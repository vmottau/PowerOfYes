import type {
  Api, Assignment, Branding, Church, ChurchEvent, Followup, Invite, Ministry, Role, Session, Volunteer, VolunteerInput,
} from "./types";
import { DEFAULT_MINISTRIES } from "../lib/ministries";
import { DEFAULT_BRANDING } from "../lib/brandingDefaults";
import { pickCurrentChurch, rememberChurch } from "./churchChoice";

/**
 * Demo mode: everything lives in this browser (localStorage), nothing is sent anywhere.
 * Used to try the app before Supabase is set up, and by the automated tests.
 * It follows the same rules as the real database, in simplified form.
 *
 * Demo sign-ins: owner@… is the platform owner; admin@… and coordinator@… run St. Example Parish;
 * anyone else is a volunteer at whichever church link they came from.
 */
type Row<T> = T & { church_id: string };
interface Account { id: string; email: string; isPlatformAdmin: boolean }
interface Store {
  accounts: Account[];
  churches: Church[];
  memberships: { church_id: string; user_id: string; role: Role }[];
  invites: Row<Invite>[];
  ministries: Row<Ministry>[];
  volunteers: Row<Volunteer>[];
  events: Row<ChurchEvent>[];
  assignments: Row<Assignment>[];
  followups: Row<Followup>[];
  sessionUserId: string | null;
}

