import type { ChurchEvent } from "../api";
import { dateParts } from "./format";

/** The follow-up text coordinators see when a volunteer says they can't make it. Matches cant_make_it() in schema.sql. */
export function cantMakeItNote(ev: Pick<ChurchEvent, "name" | "date">, reason: string): string {
  const d = ev.date ? dateParts(ev.date) : null;
  const r = reason.trim();
  return `Can't make it to ${ev.name}${d ? ` (${d.mon} ${d.day})` : ""}. Find someone to fill the spot.${r ? ` They said: "${r}"` : ""}`;
}
