import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Api, Assignment, AttendanceStatus, Branding, Church, ChurchEvent, ChurchSettings, EventInput, Followup, FollowupInput, Invite,
  Membership, Ministry, MyAssignment, OpenEvent, Profile, Role, SentEmail, Session, Volunteer, VolunteerInput,
} from "./types";
import { pickCurrentChurch, rememberChurch } from "./churchChoice";

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Supabase returns at most 1,000 rows per request, so read big lists a page at a time (ordered by id as a tiebreak so pages don't overlap). */
const PAGE = 1000;
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = check(await page(from, from + PAGE - 1)) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
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
      const rows = check(await sb.rpc("church_by_slug", { church_slug: slug })) as Church[] | null;
      return rows?.[0] ?? null;
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
      const rows = check(await sb.from("assignments").select("id, event_id, volunteer_id, status, cant_reason, cant_at, self_signup, events(*)").eq("volunteer_id", me.id)) as unknown as
        (Assignment & { events: ChurchEvent | null })[];
      return rows.filter((r) => r.events).map(({ events, ...a }) => ({ assignment: a, event: events! }));
    },

    async cantMakeIt(assignmentId, reason) {
      check(await sb.rpc("cant_make_it", { assignment: assignmentId, reason }));
    },

    async canMakeItAfterAll(assignmentId) {
      check(await sb.rpc("can_make_it_after_all", { assignment: assignmentId }));
    },

    async listOpenEvents() {
      return await allRows((a, b) => sb.rpc("open_events", { c: cid() }).order("date", { ascending: true, nullsFirst: false }).order("name").order("id").range(a, b)) as OpenEvent[];
    },

    async signUpForEvent(eventId) {
      check(await sb.rpc("sign_up_for_event", { event: eventId }));
    },

    async listVolunteers() {
      const rows = await allRows((a, b) => sb.from("volunteers").select("*, volunteer_notes(notes)").eq("church_id", cid()).order("name").order("id").range(a, b)) as unknown as
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
      return await allRows((a, b) => sb.from("events").select("*").eq("church_id", cid()).order("date", { ascending: true, nullsFirst: false }).order("id").range(a, b)) as ChurchEvent[];
    },

    async saveEvent(input: EventInput, id?: string) {
      const q = id ? sb.from("events").update(input).eq("id", id) : sb.from("events").insert({ ...input, church_id: cid() });
      return check(await q.select().single()) as ChurchEvent;
    },

    async deleteEvent(id) {
      check(await sb.from("events").delete().eq("id", id));
    },

    async listAssignments() {
      return await allRows((a, b) => sb.from("assignments").select("id, event_id, volunteer_id, status, cant_reason, cant_at, self_signup").eq("church_id", cid()).order("id").range(a, b)) as Assignment[];
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
      return await allRows((a, b) => sb.from("followups").select("id, volunteer_id, note, due, assigned_to, done, done_at, created_at, assignment_id").eq("church_id", cid()).order("due", { ascending: true, nullsFirst: false }).order("id").range(a, b)) as Followup[];
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

    async getReminderDays() {
      const row = check(await sb.from("churches").select("reminder_days").eq("id", cid()).single()) as { reminder_days: number };
      return row.reminder_days;
    },

    async setReminderDays(days) {
      check(await sb.from("churches").update({ reminder_days: days }).eq("id", cid()));
    },

    async listEmails() {
      return check(await sb.from("email_outbox").select("id, kind, to_email, subject, status, error, created_at, sent_at")
        .eq("church_id", cid()).order("created_at", { ascending: false }).limit(100)) as SentEmail[];
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

    async getChurchSettings(id): Promise<ChurchSettings> {
      const [church, admins, invites] = await Promise.all([
        sb.from("churches").select("reminder_days").eq("id", id).single(),
        sb.from("memberships").select("user_id").eq("church_id", id).eq("role", "admin"),
        sb.from("invites").select("id, email, role, created_at").eq("church_id", id).eq("role", "admin").order("created_at"),
      ]);
      const ids = (check(admins) as { user_id: string }[]).map((r) => r.user_id);
      const profs = ids.length ? check(await sb.from("profiles").select("id, email").in("id", ids)) as { id: string; email: string }[] : [];
      return {
        reminder_days: (check(church) as { reminder_days: number }).reminder_days,
        admins: profs.map((p) => ({ id: p.id, email: p.email, role: "admin" as Role })).sort((a, b) => a.email.localeCompare(b.email)),
        adminInvites: check(invites) as Invite[],
      };
    },

    async saveChurchSettings(id, c) {
      const rows = check(await sb.from("churches").update({ org_name: c.org_name, slug: c.slug, reminder_days: c.reminder_days }).eq("id", id).select("id")) as unknown[];
      if (!rows.length) throw new Error("Only the platform owner can do that.");
    },

    async addChurchAdmin(id, email) {
      return check(await sb.rpc("invite_to_church", { c: id, invite_email: email, invite_role: "admin" })) as "added" | "invited";
    },

    async removeChurchAdmin(id, userId) {
      check(await sb.from("memberships").update({ role: "volunteer" }).eq("church_id", id).eq("user_id", userId));
    },

    async cancelChurchInvite(id, inviteId) {
      check(await sb.from("invites").delete().eq("church_id", id).eq("id", inviteId));
    },
  };
}
