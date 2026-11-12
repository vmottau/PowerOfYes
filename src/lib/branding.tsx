import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Branding } from "../api";
import { DEFAULT_BRANDING } from "./brandingDefaults";

interface Ctx {
  /** What's on screen: the saved look, or the admin's unsaved preview. */
  branding: Branding;
  /** The church's saved look. */
  saved: Branding;
  setSaved: (b: Branding) => void;
  preview: (b: Branding | null) => void;
}
const BrandingContext = createContext<Ctx>({ branding: DEFAULT_BRANDING, saved: DEFAULT_BRANDING, setSaved: () => {}, preview: () => {} });
export const useBranding = () => useContext(BrandingContext);

const HEX = /^#[0-9a-f]{6}$/i;

/** Puts the church's colors into CSS variables; every other color in styles.css is mixed from these. */
export function applyBranding(b: Branding) {
  const root = document.documentElement;
  root.style.setProperty("--brand", HEX.test(b.primary_color) ? b.primary_color : DEFAULT_BRANDING.primary_color);
  root.style.setProperty("--brand-2", HEX.test(b.accent_color) ? b.accent_color : DEFAULT_BRANDING.accent_color);
  document.title = b.org_name ? `${b.app_title} · ${b.org_name}` : b.app_title;
}

export const pickBranding = (b: Branding): Branding => ({
  org_name: b.org_name, app_title: b.app_title, tagline: b.tagline, primary_color: b.primary_color, accent_color: b.accent_color, logo: b.logo,
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Branding>(DEFAULT_BRANDING);
  const [previewing, preview] = useState<Branding | null>(null);
  const shown = previewing ?? saved;
  useEffect(() => { applyBranding(shown); }, [shown]);
  const value = useMemo(() => ({ branding: shown, saved, setSaved, preview }), [shown, saved]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function Logo({ size = 40, b }: { size?: number; b?: Branding }) {
  const { branding: ctx } = useBranding();
  const branding = b ?? ctx;
  if (branding.logo) return <img className="logo" src={branding.logo} alt="" width={size} height={size} />;
  const initials = branding.org_name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(of|the|and|st\.?|saint)$/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "✓";
  return <span className="logo mono" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">{initials}</span>;
}
