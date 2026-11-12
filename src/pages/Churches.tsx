import { useState, type FormEvent } from "react";
import { useApi } from "../api";
import { PageHeader, useAppState } from "../App";
import { Logo } from "../lib/branding";
import { churchLink } from "../api/churchChoice";
import { copyText, errText, useLoad, useToast } from "../lib/hooks";

/** Platform owner: every church on the site, and adding new ones. */
export function Churches() {
  const api = useApi();
  const toast = useToast();
  const { refreshSession, switchChurch } = useAppState();
  const churches = useLoad(() => api.listAllChurches(), [api]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoSlug = (n: string) => n.toLowerCase().replace(/\bsaint\b/g, "st").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

  async function create(e: FormEvent) {
    e.preventDefault();
    const s = (slugTouched ? slug : autoSlug(name)).trim();
    if (!name.trim()) { setWarn("Enter the church's name."); return; }
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(s)) { setWarn("The link name can use lowercase letters, numbers and dashes, like st-marys."); return; }
    setBusy(true); setWarn(null);
    try {
      await api.createChurch(s, name.trim(), adminEmail.trim());
      toast(`Added ${name.trim()}`);
      setName(""); setSlug(""); setSlugTouched(false); setAdminEmail("");
      await churches.reload(); await refreshSession();
    } catch (err) {
      const m = errText(err);
      setWarn(/duplicate|unique|taken/i.test(m) ? "That link name is already used by another church." : m);
    } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="All churches" sub="Every church on this site. Each one sees only its own volunteers and events." />
      <div className="managegrid">
        <section className="panel">
          <div className="panelhead"><h2>Churches</h2><span className="muted small">{churches.data?.length ?? ""}</span></div>
          {churches.error && <div className="notice">{churches.error}</div>}
          {churches.data && !churches.data.length && <p className="muted">No churches yet. Add the first one.</p>}
          <div className="list">
            {(churches.data ?? []).map((c) => (
              <div key={c.id} className={"churchrow" + (c.active ? "" : " off")}>
                <Logo size={40} b={c} />
                <div className="minw0 grow">
                  <b>{c.org_name}</b>{!c.active && <span className="pill paper">Paused</span>}
                  <span className="muted small block linkline">{churchLink(c.slug)}</span>
                </div>
                <div className="rowactions">
                  <button className="btn small" type="button" onClick={() => void copyText(churchLink(c.slug), "sign-up link", toast)}>Copy link</button>
                  <button className="btn small" type="button" onClick={() => void switchChurch(c.id)}>Open</button>
                  <button className="btn small" type="button" onClick={async () => {
                    try { await api.setChurchActive(c.id, !c.active); await churches.reload(); toast(c.active ? "Paused: hidden from sign-up" : "Active again"); } catch (e) { toast(errText(e)); }
                  }}>{c.active ? "Pause" : "Activate"}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
        <form className="panel" onSubmit={create} noValidate>
          <div className="panelhead"><h2>Add a church</h2></div>
          <div className="field"><label htmlFor="ch-name">Church name</label>
            <input id="ch-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="St. Mary's Parish" /></div>
          <div className="field"><label htmlFor="ch-slug">Link name</label>
            <input id="ch-slug" value={slugTouched ? slug : autoSlug(name)} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }} placeholder="st-marys" />
            <span className="muted small">Their sign-up link: {churchLink((slugTouched ? slug : autoSlug(name)) || "…")}</span></div>
          <div className="field"><label htmlFor="ch-admin">Their admin's email</label>
            <input id="ch-admin" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="office@stmarys.org" />
            <span className="muted small">They become this church's admin the first time they sign in with this email.</span></div>
          {warn && <p className="warn">{warn}</p>}
          <div><button className="btn primary" type="submit" disabled={busy}>Add church</button></div>
        </form>
      </div>
    </div>
  );
}
