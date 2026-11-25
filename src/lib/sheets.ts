/*
  Reading spreadsheets people upload (.xlsx from Excel or Google Sheets, or .csv),
  and writing a small .xlsx (the blank import template). No outside libraries:
  .xlsx is a zip of XML files; the browser's DecompressionStream unpacks it.
*/
import { zipFiles } from "./export";

/** The rows of the first sheet, every cell as trimmed-free text ("" for empty). */
export type Grid = string[][];

export async function readSpreadsheet(file: File): Promise<Grid> {
  const name = file.name.toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  if (name.endsWith(".xlsx") || (isZip && !name.endsWith(".csv"))) {
    if (!isZip) throw new Error("This file doesn't look like an Excel workbook. Save it as .xlsx or .csv and try again.");
    return readXlsx(buf);
  }
  if (/\.(xls|numbers|ods)$/.test(name)) {
    throw new Error("This kind of spreadsheet can't be read here. In your spreadsheet program, use File → Save As (or Download) and pick Excel (.xlsx) or CSV.");
  }
  return parseCSV(decodeText(buf));
}

/** UTF-8 when it is valid UTF-8, otherwise the Windows encoding Excel uses for "CSV (Comma delimited)". */
function decodeText(buf: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, ""); }
  catch { return new TextDecoder("windows-1252").decode(buf); }
}

/** CSV with quotes; the separator (comma, semicolon or tab) is picked from the first line. */
export function parseCSV(text: string): Grid {
  const first = text.slice(0, text.search(/\r?\n|$/));
  const count = (c: string) => first.split(c).length;
  const sep = [",", ";", "\t"].sort((a, b) => count(b) - count(a))[0];
  const rows: Grid = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/* ---------- .xlsx reading ---------- */

async function unzip(buf: Uint8Array): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("This workbook looks damaged. Open it in your spreadsheet program, save it again, and retry.");
  const total = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  const files = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/^(xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/worksheets\/[^/]+\.xml)$/.test(name)) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = buf.subarray(start, start + size);
    if (method === 0) files.set(name, raw);
    else if (method === 8) {
      const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      files.set(name, new Uint8Array(await new Response(stream).arrayBuffer()));
    }
  }
  return files;
}

const xml = (b: Uint8Array | undefined) => b && new DOMParser().parseFromString(new TextDecoder().decode(b), "application/xml");
const tags = (n: Document | Element, t: string) => Array.from(n.getElementsByTagNameNS("*", t));
const textOf = (n: Element) => tags(n, "t").map((t) => t.textContent ?? "").join("");

/** Column letters to a 0-based index: A → 0, AA → 26. */
function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

async function readXlsx(buf: Uint8Array): Promise<Grid> {
  const files = await unzip(buf);
  const wb = xml(files.get("xl/workbook.xml"));
  if (!wb) throw new Error("This file doesn't look like an Excel workbook. Save it as .xlsx or .csv and try again.");
  // The first sheet tab, wherever it's stored.
  let path = "xl/worksheets/sheet1.xml";
  const firstSheet = tags(wb, "sheet")[0];
  const rid = firstSheet?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? firstSheet?.getAttribute("r:id");
  const rels = xml(files.get("xl/_rels/workbook.xml.rels"));
  const target = rels && rid ? tags(rels, "Relationship").find((r) => r.getAttribute("Id") === rid)?.getAttribute("Target") : null;
  if (target) path = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
  const sheet = xml(files.get(path));
  if (!sheet) throw new Error("Couldn't find a sheet in this workbook.");
  const ss = xml(files.get("xl/sharedStrings.xml"));
  const shared = ss ? tags(ss, "si").map(textOf) : [];
  const rows: Grid = [];
  for (const r of tags(sheet, "row")) {
    const rowNum = Number(r.getAttribute("r")) || rows.length + 1;
    const out: string[] = [];
    let next = 0;
    for (const c of tags(r, "c")) {
      const ref = c.getAttribute("r");
      const i = ref ? colIndex(ref) : next;
      next = i + 1;
      const t = c.getAttribute("t");
      const v = tags(c, "v")[0]?.textContent ?? "";
      let val: string;
      if (t === "s") val = shared[Number(v)] ?? "";
      else if (t === "inlineStr") val = textOf(c);
      else if (t === "b") val = v === "1" ? "Yes" : "No";
      else val = v;
      out[i] = val;
    }
    rows[rowNum - 1] = Array.from(out, (x) => x ?? "");
  }
  return Array.from(rows, (x) => x ?? []);
}

/* ---------- .xlsx writing ---------- */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colName = (i: number) => { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

export interface SheetSpec {
  name: string;
  rows: string[][];
  /** Column widths in characters. */
  widths?: number[];
  /** Bold, shaded first row that stays put when scrolling. */
  header?: boolean;
}

/** A plain .xlsx workbook (text cells only) that Excel, Google Sheets and Numbers open. */
export function buildXlsx(sheets: SheetSpec[]): Blob {
  const sheetXml = (s: SheetSpec) => {
    const cols = s.widths?.length ? `<cols>${s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    const view = s.header ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
    const body = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) =>
      `<c r="${colName(ci)}${ri + 1}" t="inlineStr"${s.header && ri === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join("")}</row>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${view}${cols}<sheetData>${body}</sheetData></worksheet>`;
  };
  const files = [
    { name: "[Content_Types].xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { name: "_rels/.rels", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDE7F3"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s) })),
  ];
  return new Blob([zipFiles(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
