"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

export type AuthStatus = "loading" | "authed" | "guest";

export type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /** 供仍需直接调用 Supabase 客户端的场景（如改密码） */
  getSupabase: () => ReturnType<typeof createBrowserSupabaseClient>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);

  const getSupabase = useCallback(() => createBrowserSupabaseClient(), []);

  useEffect(() => {
    let alive = true;
    try {
      const supabase = createBrowserSupabaseClient();
      supabase.auth
        .getSession()
        .then(({ data }: { data: { session: Session | null } }) => {
          if (!alive) return;
          const s = data.session ?? null;
          setSession(s);
          setStatus(s ? "authed" : "guest");
        })
        .catch(() => {
          if (!alive) return;
          setSession(null);
          setStatus("guest");
        });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event: string, s: Session | null) => {
        setSession(s);
        setStatus(s ? "authed" : "guest");
      });

      return () => {
        alive = false;
        subscription.unsubscribe();
      };
    } catch {
      Promise.resolve().then(() => {
        setSession(null);
        setStatus("guest");
      });
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      getSupabase,
    }),
    [getSupabase, session, status]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth 必须在 AuthProvider 内使用");
  }
  return ctx;
}
