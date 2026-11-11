import { useState, type FormEvent } from "react";
import { useApi } from "../api";
import { isEmail } from "../lib/format";

export function SignIn({ error }: { error: string | null }) {
  const api = useApi();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(error);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const em = email.trim();
    if (!isEmail(em)) { setMsg("Enter your full email address, like name@example.com."); return; }
    setBusy(true); setMsg(null);
    try {
      await api.sendSignInLink(em);
      if (api.mode === "supabase") setSent(true);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't send the link. Try again in a minute.");
    } finally { setBusy(false); }
  }

  return (
    <div className="signin">
      <div className="card signin-card">
        <h1 className="brandmark">The Power of <span>Yes</span></h1>
        <p className="lede">Sign up to volunteer at the parish, or sign in to see where you're scheduled to help.</p>
        {sent ? (
          <div className="sent" role="status">
            <h2>Check your email</h2>
            <p>We sent a sign-in link to <b>{email.trim()}</b>. Open it on this device to continue. The link works once and expires in an hour.</p>
            <button className="linkbtn" type="button" onClick={() => setSent(false)}>Use a different email</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="signin-email">Email</label>
              <input id="signin-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            {msg && <p className="warn">{msg}</p>}
            <button className="btn primary wide" type="submit" disabled={busy}>{busy ? "Sending…" : api.mode === "demo" ? "Sign in (demo)" : "Email me a sign-in link"}</button>
            <p className="muted small">New here? The same link creates your account. No password needed.</p>
            {api.mode === "demo" && (
              <div className="demo-hint">
                <b>Demo mode.</b> Try each role:
                <div className="demo-buttons">
                  <button type="button" className="btn small" onClick={() => setEmail("volunteer@example.org")}>Volunteer</button>
                  <button type="button" className="btn small" onClick={() => setEmail("coordinator@example.org")}>Coordinator</button>
                  <button type="button" className="btn small" onClick={() => setEmail("admin@example.org")}>Admin</button>
                </div>
                Signing in as <code>ann@example.org</code> shows a volunteer who already has a paper card and assignments.
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