const KEY = "pov-demo-v4";
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const iso = (daysFromNow: number) => {
  const d = new Date(Date.now() + daysFromNow * 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function seed(): Store {
  const now = new Date().toISOString();
  const c1: Church = { ...DEFAULT_BRANDING, id: uid(), slug: "st-example", org_name: "St. Example Parish", active: true };
  const c2: Church = { ...DEFAULT_BRANDING, id: uid(), slug: "grace", org_name: "Grace Community Church", app_title: "Serve at Grace", primary_color: "#24613f", accent_color: "#c08a2b", tagline: "Many hands, one family.", active: true };
  const ministries = [c1, c2].flatMap((c) => DEFAULT_MINISTRIES.map((m) => ({ ...m, church_id: c.id })));
  const v = (church_id: string, name: string, email: string, ms: string[], extra: Partial<Volunteer> = {}): Row<Volunteer> => ({
    id: uid(), church_id, user_id: null, name, phone: "", email, ministries: ms, notes: "", contacted: false, source: "card", created_at: now, ...extra,
  });
  const volunteers = [
    v(c1.id, "Example: Ann Example", "ann@example.org", ["pierogies", "pancake"], { phone: "555-010-0101", contacted: true }),
    v(c1.id, "Example: Ben Sample", "ben@example.org", ["greeter-usher", "parish-security"], { phone: "555-010-0102" }),
    v(c1.id, "Example: Cara Demo", "cara@example.org", ["childrens-liturgy", "movie-night"]),
    v(c1.id, "Example: Dan Placeholder", "dan@example.org", ["pierogies", "craft-flea"], { phone: "555-010-0104" }),
    v(c2.id, "Example: Grace Volunteer", "gv@example.org", ["potluck"]),
  ];
  const events: Row<ChurchEvent>[] = [
    { id: uid(), church_id: c1.id, name: "Example: Fall pierogi batch", date: iso(9), time: "8:00 am – noon", place: "Parish hall kitchen", area: "pierogies", needed: 6, notes: "" },
    { id: uid(), church_id: c1.id, name: "Example: Pancake breakfast", date: iso(-12), time: "After 9:00 Mass", place: "Parish hall", area: "pancake", needed: 4, notes: "" },
    { id: uid(), church_id: c2.id, name: "Example: Harvest potluck", date: iso(5), time: "6:00 pm", place: "Fellowship hall", area: "potluck", needed: 8, notes: "" },
  ];
  const assignments: Row<Assignment>[] = [
    { id: uid(), church_id: c1.id, event_id: events[0].id, volunteer_id: volunteers[0].id, status: "assigned" },
    { id: uid(), church_id: c1.id, event_id: events[1].id, volunteer_id: volunteers[0].id, status: "attended" },
    { id: uid(), church_id: c1.id, event_id: events[1].id, volunteer_id: volunteers[3].id, status: "missed" },
  ];
  const followups: Row<Followup>[] = [
    { id: uid(), church_id: c1.id, volunteer_id: volunteers[1].id, note: "Call about greeting at the 10:30 Mass", due: iso(-1), assigned_to: null, done: false, done_at: null, created_at: now },
    { id: uid(), church_id: c1.id, volunteer_id: volunteers[2].id, note: "Ask about Children's Liturgy next month", due: iso(3), assigned_to: null, done: false, done_at: null, created_at: now },
  ];
  const invites: Row<Invite>[] = [
    { id: uid(), church_id: c1.id, email: "admin@example.org", role: "admin", created_at: now },
    { id: uid(), church_id: c1.id, email: "coordinator@example.org", role: "coordinator", created_at: now },
    { id: uid(), church_id: c1.id, email: "volunteer@example.org", role: "volunteer", created_at: now },
    { id: uid(), church_id: c2.id, email: "grace-admin@example.org", role: "admin", created_at: now },
  ];
  return { accounts: [], churches: [c1, c2], memberships: [], invites, ministries, volunteers, events, assignments, followups, sessionUserId: null };
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch { /* fall through */ }
  return seed();
}

export function createDemoApi(): Api {
  const s = load();
  let churchId: string | null = null;
  const listeners = new Set<() => void>();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* demo only */ } };
  const out = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 50));
  const strip = <T extends { church_id: string }>(r: T) => { const { church_id: _c, ...rest } = r; void _c; return rest; };
  const me = () => s.accounts.find((a) => a.id === s.sessionUserId) ?? null;
  const cid = () => { if (!churchId) throw new Error("Choose a church first."); return churchId; };
  const roleIn = (c: string): Role | null => me()?.isPlatformAdmin ? "admin" : s.memberships.find((m) => m.church_id === c && m.user_id === s.sessionUserId)?.role ?? null;
  const requireStaff = () => { const r = roleIn(cid()); if (r !== "coordinator" && r !== "admin") throw new Error("Only coordinators can do that."); };
  const requireAdmin = () => { if (roleIn(cid()) !== "admin") throw new Error("Only a church admin can do that."); };
  const mine = <T extends { church_id: string }>(rows: T[]) => rows.filter((r) => r.church_id === churchId);
  const myVol = () => s.volunteers.find((v) => v.church_id === churchId && v.user_id === s.sessionUserId) ?? null;
  const notify = () => listeners.forEach((l) => setTimeout(l, 0));

  function syncMe() {
    const a = me(); if (!a) return;
    for (const inv of s.invites.filter((i) => i.email === a.email)) {
      const m = s.memberships.find((x) => x.church_id === inv.church_id && x.user_id === a.id);
      if (!m) s.memberships.push({ church_id: inv.church_id, user_id: a.id, role: inv.role });
      else if (m.role === "volunteer" || (m.role === "coordinator" && inv.role === "admin")) m.role = inv.role;
    }
    s.invites = s.invites.filter((i) => i.email !== a.email);
    for (const m of s.memberships.filter((x) => x.user_id === a.id)) {
      if (s.volunteers.some((v) => v.church_id === m.church_id && v.user_id === a.id)) continue;
      const card = s.volunteers.find((v) => v.church_id === m.church_id && !v.user_id && v.email.toLowerCase() === a.email);
      if (card) card.user_id = a.id;
    }
    save();
  }

  return {
    mode: "demo",

    async getChurchBySlug(slug) { return out(s.churches.find((c) => c.slug === slug.toLowerCase()) ?? null); },

    async getSession(): Promise<Session | null> {
      const a = me();
      if (!a) return out(null);
      const memberships = a.isPlatformAdmin
        ? s.churches.map((church) => ({ church, role: "admin" as Role }))
        : s.memberships.filter((m) => m.user_id === a.id).map((m) => ({ church: s.churches.find((c) => c.id === m.church_id)!, role: m.role })).filter((m) => m.church);
      memberships.sort((x, y) => x.church.org_name.localeCompare(y.church.org_name));
      const cur = pickCurrentChurch(memberships, churchId);
      churchId = cur?.church.id ?? null;
      return out({ userId: a.id, email: a.email, isPlatformAdmin: a.isPlatformAdmin, memberships, current: cur?.church ?? null, profile: { id: a.id, email: a.email, role: cur?.role ?? "volunteer" } });
    },
    onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },

    async sendSignInLink(email) {
      const e = email.trim().toLowerCase();
      let a = s.accounts.find((x) => x.email === e);
      if (!a) { a = { id: uid(), email: e, isPlatformAdmin: e.startsWith("owner") }; s.accounts.push(a); }
      s.sessionUserId = a.id;
      syncMe();
      notify();
    },
    async signOut() { s.sessionUserId = null; churchId = null; save(); notify(); },

    async joinChurch(slug) {
      const a = me(); if (!a) throw new Error("Please sign in first");
      const c = s.churches.find((x) => x.slug === slug.toLowerCase() && x.active);
      if (!c) throw new Error("That church link is not valid");
      if (!s.memberships.some((m) => m.church_id === c.id && m.user_id === a.id)) s.memberships.push({ church_id: c.id, user_id: a.id, role: "volunteer" });
      syncMe();
      churchId = c.id; rememberChurch(c.id);
      return c.id;
    },
    setCurrentChurch(id) { churchId = id; rememberChurch(id); },
    async saveBranding(b: Branding) {
      requireAdmin();
      Object.assign(s.churches.find((c) => c.id === cid())!, b); save();
    },

    async listMinistries() { cid(); return out(mine(s.ministries).sort((a, b) => a.sort - b.sort).map(strip)); },

    async getMyVolunteer() { cid(); const v = myVol(); return out(v ? strip(v) : null); },
    async saveMyVolunteer(input: VolunteerInput) {
      const a = me(); if (!a) throw new Error("Please sign in again.");
      let v = myVol();
      const fields = { name: input.name, phone: input.phone, email: input.email, ministries: input.ministries };
      if (v) Object.assign(v, fields);
      else { v = { id: uid(), church_id: cid(), user_id: a.id, notes: "", contacted: false, source: "online", created_at: new Date().toISOString(), ...fields }; s.volunteers.push(v); }
      save(); return out(strip(v));
    },
    async listMyAssignments() {
      const v = myVol(); if (!v) return out([]);
      return out(s.assignments.filter((a) => a.volunteer_id === v.id)
        .map((a) => ({ assignment: strip(a), event: s.events.find((e) => e.id === a.event_id)! })).filter((x) => x.event).map((x) => ({ ...x, event: strip(x.event) })));
    },

    async listVolunteers() { requireStaff(); return out(mine(s.volunteers).sort((a, b) => a.name.localeCompare(b.name)).map(strip)); },
    async saveVolunteer(input, id) {
      requireStaff();
      let v = id ? mine(s.volunteers).find((x) => x.id === id) : undefined;
      if (v) Object.assign(v, input);
      else { v = { id: uid(), church_id: cid(), user_id: null, notes: "", contacted: false, source: "card", created_at: new Date().toISOString(), ...input }; s.volunteers.push(v); }
      save(); return out(strip(v));
    },
    async deleteVolunteer(id) {
      requireStaff();
      s.volunteers = s.volunteers.filter((v) => !(v.id === id && v.church_id === churchId));
      s.assignments = s.assignments.filter((a) => a.volunteer_id !== id);
      s.followups = s.followups.filter((f) => f.volunteer_id !== id);
      save();
    },
    async listEvents() { requireStaff(); return out(mine(s.events).map(strip)); },
    async saveEvent(input, id) {
      requireStaff();
      let e = id ? mine(s.events).find((x) => x.id === id) : undefined;
      if (e) Object.assign(e, input); else { e = { id: uid(), church_id: cid(), ...input }; s.events.push(e); }
      save(); return out(strip(e));
    },
    async deleteEvent(id) {
      requireStaff();
      s.events = s.events.filter((e) => !(e.id === id && e.church_id === churchId));
      s.assignments = s.assignments.filter((a) => a.event_id !== id);
      save();
    },
    async listAssignments() { requireStaff(); return out(mine(s.assignments).map(strip)); },
    async assign(eventId, ids) {
      requireStaff();
      let n = 0;
      for (const vid of ids) {
        if (s.assignments.some((a) => a.event_id === eventId && a.volunteer_id === vid)) continue;
        s.assignments.push({ id: uid(), church_id: cid(), event_id: eventId, volunteer_id: vid, status: "assigned" }); n++;
      }
      save(); return n;
    },
    async setAttendance(id, status) { requireStaff(); const a = mine(s.assignments).find((x) => x.id === id); if (a) a.status = status; save(); },
    async unassign(id) { requireStaff(); s.assignments = s.assignments.filter((a) => !(a.id === id && a.church_id === churchId)); save(); },

    async listFollowups() { requireStaff(); return out(mine(s.followups).map(strip)); },
    async saveFollowup(input, id) {
      requireStaff();
      let f = id ? mine(s.followups).find((x) => x.id === id) : undefined;
      if (f) Object.assign(f, input);
      else { f = { id: uid(), church_id: cid(), done: false, done_at: null, created_at: new Date().toISOString(), ...input }; s.followups.push(f); }
      save(); return out(strip(f));
    },
    async setFollowupDone(id, done) {
      requireStaff();
      const f = mine(s.followups).find((x) => x.id === id);
      if (f) { f.done = done; f.done_at = done ? new Date().toISOString() : null; }
      save();
    },
    async deleteFollowup(id) { requireStaff(); s.followups = s.followups.filter((f) => !(f.id === id && f.church_id === churchId)); save(); },

    async saveMinistry(m) {
      requireStaff();
      const i = s.ministries.findIndex((x) => x.church_id === churchId && x.id === m.id);
      if (i >= 0) s.ministries[i] = { ...m, church_id: cid() }; else s.ministries.push({ ...m, church_id: cid() });
      save();
    },
    async deleteMinistry(id) {
      requireStaff();
      s.ministries = s.ministries.filter((m) => !(m.church_id === churchId && m.id === id));
      mine(s.events).forEach((e) => { if (e.area === id) e.area = null; });
      save();
    },

    async listProfiles() {
      requireStaff();
      return out(s.memberships.filter((m) => m.church_id === churchId)
        .map((m) => ({ id: m.user_id, email: s.accounts.find((a) => a.id === m.user_id)?.email ?? "", role: m.role }))
        .sort((a, b) => a.email.localeCompare(b.email)));
    },
    async listInvites() { requireStaff(); return out(mine(s.invites).map(strip)); },
    async invite(email, role) {
      requireAdmin();
      const e = email.trim().toLowerCase();
      const acct = s.accounts.find((a) => a.email === e);
      if (acct) {
        const m = s.memberships.find((x) => x.church_id === churchId && x.user_id === acct.id);
        if (m) m.role = role; else s.memberships.push({ church_id: cid(), user_id: acct.id, role });
        save(); return "added";
      }
      const inv = mine(s.invites).find((i) => i.email === e);
      if (inv) inv.role = role; else s.invites.push({ id: uid(), church_id: cid(), email: e, role, created_at: new Date().toISOString() });
      save(); return "invited";
    },
    async cancelInvite(id) { requireAdmin(); s.invites = s.invites.filter((i) => !(i.id === id && i.church_id === churchId)); save(); },
    async setRole(userId, role) {
      requireAdmin();
      const m = s.memberships.find((x) => x.church_id === churchId && x.user_id === userId); if (!m) return;
      if (m.role === "admin" && role !== "admin" && s.memberships.filter((x) => x.church_id === churchId && x.role === "admin").length <= 1)
        throw new Error("A church must always have at least one admin.");
      m.role = role; save();
    },
    async removeMember(userId) {
      requireAdmin();
      const m = s.memberships.find((x) => x.church_id === churchId && x.user_id === userId); if (!m) return;
      if (m.role === "admin" && s.memberships.filter((x) => x.church_id === churchId && x.role === "admin").length <= 1)
        throw new Error("A church must always have at least one admin.");
      s.memberships = s.memberships.filter((x) => x !== m); save();
    },

    async listAllChurches() { if (!me()?.isPlatformAdmin) throw new Error("Only the platform owner can do that."); return out(s.churches); },
    async createChurch(slug, name, adminEmail) {
      if (!me()?.isPlatformAdmin) throw new Error("Only the platform owner can add churches");
      const sl = slug.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(sl)) throw new Error("The web address can use lowercase letters, numbers and dashes.");
      if (s.churches.some((c) => c.slug === sl)) throw new Error("That web address is already taken.");
      const c: Church = { ...DEFAULT_BRANDING, id: uid(), slug: sl, org_name: name.trim(), active: true };
      s.churches.push(c);
      s.ministries.push(...DEFAULT_MINISTRIES.map((m) => ({ ...m, church_id: c.id })));
      const e = adminEmail.trim().toLowerCase();
      if (e) {
        const acct = s.accounts.find((a) => a.email === e);
        if (acct) s.memberships.push({ church_id: c.id, user_id: acct.id, role: "admin" });
        else s.invites.push({ id: uid(), church_id: c.id, email: e, role: "admin", created_at: new Date().toISOString() });
      }
      save(); return c.id;
    },
    async setChurchActive(id, active) {
      if (!me()?.isPlatformAdmin) throw new Error("Only the platform owner can do that.");
      const c = s.churches.find((x) => x.id === id); if (c) c.active = active; save();
    },
  };
}

export function resetDemo() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
