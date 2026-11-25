import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader, useAppState } from "../App";
import { useApi } from "../api";
import { FAQS, FIRST_STEPS, ROLE_NAMES, useWelcome, type HelpRole } from "../lib/help";

const GUIDE_URL = "https://github.com/vmottau/PowerOfYes/blob/main/docs/USER_GUIDE.md";
const DEMO_URL = "https://vmottau.github.io/PowerOfYes/?demo";

/** The signed-in person's role, as Help and the welcome box talk about it. */
export function helpRoleOf(isPlatformAdmin: boolean, hasChurch: boolean, role: string): HelpRole {
  if (isPlatformAdmin && !hasChurch) return "owner";
  return role === "admin" ? "admin" : role === "coordinator" ? "coordinator" : "volunteer";
}

export function Help() {
  const api = useApi();
  const { session, church } = useAppState();
  const mine = helpRoleOf(session.isPlatformAdmin, !!church, church ? session.profile.role : "volunteer");
  const staff = mine !== "volunteer";
  // Staff can read every role's answers (so they can help volunteers); volunteers see only their own.
  const tabs: HelpRole[] = staff
    ? [mine, ...(["volunteer", "coordinator", "admin", "owner"] as HelpRole[]).filter((r) => r !== mine && (r !== "owner" || session.isPlatformAdmin))]
    : ["volunteer"];
  const [tab, setTab] = useState<HelpRole>(mine);
  const welcome = useWelcome(session.email, mine, church?.id ?? null);
  const start = FIRST_STEPS[tab];

  return (
    <div className="helppage">
      <PageHeader title="Help" sub="Short answers about using the app. Click a question to open it." />

      {tabs.length > 1 && (
        <div className="subtabs" role="tablist" aria-label="Help for">
          {tabs.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={tab === r} aria-pressed={tab === r} onClick={() => setTab(r)}>
              {ROLE_NAMES[r]}{r === mine ? " (you)" : ""}
            </button>
          ))}
        </div>
      )}

      <section className="panel">
        <div className="panelhead"><h2>Getting started</h2></div>
        <ol className="helpsteps">{start.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        {tab === mine && welcome.seen && (
          <div><button className="linkbtn" type="button" onClick={welcome.showAgain}>Show the welcome box again</button></div>
        )}
      </section>

      <section className="sect">
        <h2 className="subhead">Questions</h2>
        <div className="faqs">
          {FAQS[tab].map((f) => (
            <details key={f.q} className="faq">
              <summary>{f.q}</summary>
              <div className="faqa">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      {staff && (
        <section className="panel">
          <div className="panelhead"><h2>Try things safely</h2></div>
          <p>Demo mode is a practice copy of the app with made-up people. Nothing you do there touches real records or sends anything.
            Open <a href={DEMO_URL} target="_blank" rel="noreferrer">the demo</a>, pick a role, and click <b>Reset demo</b> in the yellow bar to start over.</p>
          <p>For a full walkthrough of every page by role, read the <a href={GUIDE_URL} target="_blank" rel="noreferrer">user guide</a>.</p>
          {api.mode === "demo" && <p className="muted small">You're in demo mode right now.</p>}
        </section>
      )}

      <p className="muted small helpfoot">
        Still stuck? {staff ? "Volunteers ask their coordinator, and coordinators contact the person who runs this site." : "Ask a coordinator at your church. They can pass it on if needed."}
        {" "}<Link to="/">Back to my home page</Link>
      </p>
    </div>
  );
}
