/*
  Turning a spreadsheet of paper cards into volunteers.
  Reads the columns of the blank template and of the "Download spreadsheet" file
  (so a downloaded list can be edited and uploaded again), checks every row,
  and finds people who are already in the list.
*/
import type { Ministry, Volunteer, VolunteerInput } from "../api/types";
import { digits, fmtPhone, isEmail } from "./format";
import type { Grid } from "./sheets";

/** The template's columns: the first columns of the volunteer spreadsheet download, in the same order. */
export const TEMPLATE_COLUMNS = ["Name", "Phone", "Email", "Interests", "Contacted", "Staff notes"];

type Field = "name" | "first" | "last" | "phone" | "email" | "interests" | "contacted" | "notes";

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

const ALIASES: Record<Field, string[]> = {
  name: ["name", "fullname", "volunteer", "volunteername"],
  first: ["firstname", "first", "givenname"],
  last: ["lastname", "last", "surname", "familyname"],
  phone: ["phone", "phonenumber", "phoneno", "cell", "cellphone", "mobile", "telephone", "tel"],
  email: ["email", "emailaddress", "mail"],
  interests: ["interests", "interest", "areasofinterest", "areas", "ministries", "ministry", "signedupfor"],
  contacted: ["contacted", "reachedout", "called"],
  notes: ["staffnotes", "notes", "note", "comments", "comment"],
};
/** Columns of the download that describe the app's own records; they're skipped without comment. */
const DOWNLOAD_ONLY = ["haslogin", "camefrom", "timesserved", "timesmissed", "upcoming", "openfollowups", "addedon"];

export type Action = "add" | "update" | "skip";

export interface ImportRow {
  /** The row number as the spreadsheet program shows it. */
  line: number;
  /** The row's cells, for the "rows that need fixing" download. */
  cells: string[];
  input: VolunteerInput;
  /** Reasons the row can't be added until it's fixed in the spreadsheet. */
  errors: string[];
  /** Things worth a look that don't stop the row. */
  notes: string[];
  /** Someone already in the list who looks like the same person. */
  existing: Volunteer | null;
  /** An earlier row in this file with the same person. */
  sameAs: number | null;
  /** What happens to the row; the coordinator can change it in the preview. */
  action: Action;
}

export interface ImportPlan {
  header: string[];
  rows: ImportRow[];
  /** Header names nobody could match, to mention in the preview. */
  unusedColumns: string[];
  /** Set when the file can't be used at all. */
  problem: string | null;
}

function matchMinistry(piece: string, ministries: Ministry[]): Ministry | null {
  const p = norm(piece);
  if (!p) return null;
  const exact = ministries.find((m) => norm(m.label) === p || norm(m.id) === p);
  if (exact) return exact;
  if (p.length < 4) return null;
  const close = ministries.filter((m) => { const l = norm(m.label); return l.includes(p) || p.includes(l); });
  return close.length === 1 ? close[0] : null;
}

/** "Pierogies; Movie Night" (or commas or one per line) to ministry ids, plus anything not recognized. */
export function parseInterests(text: string, ministries: Ministry[]): { ids: string[]; unknown: string[] } {
  const pieces = text.split(/[;,\n\r]+/).map((s) => s.trim()).filter(Boolean);
  const ids: string[] = [], unknown: string[] = [];
  for (let i = 0; i < pieces.length; i++) {
    let m = matchMinistry(pieces[i], ministries);
    // A label that itself holds a comma ("Craft Shows, Flea Market") arrives in two pieces.
    if (!m && i + 1 < pieces.length) {
      const joined = matchMinistry(pieces[i] + ", " + pieces[i + 1], ministries);
      if (joined && norm(joined.label) === norm(pieces[i] + pieces[i + 1])) { m = joined; i++; }
    }
    if (m) { if (!ids.includes(m.id)) ids.push(m.id); }
    else unknown.push(pieces[i]);
  }
  return { ids, unknown };
}

const YES = new Set(["yes", "y", "true", "x", "1", "done", "✓", "✔", "checked"]);
const NO = new Set(["", "no", "n", "false", "0", "-", "none"]);
const isYes = (s: string) => YES.has(s.trim().toLowerCase());
/** A checkbox column: anything typed in it counts, except "no" and the like. */
const isTicked = (s: string) => !NO.has(s.trim().toLowerCase());
/** Our own download puts ' before text starting with = + - @ so spreadsheets don't run it as a formula. */
const unguard = (s: string) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s).trim();

const sameName = (a: string, b: string) => !!norm(a) && norm(a) === norm(b);

