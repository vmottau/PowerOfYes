import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi, type Assignment, type ChurchEvent } from "../api";
import { PageHeader, useAppState } from "../App";
import { Modal } from "../components/Modal";
import { EventForm } from "../components/EventForm";
import { dateParts, isPast } from "../lib/format";
import { useLoad, useToast } from "../lib/hooks";

export function Events() {
  const api = useApi();
  const nav = useNavigate();
  const toast = useToast();
  const data = useLoad(async () => {
    const [events, asg] = await Promise.all([api.listEvents(), api.listAssignments()]);
    return { events, asg };
  }, [api]);
  const [creating, setCreating] = useState(false);

  const events = data.data?.events ?? [];
  const byDate = (a: ChurchEvent, b: ChurchEvent) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.name.localeCompare(b.name);
  const up = events.filter((e) => !isPast(e.date)).sort(byDate);
  const past = events.filter((e) => isPast(e.date)).sort((a, b) => byDate(b, a));

  return (
    <div>
      <PageHeader title="Events & projects" sub="Create an event, assign volunteers, then mark who came.">
        <button className="btn primary" type="button" onClick={() => setCreating(true)}>+ New event or project</button>
      </PageHeader>
      {up.length > 0 && <h2 className="subhead">Upcoming</h2>}
      {data.error && <div className="notice">{data.error}</div>}
      {!data.data ? <p className="muted">Loading events…</p> : !events.length ? (
        <div className="empty">
          <h3>No events yet</h3>
          <p>Create an event or project, like a pancake breakfast or the fall pierogi batch. Then assign volunteers and mark who came.</p>
          <button className="btn primary" type="button" onClick={() => setCreating(true)}>+ Create the first event</button>
        </div>
      ) : (
        <>
          <div className="list">{up.length ? up.map((e) => <EventRow key={e.id} ev={e} asg={data.data!.asg} />) : <p className="muted">Nothing scheduled. Past events are below.</p>}</div>
          {past.length > 0 && (
            <div className="sect">
              <h2 className="subhead">Past · mark attendance</h2>
              <div className="list">{past.map((e) => <EventRow key={e.id} ev={e} asg={data.data!.asg} />)}</div>
            </div>
          )}
        </>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} labelledBy="ev-dlg-title">
        {creating && <EventForm event={null} onCancel={() => setCreating(false)} onSaved={(ev) => { setCreating(false); toast(`Created ${ev.name}`); nav(`/events/${ev.id}`); }} />}
      </Modal>
    </div>
  );
}

function EventRow({ ev, asg }: { ev: ChurchEvent; asg: Assignment[] }) {
  const { ministries } = useAppState();
  const rs = asg.filter((a) => a.event_id === ev.id);
  const att = rs.filter((a) => a.status === "attended").length;
  const past = isPast(ev.date);
  const d = dateParts(ev.date);
  const area = ministries.find((m) => m.id === ev.area);
  return (
    <Link to={`/events/${ev.id}`} className="ev">
      <div className={"date" + (past ? " past" : "")}><small>{d.mon}</small><b>{d.day}</b></div>
      <div className="minw0">
        <h3>{ev.name}</h3>
        <p>{[ev.time, ev.place, area?.label].filter(Boolean).join(" · ") || " "}</p>
      </div>
      <div className="counts">
        {past ? <><b>{att}/{rs.length}</b> attended</> : <><b>{ev.needed ? `${rs.length}/${ev.needed}` : rs.length}</b> assigned</>}
      </div>
    </Link>
  );
}
