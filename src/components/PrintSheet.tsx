import { createPortal } from "react-dom";
import { useBranding } from "../lib/branding";
import { longDate, todayISO } from "../lib/format";

export interface PrintColumn {
  label: string;
  /** "box" prints an empty square to tick by hand; "blank" leaves room to write. */
  kind?: "text" | "box" | "blank";
  width?: string;
}

/**
 * A paper roster: hidden on screen, and the only thing that prints while it is on the page.
 * Pages that show one print it with window.print() (or the browser's own Print).
 */
export function PrintSheet({ title, meta, columns, rows, blankRows = 0, footer }: {
  title: string;
  meta?: string[];
  columns: PrintColumn[];
  rows: string[][];
  blankRows?: number;
  footer?: string;
}) {
  const { branding } = useBranding();
  const cellFor = (c: PrintColumn, text: string, i: number) =>
    c.kind === "box" ? <td key={i} className="boxcell"><span className="tick" /></td> : <td key={i}>{c.kind === "blank" ? "" : text}</td>;
  return createPortal(
    <section className="printsheet" aria-hidden="true">
      <header>
        <div className="ps-org">{branding.org_name}</div>
        <h1>{title}</h1>
        {meta && meta.filter(Boolean).length > 0 && <p className="ps-meta">{meta.filter(Boolean).join("  ·  ")}</p>}
      </header>
      <table>
        <thead>
          <tr><th className="num">#</th>{columns.map((c, i) => <th key={i} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, n) => <tr key={n}><td className="num">{n + 1}</td>{columns.map((c, i) => cellFor(c, r[i] ?? "", i))}</tr>)}
          {Array.from({ length: blankRows }, (_, n) => (
            <tr key={"b" + n} className="blankrow"><td className="num">{rows.length + n + 1}</td>{columns.map((c, i) => cellFor(c, "", i))}</tr>
          ))}
        </tbody>
      </table>
      <footer>{footer ? `${footer}  ·  ` : ""}Printed {longDate(todayISO())}</footer>
    </section>,
    document.body,
  );
}
