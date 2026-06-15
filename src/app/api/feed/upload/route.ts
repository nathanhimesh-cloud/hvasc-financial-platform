import { revalidatePath, revalidateTag } from "next/cache";
import * as XLSX from "xlsx";
import { buildSnapshot, classifyRows, detectFyMonth, type BuildInput } from "@/lib/feed/parse.mjs";
import {
  writeRuntimeSnapshot,
  writeRuntimeInputs,
  readRuntimeInputs,
  storeKind,
  type RuntimeInputs,
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
  const classified: { name: string; kind: string }[] = [];

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
    } else if (kind === "income" && !isFy25) {
      const mo = detectFyMonth(file.name);
      if (mo) {
        input.monthly = [...(input.monthly ?? []).filter((x) => x.idx !== mo.idx), { ...mo, rows }];
        tag = `income (${mo.label} monthly)`;
      } else input.income = rows;
    } else if (kind === "grants" && !isFy25) input.grants = rows;
    classified.push({ name: file.name, kind: tag + (isFy25 ? " (FY25)" : "") });
  }

  if (!input.byFunction) {
    return Response.json(
      {
        ok: false,
        error:
          "No current-year 'Analysis by function' (Note 3a) yet. Upload the current-year Note 3a — once, on its own or with these files — and it'll be remembered for future single-file uploads.",
        classified,
      },
      { status: 400 },
    );
  }

  let snapshot;
  try {
    snapshot = buildSnapshot(input as BuildInput);
    snapshot.meta = { ...snapshot.meta, source: snapshot.meta?.source ?? "Upload", generatedAt: new Date().toISOString().slice(0, 10) };
  } catch (err) {
    return Response.json(
      { ok: false, error: `Failed to build snapshot: ${(err as Error).message}`, classified },
      { status: 422 },
    );
  }

  let location: string;
  try {
    location = await writeRuntimeSnapshot(snapshot);
    await writeRuntimeInputs(input); // remember reports so future uploads can merge
  } catch (err) {
    return Response.json(
      { ok: false, error: `Parsed OK but couldn't save: ${(err as Error).message}`, classified },
      { status: 500 },
    );
  }

  // Bust caches so the dashboard reflects the new data.
  clearSnapshotCache();
  revalidateTag("snapshot", "max");
  revalidatePath("/", "layout");

  return Response.json({
    ok: true,
    store: storeKind(),
    location,
    classified,
    summary: {
      departments: snapshot.departments.length,
      grants: snapshot.grants.length,
      revenueLines: snapshot.revenueLines.length,
      baseline: snapshot.meta?.baseline,
      totalYtdSpend: snapshot.departments.reduce((a, d) => a + d.ytdActual, 0),
    },
  });
}
