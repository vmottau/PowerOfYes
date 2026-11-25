import { Link } from "react-router-dom";
import { useApi } from "../api";
import { PageHeader, useAppState } from "../App";
import { dateParts, isPast, longDate, todayISO } from "../lib/format";
import { errText, useLoad, useToast } from "../lib/hooks";
import { useBranding } from "../lib/branding";
import { FollowupRow } from "./Followups";
import { Tip } from "../components/Tip";

export function Dashboard() {
  const api = useApi();
  const toast = useToast();
  const { branding } = useBranding();
  const { ministries } = useAppState();
  const data = useLoad(async () => {
    const [vols, events, asg, fus, people] = await Promise.all([api.listVolunteers(), api.listEvents(), api.listAssignments(), api.listFollowups(), api.listProfiles()]);
    return { vols, events, asg, fus, staff: people.filter((p) => p.role !== "volunteer") };
  }, [api]);

  if (!data.data) return <>{data.error ? <div className="notice">{data.error}</div> : <p className="muted">Loading…</p>}</>;
  const { vols, events, asg, fus, staff } = data.data;
  const today = todayISO();
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const upcoming = events.filter((e) => !isPast(e.date)).sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  const rosterSize = (id: string) => asg.filter((a) => a.event_id === id && a.status !== "cant_make_it").length;
  const evById = new Map(events.map((e) => [e.id, e]));
  const volById = new Map(vols.map((v) => [v.id, v]));
  const cantGo = asg
    .filter((a) => a.status === "cant_make_it" && evById.has(a.event_id) && volById.has(a.volunteer_id) && !isPast(evById.get(a.event_id)!.date))
    .map((a) => ({ a, e: evById.get(a.event_id)!, v: volById.get(a.volunteer_id)! }))
    .sort((x, y) => (x.e.date ?? "9999").localeCompare(y.e.date ?? "9999"));
  const needPeople = upcoming.filter((e) => e.needed && rosterSize(e.id) < e.needed);
  const dueFus = fus.filter((f) => !f.done && (!f.due || f.due <= today)).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const newVols = vols.filter((v) => v.created_at >= monthAgo).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const label = (id: string | null) => ministries.find((m) => m.id === id)?.label;

  return (
    <div>
      <PageHeader title="Home" sub={`${branding.org_name} · ${longDate(today)}`} />
      <div className="tiles">
        <Link to="/volunteers" className="tile"><b>{vols.length}</b><span>Volunteers</span></Link>
        <Link to="/volunteers" className="tile"><b>{newVols.length}</b><span>New in the last 30 days</span></Link>
        <Link to="/followups" className={"tile" + (dueFus.length ? " attention" : "")}><b>{dueFus.length}</b><span>Follow-ups due</span></Link>
        <Link to="/events" className="tile"><b>{upcoming.length}</b><span>Upcoming events</span></Link>
      </div>

      {cantGo.length > 0 && (
        <section className="panel alert" aria-labelledby="cant-title">
          <div className="panelhead"><h2 id="cant-title">Can't make it</h2><span className="muted">Find someone to fill these spots</span></div>
          {cantGo.map(({ a, e, v }) => {
            const d = dateParts(e.date);
            return (
              <Link key={a.id} to={`/events/${e.id}`} className="mini cantrow">
                <div className="date"><small>{d.mon}</small><b>{d.day}</b></div>
                <div className="minw0"><b>{v.name}</b><span>{e.name}{a.cant_reason ? ` · “${a.cant_reason}”` : ""}</span></div>
                <span className="pill s-cant_make_it">Can't make it</span>
              </Link>
            );
          })}
        </section>
      )}

      <div className="dashgrid">
        <section className="panel">
          <div className="panelhead"><h2>Still need volunteers <Tip>Upcoming events with fewer people than their “Volunteers needed” number. Click one to add people.</Tip></h2><Link to="/events">All events</Link></div>
          {needPeople.length ? needPeople.slice(0, 5).map((e) => {
            const d = dateParts(e.date), have = rosterSize(e.id);
            return (
              <Link key={e.id} to={`/events/${e.id}`} className="mini">
                <div className="date"><small>{d.mon}</small><b>{d.day}</b></div>
                <div className="minw0"><b>{e.name}</b><span>{[label(e.area), e.time].filter(Boolean).join(" · ")}</span></div>
                <div className="need"><div className="bar"><i style={{ width: `${Math.min(100, (have / e.needed!) * 100)}%` }} /></div><span>{have} of {e.needed}</span></div>
              </Link>
            );
          }) : <p className="muted">Every upcoming event has enough people. Set “Volunteers needed” on an event to track it here.</p>}
        </section>

        <section className="panel">
          <div className="panelhead"><h2>Follow-ups due</h2><Link to="/followups">All follow-ups</Link></div>
          {dueFus.length ? <div className="list">{dueFus.slice(0, 5).map((f) => (
            <FollowupRow key={f.id} f={f} vols={vols} staff={staff} compact onToggle={async (done) => {
              try { await api.setFollowupDone(f.id, done); toast("Marked done"); await data.reload(); } catch (e) { toast(errText(e)); }
            }} />
          ))}</div> : <p className="muted">You're all caught up.</p>}
        </section>

        <section className="panel">
          <div className="panelhead"><h2>New volunteers</h2><Link to="/volunteers">Directory</Link></div>
          {newVols.length ? newVols.slice(0, 6).map((v) => (
            <div key={v.id} className="mini plain">
              <div className="avatar" aria-hidden="true">{v.name.replace(/^Example:\s*/, "").slice(0, 1)}</div>
              <div className="minw0"><b>{v.name}</b><span>{v.ministries.map((m) => label(m)).filter(Boolean).slice(0, 3).join(", ") || "No areas picked yet"}</span></div>
              <span className={"pill " + (v.user_id ? "online" : "paper")}>{v.user_id ? "Online" : "Paper card"}</span>
            </div>
          )) : <p className="muted">No one new in the last 30 days.</p>}
        </section>
      </div>
    </div>
  );
}
