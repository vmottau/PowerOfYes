import { useEffect, useState, type FormEvent } from "react";
import { useApi, type MyAssignment, type OpenEvent, type VolunteerInput } from "../api";
import { PageHeader, useAppState } from "../App";
import { VolunteerFields, validateVolunteer } from "../components/VolunteerFields";
import { Modal } from "../components/Modal";
import { dateParts, isPast, longDate } from "../lib/format";
import { errText, useLoad, useToast } from "../lib/hooks";

const STATUS_TEXT = { assigned: "Scheduled", attended: "You served", missed: "Marked absent", cant_make_it: "Couldn't make it" } as const;

export function MyPage() {
  const api = useApi();
  const toast = useToast();
  const { session, ministries } = useAppState();
  const me = useLoad(() => api.getMyVolunteer(), [api]);
  const mine = useLoad(() => api.listMyAssignments(), [api]);
  const open = useLoad(() => api.listOpenEvents(), [api]);
  const [signing, setSigning] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<VolunteerInput>({ name: "", phone: "", email: session.email, ministries: [] });
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cantFor, setCantFor] = useState<MyAssignment | null>(null);

  useEffect(() => {
    if (me.data) setForm({ name: me.data.name, phone: me.data.phone, email: me.data.email, ministries: me.data.ministries });
  }, [me.data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const problem = validateVolunteer(form);
    if (problem) { setWarn(problem); return; }
    setBusy(true); setWarn(null);
    try {
      await api.saveMyVolunteer({ ...form, name: form.name.trim(), email: form.email.trim() });
      await me.reload();
      void open.reload();
      setEditing(false);
      toast(me.data ? "Your card is updated" : "Thank you for saying yes! Your card is saved.");
    } catch (err) { setWarn(errText(err)); } finally { setBusy(false); }
  }

  async function backIn(x: MyAssignment) {
    try { await api.canMakeItAfterAll(x.assignment.id); toast("Great, you're back on the schedule"); await mine.reload(); }
    catch (err) { toast(errText(err)); }
  }

  async function signUp(ev: OpenEvent) {
    setSigning(ev.id);
    try { await api.signUpForEvent(ev.id); toast(`You're signed up for ${ev.name}. Thank you!`); }
    catch (err) { toast(errText(err)); }
    finally { setSigning(null); await Promise.all([mine.reload(), open.reload()]); }
  }

  if (me.loading && !me.data) return <p className="muted">Loading your card…</p>;
  if (me.error) return <div className="notice">{me.error}</div>;

  const showForm = editing || !me.data;
  const label = (id: string) => ministries.find((m) => m.id === id)?.label ?? id;
  const items = (mine.data ?? []).slice().sort((a, b) => (a.event.date ?? "9999").localeCompare(b.event.date ?? "9999"));
  const upcoming = items.filter((x) => !isPast(x.event.date));
  const past = items.filter((x) => isPast(x.event.date)).reverse();
  const openList = (open.data ?? []).filter((x) => !isPast(x.date));
  const served = items.filter((x) => x.assignment.status === "attended").length;

  return (
    <div className="mypage">
      <PageHeader title={me.data ? `Hello, ${me.data.name.replace(/^Example:\s*/, "").split(" ")[0]}` : "Welcome"} sub={me.data ? "Thank you for saying yes." : "Let us know where you'd like to help."} />
      {showForm ? (
        <form className="card pad" onSubmit={save} noValidate>
          <h2 className="section-title">{me.data ? "Edit your card" : "Fill in your volunteer card"}</h2>
          {!me.data && <p className="muted">Check every box you're interested in. No amount of effort is too big or too small. A coordinator will reach out to you.</p>}
          <VolunteerFields value={form} onChange={setForm} ministries={ministries} idPrefix="me" />
          {warn && <p className="warn">{warn}</p>}
          <div className="formfoot">
            <div className="right">
              {me.data && <button className="btn" type="button" onClick={() => setEditing(false)}>Cancel</button>}
              <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save my card"}</button>
            </div>
          </div>
        </form>
      ) : (
        <section className="card pad">
          <div className="cardhead">
            <h2 className="section-title">{me.data!.name}</h2>
            <button className="btn small" type="button" onClick={() => setEditing(true)}>Edit my card</button>
          </div>
          <p className="contactline">{[me.data!.phone, me.data!.email].filter(Boolean).join(" · ") || "No phone or email yet"}</p>
          <div className="tags">
            {me.data!.ministries.length
              ? me.data!.ministries.map((id) => <span key={id} className={"tag" + (ministries.find((m) => m.id === id)?.kind === "event" ? " event" : "")}>{label(id)}</span>)
              : <span className="muted">You haven't picked any areas yet.</span>}
          </div>
        </section>
      )}

      {me.data && !!openList.length && (
        <section className="sect" aria-labelledby="open-title">
          <div className="evhead"><h2 id="open-title">Open spots you can sign up for</h2><span className="muted">Picked from the areas on your card</span></div>
          <div className="list">
            {openList.map((ev) => {
              const d = dateParts(ev.date);
              const left = ev.needed == null ? null : Math.max(0, ev.needed - ev.taken);
              return (
                <div key={ev.id} className={"ev static myev openev" + (left === 0 ? " full" : "")}>
                  <div className="date"><small>{d.mon}</small><b>{d.day}</b></div>
                  <div className="minw0">
                    <h3>{ev.name}</h3>
                    <p>{[longDate(ev.date), ev.time, ev.place, ev.area ? label(ev.area) : ""].filter(Boolean).join(" · ")}</p>
                    {ev.notes && <p>{ev.notes}</p>}
                    <p className="spots">{left === null ? (ev.taken ? `${ev.taken} signed up so far` : "Be the first to sign up")
                      : left === 0 ? "All spots are taken" : `${left} of ${ev.needed} ${ev.needed === 1 ? "spot" : "spots"} left`}</p>
                  </div>
                  <div className="myev-act">
                    {left === 0
                      ? <span className="pill paper">Full</span>
                      : <button className="btn small primary" type="button" disabled={signing === ev.id} onClick={() => void signUp(ev)}>{signing === ev.id ? "Signing up…" : "Sign me up"}</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {me.data && (
        <section className="sect">
          <div className="evhead"><h2>Where you're scheduled</h2>{served > 0 && <span className="muted">You've served {served} {served === 1 ? "time" : "times"}. Thank you!</span>}</div>
          {mine.loading && !mine.data ? <p className="muted">Loading…</p> : upcoming.length ? (
            <div className="list">
              {upcoming.map(({ assignment, event }) => {
                const d = dateParts(event.date);
                const cant = assignment.status === "cant_make_it";
                return (
                  <div key={assignment.id} className={"ev static myev" + (cant ? " cant" : "")}>
                    <div className="date"><small>{d.mon}</small><b>{d.day}</b></div>
                    <div className="minw0">
                      <h3>{event.name}</h3>
                      <p>{[longDate(event.date), event.time, event.place].filter(Boolean).join(" · ")}</p>
                      {event.notes && <p>{event.notes}</p>}
                      {cant && <p className="cantnote"><span className="pill s-cant_make_it">Can't make it</span> We let the coordinators know. Thank you for telling us ahead of time.</p>}
                    </div>
                    <div className="myev-act">
                      {assignment.status === "assigned" && <button className="btn small" type="button" onClick={() => setCantFor({ assignment, event })}>Can't make it</button>}
                      {cant && <button className="linkbtn" type="button" onClick={() => void backIn({ assignment, event })}>I can make it after all</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty small"><p>You're not scheduled for anything yet. A coordinator will reach out when something comes up that matches your interests, and open spots you can sign up for will show up on this page.</p></div>
          )}
          {past.length > 0 && (
            <>
              <h2 className="subhead">Past</h2>
              <div className="list">
                {past.map(({ assignment, event }) => (
                  <div key={assignment.id} className="pastrow">
                    <span>{event.name} <span className="muted">· {longDate(event.date)}</span></span>
                    <span className={`pill s-${assignment.status}`}>{STATUS_TEXT[assignment.status]}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <Modal open={!!cantFor} onClose={() => setCantFor(null)} labelledBy="cant-dlg-title">
        {cantFor && <CantMakeItForm item={cantFor} onCancel={() => setCantFor(null)}
          onDone={() => { setCantFor(null); toast("Thanks for letting us know. The coordinators have been told."); void mine.reload(); }} />}
      </Modal>
    </div>
  );
}

function CantMakeItForm({ item, onCancel, onDone }: { item: MyAssignment; onCancel: () => void; onDone: () => void }) {
  const api = useApi();
  const [reason, setReason] = useState("");
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setWarn(null);
    try { await api.cantMakeIt(item.assignment.id, reason); onDone(); }
    catch (err) { setWarn(errText(err)); setBusy(false); }
  }
  return (
    <form onSubmit={submit} noValidate>
      <h2 id="cant-dlg-title">Can't make it?</h2>
      <p className="muted">{item.event.name} · {[longDate(item.event.date), item.event.time].filter(Boolean).join(" · ")}</p>
      <p>No problem. We'll free up your spot and let the coordinators know so they can find someone else.</p>
      <div className="field">
        <label htmlFor="cant-reason">Anything they should know? (optional)</label>
        <textarea id="cant-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Out of town that weekend. Happy to help next time!" />
      </div>
      {warn && <p className="warn">{warn}</p>}
      <div className="formfoot">
        <div />
        <div className="right">
          <button className="btn" type="button" onClick={onCancel}>Keep me on</button>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Let them know"}</button>
        </div>
      </div>
    </form>
  );
}
