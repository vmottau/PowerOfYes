import { useState, type ChangeEvent } from "react";
import { useApi, type Ministry, type Volunteer } from "../api";
import { useAppState } from "../App";
import { downloadBlob, downloadCSV } from "../lib/export";
import { plural, todayISO } from "../lib/format";
import { errText } from "../lib/hooks";
import { TEMPLATE_COLUMNS, buildImportPlan, mergeChanges, mergeInto, type Action, type ImportPlan, type ImportRow } from "../lib/importVolunteers";
import { buildXlsx, readSpreadsheet } from "../lib/sheets";

type Step =
  | { at: "pick"; error?: string }
  | { at: "preview"; file: string; plan: ImportPlan }
  | { at: "saving"; done: number; total: number }
  | { at: "done"; added: number; updated: number; left: ImportRow[]; header: string[]; error?: string };

export function downloadImportTemplate(ministries: Ministry[]) {
  const interests = ministries.filter((m) => m.active).sort((a, b) => a.sort - b.sort);
  downloadBlob("volunteer-cards-template.xlsx", buildXlsx([
    { name: "Volunteers", header: true, widths: [26, 16, 30, 44, 12, 40], rows: [TEMPLATE_COLUMNS] },
    {
      name: "How to fill in", widths: [34, 70], rows: [
        ["Type one paper card per row on the Volunteers tab.", ""],
        ["", ""],
        ["Column", "What to type"],
        ["Name", "Required. First and last name."],
        ["Phone", "Any format, like 555-010-0101."],
        ["Email", "Leave blank if the card has none."],
        ["Interests", "The boxes ticked on the card, separated by semicolons, like: Pierogies; Movie Night. Copy the names from the list below."],
        ["Contacted", "Yes if someone has already reached out to them. Otherwise leave blank."],
        ["Staff notes", "Anything else written on the card. Only coordinators see it."],
        ["", ""],
        ["Interests you can use", ""],
        ...interests.map((m) => [m.label, m.kind === "event" ? "Event" : "Parish ministry"]),
        ["", ""],
        ["When you're done, save the file and upload it under Volunteers → Import spreadsheet. You'll see a preview before anything is saved.", ""],
      ],
    },
  ]));
}

const ACTION_LABEL: Record<Action, string> = { add: "Add as a new volunteer", update: "Update the existing card", skip: "Skip this row" };

export function ImportDialog({ volunteers, onClose, onImported }: {
  volunteers: Volunteer[]; onClose: () => void; onImported: (msg: string) => void;
}) {
  const api = useApi();
  const { ministries } = useAppState();
  const [step, setStep] = useState<Step>({ at: "pick" });
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const plan = buildImportPlan(await readSpreadsheet(f), ministries, volunteers);
      if (plan.problem) setStep({ at: "pick", error: plan.problem });
      else { setOnlyFlagged(false); setStep({ at: "preview", file: f.name, plan }); }
    } catch (err) { setStep({ at: "pick", error: errText(err) }); }
  }

  function setAction(line: number, action: Action) {
    if (step.at !== "preview") return;
    setStep({ ...step, plan: { ...step.plan, rows: step.plan.rows.map((r) => (r.line === line ? { ...r, action } : r)) } });
  }

  async function save(plan: ImportPlan) {
    const todo = plan.rows.filter((r) => r.action !== "skip");
    let added = 0, updated = 0;
    const left = plan.rows.filter((r) => r.action === "skip");
    setStep({ at: "saving", done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      const r = todo[i];
      try {
        if (r.action === "update" && r.existing) { await api.saveVolunteer(mergeInto(r.existing, r.input), r.existing.id); updated++; }
        else { await api.saveVolunteer(r.input); added++; }
      } catch (err) {
        setStep({ at: "done", added, updated, left: [...left, ...todo.slice(i)], header: plan.header,
          error: `Stopped at row ${r.line} (${r.input.name}): ${errText(err)}. Everything above it was saved. Fix the problem and upload the rows that weren't imported.` });
        if (added || updated) onImported("");
        return;
      }
      setStep({ at: "saving", done: i + 1, total: todo.length });
    }
    setStep({ at: "done", added, updated, left, header: plan.header });
    onImported(summary(added, updated));
  }

  function downloadLeftovers(header: string[], left: ImportRow[]) {
    const width = Math.max(header.length, ...left.map((r) => r.cells.length));
    const pad = (a: string[]) => Array.from({ length: width }, (_, i) => a[i] ?? "");
    downloadCSV(`volunteers-not-imported-${todayISO()}.csv`, [...pad(header), "Why it wasn't imported"],
      [...left].sort((a, b) => a.line - b.line).map((r) => [...pad(r.cells), r.errors.join("; ") || r.notes[0] || "Skipped in the preview"]));
  }

  return (
    <form className="importer" onSubmit={(e) => e.preventDefault()}>
      <h2 id="imp-dlg-title">Import a spreadsheet</h2>

      {step.at === "pick" && <>
        <p className="lead">Add many paper cards at once. Type the cards into a spreadsheet, one person per row, then upload it here. You'll see every row before anything is saved.</p>
        <ol className="steps">
          <li>
            <b>Get the blank template.</b> It has the right columns and a list of the interest names to copy from. It opens in Excel, Google Sheets or Numbers.
            <div><button className="btn" type="button" onClick={() => downloadImportTemplate(ministries)}>Download blank template</button></div>
          </li>
          <li><b>Type in the cards.</b> One person per row. Only the name is required.</li>
          <li>
            <b>Upload the file.</b> Excel (.xlsx) or CSV. From Google Sheets, use File → Download → Microsoft Excel. A spreadsheet from “Download spreadsheet” works too.
            <div>
              <label className="btn primary filebtn">
                Choose a spreadsheet…
                <input id="imp-file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => void pickFile(e)} />
              </label>
            </div>
          </li>
        </ol>
        {step.error && <p className="warn" role="alert">{step.error}</p>}
        <div className="formfoot"><div className="right"><button className="btn" type="button" onClick={onClose}>Close</button></div></div>
      </>}

      {step.at === "preview" && <Preview step={step} onlyFlagged={onlyFlagged} setOnlyFlagged={setOnlyFlagged} ministries={ministries}
        setAction={setAction} onBack={() => setStep({ at: "pick" })} onSave={() => void save(step.plan)} />}

      {step.at === "saving" && (
        <div className="impsaving" role="status">
          <p>Saving {step.done} of {step.total}…</p>
          <progress max={step.total} value={step.done} />
          <p className="muted small">Please keep this window open until it finishes.</p>
        </div>
      )}

      {step.at === "done" && <>
        <p className="impresult" role="status">{summary(step.added, step.updated) || "Nothing was saved."}</p>
        {step.error && <p className="warn">{step.error}</p>}
        {step.left.length > 0 && (
          <div className="notice">
            <p>{plural(step.left.length, "row was", "rows were")} not imported. You can download them, fix them in your spreadsheet program, and upload that file. The last column says why each was left out.</p>
            <button className="btn" type="button" onClick={() => downloadLeftovers(step.header, step.left)}>Download rows that weren't imported</button>
          </div>
        )}
        <div className="formfoot"><div className="right">
          <button className="btn" type="button" onClick={() => setStep({ at: "pick" })}>Import another</button>
          <button className="btn primary" type="button" onClick={onClose}>Done</button>
        </div></div>
      </>}
    </form>
  );
}

