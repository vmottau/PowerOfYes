import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApi, type Assignment, type AttendanceStatus } from "../api";
import { useAppState } from "../App";
import { Modal } from "../components/Modal";
import { EventForm } from "../components/EventForm";
import { longDate, plural } from "../lib/format";
import { historyByVolunteer } from "../lib/history";
import { copyText, errText, useLoad, useToast } from "../lib/hooks";

const ATT: { id: AttendanceStatus; label: string }[] = [
  { id: "assigned", label: "Assigned" }, { id: "attended", label: "Attended" }, { id: "missed", label: "Missed" },
];

export function EventDetail() {
  const { id = "" } = useParams();
  const api = useApi();
  const toast = useToast();
  const nav = useNavigate();
  const { ministries } = useAppState();
  const data = useLoad(async () => {
    const [events, vols, asg] = await Promise.all([api.listEvents(), api.listVolunteers(), api.listAssignments()]);
    return { events, vols, asg };
  }, [api]);
  const [editing, setEditing] = useState(false);
  const [pickQ, setPickQ] = useState("");
  const [onlyInterested, setOnlyInterested] = useState(true);
  const [pickSel, setPickSel] = useState<Set<string>>(new Set());

  const hist = useMemo(() => historyByVolunteer(data.data?.asg ?? [], data.data?.events ?? []), [data.data]);

  if (!data.data) return data.error ? <div className="notice">{data.error}</div> : <p className="muted">Loading…</p>;
  const ev = data.data.events.find((e) => e.id === id);
  if (!ev) return <div className="empty"><h3>Event not found</h3><p>It may have been deleted.</p><Link className="btn" to="/events">All events</Link></div>;

  const vols = data.data.vols;
  const volById = new Map(vols.map((v) => [v.id, v]));
  const rs = data.data.asg.filter((a) => a.event_id === ev.id && volById.has(a.volunteer_id));
  const roster = rs.map((a) => ({ a, v: volById.get(a.volunteer_id)! })).sort((x, y) => x.v.name.localeCompare(y.v.name));
  const onRoster = new Set(rs.map((a) => a.volunteer_id));
  const area = ministries.find((m) => m.id === ev.area);
  const interested = (vid: string) => !!ev.area && !!volById.get(vid)?.ministries.includes(ev.area);
  const cnt = (s: AttendanceStatus) => rs.filter((a) => a.status === s).length;

  const q = pickQ.trim().toLowerCase();
  const cands = vols
    .filter((v) => !onRoster.has(v.id))
    .filter((v) => !(ev.area && onlyInterested) || interested(v.id))
    .filter((v) => !q || `${v.name} ${v.email} ${v.phone}`.toLowerCase().includes(q))
    .sort((a, b) => Number(interested(b.id)) - Number(interested(a.id)) || a.name.localeCompare(b.name));
  const selected = [...pickSel].filter((x) => !onRoster.has(x));

  async function act(fn: () => Promise<unknown>, msg?: string) {
    try { await fn(); if (msg) toast(msg); await data.reload(); } catch (e) { toast(errText(e)); }
  }
  const setStatus = (a: Assignment, s: AttendanceStatus) => a.status !== s && act(() => api.setAttendance(a.id, s));

  return (
    <div className="detail">
      <Link className="linkbtn back" to="/events">← All events</Link>
      <h2 className="title">{ev.name}</h2>
      <div className="meta">
        <span>{longDate(ev.date)}{ev.time ? ` · ${ev.time}` : ""}</span>
        {ev.place && <span>{ev.place}</span>}
        {area && <span className={"tag" + (area.kind === "event" ? " event" : "")}>{area.label}</span>}
        <button className="linkbtn" type="button" onClick={() => setEditing(true)}>Edit details</button>
      </div>
      {ev.notes && <p className="notes">{ev.notes}</p>}
      <div className="tally">
        <div><b>{ev.needed ? `${rs.length}/${ev.needed}` : rs.length}</b><small>On roster</small></div>
        <div><b>{cnt("attended")}</b><small>Attended</small></div>
        <div><b>{cnt("missed")}</b><small>Missed</small></div>
      </div>

      <section className="sect">
        <div className="evhead tight">
          <h2>Roster</h2>
          <div className="actions">
            {rs.some((a) => a.status === "assigned") && (
              <button className="btn" type="button" onClick={() => act(async () => {
                for (const a of rs.filter((x) => x.status === "assigned")) await api.setAttendance(a.id, "attended");
              }, "Marked everyone attended")}>Mark all attended</button>
            )}
            {roster.some((x) => x.v.email) && (
              <button className="btn" type="button" onClick={() => {
                const em = [...new Set(roster.map((x) => x.v.email).filter(Boolean))];
                void copyText(em.join(", "), plural(em.length, "email"), toast);
              }}>Copy roster emails</button>
            )}
          </div>
        </div>
        {roster.length ? (
          <div className="roster">
            {roster.map(({ a, v }) => (
              <div className="rrow" key={a.id}>
                <div className="who minw0"><b>{v.name}</b><span>{[v.phone, v.email].filter(Boolean).join(" · ") || "No contact info"}</span></div>
                <div className="seg" role="group" aria-label={`Attendance for ${v.name}`}>
                  {ATT.map((s) => (
                    <button key={s.id} type="button" className={`s-${s.id}`} aria-pressed={a.status === s.id} onClick={() => void setStatus(a, s.id)}>{s.label}</button>
                  ))}
                </div>
                <button type="button" className="x" aria-label={`Remove ${v.name} from this event`} title="Remove from roster"
                  onClick={() => void act(() => api.unassign(a.id), `Removed ${v.name}`)}>×</button>
              </div>
            ))}
          </div>
        ) : <p className="muted">No one is assigned yet. Pick volunteers below.</p>}
      </section>

      <section className="sect">
        <h2 className="subhead">Add volunteers</h2>
        <div className="picker">
          <div className="opts">
            <input type="search" id="pick-q" placeholder="Search volunteers" aria-label="Search volunteers to add" value={pickQ} onChange={(e) => setPickQ(e.target.value)} />
            {area && <label className="inline"><input type="checkbox" id="pick-only" checked={onlyInterested} onChange={(e) => setOnlyInterested(e.target.checked)} /> Only people who checked {area.label}</label>}
          </div>
          {cands.length ? (
            <div className="plist">
              {cands.map((v) => {
                const h = hist.get(v.id);
                return (
                  <label key={v.id}>
                    <input type="checkbox" checked={pickSel.has(v.id)} onChange={(e) => setPickSel((s) => { const n = new Set(s); if (e.target.checked) n.add(v.id); else n.delete(v.id); return n; })} />
                    <div className="minw0">
                      <div className="nm">{v.name} {interested(v.id) && <span className="badge">Interested</span>}</div>
                      <div className="sub">{[v.phone, h?.attended ? `served ${h.attended}×` : "", h?.missed ? `missed ${h.missed}×` : ""].filter(Boolean).join(" · ")}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="muted">{!vols.length ? "Add volunteers first, on the Volunteers tab."
              : area && onlyInterested ? `Everyone who checked ${area.label} is already on the roster. Untick the box to see all volunteers.`
              : "Everyone matching is already on the roster."}</p>
          )}
          <div>
            <button className="btn primary" type="button" disabled={!selected.length} onClick={() => void act(async () => {
              const n = await api.assign(ev.id, selected); setPickSel(new Set()); toast(`Added ${n} to the roster`);
            })}>{selected.length ? `Add ${selected.length} to roster` : "Add to roster"}</button>
          </div>
        </div>
      </section>

      <Modal open={editing} onClose={() => setEditing(false)} labelledBy="ev-dlg-title">
        {editing && <EventForm event={ev} onCancel={() => setEditing(false)}
          onSaved={() => { setEditing(false); toast("Saved"); void data.reload(); }}
          onDeleted={() => { setEditing(false); toast(`Deleted ${ev.name}`); nav("/events"); }} />}
      </Modal>
    </div>
  );
}
