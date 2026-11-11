import type React from "react";
import type { Assignment, ChurchEvent } from "../api";
import { isPast } from "./format";

export interface History { attended: number; missed: number; upcoming: number }

/** Per-volunteer attendance counts, used on the directory and when picking people for an event. */
export function historyByVolunteer(assignments: Assignment[], events: ChurchEvent[]): Map<string, History> {
  const evs = new Map(events.map((e) => [e.id, e]));
  const out = new Map<string, History>();
  for (const a of assignments) {
    const ev = evs.get(a.event_id);
    if (!ev) continue;
    const h = out.get(a.volunteer_id) ?? { attended: 0, missed: 0, upcoming: 0 };
    if (a.status === "attended") h.attended++;
    else if (a.status === "missed") h.missed++;
    else if (!isPast(ev.date)) h.upcoming++;
    out.set(a.volunteer_id, h);
  }
  return out;
}

export function HistoryLine({ h }: { h?: History }) {
  if (!h || (!h.attended && !h.missed && !h.upcoming)) return null;
  const parts: React.ReactNode[] = [];
  if (h.attended) parts.push(<b key="a">Served {h.attended}×</b>);
  if (h.missed) parts.push(<span key="m" className="miss">Missed {h.missed}×</span>);
  if (h.upcoming) parts.push(<span key="u">{h.upcoming} upcoming</span>);
  return <p className="history">{parts.flatMap((p, i) => (i ? [" · ", p] : [p]))}</p>;
}
