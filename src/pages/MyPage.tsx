import { useEffect, useState, type FormEvent } from "react";
import { useApi, type VolunteerInput } from "../api";
import { PageHeader, useAppState } from "../App";
import { VolunteerFields, validateVolunteer } from "../components/VolunteerFields";
import { dateParts, isPast, longDate } from "../lib/format";
import { errText, useLoad, useToast } from "../lib/hooks";

const STATUS_TEXT = { assigned: "Scheduled", attended: "You served", missed: "Marked absent" } as const;

export function MyPage() {
  const api = useApi();
  const toast = useToast();
  const { session, ministries } = useAppState();
  const me = useLoad(() => api.getMyVolunteer(), [api]);
  const mine = useLoad(() => api.listMyAssignments(), [api]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<VolunteerInput>({ name: "", phone: "", email: session.email, ministries: [] });
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      setEditing(false);
      toast(me.data ? "Your card is updated" : "Thank you for saying yes! Your card is saved.");
    } catch (err) { setWarn(errText(err)); } finally { setBusy(false); }
  }

  if (me.loading && !me.data) return <p className="muted">Loading your card…</p>;
  if (me.error) return <div className="notice">{me.error}</div>;

  const showForm = editing || !me.data;
  const label = (id: string) => ministries.find((m) => m.id === id)?.label ?? id;
  const items = (mine.data ?? []).slice().sort((a, b) => (a.event.date ?? "9999").localeCompare(b.event.date ?? "9999"));
  const upcoming = items.filter((x) => !isPast(x.event.date));
  const past = items.filter((x) => isPast(x.event.date)).reverse();
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

      {me.data && (
        <section className="sect">
          <div className="evhead"><h2>Where you're scheduled</h2>{served > 0 && <span className="muted">You've served {served} {served === 1 ? "time" : "times"}. Thank you!</span>}</div>
          {mine.loading && !mine.data ? <p className="muted">Loading…</p> : upcoming.length ? (
            <div className="list">
              {upcoming.map(({ assignment, event }) => {
                const d = dateParts(event.date);
                return (
                  <div key={assignment.id} className="ev static">
                    <div className="date"><small>{d.mon}</small><b>{d.day}</b></div>
                    <div className="minw0">
                      <h3>{event.name}</h3>
                      <p>{[longDate(event.date), event.time, event.place].filter(Boolean).join(" · ")}</p>
                      {event.notes && <p>{event.notes}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty small"><p>You're not scheduled for anything yet. A coordinator will reach out when something comes up that matches your interests.</p></div>
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
    </div>
  );
}
