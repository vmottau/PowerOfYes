import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useApi, type Church, type Ministry, type Session } from "./api";
import { resetDemo } from "./api/demo";
import { clearChurchLink, readChurchLink } from "./api/churchChoice";
import { DEFAULT_MINISTRIES } from "./lib/ministries";
import { DEFAULT_BRANDING } from "./lib/brandingDefaults";
import { Logo, pickBranding, useBranding } from "./lib/branding";
import { Icon } from "./components/Icon";
import { SignIn } from "./pages/SignIn";
import { ChooseChurch } from "./pages/ChooseChurch";
import { MyPage } from "./pages/MyPage";
import { Dashboard } from "./pages/Dashboard";
import { Directory } from "./pages/Directory";
import { Events } from "./pages/Events";
import { EventDetail } from "./pages/EventDetail";
import { Followups } from "./pages/Followups";
import { Manage } from "./pages/Manage";
import { Churches } from "./pages/Churches";

interface AppState {
  session: Session;
  church: Church | null;
  ministries: Ministry[];
  reloadMinistries: () => Promise<void>;
  refreshSession: () => Promise<void>;
  switchChurch: (id: string) => Promise<void>;
}
const AppContext = createContext<AppState | null>(null);
export function useAppState(): AppState {
  const s = useContext(AppContext);
  if (!s) throw new Error("AppContext missing");
  return s;
}

export function App() {
  const api = useApi();
  const { setSaved } = useBranding();
  const [linkSlug, setLinkSlug] = useState<string | null>(() => readChurchLink());
  const [linkChurch, setLinkChurch] = useState<Church | null | undefined>(undefined);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [ministries, setMinistries] = useState<Ministry[]>(DEFAULT_MINISTRIES);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setSession(await api.getSession()); setLoadError(null); }
    catch (e) { setLoadError(e instanceof Error ? e.message : String(e)); setSession(null); }
  }, [api]);
  useEffect(() => { void refresh(); return api.onAuthChange(() => void refresh()); }, [api, refresh]);

  // The church behind a link like /#/c/st-marys: show its look on the sign-in page.
  useEffect(() => {
    if (!linkSlug) { setLinkChurch(null); return; }
    api.getChurchBySlug(linkSlug).then(setLinkChurch, () => setLinkChurch(null));
  }, [api, linkSlug]);

  // Once signed in with a church link, join that church (or just switch to it).
  useEffect(() => {
    if (!session || !linkSlug || linkChurch === undefined) return;
    const slug = linkSlug;
    setLinkSlug(null); clearChurchLink();
    if (window.location.hash.startsWith("#/c/")) history.replaceState(null, "", window.location.pathname + window.location.search);
    if (!linkChurch?.active) return;
    const member = session.memberships.find((m) => m.church.slug === slug);
    (async () => {
      try {
        if (member) api.setCurrentChurch(member.church.id); else await api.joinChurch(slug);
      } catch (e) { setLoadError(e instanceof Error ? e.message : String(e)); }
      await refresh();
    })();
  }, [api, session, linkSlug, linkChurch, refresh]);

  const churchId = session?.current?.id ?? null;
  const reloadMinistries = useCallback(async () => {
    if (!churchId) return;
    try { setMinistries(await api.listMinistries()); } catch { /* keep the last list */ }
  }, [api, churchId]);
  useEffect(() => { void reloadMinistries(); }, [reloadMinistries]);

  // Show the current church's look (or the linked church's on the sign-in page).
  const lookFrom = session?.current ?? (session ? null : linkChurch) ?? null;
  useEffect(() => { setSaved(lookFrom ? pickBranding(lookFrom) : DEFAULT_BRANDING); }, [lookFrom, setSaved]);

  const switchChurch = useCallback(async (id: string) => { api.setCurrentChurch(id); await refresh(); }, [api, refresh]);

  if (session === undefined || (session && linkSlug)) return <div className="boot"><Logo size={48} /></div>;
  if (!session) return <SignIn error={loadError} church={linkChurch ?? null} badLink={!!linkSlug && linkChurch === null} />;

  const state: AppState = { session, church: session.current, ministries, reloadMinistries, refreshSession: refresh, switchChurch };
  return (
    <AppContext.Provider value={state}>
      <HashRouter>
        {!session.current && !session.isPlatformAdmin ? <ChooseChurch error={loadError} /> : <Shell />}
      </HashRouter>
    </AppContext.Provider>
  );
}

