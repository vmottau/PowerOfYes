import { Link } from "react-router-dom";
import { FIRST_STEPS, useWelcome, type HelpRole } from "../lib/help";

/** A dismissible box at the top of someone's home page the first time they sign in with a role. */
export function Welcome({ email, role, churchId }: { email: string; role: HelpRole; churchId: string | null }) {
  const { seen, hide } = useWelcome(email, role, churchId);
  if (seen) return null;
  const { title, steps } = FIRST_STEPS[role];
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <h2 id="welcome-title">{title}</h2>
      <ol className="helpsteps">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      <div className="welcome-act">
        <button className="btn primary small" type="button" onClick={hide}>Got it</button>
        <Link className="btn small" to="/help" onClick={hide}>More help</Link>
      </div>
    </section>
  );
}
