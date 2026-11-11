import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Api, Assignment, AttendanceStatus, ChurchEvent, EventInput, Ministry, MyAssignment,
  Profile, Role, Session, Volunteer, VolunteerInput,
} from "./types";

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function createSupabaseApi(url: string, anonKey: string): Api {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  let claimed: string | null = null;

  async function currentUser() {
    const { data } = await sb.auth.getUser();
    return data.user;
  }

  return {
    mode: "supabase",

    async getSession(): Promise<Session | null> {
      const user = await currentUser();
      if (!user) return null;
      if (claimed !== user.id) {
        // Link a paper card typed in by staff with the same email, if there is one.
        await sb.rpc("claim_my_volunteer_record");
        claimed = user.id;
      }
      const profile = check(await sb.from("profiles").select("id, email, role").eq("id", user.id).maybeSingle()) as Profile | null;
      return {
        userId: user.id,
        email: user.email ?? "",
        profile: profile ?? { id: user.id, email: user.email ?? "", role: "volunteer" },
      };
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") setTimeout(cb, 0);
      });
      return () => data.subscription.unsubscribe();
    },

    async sendSignInLink(email) {
      const redirect = window.location.origin + window.location.pathname;
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
      if (error) throw new Error(error.message);
    },

    async signOut() {
      await sb.auth.signOut();
      claimed = null;
    },

    async listMinistries() {
      return check(await sb.from("ministries").select("*").order("sort")) as Ministry[];
    },

    async getMyVolunteer() {
      const user = await currentUser();
      if (!user) return null;
      const row = check(await sb.from("volunteers").select("*").eq("user_id", user.id).maybeSingle()) as Omit<Volunteer, "notes"> | null;
      return row ? { ...row, notes: "" } : null;
    },

    async saveMyVolunteer(input: VolunteerInput) {
      const user = await currentUser();
      if (!user) throw new Error("Please sign in again.");
      const fields = { name: input.name, phone: input.phone, email: input.email, ministries: input.ministries };
      const existing = check(await sb.from("volunteers").select("id").eq("user_id", user.id).maybeSingle()) as { id: string } | null;
      const row = existing
        ? check(await sb.from("volunteers").update(fields).eq("id", existing.id).select().single())
        : check(await sb.from("volunteers").insert({ ...fields, user_id: user.id }).select().single());
      return { ...(row as Omit<Volunteer, "notes">), notes: "" };
    },

    async listMyAssignments(): Promise<MyAssignment[]> {
      const user = await currentUser();
      if (!user) return [];
      const me = check(await sb.from("volunteers").select("id").eq("user_id", user.id).maybeSingle()) as { id: string } | null;
      if (!me) return [];
      const rows = check(await sb.from("assignments").select("id, event_id, volunteer_id, status, events(*)").eq("volunteer_id", me.id)) as unknown as
        (Assignment & { events: ChurchEvent | null })[];
      return rows.filter((r) => r.events).map(({ events, ...a }) => ({ assignment: a, event: events! }));
    },

    async listVolunteers() {
      const rows = check(await sb.from("volunteers").select("*, volunteer_notes(notes)").order("name")) as unknown as
        (Omit<Volunteer, "notes"> & { volunteer_notes: { notes: string } | { notes: string }[] | null })[];
      return rows.map(({ volunteer_notes, ...v }) => {
        const n = Array.isArray(volunteer_notes) ? volunteer_notes[0] : volunteer_notes;
        return { ...v, notes: n?.notes ?? "" };
      });
    },

    async saveVolunteer(input, id) {
      const { notes, ...fields } = input;
      const q = id ? sb.from("volunteers").update(fields).eq("id", id) : sb.from("volunteers").insert({ source: "card", ...fields });
      const v = check(await q.select().single()) as Omit<Volunteer, "notes">;
      if (notes !== undefined) check(await sb.from("volunteer_notes").upsert({ volunteer_id: v.id, notes }));
      return { ...v, notes: notes ?? "" };
    },

    async deleteVolunteer(id) {
      check(await sb.from("volunteers").delete().eq("id", id));
    },

    async listEvents() {
      return check(await sb.from("events").select("*").order("date", { ascending: true, nullsFirst: false })) as ChurchEvent[];
    },

    async saveEvent(input: EventInput, id?: string) {
      const q = id ? sb.from("events").update(input).eq("id", id) : sb.from("events").insert(input);
      return check(await q.select().single()) as ChurchEvent;
    },

    async deleteEvent(id) {
      check(await sb.from("events").delete().eq("id", id));
    },

    async listAssignments() {
      return check(await sb.from("assignments").select("id, event_id, volunteer_id, status")) as Assignment[];
    },

    async assign(eventId, volunteerIds) {
      if (!volunteerIds.length) return 0;
      const rows = volunteerIds.map((volunteer_id) => ({ event_id: eventId, volunteer_id }));
      const data = check(await sb.from("assignments").upsert(rows, { onConflict: "event_id,volunteer_id", ignoreDuplicates: true }).select("id")) as unknown[];
      return data.length;
    },

    async setAttendance(assignmentId: string, status: AttendanceStatus) {
      check(await sb.from("assignments").update({ status }).eq("id", assignmentId));
    },

    async unassign(assignmentId) {
      check(await sb.from("assignments").delete().eq("id", assignmentId));
    },

    async listProfiles() {
      return check(await sb.from("profiles").select("id, email, role").order("email")) as Profile[];
    },

    async setRole(userId: string, role: Role) {
      check(await sb.from("profiles").update({ role }).eq("id", userId));
    },

    async saveMinistry(m: Ministry) {
      check(await sb.from("ministries").upsert(m));
    },
  };
}
