import type {
  Api, Assignment, ChurchEvent, Ministry, Profile, Role, Session, Volunteer, VolunteerInput,
} from "./types";
import { DEFAULT_MINISTRIES } from "../lib/ministries";

/**
 * Demo mode: everything lives in this browser (localStorage), nothing is sent anywhere.
 * Used to try the app before Supabase is set up, and by the automated tests.
 * Sign in with any email; emails starting with "admin" or "coord" get those roles.
 */
interface Store {
  profiles: Profile[];
  ministries: Ministry[];
  volunteers: Volunteer[];
  events: ChurchEvent[];
  assignments: Assignment[];
  sessionUserId: string | null;
}

const KEY = "pov-demo-v1";
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const iso = (daysFromNow: number) => {
  const d = new Date(Date.now() + daysFromNow * 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function seed(): Store {
  const now = new Date().toISOString();
  const v = (name: string, email: string, ministries: string[], extra: Partial<Volunteer> = {}): Volunteer => ({
    id: uid(), user_id: null, name, phone: "", email, ministries, notes: "", contacted: false, source: "card", created_at: now, ...extra,
  });
  const volunteers = [
    v("Example: Ann Example", "ann@example.org", ["pierogies", "pancake"], { phone: "555-010-0101", contacted: true }),
    v("Example: Ben Sample", "ben@example.org", ["greeter-usher", "parish-security"], { phone: "555-010-0102" }),
    v("Example: Cara Demo", "cara@example.org", ["childrens-liturgy", "movie-night"]),
    v("Example: Dan Placeholder", "dan@example.org", ["pierogies", "craft-flea"], { phone: "555-010-0104" }),
  ];
  const events: ChurchEvent[] = [
    { id: uid(), name: "Example: Fall pierogi batch", date: iso(9), time: "8:00 am – noon", place: "Parish hall kitchen", area: "pierogies", needed: 6, notes: "" },
    { id: uid(), name: "Example: Pancake breakfast", date: iso(-12), time: "After 9:00 Mass", place: "Parish hall", area: "pancake", needed: 4, notes: "" },
  ];
  const assignments: Assignment[] = [
    { id: uid(), event_id: events[0].id, volunteer_id: volunteers[0].id, status: "assigned" },
    { id: uid(), event_id: events[1].id, volunteer_id: volunteers[0].id, status: "attended" },
    { id: uid(), event_id: events[1].id, volunteer_id: volunteers[3].id, status: "missed" },
  ];
  return { profiles: [], ministries: DEFAULT_MINISTRIES, volunteers, events, assignments, sessionUserId: null };
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch { /* fall through */ }
  return seed();
}

export function createDemoApi(): Api {
  let s = load();
  const listeners = new Set<() => void>();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* demo only */ } };
  const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 60));
  const me = () => s.profiles.find((p) => p.id === s.sessionUserId) ?? null;
  const myVol = () => s.volunteers.find((v) => v.user_id === s.sessionUserId) ?? null;
  const requireStaff = () => {
    const p = me();
    if (!p || p.role === "volunteer") throw new Error("Only coordinators can do that.");
  };
  const requireAdmin = () => { if (me()?.role !== "admin") throw new Error("Only an admin can do that."); };

  return {
    mode: "demo",

    async getSession(): Promise<Session | null> {
      const p = me();
      return delay(p ? { userId: p.id, email: p.email, profile: p } : null);
    },
    onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },

    async sendSignInLink(email) {
      const e = email.trim().toLowerCase();
      let p = s.profiles.find((x) => x.email === e);
      if (!p) {
        const role: Role = e.startsWith("admin") ? "admin" : e.startsWith("coord") ? "coordinator" : "volunteer";
        p = { id: uid(), email: e, role };
        s.profiles.push(p);
      }
      s.sessionUserId = p.id;
      // claim a matching paper card
      if (!myVol()) {
        const card = s.volunteers.find((v) => !v.user_id && v.email.toLowerCase() === e);
        if (card) card.user_id = p.id;
      }
      save();
      listeners.forEach((l) => setTimeout(l, 0));
    },

    async signOut() { s.sessionUserId = null; save(); listeners.forEach((l) => setTimeout(l, 0)); },

    async listMinistries() { return delay([...s.ministries].sort((a, b) => a.sort - b.sort)); },

    async getMyVolunteer() { return delay(myVol()); },
    async saveMyVolunteer(input: VolunteerInput) {
      const p = me(); if (!p) throw new Error("Please sign in again.");
      let v = myVol();
      const fields = { name: input.name, phone: input.phone, email: input.email, ministries: input.ministries };
      if (v) Object.assign(v, fields);
      else { v = { id: uid(), user_id: p.id, notes: "", contacted: false, source: "online", created_at: new Date().toISOString(), ...fields }; s.volunteers.push(v); }
      save(); return delay(v);
    },
    async listMyAssignments() {
      const v = myVol(); if (!v) return delay([]);
      return delay(s.assignments.filter((a) => a.volunteer_id === v.id)
        .map((a) => ({ assignment: a, event: s.events.find((e) => e.id === a.event_id)! })).filter((x) => x.event));
    },

    async listVolunteers() { requireStaff(); return delay([...s.volunteers].sort((a, b) => a.name.localeCompare(b.name))); },
    async saveVolunteer(input, id) {
      requireStaff();
      let v = id ? s.volunteers.find((x) => x.id === id) : undefined;
      if (v) Object.assign(v, input);
      else { v = { id: uid(), user_id: null, notes: "", contacted: false, source: "card", created_at: new Date().toISOString(), ...input }; s.volunteers.push(v); }
      save(); return delay(v);
    },
    async deleteVolunteer(id) {
      requireStaff();
      s.volunteers = s.volunteers.filter((v) => v.id !== id);
      s.assignments = s.assignments.filter((a) => a.volunteer_id !== id);
      save();
    },
    async listEvents() { requireStaff(); return delay(s.events); },
    async saveEvent(input, id) {
      requireStaff();
      let e = id ? s.events.find((x) => x.id === id) : undefined;
      if (e) Object.assign(e, input); else { e = { id: uid(), ...input }; s.events.push(e); }
      save(); return delay(e);
    },
    async deleteEvent(id) {
      requireStaff();
      s.events = s.events.filter((e) => e.id !== id);
      s.assignments = s.assignments.filter((a) => a.event_id !== id);
      save();
    },
    async listAssignments() { requireStaff(); return delay(s.assignments); },
    async assign(eventId, ids) {
      requireStaff();
      let n = 0;
      for (const vid of ids) {
        if (s.assignments.some((a) => a.event_id === eventId && a.volunteer_id === vid)) continue;
        s.assignments.push({ id: uid(), event_id: eventId, volunteer_id: vid, status: "assigned" }); n++;
      }
      save(); return n;
    },
    async setAttendance(id, status) {
      requireStaff();
      const a = s.assignments.find((x) => x.id === id); if (a) a.status = status; save();
    },
    async unassign(id) { requireStaff(); s.assignments = s.assignments.filter((a) => a.id !== id); save(); },

    async listProfiles() { requireStaff(); return delay([...s.profiles].sort((a, b) => a.email.localeCompare(b.email))); },
    async setRole(userId, role) {
      requireAdmin();
      const p = s.profiles.find((x) => x.id === userId); if (!p) return;
      if (p.role === "admin" && role !== "admin" && s.profiles.filter((x) => x.role === "admin").length <= 1)
        throw new Error("There must always be at least one admin.");
      p.role = role; save();
    },
    async saveMinistry(m) {
      requireAdmin();
      const i = s.ministries.findIndex((x) => x.id === m.id);
      if (i >= 0) s.ministries[i] = m; else s.ministries.push(m);
      save();
    },
  };
}

export function resetDemo() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
