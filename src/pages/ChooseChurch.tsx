import { useApi } from "../api";
import { useAppState } from "../App";
import { Logo } from "../lib/branding";

/** Shown to someone signed in who isn't part of any church yet. People join a church only through its link or an invite. */
export function ChooseChurch({ error }: { error?: string | null }) {
  const api = useApi();
  const { session } = useAppState();
  return (
    <div className="shell shell-simple">
      <header className="mobilebar">
        <div className="brandrow"><Logo size={32} /><span className="apptitle">Volunteer sign-up</span></div>
        <button className="btn small" type="button" onClick={() => void api.signOut()}>Sign out</button>
      </header>
      <main className="content">
        <header className="pagehead"><div className="minw0"><h1>Open your church's link</h1></div></header>
        {error && <div className="notice">{error}</div>}
        <div className="card nochurch">
          <p>You're signed in as <b>{session.email}</b>, but this email isn't connected to a church yet.</p>
          <p>To sign up, open the volunteer link your church shared with you (in the bulletin, an email or on the website). It takes you straight to your church.</p>
          <p className="muted">If a coordinator invited you, make sure you signed in with the same email address they used.</p>
        </div>
      </main>
    </div>
  );
}
