import type { Ministry } from "../api/types";

/** The checkboxes on the Power of Yes card. The database is seeded with the same list (supabase/schema.sql). */
export const DEFAULT_MINISTRIES: Ministry[] = [
  { id: "childrens-liturgy", label: "Children's Liturgy", kind: "ministry", hint: "Once a month", sort: 10, active: true },
  { id: "hallow-helper", label: "Hallow Helper", kind: "ministry", hint: "5–10 min after Mass", sort: 20, active: true },
  { id: "parish-leadership", label: "Parish Leadership", kind: "ministry", hint: "", sort: 30, active: true },
  { id: "greeter-usher", label: "Mass Greeter / Usher", kind: "ministry", hint: "", sort: 40, active: true },
  { id: "parish-security", label: "Parish Security", kind: "ministry", hint: "", sort: 50, active: true },
  { id: "lawn-games", label: "Outdoor Lawn Game Organizer", kind: "event", hint: "", sort: 60, active: true },
  { id: "craft-flea", label: "Craft Shows & Flea Market", kind: "event", hint: "", sort: 70, active: true },
  { id: "pierogies", label: "Pierogies", kind: "event", hint: "", sort: 80, active: true },
  { id: "movie-night", label: "Movie Night", kind: "event", hint: "", sort: 90, active: true },
  { id: "potluck", label: "International Pot Luck", kind: "event", hint: "", sort: 100, active: true },
  { id: "pancake", label: "All-You-Can-Eat Pancake Breakfast", kind: "event", hint: "", sort: 110, active: true },
];
