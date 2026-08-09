"use client";

import * as XLSX from "xlsx";

/**
 * Native Excel export (Build Brief B3: "every report should export to Excel and PDF").
 *
 * We already had CSV, and CSV is *technically* openable in Excel — but it opens as
 * text, loses every number as a number, mangles leading zeros in GL codes
 * ("0205-4147" becomes a date in some locales), and can't carry more than one
 * table. A CFO who asked for Excel and got a CSV asked twice.
 *
 * So: real `.xlsx`. Numbers stay numbers, currency is formatted, codes stay strings,
 * and a workbook can hold several sheets — which matters, because a report is
 * usually more than one table.
 */

/** A column: its header, the key to read, and how to treat the value. */
export interface XlsxColumn<T> {
  header: string;
  /** Pull the cell value out of the row. */
  value: (row: T) => string | number | null | undefined;
  /** Money gets a currency format and right alignment. Text stays text. */
  type?: "text" | "money" | "number" | "percent" | "date";
  width?: number;
}

export interface XlsxSheet<T> {
  name: string;
  columns: XlsxColumn<T>[];
  rows: T[];
  /** An optional totals row, appended in bold. */
  total?: Partial<Record<string, string | number>>;
}

const FORMATS: Record<NonNullable<XlsxColumn<unknown>["type"]>, string | undefined> = {
  text: undefined,
  money: '"$"#,##0.00;[Red]-"$"#,##0.00',
  number: "#,##0",
  percent: "0.0%",
  date: "dd/mm/yyyy",
};

/**
 * Build and download a workbook.
 *
 * `filename` gets `.xlsx` appended and the period stamped in, so a folder full of
 * exports doesn't become three files all called "report".
 */
export function downloadXlsx<T>(
  filename: string,
  sheets: XlsxSheet<T>[],
  meta?: { period?: string; generatedAt?: string },
) {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const header = sheet.columns.map((c) => c.header);
    const body = sheet.rows.map((r) =>
      sheet.columns.map((c) => {
        const v = c.value(r);
        // TRUE empty cells, not "". An empty STRING is a text cell — in a money
        // column it left-aligns among right-aligned numbers, which is exactly
        // the "misaligned export" the Aug 2026 review complained about.
        if (v === null || v === undefined || v === "") return null;
        return v;
      }),
    );

    const aoa: (string | number | null)[][] = [header, ...body];

    // The promised totals row (the interface always offered it; nothing wrote it).
    if (sheet.total) {
      aoa.push(sheet.columns.map((c) => {
        const v = sheet.total![c.header];
        return v === undefined || v === null || v === "" ? null : v;
      }));
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const lastDataRow = aoa.length - 1; // includes the totals row when present

    // Number formats, per column, skipping the header row.
    sheet.columns.forEach((col, ci) => {
      const fmt = FORMATS[col.type ?? "text"];
      if (!fmt) return;
      for (let ri = 1; ri <= lastDataRow; ri++) {
        const addr = XLSX.utils.encode_cell({ r: ri, c: ci });
        const cell = ws[addr];
        if (cell && typeof cell.v === "number") cell.z = fmt;
      }
    });

    ws["!cols"] = sheet.columns.map((c) => ({
      wch: c.width ?? Math.max(c.header.length + 2, 12),
    }));
    // Freeze the header row. The bare {xSplit, ySplit} object was silently
    // ignored by SheetJS — the pane needs its anchor and state spelled out.
    ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
    // Filter arrows over the data (not the totals row).
    ws["!autofilter"] = {
      ref: `A1:${XLSX.utils.encode_cell({ r: sheet.rows.length, c: sheet.columns.length - 1 })}`,
    };

    // Sheet names are capped at 31 chars by the format itself, and Excel refuses
    // a workbook with a longer one rather than truncating politely.
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }

  // Provenance sheet. An exported figure that outlives its context is how a stale
  // number ends up in a Council paper — so every workbook says what it is and when.
  const about = XLSX.utils.aoa_to_sheet([
    ["Hope Vale Aboriginal Shire Council"],
    ["Vantage — financial reporting platform"],
    [],
    ["Report", filename],
    ["Period", meta?.period ?? ""],
    ["Data as at", meta?.generatedAt ?? ""],
    ["Exported", new Date().toLocaleString("en-AU")],
    [],
    ["Source", "Civica Practical Plus (live general ledger, read-only)"],
    ["Note", "Figures depend on the accuracy of the data recorded in Practical."],
  ]);
  about["!cols"] = [{ wch: 16 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, about, "About");

  const stamp = meta?.period ? `-${meta.period.replace(/\s+/g, "-")}` : "";
  XLSX.writeFile(wb, `${filename}${stamp}.xlsx`);
}
