import type { Membership } from "./types";

const CURRENT_KEY = "pov-current-church";
const PENDING_KEY = "pov-pending-church-slug";

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };

/** Remembers which church this browser last looked at. */
export const rememberChurch = (id: string) => set(CURRENT_KEY, id);

/** The church to show: the one already chosen, else the last one used here, else the first. */
export function pickCurrentChurch(ms: Membership[], chosen: string | null): Membership | null {
  return ms.find((m) => m.church.id === chosen) ?? ms.find((m) => m.church.id === get(CURRENT_KEY)) ?? ms[0] ?? null;
}

/**
 * A church link looks like  https://site/#/c/st-marys . We keep the slug in this browser while the person
 * signs in (the email link brings them back here), then join that church.
 */
export function readChurchLink(): string | null {
  const m = /^#\/c\/([a-z0-9-]+)/i.exec(window.location.hash);
  if (m) set(PENDING_KEY, m[1].toLowerCase());
  return get(PENDING_KEY);
}
export const clearChurchLink = () => set(PENDING_KEY, null);
export const setPendingChurch = (slug: string) => set(PENDING_KEY, slug);

export const churchLink = (slug: string) => `${window.location.origin}${window.location.pathname}#/c/${slug}`;
