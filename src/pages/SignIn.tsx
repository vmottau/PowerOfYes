import { useState, type FormEvent } from "react";
import { useApi } from "../api";
import { isEmail } from "../lib/format";
import { Logo, useBranding } from "../lib/branding";

export function SignIn({ error }: { error: string | null }) {
  const api = useApi();
  const { branding } = useBranding();
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
      <section className="signin-hero">
        <div className="brandrow"><Logo size={48} /><span className="orgname">{branding.org_name}</span></div>
        <h1>{branding.app_title}</h1>
        <p className="tagline">{branding.tagline}</p>
        <ul className="signin-points">
          <li>Tell us where you'd like to help</li>
          <li>See where you're scheduled</li>
          <li>Hear from a coordinator when something fits</li>
        </ul>
      </section>
      <section className="signin-panel">
        <div className="signin-card">
          {sent ? (
            <div className="sent" role="status">
              <h2>Check your email</h2>
              <p>We sent a sign-in link to <b>{email.trim()}</b>. Open it on this device to continue. The link works once and expires in an hour.</p>
              <button className="linkbtn" type="button" onClick={() => setSent(false)}>Use a different email</button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <h2>Volunteer sign-up and sign-in</h2>
              <p className="muted">New or returning, enter your email. We'll send you a link, so there's no password to remember.</p>
              <div className="field">
                <label htmlFor="signin-email">Email</label>
                <input id="signin-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              {msg && <p className="warn">{msg}</p>}
              <button className="btn primary wide big" type="submit" disabled={busy}>{busy ? "Sending…" : api.mode === "demo" ? "Sign in (demo)" : "Email me a sign-in link"}</button>
              {api.mode === "demo" && (
                <div className="demo-hint">
                  <b>Demo mode.</b> Pick a role to try:
                  <div className="demo-buttons">
                    <button type="button" className="btn small" onClick={() => setEmail("volunteer@example.org")}>Volunteer</button>
                    <button type="button" className="btn small" onClick={() => setEmail("coordinator@example.org")}>Coordinator</button>
                    <button type="button" className="btn small" onClick={() => setEmail("admin@example.org")}>Admin</button>
                    <button type="button" className="btn small" onClick={() => setEmail("ann@example.org")}>Ann (paper card)</button>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
