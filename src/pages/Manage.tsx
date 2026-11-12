import { useEffect, useState, type FormEvent } from "react";
import { useApi, type Branding, type Ministry, type Role } from "../api";
import { PageHeader, useAppState } from "../App";
import { Icon } from "../components/Icon";
import { Logo, useBranding } from "../lib/branding";
import { churchLink } from "../api/churchChoice";
import { copyText, errText, useLoad, useToast } from "../lib/hooks";

type Tab = "areas" | "people" | "appearance";

export function Manage() {
  const { session } = useAppState();
  const isAdmin = session.profile.role === "admin";
  const [tab, setTab] = useState<Tab>("areas");
  const tabs: [Tab, string][] = [["areas", "Ministries & areas"], ["people", "People & roles"], ...(isAdmin ? [["appearance", "Appearance"] as [Tab, string]] : [])];
  return (
    <div>
      <PageHeader title="Manage" sub="The lists and settings behind the app." />
      <div className="subtabs" role="tablist">
        <div className="seg">
          {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
        </div>
      </div>
      {tab === "areas" && <Areas />}
      {tab === "people" && <People canEdit={isAdmin} />}
      {tab === "appearance" && isAdmin && <Appearance />}
    </div>
  );
}

/* ---------------- Ministries & areas ---------------- */
function Areas() {
  const api = useApi();
  const toast = useToast();
  const { ministries, reloadMinistries } = useAppState();
  const usage = useLoad(async () => {
    const [vols, events] = await Promise.all([api.listVolunteers(), api.listEvents()]);
    return { vols, events };
  }, [api]);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const count = (id: string) => usage.data?.vols.filter((v) => v.ministries.includes(id)).length ?? 0;
  const save = async (m: Ministry, msg = "Saved") => {
    try { await api.saveMinistry(m); await reloadMinistries(); toast(msg); } catch (e) { toast(errText(e)); }
  };
  async function move(kind: Ministry["kind"], idx: number, dir: -1 | 1) {
    const list = ministries.filter((m) => m.kind === kind);
    const a = list[idx], b = list[idx + dir];
    if (!a || !b) return;
    try {
      await api.saveMinistry({ ...a, sort: b.sort });
      await api.saveMinistry({ ...b, sort: a.sort === b.sort ? a.sort + dir : a.sort });
      await reloadMinistries();
    } catch (e) { toast(errText(e)); }
  }

  return (
    <div className="managegrid">
      {(["ministry", "event"] as const).map((kind) => {
        const list = ministries.filter((m) => m.kind === kind);
        return (
          <section className="panel" key={kind}>
            <div className="panelhead"><h2>{kind === "ministry" ? "Parish ministries" : "Events & activities"}</h2><span className="muted small">{list.length}</span></div>
            <p className="muted small">These are the checkboxes on the volunteer card, in this order.</p>
            <div className="arealist">
              {list.map((m, i) => (
                <div key={m.id} className={"arearow" + (m.active ? "" : " off")}>
                  {editing === m.id ? (
                    <AreaEditor m={m} onCancel={() => setEditing(null)} onSave={async (next) => { await save(next); setEditing(null); }} />
                  ) : (
                    <>
                      <div className="order">
                        <button className="iconbtn sm" type="button" aria-label={`Move ${m.label} up`} disabled={i === 0} onClick={() => void move(kind, i, -1)}><Icon name="up" size={16} /></button>
                        <button className="iconbtn sm" type="button" aria-label={`Move ${m.label} down`} disabled={i === list.length - 1} onClick={() => void move(kind, i, 1)}><Icon name="down" size={16} /></button>
                      </div>
                      <div className="minw0 grow">
                        <b>{m.label}</b>{!m.active && <span className="pill paper">Hidden</span>}
                        <span className="muted small block">{[m.hint, usage.data ? `${count(m.id)} interested` : ""].filter(Boolean).join(" · ")}</span>
                      </div>
                      {confirmDel === m.id ? (
                        <div className="confirmdel">
                          {count(m.id) ? `${count(m.id)} volunteers checked this. Delete anyway?` : "Delete?"}
                          <button className="btn danger small" type="button" onClick={async () => {
                            try { await api.deleteMinistry(m.id); await reloadMinistries(); toast(`Deleted ${m.label}`); } catch (e) { toast(errText(e)); }
                            setConfirmDel(null);
                          }}>Delete</button>
                          <button className="btn small" type="button" onClick={() => setConfirmDel(null)}>Keep</button>
                        </div>
                      ) : (
                        <div className="rowactions">
                          <button className="btn small" type="button" onClick={() => setEditing(m.id)}>Edit</button>
                          <button className="btn small" type="button" onClick={() => void save({ ...m, active: !m.active }, m.active ? `Hid ${m.label}` : `Showing ${m.label}`)}>{m.active ? "Hide" : "Show"}</button>
                          <button className="iconbtn sm" type="button" aria-label={`Delete ${m.label}`} title="Delete" onClick={() => setConfirmDel(m.id)}><Icon name="trash" size={16} /></button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            <NewArea kind={kind} nextSort={Math.max(0, ...ministries.map((m) => m.sort)) + 10} onSaved={reloadMinistries} />
          </section>
        );
      })}
      <p className="muted small span-all">Hiding an area stops offering it on the card but keeps it on volunteers who already checked it. Deleting removes it everywhere.</p>
    </div>
  );
}

function AreaEditor({ m, onSave, onCancel }: { m: Ministry; onSave: (m: Ministry) => void; onCancel: () => void }) {
  const [label, setLabel] = useState(m.label);
  const [hint, setHint] = useState(m.hint);
  const [kind, setKind] = useState(m.kind);
  return (
    <form className="areaeditor" onSubmit={(e) => { e.preventDefault(); if (label.trim()) onSave({ ...m, label: label.trim(), hint: hint.trim(), kind }); }}>
      <input aria-label="Name" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
      <input aria-label="Short note" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Short note, e.g. Once a month" />
      <select aria-label="Group" value={kind} onChange={(e) => setKind(e.target.value as Ministry["kind"])}>
        <option value="ministry">Parish ministry</option><option value="event">Event or activity</option>
      </select>
      <div className="rowactions"><button className="btn primary small" type="submit">Save</button><button className="btn small" type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function NewArea({ kind, nextSort, onSaved }: { kind: Ministry["kind"]; nextSort: number; onSaved: () => Promise<void> }) {
  const api = useApi();
  const toast = useToast();
  const [label, setLabel] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    const l = label.trim(); if (!l) return;
    const id = l.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + Date.now().toString(36).slice(-4);
    try { await api.saveMinistry({ id, label: l, kind, hint: "", sort: nextSort, active: true }); setLabel(""); await onSaved(); toast(`Added ${l}`); }
    catch (err) { toast(errText(err)); }
  }
  return (
    <form className="newarea" onSubmit={submit}>
      <input id={`new-area-${kind}`} aria-label={`New ${kind === "ministry" ? "ministry" : "event or activity"}`} placeholder={kind === "ministry" ? "Add a ministry, e.g. Lector" : "Add an event, e.g. Fish Fry"} value={label} onChange={(e) => setLabel(e.target.value)} />
      <button className="btn" type="submit" disabled={!label.trim()}><Icon name="plus" size={16} /> Add</button>
    </form>
  );
}

/* ---------------- People & roles ---------------- */
const ROLES: { id: Role; label: string; help: string }[] = [
  { id: "volunteer", label: "Volunteer", help: "Their own card and assignments" },
  { id: "coordinator", label: "Coordinator", help: "All volunteers, events, follow-ups and lists" },
  { id: "admin", label: "Church admin", help: "Everything, plus people, roles and appearance" },
];

function People({ canEdit }: { canEdit: boolean }) {
  const api = useApi();
  const toast = useToast();
  const { session, church } = useAppState();
  const people = useLoad(async () => {
    const [members, invites] = await Promise.all([api.listProfiles(), api.listInvites()]);
    return { members, invites };
  }, [api]);
  const [q, setQ] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("coordinator");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>, msg: string) {
    try { await fn(); toast(msg); } catch (e) { toast(errText(e)); }
    await people.reload();
  }
  async function invite(e: FormEvent) {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { toast("Enter a full email address."); return; }
    try {
      const r = await api.invite(em, role);
      toast(r === "added" ? `${em} is now a ${ROLES.find((x) => x.id === role)!.label.toLowerCase()}` : `Invited ${em}. Their role starts when they first sign in.`);
      setEmail("");
    } catch (err) { toast(errText(err)); }
    await people.reload();
  }
  const list = (people.data?.members ?? []).filter((p) => !q.trim() || p.email.toLowerCase().includes(q.trim().toLowerCase()));
  const link = church ? churchLink(church.slug) : "";

  return (
    <div className="managegrid">
      <section className="panel">
        <div className="panelhead"><h2>People at {church?.org_name}</h2><span className="muted small">{people.data?.members.length ?? ""}</span></div>
        <p className="muted small">{canEdit ? "Everyone who has joined this church. Change a role, or remove someone from this church." : "Only a church admin can change roles."}</p>
        <input type="search" id="people-q" className="input narrow" placeholder="Search by email" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
        {people.error && <div className="notice">{people.error}</div>}
        <div className="tablewrap">
          <table className="table">
            <thead><tr><th>Email</th><th>Role</th>{canEdit && <th><span className="visually-hidden">Remove</span></th>}</tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>{p.email}{p.id === session.userId && <span className="muted"> (you)</span>}</td>
                  <td>{canEdit ? (
                    <select aria-label={`Role for ${p.email}`} value={p.role} onChange={(e) => void act(() => api.setRole(p.id, e.target.value as Role), "Role updated")}>
                      {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  ) : ROLES.find((r) => r.id === p.role)?.label}</td>
                  {canEdit && <td className="right">
                    {confirmRemove === p.id ? (
                      <span className="confirmdel">Remove?
                        <button className="btn danger small" type="button" onClick={() => { setConfirmRemove(null); void act(() => api.removeMember(p.id), `Removed ${p.email}`); }}>Remove</button>
                        <button className="btn small" type="button" onClick={() => setConfirmRemove(null)}>Keep</button>
                      </span>
                    ) : p.id !== session.userId && <button className="iconbtn sm" type="button" aria-label={`Remove ${p.email} from this church`} title="Remove from this church" onClick={() => setConfirmRemove(p.id)}><Icon name="x" size={16} /></button>}
                  </td>}
                </tr>
              ))}
              {people.data && !list.length && <tr><td colSpan={3} className="muted">No one matches.</td></tr>}
            </tbody>
          </table>
        </div>
        <ul className="rolehelp">{ROLES.map((r) => <li key={r.id}><b>{r.label}:</b> {r.help}</li>)}</ul>
      </section>

      <div className="stack">
        <section className="panel">
          <div className="panelhead"><h2>Volunteer sign-up link</h2></div>
          <p className="muted small">Share this in the bulletin, on the website or as a QR code. Anyone who signs up through it joins {church?.org_name}.</p>
          <div className="linkbox"><code>{link}</code><button className="btn small" type="button" onClick={() => void copyText(link, "sign-up link", toast)}>Copy</button></div>
        </section>
        {canEdit && (
          <form className="panel" onSubmit={invite} noValidate>
            <div className="panelhead"><h2>Invite someone</h2></div>
            <p className="muted small">Give a coordinator or another admin their role ahead of time. It applies the first time they sign in with this email.</p>
            <div className="field"><label htmlFor="inv-email">Email</label><input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.org" /></div>
            <div className="field"><label htmlFor="inv-role">Role</label>
              <select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
            <div><button className="btn primary" type="submit">Send invite</button></div>
            {(people.data?.invites.length ?? 0) > 0 && (
              <div className="invites">
                <h3 className="subhead">Waiting to sign in</h3>
                {people.data!.invites.map((i) => (
                  <div key={i.id} className="inviterow">
                    <span className="minw0">{i.email} <span className="muted small">· {ROLES.find((r) => r.id === i.role)?.label}</span></span>
                    <button className="linkbtn" type="button" onClick={() => void act(() => api.cancelInvite(i.id), "Invite cancelled")}>Cancel</button>
                  </div>
                ))}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

/* ---------------- Appearance ---------------- */
const PRESETS: { name: string; primary: string; accent: string }[] = [
  { name: "Purple", primary: "#5b2a86", accent: "#a259c6" },
  { name: "Plum", primary: "#6b2259", accent: "#c0569e" },
  { name: "Lavender", primary: "#5a4a9c", accent: "#9d8fe0" },
  { name: "Navy", primary: "#1d3fa6", accent: "#b8326e" },
  { name: "Forest", primary: "#24613f", accent: "#c08a2b" },
  { name: "Burgundy", primary: "#7a1f2b", accent: "#c79a3a" },
];

async function shrinkImage(file: File, max = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}

function Appearance() {
  const api = useApi();
  const toast = useToast();
  const { saved, preview } = useBranding();
  const { refreshSession } = useAppState();
  const [b, setB] = useState<Branding>(saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => { preview(b); }, [b, preview]);
  useEffect(() => () => preview(null), [preview]);
  const set = (p: Partial<Branding>) => setB({ ...b, ...p });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!b.org_name.trim() || !b.app_title.trim()) { toast("Add the church name and the app's title."); return; }
    setBusy(true);
    try { await api.saveBranding({ ...b, org_name: b.org_name.trim(), app_title: b.app_title.trim(), tagline: b.tagline.trim() }); await refreshSession(); preview(null); toast("Appearance saved for everyone"); }
    catch (err) { toast(errText(err)); } finally { setBusy(false); }
  }

  return (
    <form className="panel appearance" onSubmit={submit}>
      <div className="panelhead"><h2>Your church's look</h2><span className="muted small">Changes preview right away. Save to apply them for everyone.</span></div>
      <div className="row">
        <div className="field"><label htmlFor="br-org">Church name</label><input id="br-org" value={b.org_name} onChange={(e) => set({ org_name: e.target.value })} /></div>
        <div className="field"><label htmlFor="br-title">App title</label><input id="br-title" value={b.app_title} onChange={(e) => set({ app_title: e.target.value })} /></div>
      </div>
      <div className="field"><label htmlFor="br-tag">Welcome line on the sign-in page</label><input id="br-tag" value={b.tagline} onChange={(e) => set({ tagline: e.target.value })} /></div>
      <fieldset>
        <legend>Colors</legend>
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.name} type="button" className="preset" aria-pressed={b.primary_color === p.primary && b.accent_color === p.accent} onClick={() => set({ primary_color: p.primary, accent_color: p.accent })}>
              <span className="sw" style={{ background: p.primary }} /><span className="sw" style={{ background: p.accent }} />{p.name}
            </button>
          ))}
        </div>
        <div className="row">
          <label className="colorpick" htmlFor="br-primary"><input id="br-primary" type="color" value={b.primary_color} onChange={(e) => set({ primary_color: e.target.value })} /> Main color <code>{b.primary_color}</code></label>
          <label className="colorpick" htmlFor="br-accent"><input id="br-accent" type="color" value={b.accent_color} onChange={(e) => set({ accent_color: e.target.value })} /> Accent color <code>{b.accent_color}</code></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Logo</legend>
        <div className="logoedit">
          <Logo size={64} />
          <div className="rowactions">
            <label className="btn small filebtn" htmlFor="br-logo">Upload image<input id="br-logo" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = "";
              if (!f) return;
              try { set({ logo: await shrinkImage(f) }); } catch { toast("That image couldn't be read. Try a PNG or JPG."); }
            }} /></label>
            {b.logo && <button className="btn small" type="button" onClick={() => set({ logo: "" })}>Remove</button>}
          </div>
          <span className="muted small">A square image works best. Without one, the church's initials are shown.</span>
        </div>
      </fieldset>
      <div className="formfoot"><div className="right">
        <button className="btn" type="button" onClick={() => setB(saved)}>Undo changes</button>
        <button className="btn primary" type="submit" disabled={busy}>Save appearance</button>
      </div></div>
    </form>
  );
}
