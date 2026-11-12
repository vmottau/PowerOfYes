import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../api";
import { PageHeader, useAppState } from "../App";
import { Logo } from "../lib/branding";
import { errText, useLoad } from "../lib/hooks";

/** Shown to someone signed in who hasn't joined a church yet, or who wants to join another. */
export function ChooseChurch({ embedded, error }: { embedded?: boolean; error?: string | null }) {
  const api = useApi();
  const nav = useNavigate();
  const { session, refreshSession } = useAppState();
  const churches = useLoad(() => api.listPublicChurches(), [api]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(error ?? null);
  const mine = new Set(session.memberships.map((m) => m.church.id));
  const list = (churches.data ?? []).filter((c) => !mine.has(c.id) && (!q.trim() || c.org_name.toLowerCase().includes(q.trim().toLowerCase())));

  async function join(slug: string) {
    try { await api.joinChurch(slug); await refreshSession(); nav("/"); } catch (e) { setMsg(errText(e)); }
  }

  const body = (
    <>
      <PageHeader title={embedded ? "Join another church" : "Find your church"} sub="Pick the church you'd like to volunteer with. If your church gave you a link, you can also just open that link." />
      {msg && <div className="notice">{msg}</div>}
      <input type="search" id="find-q" className="input narrow" placeholder="Search by name" aria-label="Search churches" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="list churchlist">
        {churches.data && !list.length && <p className="muted">{q ? "No church matches that name." : "There are no other churches to join yet."}</p>}
        {list.map((c) => (
          <div key={c.id} className="churchrow">
            <Logo size={44} b={c} />
            <div className="minw0 grow"><b>{c.org_name}</b><span className="muted small block">{c.app_title}</span></div>
            <button className="btn primary small" type="button" onClick={() => void join(c.slug)}>Join</button>
          </div>
        ))}
      </div>
    </>
  );
  if (embedded) return <div>{body}</div>;
  return (
    <div className="shell shell-simple">
      <header className="mobilebar">
        <div className="brandrow"><Logo size={32} /><span className="apptitle">Volunteer sign-up</span></div>
        <button className="btn small" type="button" onClick={() => void api.signOut()}>Sign out</button>
      </header>
      <main className="content">{body}</main>
    </div>
  );
}
