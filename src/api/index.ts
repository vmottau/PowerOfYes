import { createContext, useContext } from "react";
import type { Api } from "./types";
import { createSupabaseApi } from "./supabase";
import { createDemoApi } from "./demo";

/**
 * Supabase wants just the project address (https://abc.supabase.co). People often paste a longer one,
 * such as the REST address ending in /rest/v1/, which makes sign-in fail with "Invalid path specified
 * in request URL". Keep only the address part, and drop stray spaces from both values.
 */
export function projectAddress(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  try { return new URL(v).origin; } catch { return v; }
}

export function createApi(): Api {
  const url = projectAddress(import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  const forceDemo = import.meta.env.VITE_DEMO === "1" || new URLSearchParams(location.search).has("demo");
  if (!forceDemo && url && key) return createSupabaseApi(url, key);
  return createDemoApi();
}

export const ApiContext = createContext<Api | null>(null);
export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error("ApiContext missing");
  return api;
}

export type * from "./types";
