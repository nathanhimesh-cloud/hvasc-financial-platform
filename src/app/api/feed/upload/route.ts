import { revalidatePath, revalidateTag } from "next/cache";
import * as XLSX from "xlsx";
import {
  buildSnapshot,
  classifyRows,
  detectFyMonth,
  parseBalanceSheet,
  parseCashFlow,
  type BuildInput,
} from "@/lib/feed/parse.mjs";
import {
  writeRuntimeSnapshot,
  writeRuntimeInputs,
  readRuntimeInputs,
  readRuntimeStatements,
  writeRuntimeStatements,
  storeKind,
  type RuntimeInputs,
  type RuntimeStatements,
} from "@/lib/feed/store";
import { clearSnapshotCache } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Parse an uploaded spreadsheet (.xls/.xlsx/.csv) into rows. */
function fileToRows(buf: Buffer): string[][] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
}

export async function POST(request: Request) {
  // Optional shared-secret protection. If UPLOAD_PASSWORD is set, require it.
  const required = process.env.UPLOAD_PASSWORD;
  const form = await request.formData();
  if (required) {
    const given = (form.get("password") as string) ?? request.headers.get("x-upload-password") ?? "";
    if (given !== required) {
      return Response.json({ ok: false, error: "Invalid upload password." }, { status: 401 });
    }
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) {
    return Response.json({ ok: false, error: "No files received." }, { status: 400 });
  }

  // Merge onto previously-uploaded reports so you can add one file at a time
  // (e.g. drop in a FY25 baseline without re-uploading the current-year set).
  const input: RuntimeInputs = (await readRuntimeInputs()) ?? {};
  // Formal statements (Balance Sheet / Cash Flow) live in their own overlay so
  // the live ODBC feed never wipes them — merge new ones onto whatever's stored.
  const statements: RuntimeStatements = (await readRuntimeStatements()) ?? {};
  const classified: { name: string; kind: string }[] = [];
  let reportTouched = false; // a file that feeds buildSnapshot
  let statementTouched = false; // a Balance Sheet / Cash Flow

  for (const file of files) {
    let rows: string[][];
    try {
      rows = fileToRows(Buffer.from(await file.arrayBuffer()));
    } catch {
      classified.push({ name: file.name, kind: "unreadable" });
      continue;
    }
    const kind = classifyRows(rows);
    const isFy25 = /fy[\s_-]?25/i.test(file.name); // "FY25", not a bare "2025"
    let tag: string = kind ?? "unrecognised";
    if (kind === "byFunction") {
      if (isFy25) input.fy25ByFunction = rows;
      else input.byFunction = rows;
      reportTouched = true;
    } else if (kind === "income" && !isFy25) {
      const mo = detectFyMonth(file.name);
      if (mo) {
        input.monthly = [...(input.monthly ?? []).filter((x) => x.idx !== mo.idx), { ...mo, rows }];
        tag = `income (${mo.label} monthly)`;
      } else input.income = rows;
      reportTouched = true;
    } else if (kind === "grants" && !isFy25) {
      input.grants = rows;
      reportTouched = true;
    } else if (kind === "balanceSheet") {
      statements.balanceSheet = parseBalanceSheet(rows);
      statementTouched = true;
    } else if (kind === "cashFlow") {
      statements.cashFlow = parseCashFlow(rows);
      statementTouched = true;
    }
    classified.push({ name: file.name, kind: tag + (isFy25 ? " (FY25)" : "") });
  }

  // Nothing usable: not a report we build from, not a statement, and no prior
  // Note 3a to merge onto.
  if (!statementTouched && !input.byFunction) {
    return Response.json(
      {
        ok: false,
        error:
          "Nothing recognised. Upload the current-year 'Analysis by function' (Note 3a), or a Balance Sheet / Cash Flow statement.",
        classified,
      },
      { status: 400 },
    );
  }

  // Save the formal-statement overlay first (independent of the main snapshot).
  if (statementTouched) {
    statements.updatedAt = new Date().toISOString().slice(0, 10);
    try {
      await writeRuntimeStatements(statements);
    } catch (err) {
      return Response.json(
        { ok: false, error: `Parsed statement but couldn't save: ${(err as Error).message}`, classified },
        { status: 500 },
      );
    }
  }

  // Rebuild the main snapshot only when a report that feeds it was uploaded (or
  // one was already stored). A statements-only upload skips this.
  let snapshot: ReturnType<typeof buildSnapshot> | null = null;
  if (reportTouched || input.byFunction) {
    try {
      snapshot = buildSnapshot(input as BuildInput);
      snapshot.meta = { ...snapshot.meta, source: snapshot.meta?.source ?? "Upload", generatedAt: new Date().toISOString().slice(0, 10) };
    } catch (err) {
      return Response.json(
        { ok: false, error: `Failed to build snapshot: ${(err as Error).message}`, classified },
        { status: 422 },
      );
    }
    try {
      await writeRuntimeSnapshot(snapshot);
      await writeRuntimeInputs(input); // remember reports so future uploads can merge
    } catch (err) {
      return Response.json(
        { ok: false, error: `Parsed OK but couldn't save: ${(err as Error).message}`, classified },
        { status: 500 },
      );
    }
  }

  // Bust caches so the dashboard reflects the new data.
  clearSnapshotCache();
  revalidateTag("snapshot", "max");
  revalidatePath("/", "layout");

  return Response.json({
    ok: true,
    store: storeKind(),
    classified,
    statements: {
      balanceSheet: !!statements.balanceSheet,
      cashFlow: !!statements.cashFlow,
    },
    summary: snapshot
      ? {
          departments: snapshot.departments.length,
          grants: snapshot.grants.length,
          revenueLines: snapshot.revenueLines.length,
          baseline: snapshot.meta?.baseline,
          totalYtdSpend: snapshot.departments.reduce((a, d) => a + d.ytdActual, 0),
        }
      : null,
  });
}
