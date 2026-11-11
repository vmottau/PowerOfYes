import { useState, type FormEvent } from "react";
import { useApi, type Ministry, type Role } from "../api";
import { useAppState } from "../App";
import { errText, useLoad, useToast } from "../lib/hooks";

const ROLES: { id: Role; label: string; help: string }[] = [
  { id: "volunteer", label: "Volunteer", help: "Their own card and assignments" },
  { id: "coordinator", label: "Coordinator", help: "All volunteers, events and attendance" },
  { id: "admin", label: "Admin", help: "Everything, plus roles and areas" },
];

export function Admin() {
  const api = useApi();
  const toast = useToast();
  const { session, ministries, reloadMinistries } = useAppState();
  const people = useLoad(() => api.listProfiles(), [api]);
  const [q, setQ] = useState("");

  async function changeRole(id: string, role: Role) {
    try { await api.setRole(id, role); toast("Role updated"); await people.reload(); }
    catch (e) { toast(errText(e)); await people.reload(); }
  }

  const list = (people.data ?? []).filter((p) => !q.trim() || p.email.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="admin">
      <section className="sect">
        <h2 className="subhead">People and roles</h2>
        <p className="muted">Everyone who has signed in is listed here. Give coordinators the Coordinator role so they can see volunteers and manage events.</p>
        <input type="search" id="admin-q" className="input" placeholder="Search by email" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
        {people.error && <div className="notice">{people.error}</div>}
        <div className="tablewrap">
          <table className="table">
            <thead><tr><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>{p.email}{p.id === session.userId && <span className="muted"> (you)</span>}</td>
                  <td>
                    <select aria-label={`Role for ${p.email}`} value={p.role} onChange={(e) => void changeRole(p.id, e.target.value as Role)}>
                      {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {people.data && !list.length && <tr><td colSpan={2} className="muted">No one matches.</td></tr>}
            </tbody>
          </table>
        </div>
        <ul className="rolehelp">{ROLES.map((r) => <li key={r.id}><b>{r.label}:</b> {r.help}</li>)}</ul>
      </section>

      <section className="sect">
        <h2 className="subhead">Areas of interest</h2>
        <p className="muted">These are the checkboxes volunteers see. Hide an area to stop offering it; people who already checked it keep it.</p>
        <div className="arealist">
          {ministries.map((m) => <AreaRow key={m.id} m={m} onSaved={reloadMinistries} />)}
        </div>
        <NewArea onSaved={reloadMinistries} nextSort={Math.max(0, ...ministries.map((m) => m.sort)) + 10} />
      </section>
    </div>
  );
}

function AreaRow({ m, onSaved }: { m: Ministry; onSaved: () => Promise<void> }) {
  const api = useApi();
  const toast = useToast();
  const [label, setLabel] = useState(m.label);
  const save = async (patch: Partial<Ministry>) => {
    try { await api.saveMinistry({ ...m, ...patch }); await onSaved(); toast("Saved"); } catch (e) { toast(errText(e)); }
  };
  return (
    <div className={"arearow" + (m.active ? "" : " off")}>
      <input aria-label={`Name for ${m.label}`} value={label} onChange={(e) => setLabel(e.target.value)}
        onBlur={() => { if (label.trim() && label.trim() !== m.label) void save({ label: label.trim() }); }} />
      <span className={"tag" + (m.kind === "event" ? " event" : "")}>{m.kind === "event" ? "Event" : "Ministry"}</span>
      <button className="btn small" type="button" onClick={() => void save({ active: !m.active })}>{m.active ? "Hide" : "Show"}</button>
    </div>
  );
}

function NewArea({ onSaved, nextSort }: { onSaved: () => Promise<void>; nextSort: number }) {
  const api = useApi();
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<Ministry["kind"]>("event");
  async function submit(e: FormEvent) {
    e.preventDefault();
    const l = label.trim(); if (!l) return;
    const id = l.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36).slice(-4);
    try { await api.saveMinistry({ id, label: l, kind, hint: "", sort: nextSort, active: true }); setLabel(""); await onSaved(); toast(`Added ${l}`); }
    catch (err) { toast(errText(err)); }
  }
  return (
    <form className="newarea" onSubmit={submit}>
      <input id="new-area" aria-label="New area name" placeholder="New area, e.g. Fish Fry" value={label} onChange={(e) => setLabel(e.target.value)} />
      <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as Ministry["kind"])}>
        <option value="ministry">Parish ministry</option><option value="event">Event</option>
      </select>
      <button className="btn" type="submit" disabled={!label.trim()}>Add area</button>
    </form>
  );
}
