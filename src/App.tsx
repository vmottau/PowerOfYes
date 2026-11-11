import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { HashRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useApi, type Ministry, type Session } from "./api";
import { resetDemo } from "./api/demo";
import { DEFAULT_MINISTRIES } from "./lib/ministries";
import { SignIn } from "./pages/SignIn";
import { MyPage } from "./pages/MyPage";
import { Directory } from "./pages/Directory";
import { Events } from "./pages/Events";
import { EventDetail } from "./pages/EventDetail";
import { Admin } from "./pages/Admin";

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
    try {
      setSession(await api.getSession());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setSession(null);
    }
  }, [api]);

  const reloadMinistries = useCallback(async () => {
    try { setMinistries(await api.listMinistries()); } catch { /* keep defaults */ }
  }, [api]);

  useEffect(() => { void refresh(); return api.onAuthChange(() => void refresh()); }, [api, refresh]);
  useEffect(() => { if (session) void reloadMinistries(); }, [session, reloadMinistries]);

  if (session === undefined) return <div className="wrap"><p className="muted">Loading…</p></div>;
  if (!session) return <SignIn error={loadError} />;

  const role = session.profile.role;
  const staff = role === "coordinator" || role === "admin";

  return (
    <AppContext.Provider value={{ session, ministries, reloadMinistries }}>
      <HashRouter>
        {api.mode === "demo" && (
          <div className="demobar">
            Demo mode: data stays in this browser. Signed in as {session.email} ({role}).
            <button className="linkbtn" type="button" onClick={() => { resetDemo(); location.reload(); }}>Reset demo data</button>
          </div>
        )}
        <div className="wrap">
          <header className="top">
            <div className="brand">
              <h1>The Power of <span>Yes</span></h1>
              <p>{staff ? "Volunteer coordination" : "Your volunteer page"}</p>
            </div>
            <div className="who">
              <span>{session.email}</span>
              <span className={`rolepill r-${role}`}>{role}</span>
              <button className="btn small" type="button" onClick={() => void api.signOut()}>Sign out</button>
            </div>
          </header>
          {staff && (
            <nav className="tabs" aria-label="Sections">
              <NavLink className="tab" to="/volunteers">Volunteers</NavLink>
              <NavLink className="tab" to="/events">Events &amp; projects</NavLink>
              <NavLink className="tab" to="/me">My card</NavLink>
              {role === "admin" && <NavLink className="tab" to="/admin">Admin</NavLink>}
            </nav>
          )}
          <main>
            <Routes>
              <Route path="/" element={<Navigate to={staff ? "/volunteers" : "/me"} replace />} />
              <Route path="/me" element={<MyPage />} />
              {staff && <Route path="/volunteers" element={<Directory />} />}
              {staff && <Route path="/events" element={<Events />} />}
              {staff && <Route path="/events/:id" element={<EventDetail />} />}
              {role === "admin" && <Route path="/admin" element={<Admin />} />}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </HashRouter>
    </AppContext.Provider>
  );
}
