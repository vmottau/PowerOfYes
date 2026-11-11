import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useApi, type Ministry, type Session } from "./api";
import { resetDemo } from "./api/demo";
import { DEFAULT_MINISTRIES } from "./lib/ministries";
import { Logo, useBranding } from "./lib/branding";
import { Icon } from "./components/Icon";
import { SignIn } from "./pages/SignIn";
import { MyPage } from "./pages/MyPage";
import { Dashboard } from "./pages/Dashboard";
import { Directory } from "./pages/Directory";
import { Events } from "./pages/Events";
import { EventDetail } from "./pages/EventDetail";
import { Followups } from "./pages/Followups";
import { Manage } from "./pages/Manage";

interface AppState {
  session: Session;
  ministries: Ministry[];
  reloadMinistries: () => Promise<void>;
}
const AppContext = createContext<AppState | null>(null);
export function useAppState(): AppState {
  const s = useContext(AppContext);
  if (!s) throw new Error("AppContext missing");
  return s;
}

export function App() {
  const api = useApi();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [ministries, setMinistries] = useState<Ministry[]>(DEFAULT_MINISTRIES);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setSession(await api.getSession()); setLoadError(null); }
    catch (e) { setLoadError(e instanceof Error ? e.message : String(e)); setSession(null); }
  }, [api]);
  const reloadMinistries = useCallback(async () => {
    try { setMinistries(await api.listMinistries()); } catch { /* keep defaults */ }
  }, [api]);

  useEffect(() => { void refresh(); return api.onAuthChange(() => void refresh()); }, [api, refresh]);
  useEffect(() => { if (session) void reloadMinistries(); }, [session, reloadMinistries]);

  if (session === undefined) return <div className="boot"><Logo size={48} /></div>;
  if (!session) return <SignIn error={loadError} />;

  return (
    <AppContext.Provider value={{ session, ministries, reloadMinistries }}>
      <HashRouter>
        <Shell />
      </HashRouter>
    </AppContext.Provider>
  );
}

function Shell() {
  const api = useApi();
  const { branding } = useBranding();
  const { session } = useAppState();
  const role = session.profile.role;
  const staff = role === "coordinator" || role === "admin";
  const [menuOpen, setMenuOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setMenuOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);

  const nav = staff
    ? [
        { to: "/home", label: "Home", icon: "home" },
        { to: "/volunteers", label: "Volunteers", icon: "people" },
        { to: "/events", label: "Events & projects", icon: "calendar" },
        { to: "/followups", label: "Follow-ups", icon: "check" },
        { to: "/me", label: "My card", icon: "card" },
        { to: "/manage", label: "Manage", icon: "settings" },
      ]
    : [{ to: "/me", label: "My volunteer page", icon: "card" }];

  return (
    <div className={"shell" + (staff ? "" : " shell-simple")}>
      {api.mode === "demo" && (
        <div className="demobar">
          Demo mode: sample data that stays in this browser. Signed in as {session.email} ({role}).
          <button className="linkbtn" type="button" onClick={() => { resetDemo(); location.reload(); }}>Reset demo</button>
        </div>
      )}
      <header className="mobilebar">
        <div className="brandrow"><Logo size={32} /><span className="apptitle">{branding.app_title}</span></div>
        {staff && (
          <button className="iconbtn" type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            <Icon name={menuOpen ? "x" : "menu"} />
          </button>
        )}
        {!staff && <button className="iconbtn" type="button" aria-label="Sign out" onClick={() => void api.signOut()}><Icon name="logout" /></button>}
      </header>
      <aside className={"sidebar" + (menuOpen ? " open" : "")}>
        <div className="brandblock">
          <Logo size={44} />
          <div className="minw0">
            <div className="apptitle">{branding.app_title}</div>
            <div className="orgname">{branding.org_name}</div>
          </div>
        </div>
        <nav aria-label="Main">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} className="navitem"><Icon name={n.icon} /><span>{n.label}</span></NavLink>
          ))}
        </nav>
        <div className="sidefoot">
          <div className="minw0">
            <div className="useremail">{session.email}</div>
            <div className="userrole">{role === "admin" ? "Admin" : role === "coordinator" ? "Coordinator" : "Volunteer"}</div>
          </div>
          <button className="iconbtn" type="button" aria-label="Sign out" title="Sign out" onClick={() => void api.signOut()}><Icon name="logout" /></button>
        </div>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to={staff ? "/home" : "/me"} replace />} />
          <Route path="/me" element={<MyPage />} />
          {staff && <Route path="/home" element={<Dashboard />} />}
          {staff && <Route path="/volunteers" element={<Directory />} />}
          {staff && <Route path="/events" element={<Events />} />}
          {staff && <Route path="/events/:id" element={<EventDetail />} />}
          {staff && <Route path="/followups" element={<Followups />} />}
          {staff && <Route path="/manage" element={<Manage />} />}
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