function Shell() {
  const api = useApi();
  const nav = useNavigate();
  const { branding } = useBranding();
  const { session, church, switchChurch } = useAppState();
  const role = church ? session.profile.role : "volunteer";
  const staff = !!church && (role === "coordinator" || role === "admin");
  const wide = staff || session.isPlatformAdmin;
  const [menuOpen, setMenuOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setMenuOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);

  const items = [
    ...(staff ? [
      { to: "/home", label: "Home", icon: "home" },
      { to: "/volunteers", label: "Volunteers", icon: "people" },
      { to: "/events", label: "Events & projects", icon: "calendar" },
      { to: "/followups", label: "Follow-ups", icon: "check" },
    ] : []),
    ...(church ? [{ to: "/me", label: staff ? "My card" : "My volunteer page", icon: "card" }] : []),
    ...(staff ? [{ to: "/manage", label: "Manage", icon: "settings" }] : []),
    ...(session.isPlatformAdmin ? [{ to: "/churches", label: "All churches", icon: "church" }] : []),
  ];
  const home = staff ? "/home" : church ? "/me" : "/churches";

  const switcher = (session.memberships.length > 1 || !session.isPlatformAdmin) && (
    <select className="churchswitch" aria-label="Switch church" value={church?.id ?? ""} onChange={async (e) => {
      if (e.target.value === "__find") { nav("/find"); return; }
      await switchChurch(e.target.value); nav("/");
    }}>
      {session.memberships.map((m) => <option key={m.church.id} value={m.church.id}>{m.church.org_name}</option>)}
      {!session.isPlatformAdmin && <option value="__find">Join another church…</option>}
    </select>
  );

  return (
    <div className={"shell" + (wide ? "" : " shell-simple")}>
      {api.mode === "demo" && (
        <div className="demobar">
          Demo mode: sample data that stays in this browser. Signed in as {session.email}.
          <button className="linkbtn" type="button" onClick={() => { resetDemo(); location.reload(); }}>Reset demo</button>
        </div>
      )}
      <header className="mobilebar">
        <div className="brandrow"><Logo size={32} /><span className="apptitle">{branding.app_title}</span></div>
        {wide ? (
          <button className="iconbtn" type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            <Icon name={menuOpen ? "x" : "menu"} />
          </button>
        ) : (
          <div className="mobileright">{switcher}<button className="iconbtn" type="button" aria-label="Sign out" onClick={() => void api.signOut()}><Icon name="logout" /></button></div>
        )}
      </header>
      <aside className={"sidebar" + (menuOpen ? " open" : "")}>
        <div className="brandblock">
          <Logo size={44} />
          <div className="minw0">
            <div className="apptitle">{branding.app_title}</div>
            <div className="orgname">{church ? branding.org_name : "Platform"}</div>
          </div>
        </div>
        {switcher && <div className="switchwrap">{switcher}</div>}
        <nav aria-label="Main">
          {items.map((n) => <NavLink key={n.to} to={n.to} className="navitem"><Icon name={n.icon} /><span>{n.label}</span></NavLink>)}
        </nav>
        <div className="sidefoot">
          <div className="minw0">
            <div className="useremail">{session.email}</div>
            <div className="userrole">{session.isPlatformAdmin ? "Platform owner" : role === "admin" ? "Church admin" : role === "coordinator" ? "Coordinator" : "Volunteer"}</div>
          </div>
          <button className="iconbtn" type="button" aria-label="Sign out" title="Sign out" onClick={() => void api.signOut()}><Icon name="logout" /></button>
        </div>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <main className="content" key={church?.id ?? "none"}>
        <Routes>
          <Route path="/" element={<Navigate to={home} replace />} />
          {church && <Route path="/me" element={<MyPage />} />}
          {staff && <Route path="/home" element={<Dashboard />} />}
          {staff && <Route path="/volunteers" element={<Directory />} />}
          {staff && <Route path="/events" element={<Events />} />}
          {staff && <Route path="/events/:id" element={<EventDetail />} />}
          {staff && <Route path="/followups" element={<Followups />} />}
          {staff && <Route path="/manage" element={<Manage />} />}
          {session.isPlatformAdmin && <Route path="/churches" element={<Churches />} />}
          <Route path="/find" element={<ChooseChurch embedded />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="pagehead">
      <div className="minw0">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="pageactions">{children}</div>}
    </header>
  );
}
