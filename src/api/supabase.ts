import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Api, Assignment, AttendanceStatus, Branding, Church, ChurchEvent, EventInput, Followup, FollowupInput, Invite,
  Membership, Ministry, MyAssignment, Profile, Role, Session, Volunteer, VolunteerInput,
} from "./types";
import { pickCurrentChurch, rememberChurch } from "./churchChoice";

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const CHURCH_COLS = "id, slug, org_name, app_title, tagline, primary_color, accent_color, logo, active";

export function createSupabaseApi(url: string, anonKey: string): Api {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  let synced: string | null = null;
  let churchId: string | null = null;

  async function currentUser() {
    const { data } = await sb.auth.getUser();
    return data.user;
  }
  const cid = () => {
    if (!churchId) throw new Error("Choose a church first.");
    return churchId;
  };

  return {
    mode: "supabase",

    async getChurchBySlug(slug) {
      return check(await sb.from("churches").select(CHURCH_COLS).eq("slug", slug.toLowerCase()).maybeSingle()) as Church | null;
    },

    async listPublicChurches() {
      return check(await sb.from("churches").select(CHURCH_COLS).eq("active", true).order("org_name")) as Church[];
    },

    async getSession(): Promise<Session | null> {
      const user = await currentUser();
      if (!user) return null;
      if (synced !== user.id) {
        // Accept email invitations and link paper cards with this email.
        await sb.rpc("sync_me");
        synced = user.id;
      }
      const prof = check(await sb.from("profiles").select("is_platform_admin").eq("id", user.id).maybeSingle()) as { is_platform_admin: boolean } | null;
      const isPlatformAdmin = !!prof?.is_platform_admin;
      let memberships: Membership[];
      if (isPlatformAdmin) {
        const all = check(await sb.from("churches").select(CHURCH_COLS).order("org_name")) as Church[];
        memberships = all.map((church) => ({ church, role: "admin" as Role }));
      } else {
        const rows = check(await sb.from("memberships").select(`role, churches(${CHURCH_COLS})`).eq("user_id", user.id)) as unknown as
          { role: Role; churches: Church | null }[];
        memberships = rows.filter((r) => r.churches).map((r) => ({ church: r.churches!, role: r.role })).sort((a, b) => a.church.org_name.localeCompare(b.church.org_name));
      }
      const current = pickCurrentChurch(memberships, churchId);
      churchId = current?.church.id ?? null;
      const email = user.email ?? "";
      return {
        userId: user.id, email, isPlatformAdmin, memberships, current: current?.church ?? null,
        profile: { id: user.id, email, role: current?.role ?? "volunteer" },
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
      synced = null;
      churchId = null;
    },

    async joinChurch(slug) {
      const id = check(await sb.rpc("join_church", { church_slug: slug })) as string;
      churchId = id;
      rememberChurch(id);
      return id;
    },

    setCurrentChurch(id) { churchId = id; rememberChurch(id); },

    async saveBranding(b: Branding) {
      check(await sb.from("churches").update(b).eq("id", cid()));
    },

    async listMinistries() {
      return check(await sb.from("ministries").select("id, label, kind, hint, sort, active").eq("church_id", cid()).order("sort")) as Ministry[];
    },

    async getMyVolunteer() {
      const user = await currentUser();
      if (!user) return null;
      const row = check(await sb.from("volunteers").select("*").eq("church_id", cid()).eq("user_id", user.id).maybeSingle()) as Omit<Volunteer, "notes"> | null;
      return row ? { ...row, notes: "" } : null;
    },

    async saveMyVolunteer(input: VolunteerInput) {
      const user = await currentUser();
      if (!user) throw new Error("Please sign in again.");
      const fields = { name: input.name, phone: input.phone, email: input.email, ministries: input.ministries };
      const existing = check(await sb.from("volunteers").select("id").eq("church_id", cid()).eq("user_id", user.id).maybeSingle()) as { id: string } | null;
      const row = existing
        ? check(await sb.from("volunteers").update(fields).eq("id", existing.id).select().single())
        : check(await sb.from("volunteers").insert({ ...fields, church_id: cid(), user_id: user.id }).select().single());
      return { ...(row as Omit<Volunteer, "notes">), notes: "" };
    },

    async listMyAssignments(): Promise<MyAssignment[]> {
      const user = await currentUser();
      if (!user) return [];
      const me = check(await sb.from("volunteers").select("id").eq("church_id", cid()).eq("user_id", user.id).maybeSingle()) as { id: string } | null;
      if (!me) return [];
      const rows = check(await sb.from("assignments").select("id, event_id, volunteer_id, status, events(*)").eq("volunteer_id", me.id)) as unknown as
        (Assignment & { events: ChurchEvent | null })[];
      return rows.filter((r) => r.events).map(({ events, ...a }) => ({ assignment: a, event: events! }));
    },

    async listVolunteers() {
      const rows = check(await sb.from("volunteers").select("*, volunteer_notes(notes)").eq("church_id", cid()).order("name")) as unknown as
        (Omit<Volunteer, "notes"> & { volunteer_notes: { notes: string } | { notes: string }[] | null })[];
      return rows.map(({ volunteer_notes, ...v }) => {
        const n = Array.isArray(volunteer_notes) ? volunteer_notes[0] : volunteer_notes;
        return { ...v, notes: n?.notes ?? "" };
      });
    },

    async saveVolunteer(input, id) {
      const { notes, ...fields } = input;
      const q = id ? sb.from("volunteers").update(fields).eq("id", id) : sb.from("volunteers").insert({ source: "card", ...fields, church_id: cid() });
      const v = check(await q.select().single()) as Omit<Volunteer, "notes"> & { church_id: string };
      if (notes !== undefined) check(await sb.from("volunteer_notes").upsert({ volunteer_id: v.id, church_id: v.church_id, notes }));
      return { ...v, notes: notes ?? "" };
    },

    async deleteVolunteer(id) {
      check(await sb.from("volunteers").delete().eq("id", id));
    },

    async listEvents() {
      return check(await sb.from("events").select("*").eq("church_id", cid()).order("date", { ascending: true, nullsFirst: false })) as ChurchEvent[];
    },

    async saveEvent(input: EventInput, id?: string) {
      const q = id ? sb.from("events").update(input).eq("id", id) : sb.from("events").insert({ ...input, church_id: cid() });
      return check(await q.select().single()) as ChurchEvent;
    },

    async deleteEvent(id) {
      check(await sb.from("events").delete().eq("id", id));
    },

    async listAssignments() {
      return check(await sb.from("assignments").select("id, event_id, volunteer_id, status").eq("church_id", cid())) as Assignment[];
    },

    async assign(eventId, volunteerIds) {
      if (!volunteerIds.length) return 0;
      const rows = volunteerIds.map((volunteer_id) => ({ church_id: cid(), event_id: eventId, volunteer_id }));
      const data = check(await sb.from("assignments").upsert(rows, { onConflict: "event_id,volunteer_id", ignoreDuplicates: true }).select("id")) as unknown[];
      return data.length;
    },

    async setAttendance(assignmentId: string, status: AttendanceStatus) {
      check(await sb.from("assignments").update({ status }).eq("id", assignmentId));
    },

    async unassign(assignmentId) {
      check(await sb.from("assignments").delete().eq("id", assignmentId));
    },

    async listFollowups() {
      return check(await sb.from("followups").select("id, volunteer_id, note, due, assigned_to, done, done_at, created_at").eq("church_id", cid()).order("due", { ascending: true, nullsFirst: false })) as Followup[];
    },

    async saveFollowup(input: FollowupInput, id?: string) {
      const q = id ? sb.from("followups").update(input).eq("id", id) : sb.from("followups").insert({ ...input, church_id: cid() });
      return check(await q.select().single()) as Followup;
    },

    async setFollowupDone(id: string, done: boolean) {
      check(await sb.from("followups").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", id));
    },

    async deleteFollowup(id: string) {
      check(await sb.from("followups").delete().eq("id", id));
    },

    async saveMinistry(m: Ministry) {
      check(await sb.from("ministries").upsert({ ...m, church_id: cid() }));
    },

    async deleteMinistry(id: string) {
      check(await sb.from("ministries").delete().eq("church_id", cid()).eq("id", id));
    },

    async listProfiles(): Promise<Profile[]> {
      const rows = check(await sb.from("memberships").select("user_id, role").eq("church_id", cid())) as { user_id: string; role: Role }[];
      if (!rows.length) return [];
      const profs = check(await sb.from("profiles").select("id, email").in("id", rows.map((r) => r.user_id))) as { id: string; email: string }[];
      const email = new Map(profs.map((p) => [p.id, p.email]));
      return rows.map((r) => ({ id: r.user_id, email: email.get(r.user_id) ?? "", role: r.role })).sort((a, b) => a.email.localeCompare(b.email));
    },

    async listInvites() {
      return check(await sb.from("invites").select("id, email, role, created_at").eq("church_id", cid()).order("created_at")) as Invite[];
    },

    async invite(email: string, role: Role) {
      return check(await sb.rpc("invite_to_church", { c: cid(), invite_email: email, invite_role: role })) as "added" | "invited";
    },

    async cancelInvite(id: string) {
      check(await sb.from("invites").delete().eq("id", id));
    },

    async setRole(userId: string, role: Role) {
      check(await sb.from("memberships").update({ role }).eq("church_id", cid()).eq("user_id", userId));
    },

    async removeMember(userId: string) {
      check(await sb.from("memberships").delete().eq("church_id", cid()).eq("user_id", userId));
    },

    async listAllChurches() {
      return check(await sb.from("churches").select(CHURCH_COLS).order("org_name")) as Church[];
    },

    async createChurch(slug, name, adminEmail) {
      return check(await sb.rpc("create_church", { church_slug: slug, name, admin_email: adminEmail })) as string;
    },

    async setChurchActive(id, active) {
      check(await sb.from("churches").update({ active }).eq("id", id));
    },
  };
}
