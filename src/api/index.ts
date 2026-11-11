import { createContext, useContext } from "react";
import type { Api } from "./types";
import { createSupabaseApi } from "./supabase";
import { createDemoApi } from "./demo";

export function createApi(): Api {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
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
