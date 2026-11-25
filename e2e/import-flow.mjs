// End-to-end check of "Import spreadsheet" in demo mode: template, preview, duplicates, bad rows, saving.
// Run: node e2e/import-flow.mjs [baseUrl]   (set CHROMIUM_PATH to use a specific Chromium; SHOTS=dir to save screenshots)
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { deflateRawSync, crc32 } from "node:zlib";
const { chromium } = createRequire(import.meta.url)("playwright");

const base = process.argv[2] ?? "http://localhost:4173/";
const shots = process.env.SHOTS;
const errors = [];
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const p = await (await b.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const ok = (cond, msg) => { if (!cond) throw new Error("FAILED: " + msg); console.log("✓", msg); };
const shot = async (name) => { if (shots) await p.screenshot({ path: `${shots}/${name}.png`, fullPage: true }); };
const download = async (click) => {
  const [d] = await Promise.all([p.waitForEvent("download"), click()]);
  return { name: d.suggestedFilename(), body: await readFile(await d.path()) };
};
const upload = (name, buffer, mimeType = "text/csv") => p.setInputFiles("#imp-file", { name, mimeType, buffer });
const row = (line) => p.locator(`.improw[data-line='${line}']`);

/** A small .xlsx the way Excel writes it: compressed, with a shared-strings table and a number cell. */
function excelFile(rows) {
  const strings = [], idx = (s) => { let i = strings.indexOf(s); if (i < 0) { i = strings.length; strings.push(s); } return i; };
  const col = (i) => String.fromCharCode(65 + i);
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, ri) =>
    `<row r="${ri + 1}">${r.map((v, ci) => v === "" ? "" : typeof v === "number" ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="s"><v>${idx(v)}</v></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const files = {
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    "xl/workbook.xml": `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Cards" sheetId="1" r:id="rId7"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="worksheet" Target="worksheets/cards.xml"/></Relationships>`,
    "xl/sharedStrings.xml": "", // filled below, after the sheet has collected its strings
    "xl/worksheets/cards.xml": sheet,
  };
  files["xl/sharedStrings.xml"] = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map((s) => `<si><r><t>${esc(s)}</t></r></si>`).join("")}</sst>`;
  const locals = [], central = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = Buffer.from(name), raw = Buffer.from(text), data = deflateRawSync(raw), crc = crc32(raw);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    locals.push(h, n, data); central.push(c, n); off += 30 + n.length + data.length;
  }
  const cen = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(central.length / 2, 8); e.writeUInt16LE(central.length / 2, 10); e.writeUInt32LE(cen.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cen, e]);
}

await p.goto(base); await p.evaluate(() => localStorage.clear());
await p.goto(base); await p.reload();
await p.fill("#signin-email", "coordinator@example.org"); await p.click("button[type=submit]");
await p.waitForSelector("main.content h1");
await p.click("a.navitem:has-text('Volunteers')");
await p.waitForSelector("article.vol");
const before = await p.locator("article.vol").count();

// 1. The template
await p.click("button:has-text('Import spreadsheet')");
await p.waitForSelector("text=Download blank template");
await shot("import-1-start");
const tpl = await download(() => p.click("button:has-text('Download blank template')"));
ok(tpl.name === "volunteer-cards-template.xlsx" && tpl.body.subarray(0, 2).toString() === "PK", `template is an Excel file (${tpl.name})`);
ok(tpl.body.includes("Name") && tpl.body.includes("Staff notes") && tpl.body.includes("Pierogies"), "template has the columns and the interest list");
await upload("volunteer-cards-template.xlsx", tpl.body, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
await p.waitForSelector(".importer .warn:has-text('no volunteers under them yet')");
ok(true, "the blank template reads back and says it has no volunteers yet");

// 2. A spreadsheet typed from cards (Excel format)
await upload("cards.xlsx", excelFile([
  ["Power of Yes cards, fall drive"],
  ["Name", "Phone", "Email", "Interests", "Contacted", "Staff notes", "Shirt size"],
  ["Rosa Newcomer", 5550109911, "rosa@example.org", "Pierogi; movie night", "", "Wrote: Saturdays only", "M"],
  ["Example: Ann Example", "", "ann@example.org", "Hallow Helper", "", "", ""],
  ["", "", "", "", "", "", ""],
  ["", "555-010-0000", "", "Pierogies", "", "", ""],
  ["Tom Typo", "", "tom@example", "", "", "", ""],
  ["Rosa Newcomer", "555 010 9911", "", "Pancake", "", "", ""],
  ["Lee Ringer", "", "", "Bingo night; Craft shows", "yes", "", ""],
]), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
await p.waitForSelector(".implist");
await shot("import-2-preview");
ok(await p.isVisible("text=cards.xlsx: 6 rows found"), "preview counts the rows and ignores blank lines and the title row");
ok((await row(3).textContent()).includes("555-010-9911") && await row(3).locator(".tag:has-text('Pierogies')").isVisible() && await row(3).locator(".tag:has-text('Movie Night')").isVisible(),
  "a new volunteer's phone is formatted and loosely typed interests are matched");
ok(await row(4).locator("select").inputValue() === "update" && (await row(4).textContent()).includes("Will add: 1 interest"), "someone already in the list is set to update their card");
ok((await row(6).textContent()).includes("No name") && !(await row(6).locator("select").count()), "a row without a name can't be added");
ok((await row(7).textContent()).includes("looks incomplete"), "a broken email is flagged");
ok(await row(8).locator("select").inputValue() === "skip" && (await row(8).textContent()).includes("Same person as row 3"), "the same person twice in the file is skipped");
ok((await row(9).textContent()).includes("Not on the interest list: Bingo night"), "an unknown interest is pointed out");
ok(await p.isVisible("text=These columns were not used: Shirt size"), "unused columns are named");
ok(await p.isVisible(".impsummary li.bad:has-text('2')"), "summary counts the 2 rows that need fixing");

await row(8).locator("select").selectOption("add"); // keep both after all…
await row(8).locator("select").selectOption("skip"); // …no, skip it
await p.click("button:has-text('Save 3 volunteers')");
await p.waitForSelector(".impresult:has-text('Added 2 new volunteers and updated 1 existing card')");
await shot("import-3-done");
ok(true, "saving adds the new people and updates the existing card");
const left = await download(() => p.click("button:has-text(\"Download rows that weren't imported\")"));
const leftLines = left.body.toString("utf8").replace(/^﻿/, "").trim().split("\r\n");
ok(leftLines.length === 4 && leftLines[0].endsWith("Why it wasn't imported") && leftLines.some((l) => l.includes("Tom Typo") && l.includes("looks incomplete")),
  `rows that weren't imported download with the reason (${leftLines.length - 1} rows)`);
