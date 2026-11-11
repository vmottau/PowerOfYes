export type Role = "volunteer" | "coordinator" | "admin";
export type AttendanceStatus = "assigned" | "attended" | "missed";

export interface Profile {
  id: string;
  email: string;
  role: Role;
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

export interface MyAssignment {
  assignment: Assignment;
  event: ChurchEvent;
}

export interface Session {
  userId: string;
  email: string;
  profile: Profile;
}

/** Everything the screens need. Two implementations: Supabase (real) and demo (in the browser). */
export interface Api {
  readonly mode: "supabase" | "demo";
  getSession(): Promise<Session | null>;
  onAuthChange(cb: () => void): () => void;
  /** Sends a sign-in link to the email address. */
  sendSignInLink(email: string): Promise<void>;
  signOut(): Promise<void>;

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

  // Admin
  listProfiles(): Promise<Profile[]>;
  setRole(userId: string, role: Role): Promise<void>;
  saveMinistry(m: Ministry): Promise<void>;
}
