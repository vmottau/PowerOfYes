import { useEffect, useState, type FormEvent } from "react";
import { useApi, type Church } from "../api";
import { Modal } from "../components/Modal";
import { DAY_CHOICES } from "./Emails";
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
  const [editing, setEditing] = useState<Church | null>(null);
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
                  <button className="btn small" type="button" onClick={() => setEditing(c)}>Settings</button>
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
      <Modal open={editing !== null} onClose={() => setEditing(null)} labelledBy="cs-dlg-title">
        {editing && <ChurchSettingsForm church={editing} onClose={() => setEditing(null)}
          onSaved={async () => { await churches.reload(); await refreshSession(); }} />}
      </Modal>
    </div>
  );
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Platform owner: one church's name, link, reminder emails and admins, without going into the church. */
function ChurchSettingsForm({ church, onClose, onSaved }: { church: Church; onClose: () => void; onSaved: () => Promise<void> }) {
  const api = useApi();
  const toast = useToast();
  const settings = useLoad(() => api.getChurchSettings(church.id), [api, church.id]);
  const [name, setName] = useState(church.org_name);
  const [slug, setSlug] = useState(church.slug);
  const [days, setDays] = useState<number | null>(null);
  const [newAdmin, setNewAdmin] = useState("");
  const [warn, setWarn] = useState<string | null>(null);
  const [adminWarn, setAdminWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (settings.data && days === null) setDays(settings.data.reminder_days); }, [settings.data, days]);

  const s = settings.data;
  const dayChoices = days !== null && !DAY_CHOICES.some(([d]) => d === days) ? [...DAY_CHOICES, [days, `${days} days before`] as [number, string]] : DAY_CHOICES;
  const slugChanged = slug.trim() !== church.slug;

  async function save(e: FormEvent) {
    e.preventDefault();
    const sl = slug.trim().toLowerCase();
    if (!name.trim()) { setWarn("Enter the church's name."); return; }
    if (!SLUG_RE.test(sl)) { setWarn("The link name can use lowercase letters, numbers and dashes, like st-marys."); return; }
    if (days === null) return;
    setBusy(true); setWarn(null);
    try {
      await api.saveChurchSettings(church.id, { org_name: name.trim(), slug: sl, reminder_days: days });
      await onSaved();
      toast(`Saved ${name.trim()}`);
      onClose();
    } catch (err) {
      const m = errText(err);
      setWarn(/duplicate|unique|taken/i.test(m) ? "That link name is already used by another church." : m);
    } finally { setBusy(false); }
  }

  async function adminAction(run: () => Promise<string | void>) {
    setAdminWarn(null);
    try { const msg = await run(); await settings.reload(); if (msg) toast(msg); }
    catch (err) { setAdminWarn(/at least one admin/i.test(errText(err)) ? "Add the other admin's email first. A church always needs an admin." : errText(err)); }
  }

  async function addAdmin() {
    const e = newAdmin.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) { setAdminWarn("Type the new admin's email address."); return; }
    await adminAction(async () => {
      const r = await api.addChurchAdmin(church.id, e);
      setNewAdmin("");
      return r === "added" ? `${e} is now an admin` : `${e} becomes an admin when they first sign in`;
    });
  }

  return (
    <form onSubmit={save} noValidate className="churchsettings">
      <h2 id="cs-dlg-title">Church settings</h2>
      <div className="field"><label htmlFor="cs-name">Church name</label>
        <input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label htmlFor="cs-slug">Link name</label>
        <input id="cs-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
        <span className="muted small">Sign-up link: {churchLink(slug.trim() || "…")}</span>
        {slugChanged && <span className="warn small">The old link stops working. Share the new one with the church.</span>}</div>
      <div className="field"><label htmlFor="cs-days">Reminder emails</label>
        <select id="cs-days" value={days ?? ""} disabled={days === null} onChange={(e) => setDays(Number(e.target.value))}>
          {days === null && <option value="">…</option>}
          {dayChoices.map(([d, label]) => <option key={d} value={d}>{label}</option>)}
        </select></div>

      <fieldset className="adminsbox">
        <legend>Admins</legend>
        {settings.error && <div className="notice">{settings.error}</div>}
        {s && !s.admins.length && !s.adminInvites.length && <p className="muted small">This church has no admin yet.</p>}
        <div className="list">
          {s?.admins.map((p) => (
            <div key={p.id} className="adminrow">
              <span className="minw0 grow">{p.email || "(no email)"}</span>
              <button className="btn small" type="button" aria-label={`Remove ${p.email} as admin`} onClick={() => void adminAction(async () => { await api.removeChurchAdmin(church.id, p.id); return `${p.email} is no longer an admin`; })}>Remove as admin</button>
            </div>
          ))}
          {s?.adminInvites.map((i) => (
            <div key={i.id} className="adminrow">
              <span className="minw0 grow">{i.email} <span className="pill paper">Hasn't signed in yet</span></span>
              <button className="btn small" type="button" aria-label={`Cancel the invitation for ${i.email}`} onClick={() => void adminAction(async () => { await api.cancelChurchInvite(church.id, i.id); return `Cancelled the invitation for ${i.email}`; })}>Cancel invitation</button>
            </div>
          ))}
        </div>
        <div className="addadmin">
          <label className="visually-hidden" htmlFor="cs-admin">New admin's email</label>
          <input id="cs-admin" className="input" type="email" value={newAdmin} placeholder="new.admin@church.org"
            onChange={(e) => setNewAdmin(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addAdmin(); } }} />
          <button className="btn" type="button" onClick={() => void addAdmin()}>Add admin</button>
        </div>
        <p className="muted small">Admin changes save right away. When a church's admin changes, add the new person's email, then remove the old admin. The old admin stays in the church as a volunteer.</p>
        {adminWarn && <p className="warn">{adminWarn}</p>}
      </fieldset>

      <p className="muted small">The church's colors, logo and app title are under <b>Open</b> → Manage → Appearance.</p>
      {warn && <p className="warn">{warn}</p>}
      <div className="formfoot"><div className="right">
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button className="btn primary" type="submit" disabled={busy || days === null}>Save</button>
      </div></div>
    </form>
  );
}
