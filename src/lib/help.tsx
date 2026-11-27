import { useCallback, useEffect, useState, type ReactNode } from "react";

/** The four kinds of people who use the app, as the Help page and welcome talk about them. */
export type HelpRole = "volunteer" | "coordinator" | "admin" | "owner";

export const ROLE_NAMES: Record<HelpRole, string> = {
  volunteer: "Volunteers",
  coordinator: "Coordinators",
  admin: "Church admins",
  owner: "Platform owner",
};

export interface Faq { q: string; a: ReactNode }

/** First steps shown in the welcome box and at the top of Help. Worded so they don't repeat button names word for word. */
export const FIRST_STEPS: Record<HelpRole, { title: string; steps: ReactNode[] }> = {
  volunteer: {
    title: "Welcome! Here's how this works",
    steps: [
      <>Tick every area on your card that you'd like to help with. A coordinator will reach out when something fits.</>,
      <>Events you're scheduled for show up on this page, with the time, place and any notes. Open spots that match your card show up here too, ready to join with one click.</>,
      <>Plans changed? Use the <b>Can't make it</b> button next to the event, and the coordinators are told right away.</>,
    ],
  },
  coordinator: {
    title: "Welcome! Three places to start",
    steps: [
      <><b>Home</b> shows what needs you today: open spots, people who backed out, and calls that are due.</>,
      <><b>Volunteers</b> is the card box, searchable. Click an area like Pierogies to see everyone who ticked it.</>,
      <><b>Events &amp; projects</b> is where you make an event, put people on it, and afterwards mark who came.</>,
    ],
  },
  admin: {
    title: "Welcome! You run the app for your church",
    steps: [
      <>You can do everything a coordinator can: <b>Home</b>, <b>Volunteers</b>, <b>Events &amp; projects</b> and <b>Follow-ups</b>.</>,
      <>Under <b>Manage → People &amp; roles</b>, invite your coordinators by email and copy the link volunteers use to join.</>,
      <>Under <b>Manage → Appearance</b>, set your church's name, colors and logo.</>,
    ],
  },
  owner: {
    title: "Welcome! You look after every church on the site",
    steps: [
      <><b>All churches</b> lists every church. Each one sees only its own volunteers and events.</>,
      <>To bring on a new church, give it a name, a short link name and its admin's email. That person runs it from there.</>,
      <>Click <b>Settings</b> on a church to change its name, link or admin, or <b>Open</b> to go into it and see it as its admin would.</>,
    ],
  },
};

