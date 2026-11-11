import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useApi, type Volunteer, type VolunteerInput } from "../api";
import { PageHeader, useAppState } from "../App";
import { FollowupForm } from "../components/FollowupForm";
import { Modal } from "../components/Modal";
import { VolunteerFields, validateVolunteer } from "../components/VolunteerFields";
import { EventForm } from "../components/EventForm";
import { digits, isPast, longDate, plural } from "../lib/format";
import { HistoryLine, historyByVolunteer } from "../lib/history";
import { copyText, errText, useLoad, useToast } from "../lib/hooks";

type StatusFilter = null | "todo" | "done" | "online";

export function Directory() {
  const api = useApi();
  const toast = useToast();
  const nav = useNavigate();
  const { ministries } = useAppState();
  const data = useLoad(async () => {
    const [vols, events, asg, fus, people] = await Promise.all([api.listVolunteers(), api.listEvents(), api.listAssignments(), api.listFollowups(), api.listProfiles()]);
    return { vols, events, asg, fus, staff: people.filter((p) => p.role !== "volunteer") };
  }, [api]);

  const [q, setQ] = useState("");
  const [areas, setAreas] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<StatusFilter>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [editing, setEditing] = useState<Volunteer | "new" | null>(null);
  const [newEventFor, setNewEventFor] = useState<string[] | null>(null);
  const [followFor, setFollowFor] = useState<Volunteer | null>(null);

  const vols = data.data?.vols ?? [];
  const events = data.data?.events ?? [];
  const hist = useMemo(() => historyByVolunteer(data.data?.asg ?? [], events), [data.data, events]);

  const matchesText = (v: Volunteer) => {
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase(), d = digits(q);
    return `${v.name} ${v.email} ${v.notes}`.toLowerCase().includes(s) || (d.length >= 3 && digits(v.phone).includes(d));
  };
  const matchesStatus = (v: Volunteer) =>
    status === "todo" ? !v.contacted : status === "done" ? v.contacted : status === "online" ? !!v.user_id : true;
  const matchesArea = (v: Volunteer) => !areas.size || v.ministries.some((m) => areas.has(m));
  const shown = vols.filter((v) => matchesText(v) && matchesStatus(v) && matchesArea(v));
  const base = vols.filter((v) => matchesText(v) && matchesStatus(v));
  const baseNoStatus = vols.filter((v) => matchesText(v) && matchesArea(v));
  const filtering = !!(q || areas.size || status);
  const openFus = (id: string) => (data.data?.fus ?? []).filter((f) => f.volunteer_id === id && !f.done).length;
  const upcoming = events.filter((e) => !isPast(e.date)).sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  const toggleArea = (id: string) => setAreas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const togglePick = (id: string, on: boolean) => setPicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  async function assignPicked(eventId: string, ids: string[]) {
    try {
      const n = await api.assign(eventId, ids);
      const ev = events.find((e) => e.id === eventId);
      toast(`Assigned ${n} to ${ev?.name ?? "the event"}${n < ids.length ? ` (${ids.length - n} already on the roster)` : ""}`);
      setPicked(new Set()); setTarget("");
      await data.reload();
    } catch (e) { toast(errText(e)); }
  }

  const statusChips: { id: Exclude<StatusFilter, null>; label: string; count: number }[] = [
    { id: "todo", label: "Not contacted yet", count: baseNoStatus.filter((v) => !v.contacted).length },
    { id: "done", label: "Contacted", count: baseNoStatus.filter((v) => v.contacted).length },
    { id: "online", label: "Signed up online", count: baseNoStatus.filter((v) => v.user_id).length },
  ];

  return (
    <div className={picked.size ? "has-selbar" : undefined}>
      <PageHeader title="Volunteers" sub={data.data ? `${plural(vols.length, "volunteer")} · ${vols.filter((v) => !v.contacted).length} not contacted yet` : "Loading…"}>
        <button className="btn primary" type="button" onClick={() => setEditing("new")}>+ Add a paper card</button>
      </PageHeader>

      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 24 24" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input id="dir-q" type="search" placeholder="Search name, phone or email" aria-label="Search volunteers" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {data.error && <div className="notice">{data.error}</div>}

      <section className="filters" aria-label="Filter by area of interest">
        {(["ministry", "event"] as const).map((kind) => (
          <div className="group" key={kind}>
            <h2>{kind === "ministry" ? "Parish ministries" : "Events"}</h2>
            <div className="chips">
              {ministries.filter((m) => m.kind === kind && m.active).map((m) => (
                <button key={m.id} type="button" className={"chip" + (kind === "event" ? " event" : "")} aria-pressed={areas.has(m.id)} onClick={() => toggleArea(m.id)}>
                  <span className="box" aria-hidden="true" />{m.label}<span className="n">{data.data ? base.filter((v) => v.ministries.includes(m.id)).length : ""}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="group">
          <h2>Contact status</h2>
          <div className="chips">
            {statusChips.map((c) => (
              <button key={c.id} type="button" className="chip status" aria-pressed={status === c.id} onClick={() => setStatus(status === c.id ? null : c.id)}>
                <span className="box" aria-hidden="true" />{c.label}<span className="n">{data.data ? c.count : ""}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="resultbar">
        <p>
          {data.data ? <><b>{plural(shown.length, "volunteer")}</b>{areas.size ? ` interested in ${[...areas].map((id) => ministries.find((m) => m.id === id)?.label ?? id).join(" or ")}` : filtering ? " match" : " in the directory"}</> : "Loading volunteers…"}
        </p>
        <div className="actions">
          {filtering && <button className="linkbtn" type="button" onClick={() => { setQ(""); setAreas(new Set()); setStatus(null); }}>Clear filters</button>}
          <button className="btn" type="button" disabled={!shown.length} onClick={() => setPicked(new Set([...picked, ...shown.map((v) => v.id)]))}>Select all shown</button>
          <button className="btn" type="button" disabled={!shown.some((v) => v.email)} onClick={() => {
            const em = [...new Set(shown.map((v) => v.email).filter(Boolean))];
            void copyText(em.join(", "), plural(em.length, "email"), toast);
          }}>Copy emails</button>
        </div>
      </div>

      <div className="list">
        {data.data && !vols.length && (
          <div className="empty">
            <h3>No volunteers yet</h3>
            <p>Volunteers who sign up online appear here automatically. Type in returned paper cards with “Add a paper card”.</p>
            <button className="btn primary" type="button" onClick={() => setEditing("new")}>+ Add a paper card</button>
          </div>
        )}
        {data.data && vols.length > 0 && !shown.length && (
          <div className="empty"><h3>Nobody matches</h3><p>Try fewer areas or a shorter search.</p></div>
        )}
        {shown.map((v) => (
          <article key={v.id} className={"vol" + (picked.has(v.id) ? " selected" : "")}>
            <input type="checkbox" className="pick" aria-label={`Select ${v.name}`} checked={picked.has(v.id)} onChange={(e) => togglePick(v.id, e.target.checked)} />
            <div className="minw0">
              <h3>
                {v.name}
                {v.contacted ? <span className="pill done">Contacted</span> : <span className="pill new">To contact</span>}
                {v.user_id && <span className="pill online">Has login</span>}
              </h3>
              <div className="contact">
                {v.phone && <span><span className="lbl">Phone</span>{v.phone}<button className="copy" type="button" aria-label={`Copy phone for ${v.name}`} onClick={() => void copyText(v.phone, "phone number", toast)}>Copy</button></span>}
                {v.email && <span><span className="lbl">Email</span>{v.email}<button className="copy" type="button" aria-label={`Copy email for ${v.name}`} onClick={() => void copyText(v.email, "email", toast)}>Copy</button></span>}
                {!v.phone && !v.email && <span className="lbl">No contact info</span>}
              </div>
            </div>
            <div className="side">
              <button className="btn small" type="button" onClick={() => setFollowFor(v)}>Follow up</button>
              <button className="btn small" type="button" onClick={() => setEditing(v)}>Edit</button>
            </div>
            {v.ministries.length > 0 && (
              <div className="tags">
                {ministries.filter((m) => v.ministries.includes(m.id)).map((m) => <span key={m.id} className={"tag" + (m.kind === "event" ? " event" : "")}>{m.label}</span>)}
              </div>
            )}
            <div className="span2"><HistoryLine h={hist.get(v.id)} />{openFus(v.id) > 0 && <p className="history"><span className="fu-flag">{plural(openFus(v.id), "open follow-up")}</span></p>}</div>
            {v.notes && <p className="notes span2">{v.notes}</p>}
          </article>
        ))}
      </div>

      {picked.size > 0 && (
        <div className="selbar">
          <div className="in">
            <b>{picked.size} selected</b>
            <select id="assign-target" aria-label="Choose an event or project" value={target} onChange={(e) => {
              if (e.target.value === "__new") { setNewEventFor([...picked]); setTarget(""); } else setTarget(e.target.value);
            }}>
              <option value="">{upcoming.length ? "Choose an event or project…" : "No upcoming events yet"}</option>
              {upcoming.map((e) => <option key={e.id} value={e.id}>{e.name}{e.date ? ` · ${longDate(e.date)}` : ""}</option>)}
              <option value="__new">+ Create a new event…</option>
            </select>
            <button className="btn primary" type="button" disabled={!target} onClick={() => void assignPicked(target, [...picked])}>Assign</button>
            <button className="btn" type="button" onClick={() => setPicked(new Set())}>Clear</button>
          </div>
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} labelledBy="vol-dlg-title">
        {editing !== null && (
          <VolunteerDialog
            vol={editing === "new" ? null : editing}
            others={vols}
            onDone={async (msg) => { setEditing(null); toast(msg); await data.reload(); }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <Modal open={followFor !== null} onClose={() => setFollowFor(null)} labelledBy="fu-dlg-title">
        {followFor && data.data && (
          <FollowupForm followup={null} volunteers={vols} staff={data.data.staff} volunteerId={followFor.id}
            onCancel={() => setFollowFor(null)}
            onSaved={() => { setFollowFor(null); toast("Follow-up added"); void data.reload(); }} />
        )}
      </Modal>

      <Modal open={newEventFor !== null} onClose={() => setNewEventFor(null)} labelledBy="ev-dlg-title">
        {newEventFor && (
          <EventForm
            event={null}
            defaultArea={areas.size === 1 ? [...areas][0] : null}
            onCancel={() => setNewEventFor(null)}
            onSaved={async (ev) => {
              const ids = newEventFor; setNewEventFor(null);
              try { const n = await api.assign(ev.id, ids); toast(`Created ${ev.name} and assigned ${n}`); setPicked(new Set()); nav(`/events/${ev.id}`); }
              catch (e) { toast(errText(e)); }
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function VolunteerDialog({ vol, others, onDone, onCancel }: {
  vol: Volunteer | null; others: Volunteer[]; onDone: (msg: string) => void; onCancel: () => void;
}) {
  const api = useApi();
  const { ministries } = useAppState();
  const [form, setForm] = useState<VolunteerInput>(vol
    ? { name: vol.name, phone: vol.phone, email: vol.email, ministries: vol.ministries, notes: vol.notes, contacted: vol.contacted }
    : { name: "", phone: "", email: "", ministries: [], notes: "", contacted: false, source: "card" });
  const [warn, setWarn] = useState<string | null>(null);
  const [dupAck, setDupAck] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validateVolunteer(form);
    if (problem) { setWarn(problem); return; }
    const em = form.email.trim().toLowerCase(), ph = digits(form.phone);
    const dup = others.find((o) => o.id !== vol?.id && ((em && o.email.toLowerCase() === em) || (ph.length >= 7 && digits(o.phone) === ph)));
    if (dup && !dupAck) { setDupAck(true); setWarn(`${dup.name} already has this phone or email. Press Save again to keep both.`); return; }
    setBusy(true);
    try {
      await api.saveVolunteer({ ...form, name: form.name.trim(), email: form.email.trim() }, vol?.id);
      onDone(vol ? `Saved changes to ${form.name.trim()}` : `Added ${form.name.trim()}`);
    } catch (err) { setWarn(errText(err)); setBusy(false); }
  }

  return (
    <form onSubmit={submit} onInput={() => setDupAck(false)} noValidate>
      <h2 id="vol-dlg-title">{vol ? "Edit volunteer" : "Add a paper card"}</h2>
      {vol?.user_id && <p className="muted small">This volunteer has their own login and can also edit their name, phone, email and interests.</p>}
      <VolunteerFields value={form} onChange={setForm} ministries={ministries} idPrefix="vd" />
      <div className="field">
        <label htmlFor="vd-notes">Staff notes</label>
        <textarea id="vd-notes" rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Only coordinators see this" />
      </div>
      <label className="inline"><input type="checkbox" id="vd-contacted" checked={!!form.contacted} onChange={(e) => setForm({ ...form, contacted: e.target.checked })} /> We've reached out to this person</label>
      {warn && <p className="warn">{warn}</p>}
      <div className="formfoot">
        <div>
          {vol && !confirmDel && <button className="btn danger" type="button" onClick={() => setConfirmDel(true)}>Delete</button>}
          {vol && confirmDel && (
            <div className="confirmdel">
              Delete {vol.name} and their event history?
              <button className="btn danger" type="button" onClick={async () => {
                try { await api.deleteVolunteer(vol.id); onDone(`Deleted ${vol.name}`); } catch (err) { setWarn(errText(err)); }
              }}>Yes, delete</button>
              <button className="btn" type="button" onClick={() => setConfirmDel(false)}>Keep</button>
            </div>
          )}
        </div>
        <div className="right">
          <button className="btn" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn primary" type="submit" disabled={busy}>Save</button>
        </div>
      </div>
    </form>
  );
}