await p.click(".importer button:has-text('Done')");

ok(await p.locator("article.vol").count() === before + 2, "the directory shows the 2 new volunteers");
const lee = p.locator("article.vol:has-text('Lee Ringer')");
ok(await lee.locator(".pill.done").isVisible() && await lee.locator(".tag:has-text('Craft Shows')").isVisible() && (await lee.textContent()).includes("Also interested in: Bingo night"),
  "imported volunteer has contacted, interests and the unknown interest in staff notes");
ok(await p.locator("article.vol:has-text('Ann Example') .tag:has-text('Hallow Helper')").isVisible(), "existing card gained the new interest");

// 3. The directory's own download goes back in without making duplicates
const exp = await download(() => p.click("button:has-text('Download spreadsheet')"));
await p.click("button:has-text('Import spreadsheet')");
await upload(exp.name, exp.body);
await p.waitForSelector(".implist");
const total = await p.locator(".improw").count();
ok(total === before + 2 && await p.locator(".improw select >> nth=0").inputValue() === "update" && await p.isVisible(".impsummary li.good:has-text('0')"),
  `re-uploading the downloaded list matches everyone already there (${total} rows, 0 new)`);
await p.click(".importer button:has-text('Choose a different file')");

// 4. Files that can't be read say what to do
await upload("old.xls", Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), "application/vnd.ms-excel");
await p.waitForSelector(".importer .warn:has-text('Save As')");
await upload("random.csv", Buffer.from("Shoe,Hat\n1,2\n"));
await p.waitForSelector(".importer .warn:has-text(\"find a\")");
// Excel's "CSV (Comma delimited)" in a European locale: semicolons, Windows encoding
await upload("cards.csv", Buffer.from("Name;Phone;Email\r\nJos\xe9 Pe\xf1a;5550101234;\r\n", "latin1"));
await p.waitForSelector(".improw:has-text('José Peña')");
ok(true, "unreadable files explain what to do; semicolon CSVs with accents read correctly");

ok(!errors.length, `no browser errors (${errors.join(" | ")})`);
await b.close();
console.log("ALL IMPORT CHECKS PASSED");