export const FAQS: Record<HelpRole, Faq[]> = {
  volunteer: [
    { q: "How do I sign in?", a: <>Type your email on the sign-in page. We email you a link; open it on the same device. There's no password. The link works once and expires after an hour.</> },
    { q: "I didn't get the sign-in email.", a: <>Check your spam or junk folder, make sure the email is spelled right, and try again after a minute.</> },
    { q: "How do I change my phone, email or interests?", a: <>On your page, click <b>Edit my card</b>, make your changes and click <b>Save my card</b>.</> },
    { q: "Where do I see when I'm serving?", a: <>Under <b>Where you're scheduled</b> on your page. Each event shows its date, time, place and notes from the coordinator. Past events are listed below it.</> },
    { q: "Can I sign myself up for something?", a: <>Yes, when a coordinator opens an event for sign-up. If it matches the areas on your card, it shows under <b>Open spots you can sign up for</b> on your page. Click <b>Sign me up</b> while there are spots left.</> },
    { q: "Will I get a reminder?", a: <>Yes, if your card has an email address. A day or so before each event you're on, you get an email with the time, place and notes, and a link in case you can't make it. Your church chooses how far ahead.</> },
    { q: "I can't make it to something I signed up for.", a: <>Click <b>Can't make it</b> next to the event and add a note if you like. Your spot opens up and the coordinators are told. If your plans change back, click <b>I can make it after all</b>.</> },
    { q: "I filled out a paper card before. Do I need to fill it out again?", a: <>No. Sign in with the same email address that's on your paper card and your card shows up on its own.</> },
    { q: "It says to open my church's link.", a: <>You need to join through your church's sign-up link (from the bulletin, an email or the church website). Open that link, then sign in.</> },
    { q: "Who do I ask for help?", a: <>Ask a coordinator at your church. They can pass your question on if they need to.</> },
    { q: "Who can see my information?", a: <>Only your church's coordinators and admins. Other volunteers can't see your card.</> },
  ],
  coordinator: [
    { q: "How do I find people for an event?", a: <>On <b>Volunteers</b>, click one or more areas, like Pierogies or Mass Greeter / Usher, to see everyone who ticked them. Use <b>To contact</b> to see who nobody has called yet. <b>Copy emails</b> copies every address shown, ready for a group email.</> },
    { q: "How do I put people on an event?", a: <>Two ways. On <b>Volunteers</b>, tick the box beside each person, pick the event in the bar at the bottom and click <b>Assign</b>. Or open the event and pick people under <b>Add volunteers</b>; people who ticked that event's area are listed first, marked "Interested".</> },
    { q: "How do I type in a paper card?", a: <>On <b>Volunteers</b>, click <b>+ Add a paper card</b>. Only the name is required. Staff notes are seen only by coordinators and admins.</> },
    { q: "Can volunteers sign themselves up?", a: <>Yes. When you make or edit an event, tick <b>Open for sign-up</b>. Volunteers who ticked that event's area (or everyone, for a general event) see it on their page and can click <b>Sign me up</b> until the "Volunteers needed" number is reached. On the roster they're marked "Signed up online".</> },
    { q: "How do I bring in a whole stack of paper cards at once?", a: <>On <b>Volunteers</b>, click <b>Import spreadsheet</b> and download the blank template. Type one card per row (only the name is required) and upload it. You'll see every row before anything is saved. People already listed are updated, never erased, and rows with problems can be downloaded, fixed and uploaded again.</> },
    { q: "Do volunteers get reminder emails?", a: <>Yes, if their card has an email. They get one before each event with the time, place and notes. When someone clicks Can't make it, the coordinator who made the event gets an email right away. Every email that went out is listed under <b>Manage → Emails</b>.</> },
    { q: "What does \"Volunteers needed\" do?", a: <>Set it on an event and the Home page shows how many spots are still open, like "3 of 6", until the event is full.</> },
    { q: "How do I take attendance?", a: <>After the event, open it (past events are under <b>Past · mark attendance</b>) and click <b>Attended</b> or <b>Missed</b> for each person, or <b>Mark all attended</b> and fix the few who didn't come. This builds each volunteer's "served" count.</> },
    { q: "Someone pressed Can't make it. What now?", a: <>They show in red on <b>Home</b> with their note. Click it to open the event and add someone else. If they can come after all, click <b>Put back on roster</b>.</> },
    { q: "What are follow-ups?", a: <>Your to-do list of calls and emails, like "Call Ann about the pierogi batch, due Friday". Add one with <b>Follow up</b> on any volunteer or on the Follow-ups page, and tick it when it's done.</> },
    { q: "Can I print or download lists?", a: <>Yes. On <b>Volunteers</b>, <b>Download spreadsheet</b> and <b>Print list</b> use whatever filters you've picked. On an event, use <b>Print sign-in sheet</b> or <b>Download roster</b>.</> },
    { q: "How do I change the checkboxes on the volunteer card?", a: <>Under <b>Manage → Ministries &amp; areas</b>. <b>Hide</b> stops offering a box on new cards but keeps it on people who already ticked it. <b>Delete</b> removes it everywhere.</> },
    { q: "Should we keep a backup?", a: <>Yes. About once a month, click <b>Download backup (.zip)</b> under <b>Manage → Backup</b> and keep it with the parish records, somewhere only staff can open.</> },
    { q: "Will someone be listed twice if they filled in a paper card and then signed up online?", a: <>Not if they used the same email as on the paper card. The app joins the two on its own.</> },
  ],
  admin: [
    { q: "How do I add a coordinator?", a: <>Under <b>Manage → People &amp; roles</b>, use <b>Invite someone</b>: type their email, choose the role and send it. Their role starts the first time they sign in with that exact email.</> },
    { q: "How do I change someone's role or remove them?", a: <>In the list under <b>Manage → People &amp; roles</b>, change the role with the dropdown, or click the <b>x</b> to remove them from the church.</> },
    { q: "Where's the link for volunteers to sign up?", a: <>Under <b>Manage → People &amp; roles → Volunteer sign-up link</b>. Click <b>Copy</b> and share it in the bulletin, by email, on the website or as a QR code. Anyone who signs up through it joins your church.</> },
    { q: "How do I change when reminder emails go out?", a: <>Under <b>Manage → Emails</b>, choose how far ahead: 1, 2 or 3 days, or 1 week before. Choose <b>Off</b> to stop reminders for your church.</> },
    { q: "How do I change our church's name, colors or logo?", a: <>Under <b>Manage → Appearance</b>. Changes preview right away; click <b>Save appearance</b> to apply them for everyone.</> },
  ],
  owner: [
    { q: "How do I add a church?", a: <>On <b>All churches</b>, fill in its name, a short link name like st-marys, and its admin's email. That person becomes the church's admin the first time they sign in.</> },
    { q: "How do I change a church's name or link?", a: <>Click <b>Settings</b> next to it on <b>All churches</b>, change the <b>Church name</b> or <b>Link name</b>, and click <b>Save</b>. If you change the link name, the old sign-up link stops working, so send the church its new one.</> },
    { q: "A church's admin changed. How do I switch them?", a: <>Click <b>Settings</b> next to the church. Under <b>Admins</b>, type the new person's email and click <b>Add admin</b>, then click <b>Remove as admin</b> next to the old one. If the new person hasn't signed in yet, they're listed as "Hasn't signed in yet" and become admin the first time they sign in with that email. The old admin stays in the church as a volunteer.</> },
    { q: "I typed the wrong admin email.", a: <>Click <b>Settings</b> next to the church, click <b>Cancel invitation</b> next to the wrong email, and add the right one.</> },
    { q: "Can I change a church's reminder emails?", a: <>Yes. Under <b>Settings</b>, pick how far ahead <b>Reminder emails</b> go out, or <b>Off</b>. The church's admins can change it too, under Manage → Emails.</> },
    { q: "How do I change a church's colors or logo?", a: <>Click <b>Open</b> next to the church, then go to <b>Manage → Appearance</b>.</> },
    { q: "How do I stop a church from taking sign-ups?", a: <>Click <b>Pause</b> next to it on <b>All churches</b>. Nothing is deleted, and <b>Activate</b> turns it back on.</> },
  ],
};

/* ---------- the welcome box, shown once per person and role ---------- */

const EVENT = "poy-welcome-change";
const key = (email: string, role: HelpRole, churchId: string | null) => `poy-welcome:${email}:${role}:${churchId ?? "-"}`;
// The in-memory copy keeps "Got it" working for this visit even when browser storage is blocked or full.
const memory = new Map<string, string | null>();
const read = (k: string) => { if (memory.has(k)) return memory.get(k)!; try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => {
  memory.set(k, v);
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode: the welcome just shows again */ }
  window.dispatchEvent(new Event(EVENT));
};

/** Whether this person has dismissed the welcome for this role, plus ways to hide it or bring it back. */
export function useWelcome(email: string, role: HelpRole, churchId: string | null) {
  const k = key(email, role, churchId);
  const [seen, setSeen] = useState(() => read(k) === "1");
  useEffect(() => {
    const sync = () => setSeen(read(k) === "1");
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [k]);
  const hide = useCallback(() => write(k, "1"), [k]);
  const showAgain = useCallback(() => write(k, null), [k]);
  return { seen, hide, showAgain };
}
