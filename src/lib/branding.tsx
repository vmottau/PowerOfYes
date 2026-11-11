import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useApi, type Branding } from "../api";
import { DEFAULT_BRANDING } from "./brandingDefaults";

interface Ctx { branding: Branding; saved: Branding; reload: () => Promise<void>; preview: (b: Branding | null) => void }
const BrandingContext = createContext<Ctx>({ branding: DEFAULT_BRANDING, saved: DEFAULT_BRANDING, reload: async () => {}, preview: () => {} });
export const useBranding = () => useContext(BrandingContext);

const HEX = /^#[0-9a-f]{6}$/i;

/** Puts the church's colors into CSS variables; every other color in styles.css is mixed from these. */
export function applyBranding(b: Branding) {
  const root = document.documentElement;
  root.style.setProperty("--brand", HEX.test(b.primary_color) ? b.primary_color : DEFAULT_BRANDING.primary_color);
  root.style.setProperty("--brand-2", HEX.test(b.accent_color) ? b.accent_color : DEFAULT_BRANDING.accent_color);
  document.title = `${b.app_title} · ${b.org_name}`;
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [previewing, setPreviewing] = useState<Branding | null>(null);
  const reload = useCallback(async () => {
    try { setBranding(await api.getBranding()); } catch { /* keep defaults */ }
  }, [api]);
  useEffect(() => { void reload(); }, [reload]);
  const shown = previewing ?? branding;
  useEffect(() => { applyBranding(shown); }, [shown]);
  return <BrandingContext.Provider value={{ branding: shown, saved: branding, reload, preview: setPreviewing }}>{children}</BrandingContext.Provider>;
}

export function Logo({ size = 40 }: { size?: number }) {
  const { branding } = useBranding();
  if (branding.logo) return <img className="logo" src={branding.logo} alt="" width={size} height={size} />;
  const initials = branding.org_name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(of|the|and|st\.?)$/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "✓";
  return <span className="logo mono" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">{initials}</span>;
}