export function buildImportPlan(grid: Grid, ministries: Ministry[], existing: Volunteer[]): ImportPlan {
  const empty = (problem: string): ImportPlan => ({ header: [], rows: [], unusedColumns: [], problem });
  const nonBlank = grid.filter((r) => r.some((c) => c.trim()));
  if (!nonBlank.length) return empty("This spreadsheet is empty.");

  // The header is the first row (of the first few) that has a Name column; title rows above it are fine.
  const isNameHeader = (c: string) => [...ALIASES.name, ...ALIASES.first].includes(norm(c));
  const hIdx = grid.slice(0, 15).findIndex((r) => r.some(isNameHeader));
  if (hIdx < 0) return empty("Couldn't find a “Name” column. The first row should hold the column titles: Name, Phone, Email, Interests, Contacted, Staff notes. The blank template has them ready.");
  const header = grid[hIdx].map((c) => c.trim());

  const col: Partial<Record<Field, number>> = {};
  const ministryCols: { i: number; id: string }[] = [];
  const unusedColumns: string[] = [];
  header.forEach((h, i) => {
    const n = norm(h);
    if (!n) return;
    const field = (Object.keys(ALIASES) as Field[]).find((f) => ALIASES[f].includes(n));
    if (field && col[field] === undefined) { col[field] = i; return; }
    const m = ministries.find((x) => norm(x.label) === n || norm(x.id) === n);
    if (m) { ministryCols.push({ i, id: m.id }); return; }
    if (!DOWNLOAD_ONLY.includes(n)) unusedColumns.push(h);
  });

  const at = (r: string[], f: Field) => (col[f] === undefined ? "" : unguard(r[col[f]!] ?? ""));
  const rows: ImportRow[] = [];
  for (let li = hIdx + 1; li < grid.length; li++) {
    const cells = grid[li] ?? [];
    if (!cells.some((c) => c.trim())) continue;
    const errors: string[] = [], notes: string[] = [];

    const name = (at(cells, "name") || [at(cells, "first"), at(cells, "last")].filter(Boolean).join(" ")).replace(/\s+/g, " ");
    const email = at(cells, "email");
    const phone = fmtPhone(at(cells, "phone"));
    const { ids, unknown } = parseInterests(at(cells, "interests"), ministries);
    for (const mc of ministryCols) if (isTicked(cells[mc.i] ?? "") && !ids.includes(mc.id)) ids.push(mc.id);
    let staffNotes = at(cells, "notes");
    if (unknown.length) {
      notes.push(`Not on the interest list: ${unknown.join(", ")}. Kept in staff notes.`);
      staffNotes = [staffNotes, `Also interested in: ${unknown.join(", ")}`].filter(Boolean).join("\n");
    }

    if (!name) errors.push("No name");
    if (email && !isEmail(email)) errors.push(`Email “${email}” looks incomplete`);
    const ph = digits(phone);
    if (ph && ph.length < 7) notes.push(`Phone “${phone}” looks short`);
    if (name && !email && !phone) notes.push("No phone or email");

    rows.push({
      line: li + 1, cells, errors, notes, existing: null, sameAs: null, action: errors.length ? "skip" : "add",
      input: { name, phone, email, ministries: ids, notes: staffNotes, contacted: isYes(at(cells, "contacted")), source: "card" },
    });
  }

  // People already in the list, and the same person twice in this file.
  const em = (s: string) => s.trim().toLowerCase();
  for (const r of rows) {
    if (r.errors.length) continue;
    const e = em(r.input.email), p = digits(r.input.phone);
    const contactMatch = (o: { email: string; phone: string }) => (!!e && em(o.email) === e) || (p.length >= 7 && digits(o.phone) === p);
    const conflicting = (o: { email: string; phone: string }) =>
      (!!e && !!o.email && em(o.email) !== e) || (p.length >= 7 && digits(o.phone).length >= 7 && digits(o.phone) !== p);

    const earlier = rows.find((o) => o !== r && o.line < r.line && !o.errors.length &&
      (contactMatch(o.input) || (sameName(o.input.name, r.input.name) && !conflicting(o.input))));
    if (earlier) {
      r.sameAs = earlier.line;
      if (sameName(earlier.input.name, r.input.name)) { r.action = "skip"; r.notes.unshift(`Same person as row ${earlier.line}`); }
      else r.notes.unshift(`Shares a phone or email with ${earlier.input.name} (row ${earlier.line}). Check they're different people.`);
      continue;
    }
    const byName = existing.find((o) => sameName(o.name, r.input.name) && (contactMatch(o) || !conflicting(o)));
    const byContact = existing.find((o) => contactMatch(o));
    const twin = existing.find((o) => sameName(o.name, r.input.name));
    if (byName) {
      r.existing = byName; r.action = "update";
      r.notes.unshift(`Already in the list as ${byName.name}`);
    } else if (byContact) {
      r.existing = byContact; r.action = "skip";
      r.notes.unshift(`${byContact.name} already has this phone or email. Check before adding.`);
    } else if (twin) {
      r.notes.unshift(`Another ${twin.name} is already in the list with different contact details`);
    }
  }

  const problem = rows.length ? null : "The spreadsheet has column titles but no volunteers under them yet.";
  return { header, rows, unusedColumns, problem };
}

/** What "Update the existing card" saves: fills in what's missing and adds interests. Never erases anything. */
export function mergeInto(v: Volunteer, input: VolunteerInput): VolunteerInput {
  const extra = (input.notes ?? "").trim();
  return {
    name: v.name,
    phone: v.phone || input.phone,
    email: v.email || input.email,
    ministries: [...new Set([...v.ministries, ...input.ministries])],
    notes: !extra || v.notes.includes(extra) ? v.notes : [v.notes, extra].filter(Boolean).join("\n"),
    contacted: v.contacted || !!input.contacted,
  };
}

/** True when updating would actually change the existing card. */
export function mergeChanges(v: Volunteer, input: VolunteerInput): string[] {
  const m = mergeInto(v, input), out: string[] = [];
  if (m.phone !== v.phone) out.push("phone");
  if (m.email !== v.email) out.push("email");
  const added = m.ministries.length - v.ministries.length;
  if (added) out.push(added === 1 ? "1 interest" : `${added} interests`);
  if (m.notes !== v.notes) out.push("notes");
  if (m.contacted !== v.contacted) out.push("contacted");
  return out;
}
