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

type RGB = [number, number, number];
const toRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const toHex = (c: RGB) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i] * (1 - t) + b[i] * t) as RGB;
const luminance = (c: RGB) => {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast ratio between two colors (1 to 21). */
export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(toRgb(a)), luminance(toRgb(b))].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
/**
 * Darkens a color just enough that white text on it, and the color itself as text on its own pale tint
 * (as on tags and pills), are easy to read: at least 4.5:1, with a little room for the browser's own color mixing.
 * Dark colors come back unchanged; a bright one, like a gold, becomes a deeper shade of itself.
 */
export function readableOnLight(hex: string, tint = 0.14): string {
  const base = toRgb(hex);
  for (let k = 0; k <= 1; k += 0.02) {
    const c = toHex(mix(base, [0, 0, 0], k));
    const soft = toHex(mix(toRgb(hex), [255, 255, 255], 1 - tint));
    if (contrast(c, "#ffffff") >= 4.8 && contrast(c, soft) >= 4.8) return c;
  }
  return "#000000";
}

/**
 * Puts the church's colors into CSS variables; every other color in styles.css is mixed from these.
 * --brand-text and --brand-2-text are the same colors, deepened only as far as needed to stay readable,
 * so a church can pick a light or bright color (a gold, a sky blue) without making text hard to read.
 */
export function applyBranding(b: Branding) {
  const root = document.documentElement;
  const primary = HEX.test(b.primary_color) ? b.primary_color : DEFAULT_BRANDING.primary_color;
  const accent = HEX.test(b.accent_color) ? b.accent_color : DEFAULT_BRANDING.accent_color;
  root.style.setProperty("--brand", primary);
  root.style.setProperty("--brand-2", accent);
  root.style.setProperty("--brand-text", readableOnLight(primary, 0.11));
  root.style.setProperty("--brand-2-text", readableOnLight(accent, 0.14));
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