function summary(added: number, updated: number): string {
  const parts = [added ? `added ${plural(added, "new volunteer")}` : "", updated ? `updated ${plural(updated, "existing card")}` : ""].filter(Boolean);
  if (!parts.length) return "";
  const s = parts.join(" and ");
  return s[0].toUpperCase() + s.slice(1);
}

function Preview({ step, onlyFlagged, setOnlyFlagged, ministries, setAction, onBack, onSave }: {
  step: Extract<Step, { at: "preview" }>; onlyFlagged: boolean; setOnlyFlagged: (b: boolean) => void; ministries: Ministry[];
  setAction: (line: number, a: Action) => void; onBack: () => void; onSave: () => void;
}) {
  const { rows, unusedColumns } = step.plan;
  const count = (a: Action) => rows.filter((r) => r.action === a).length;
  const broken = rows.filter((r) => r.errors.length).length;
  const flagged = (r: ImportRow) => r.errors.length > 0 || r.notes.length > 0 || r.action !== "add";
  const shown = onlyFlagged ? rows.filter(flagged) : rows;
  const labelOf = (id: string) => ministries.find((m) => m.id === id);
  const willSave = count("add") + count("update");

  return <>
    <p className="lead"><b>{step.file}</b>: {plural(rows.length, "row")} found.</p>
    <ul className="impsummary">
      <li className="good"><b>{count("add")}</b> to add as new volunteers</li>
      {count("update") > 0 && <li><b>{count("update")}</b> to update an existing card (adds what's new, never erases)</li>}
      {count("skip") - broken > 0 && <li><b>{count("skip") - broken}</b> to skip, because they look like someone already listed</li>}
      {broken > 0 && <li className="bad"><b>{broken}</b> can't be added until they're fixed in the spreadsheet</li>}
    </ul>
    {unusedColumns.length > 0 && <p className="muted small">These columns were not used: {unusedColumns.join(", ")}.</p>}
    {rows.some(flagged) && (
      <label className="inline small"><input type="checkbox" id="imp-flagged" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} /> Show only rows that need a look</label>
    )}
    <div className="implist">
      {shown.map((r) => (
        <div key={r.line} className={"improw" + (r.errors.length ? " bad" : r.action === "skip" ? " skip" : "")} data-line={r.line}>
          <span className="line">Row {r.line}</span>
          <div className="minw0">
            <b>{r.input.name || <i>No name</i>}</b>
            <span className="contact">{[r.input.phone, r.input.email].filter(Boolean).join(" · ")}</span>
            {r.input.ministries.length > 0 && (
              <div className="tags">{r.input.ministries.map((id) => { const m = labelOf(id); return <span key={id} className={"tag" + (m?.kind === "event" ? " event" : "")}>{m?.label ?? id}</span>; })}</div>
            )}
            {r.errors.map((e) => <p key={e} className="warn">{e}. Fix it in the spreadsheet and upload again.</p>)}
            {r.notes.map((n) => <p key={n} className="impnote">{n}</p>)}
            {r.action === "update" && r.existing && (() => {
              const ch = mergeChanges(r.existing, r.input);
              return <p className="impnote">{ch.length ? `Will add: ${ch.join(", ")}.` : "Nothing new to add; the card stays as it is."}</p>;
            })()}
          </div>
          {!r.errors.length && (
            <select aria-label={`What to do with row ${r.line}`} value={r.action} onChange={(e) => setAction(r.line, e.target.value as Action)}>
              {(["add", ...(r.existing ? ["update"] : []), "skip"] as Action[]).map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
            </select>
          )}
        </div>
      ))}
    </div>
    <div className="formfoot">
      <button className="btn" type="button" onClick={onBack}>Choose a different file</button>
      <div className="right">
        <button className="btn primary" type="button" disabled={!willSave} onClick={onSave}>
          {willSave ? `Save ${plural(willSave, "volunteer")}` : "Nothing to save"}
        </button>
      </div>
    </div>
  </>;
}
