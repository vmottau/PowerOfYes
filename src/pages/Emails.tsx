import { useEffect, useState } from "react";
import { useApi, type SentEmail } from "../api";
import { useAppState } from "../App";
import { errText, useLoad, useToast } from "../lib/hooks";

const DAY_CHOICES: [number, string][] = [[0, "Off"], [1, "1 day before"], [2, "2 days before"], [3, "3 days before"], [7, "1 week before"]];

const STATUS: Record<SentEmail["status"], string> = {
  waiting: "Waiting to send",
  sending: "Sending",
  sent: "Sent",
  failed: "Couldn't send",
  cancelled: "Not needed",
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Manage → Emails: the reminder setting and a log of what went out. */
export function Emails() {
  const api = useApi();
  const toast = useToast();
  const { session } = useAppState();
  const isAdmin = session.profile.role === "admin";
  const demo = api.mode === "demo";
  const days = useLoad(() => api.getReminderDays(), [api]);
  const emails = useLoad(() => api.listEmails(), [api]);
  const [pick, setPick] = useState<number | null>(null);
  useEffect(() => { if (days.data !== null) setPick(days.data); }, [days.data]);

  async function save(n: number) {
    setPick(n);
    try {
      await api.setReminderDays(n);
      toast(n ? `Reminders go out ${DAY_CHOICES.find(([d]) => d === n)?.[1] ?? `${n} days before`}` : "Reminders turned off");
      await Promise.all([days.reload(), emails.reload()]);
    } catch (e) { toast(errText(e)); setPick(days.data); }
  }

  const list = emails.data ?? [];
  const stuck = !demo && list.length > 0 && !list.some((e) => e.status === "sent" || e.status === "sending")
    && list.some((e) => e.status === "waiting" && Date.now() - new Date(e.created_at).getTime() > 30 * 60000);
  const choices = pick !== null && !DAY_CHOICES.some(([d]) => d === pick) ? [...DAY_CHOICES, [pick, `${pick} days before`] as [number, string]] : DAY_CHOICES;

  return (
    <div className="stack">
      <section className="panel">
        <div className="panelhead"><h2>Reminder emails</h2></div>
        <p className="muted small">Each morning, volunteers on an upcoming event get an email with the time, place and notes, and a link to press "Can't make it" if their plans change. Replies go to whoever created the event.</p>
        <div className="field">
          <label htmlFor="em-days">Send reminders</label>
          {isAdmin ? (
            <select id="em-days" value={pick ?? ""} disabled={pick === null} onChange={(e) => void save(Number(e.target.value))}>
              {choices.map(([d, label]) => <option key={d} value={d}>{label}</option>)}
            </select>
          ) : <div id="em-days">{pick === null ? "…" : choices.find(([d]) => d === pick)?.[1]} <span className="muted small">(a church admin can change this)</span></div>}
        </div>
        <p className="muted small">When a volunteer presses "Can't make it", the coordinator who created the event gets an email right away (or the church admins, if that person isn't a coordinator here anymore). Volunteers without an email address on their card don't get reminders.</p>
      </section>

      <section className="panel">
        <div className="panelhead"><h2>{demo ? "Emails the real site would send" : "Recent emails"}</h2><span className="muted small">{list.length || ""}</span></div>
        {demo && <div className="notice">Demo mode doesn't send any email. This shows what would go out today.</div>}
        {stuck && <div className="notice">Emails are waiting but none have gone out yet. Email sending may not be turned on yet: see "Email reminders" in the setup steps.</div>}
        {emails.error && <div className="notice">{emails.error}</div>}
        <div className="tablewrap">
          <table className="table" id="email-log">
            <thead><tr><th>When</th><th>To</th><th>Subject</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{when(e.sent_at ?? e.created_at)}</td>
                  <td>{e.to_email}</td>
                  <td>{e.subject}</td>
                  <td>{STATUS[e.status]}{e.status === "failed" && e.error && <div className="muted small">{e.error}</div>}</td>
                </tr>
              ))}
              {emails.data && !list.length && <tr><td colSpan={4} className="muted">No emails yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
