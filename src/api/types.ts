export type Role = "volunteer" | "coordinator" | "admin";
export type AttendanceStatus = "assigned" | "attended" | "missed";

/** A person as seen from the current church: their email and role there. */
export interface Profile {
  id: string;
  email: string;
  role: Role;
}

export interface Invite {
  id: string;
  email: string;
  role: Role;
  created_at: string;
}

export interface Ministry {
  id: string;
  label: string;
  kind: "ministry" | "event";
  hint: string;
  sort: number;
  active: boolean;
}

export interface Volunteer {
  id: string;
  user_id: string | null;
  name: string;
  phone: string;
  email: string;
  ministries: string[];
  notes: string;
  contacted: boolean;
  source: "online" | "card";
  created_at: string;
}

export interface VolunteerInput {
  name: string;
  phone: string;
  email: string;
  ministries: string[];
  notes?: string;
  contacted?: boolean;
  source?: "online" | "card";
}

export interface ChurchEvent {
  id: string;
  name: string;
  date: string | null; // YYYY-MM-DD
  time: string;
  place: string;
  area: string | null;
  needed: number | null;
  notes: string;
}

export type EventInput = Omit<ChurchEvent, "id">;

export interface Assignment {
  id: string;
  event_id: string;
  volunteer_id: string;
  status: AttendanceStatus;
}

export interface Followup {
  id: string;
  volunteer_id: string;
  note: string;
  due: string | null; // YYYY-MM-DD
  assigned_to: string | null;
  done: boolean;
  done_at: string | null;
  created_at: string;
}

export interface FollowupInput {
  volunteer_id: string;
  note: string;
  due: string | null;
  assigned_to: string | null;
}

export interface MyAssignment {
  assignment: Assignment;
  event: ChurchEvent;
}

/** The church's "skin". Church admins edit it under Manage → Appearance. */
export interface Branding {
  org_name: string;
  app_title: string;
  tagline: string;
  primary_color: string; // #rrggbb
  accent_color: string; // #rrggbb
  logo: string; // data: URL or https URL, "" for none
}

export interface Church extends Branding {
  id: string;
  slug: string;
  active: boolean;
}

export interface Membership {
  church: Church;
  role: Role;
}

export interface Session {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  /** Churches this person belongs to (for the platform owner: every church, as admin). */
  memberships: Membership[];
  /** The church the app is showing right now, or null if they haven't picked/joined one. */
  current: Church | null;
  /** This person as seen in the current church. */
  profile: Profile;
}

/** Everything the screens need. Two implementations: Supabase (real) and demo (in the browser). */
export interface Api {
  readonly mode: "supabase" | "demo";

  // Churches and sign-in
  /** Public: the church behind a link like /#/c/st-marys (works before sign-in). */
  getChurchBySlug(slug: string): Promise<Church | null>;
  /** Public: active churches, for the "find your church" list. */
  listPublicChurches(): Promise<Church[]>;
  getSession(): Promise<Session | null>;
  onAuthChange(cb: () => void): () => void;
  /** Sends a sign-in link to the email address. */
  sendSignInLink(email: string): Promise<void>;
  signOut(): Promise<void>;
  /** Joins a church as a volunteer (or with the role someone invited them with). */
  joinChurch(slug: string): Promise<string>;
  /** Picks which of the person's churches the app shows; all church data below is for this church. */
  setCurrentChurch(id: string): void;
  saveBranding(b: Branding): Promise<void>;

  listMinistries(): Promise<Ministry[]>;

  // Volunteer's own record
  getMyVolunteer(): Promise<Volunteer | null>;
  saveMyVolunteer(input: VolunteerInput): Promise<Volunteer>;
  listMyAssignments(): Promise<MyAssignment[]>;

  // Coordinator and admin
  listVolunteers(): Promise<Volunteer[]>;
  saveVolunteer(input: VolunteerInput, id?: string): Promise<Volunteer>;
  deleteVolunteer(id: string): Promise<void>;
  listEvents(): Promise<ChurchEvent[]>;
  saveEvent(input: EventInput, id?: string): Promise<ChurchEvent>;
  deleteEvent(id: string): Promise<void>;
  listAssignments(): Promise<Assignment[]>;
  assign(eventId: string, volunteerIds: string[]): Promise<number>;
  setAttendance(assignmentId: string, status: AttendanceStatus): Promise<void>;
  unassign(assignmentId: string): Promise<void>;

  // Follow-ups (coordinator and admin)
  listFollowups(): Promise<Followup[]>;
  saveFollowup(input: FollowupInput, id?: string): Promise<Followup>;
  setFollowupDone(id: string, done: boolean): Promise<void>;
  deleteFollowup(id: string): Promise<void>;

  // Areas of interest (coordinator and admin)
  saveMinistry(m: Ministry): Promise<void>;
  deleteMinistry(id: string): Promise<void>;

  // People in the current church: coordinators can list, admins invite and change roles
  listProfiles(): Promise<Profile[]>;
  listInvites(): Promise<Invite[]>;
  invite(email: string, role: Role): Promise<"added" | "invited">;
  cancelInvite(id: string): Promise<void>;
  setRole(userId: string, role: Role): Promise<void>;
  removeMember(userId: string): Promise<void>;

  // Platform owner
  listAllChurches(): Promise<Church[]>;
  createChurch(slug: string, name: string, adminEmail: string): Promise<string>;
  setChurchActive(id: string, active: boolean): Promise<void>;
}
