import { useState } from "react";
import { useApi, type Followup, type Profile, type Volunteer } from "../api";
import { PageHeader, useAppState } from "../App";
import { Modal } from "../components/Modal";
import { FollowupForm } from "../components/FollowupForm";
import { longDate, plural, todayISO } from "../lib/format";
import { errText, useLoad, useToast } from "../lib/hooks";

export function Followups() {
  const api = useApi();
  const toast = useToast();
  const { session } = useAppState();
  const data = useLoad(async () => {
    const [fus, vols, people] = await Promise.all([api.listFollowups(), api.listVolunteers(), api.listProfiles()]);
    return { fus, vols, staff: people.filter((p) => p.role !== "volunteer") };
  }, [api]);
  const [tab, setTab] = useState<"open" | "done">("open");
  const [mineOnly, setMineOnly] = useState(false);
  const [editing, setEditing] = useState<Followup | "new" | null>(null);

  const fus = (data.data?.fus ?? []).filter((f) => (tab === "open" ? !f.done : f.done) && (!mineOnly || f.assigned_to === session.userId));
  const today = todayISO();
  const groups: [string, Followup[]][] = tab === "open"
    ? [
        ["Overdue", fus.filter((f) => f.due && f.due < today)],
        ["Today", fus.filter((f) => f.due === today)],
        ["Coming up", fus.filter((f) => f.due && f.due > today).sort((a, b) => a.due!.localeCompare(b.due!))],
        ["No due date", fus.filter((f) => !f.due)],
      ]
    : [["Done", fus.sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""))]];
  const openCount = (data.data?.fus ?? []).filter((f) => !f.done).length;

  return (
    <div>
      <PageHeader title="Follow-ups" sub="People to call or email, and what to talk about.">
        <button className="btn primary" type="button" onClick={() => setEditing("new")}>+ New follow-up</button>
      </PageHeader>
      {data.error && <div className="notice">{data.error}</div>}
      <div className="subtabs">
        <div className="seg" role="group" aria-label="Show">
          <button type="button" aria-pressed={tab === "open"} onClick={() => setTab("open")}>To do{data.data ? ` (${openCount})` : ""}</button>
          <button type="button" aria-pressed={tab === "done"} onClick={() => setTab("done")}>Done</button>
        </div>
        <label className="inline"><input type="checkbox" id="fu-mine" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Only mine</label>
      </div>
      {!data.data ? <p className="muted">Loading…</p> : !fus.length ? (
        <div className="empty">
          <h3>{tab === "open" ? "Nothing to follow up on" : "Nothing done yet"}</h3>
          <p>{tab === "open" ? "Add a follow-up here, or use “Follow up” on any volunteer’s card." : "Finished follow-ups show up here."}</p>
        </div>
      ) : groups.filter(([, list]) => list.length).map(([title, list]) => (
        <section className="sect" key={title}>
          <h2 className={"subhead" + (title === "Overdue" ? " danger-text" : "")}>{title} · {list.length}</h2>
          <div className="list">
            {list.map((f) => <FollowupRow key={f.id} f={f} vols={data.data!.vols} staff={data.data!.staff}
              onToggle={async (done) => {
                try { await api.setFollowupDone(f.id, done); toast(done ? "Marked done" : "Moved back to to-do"); await data.reload(); } catch (e) { toast(errText(e)); }
              }}
              onEdit={() => setEditing(f)} />)}
          </div>
        </section>
      ))}
      <Modal open={editing !== null} onClose={() => setEditing(null)} labelledBy="fu-dlg-title">
        {editing !== null && data.data && (
          <FollowupForm followup={editing === "new" ? null : editing} volunteers={data.data.vols} staff={data.data.staff}
            onCancel={() => setEditing(null)}
            onSaved={() => { setEditing(null); toast("Follow-up saved"); void data.reload(); }}
            onDeleted={() => { setEditing(null); toast("Follow-up deleted"); void data.reload(); }} />
        )}
      </Modal>
    </div>
  );
}

export function FollowupRow({ f, vols, staff, onToggle, onEdit, compact }: {
  f: Followup; vols: Volunteer[]; staff: Profile[]; onToggle: (done: boolean) => void; onEdit?: () => void; compact?: boolean;
}) {
  const { session } = useAppState();
  const v = vols.find((x) => x.id === f.volunteer_id);
  const who = f.assigned_to === session.userId ? "You" : staff.find((p) => p.id === f.assigned_to)?.email;
  const overdue = !f.done && f.due && f.due < todayISO();
  return (
    <div className={"fu" + (f.done ? " done" : "")}>
      <input type="checkbox" className="pick" checked={f.done} aria-label={`Mark “${f.note}” ${f.done ? "not done" : "done"}`} onChange={(e) => onToggle(e.target.checked)} />
      <div className="minw0">
        <div className="fu-note">{f.note}</div>
        <div className="fu-meta">
          <b>{v?.name ?? "Removed volunteer"}</b>
          {v?.phone && <span>{v.phone}</span>}
          {!compact && v?.email && <span>{v.email}</span>}
        </div>
      </div>
      <div className="fu-side">
        <span className={overdue ? "due overdue" : "due"}>{f.due ? (overdue ? "Overdue · " : "") + longDate(f.due).replace(/^\w+, /, "") : "No date"}</span>
        {!compact && <span className="muted small">{who ?? "Anyone"}</span>}
        {onEdit && <button className="linkbtn" type="button" onClick={onEdit}>Edit</button>}
      </div>
    </div>
  );
}

export const followupSummary = (n: number) => plural(n, "follow-up");
