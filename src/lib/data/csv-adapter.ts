import "server-only";
import { promises as fs } from "node:fs";
import type { FinancialSnapshot } from "@/lib/types";
import { seedSnapshot } from "@/data/seed";

/**
 * CSV ingestion adapter (STUB).
 *
 * ── How live data will flow ──────────────────────────────────────────────
 * Civica Practical Plus has no API. The agreed integration path is:
 *
 *   1. A scheduled task on hvasc-app02 (run as the `sandsservice` account)
 *      exports Practical reports to a CSV drop folder on the network share:
 *          \\hvasc-ad02\Data Share\Sands Reports
 *   2. This adapter — connected over the Sophos VPN — reads those CSVs and
 *      maps them into our FinancialSnapshot shape.
 *
 * Set the drop folder via the REPORTS_DIR env var. For local development you
 * can point it at a folder of sample CSVs.
 *
 * Expected files (names provisional — finalise against the real exports):
 *   - departments.csv  → id,name,annual_budget,ytd_actual,ytd_budget,status,...
 *   - gl_lines.csv     → department_id,code,account,amount
 *   - grants.csv       → id,name,funder,department_id,total,spent,...
 *   - revenue.csv      → id,label,department_id,ytd
 *   - monthly_spend.csv→ month,amount
 *
 * Until the real columns are confirmed, this throws so getSnapshot() falls
 * back to seed data. Implement the parsing in `parseSnapshot()` below.
 */

const DEFAULT_REPORTS_DIR = "\\\\hvasc-ad02\\Data Share\\Sands Reports";

export function getReportsDir(): string {
  return process.env.REPORTS_DIR ?? DEFAULT_REPORTS_DIR;
}

export async function loadSnapshotFromCsv(): Promise<FinancialSnapshot> {
  const dir = getReportsDir();

  // Verify the drop folder is reachable (VPN connected + share mounted).
  try {
    await fs.access(dir);
  } catch {
    throw new Error(
      `Reports directory not reachable: ${dir}. ` +
        `Check the VPN connection and the REPORTS_DIR env var.`,
    );
  }

  // TODO: read + parse the CSV files in `dir` and build a real snapshot.
  // Scaffolded here so the wiring exists; intentionally not implemented until
  // the export format is confirmed against Practical's actual output.
  return parseSnapshot(dir);
}

/**
 * Map raw CSV exports into a FinancialSnapshot.
 *
 * Replace the throw with real parsing once the export columns are confirmed.
 * `readCsv()` below is provided to get you started (no deps, handles quotes).
 */
async function parseSnapshot(dir: string): Promise<FinancialSnapshot> {
  void dir;
  void readCsv;
  throw new Error(
    "CSV parsing not implemented yet — confirm Practical export columns first.",
  );

  // Reference implementation once columns are known (use node:path to join):
  // const departments = (await readCsv(`${dir}/departments.csv`)).map(...)
  // const grants = (await readCsv(`${dir}/grants.csv`)).map(...)
  // return { period, departments, grants, revenueLines, monthlySpend };
}

/**
 * Minimal CSV reader: returns an array of row objects keyed by header.
 * Handles quoted fields and escaped quotes; no external dependency.
 */
export async function readCsv(
  filePath: string,
): Promise<Record<string, string>[]> {
  const text = await fs.readFile(filePath, "utf8");
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  return body
    .filter((r) => r.length > 0 && r.some((cell) => cell !== ""))
    .map((cells) => {
      const row: Record<string, string> = {};
      header.forEach((key, i) => {
        row[key.trim()] = (cells[i] ?? "").trim();
      });
      return row;
    });
}

/** Tiny RFC-4180-ish CSV tokeniser. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
