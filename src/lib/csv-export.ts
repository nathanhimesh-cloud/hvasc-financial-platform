/**
 * One CSV writer, shared by every page's export (Hazel, 14 Aug: CSV on all pages).
 *
 * Values are quoted and internal quotes doubled — the standard escaping — and rows
 * are joined with CRLF so Excel on Windows opens them cleanly. Numbers are written
 * as-is; callers format anything that must NOT be re-parsed (e.g. GL codes) before
 * handing them in.
 */
export type CsvCell = string | number | null | undefined;

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const esc = (c: CsvCell) => `"${String(c ?? "").replace(/"/g, '""')}"`;
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

/** Build the CSV and trigger a download in the browser. */
export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]) {
  const csv = toCsv(headers, rows);
  const name = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
