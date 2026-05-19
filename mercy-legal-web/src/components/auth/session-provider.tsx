"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

type MercySession = {
  userId: string;
  email: string | null;
  name: string;
  tenantId: string;
  roles: string[];
  firm?: string | null;
  dcBarNumber?: string | null;
  accessToken: string | null;
};

type SessionContextValue = {
  session: MercySession;
  loading: boolean;
  configured: boolean;
  signOut: () => Promise<void>;
};

const LOCAL_DEV_SESSION: MercySession = {
  userId: process.env.NEXT_PUBLIC_MERCY_USER_ID || "local-web-user",
  email: null,
  name: "Mercy Attorney",
  tenantId: process.env.NEXT_PUBLIC_MERCY_TENANT_ID || "local-dev-tenant",
  roles: ["attorney"],
  firm: "Mercy Legal AI Demo Firm",
  dcBarNumber: null,
  accessToken: process.env.NEXT_PUBLIC_MERCY_API_TOKEN || null,
};

const SessionContext = createContext<SessionContextValue>({
  session: LOCAL_DEV_SESSION,
  loading: true,
  configured: false,
  signOut: async () => undefined,
});

function rolesFromUser(user: User): string[] {
  const rawRoles = user.app_metadata?.roles ?? user.user_metadata?.roles ?? user.app_metadata?.role ?? user.user_metadata?.role;
  if (Array.isArray(rawRoles)) return rawRoles.map(String).filter(Boolean);
  if (typeof rawRoles === "string") return rawRoles.split(",").map((role) => role.trim()).filter(Boolean);
  return ["attorney"];
}

function sessionFromSupabase(user: User, accessToken: string | null): MercySession {
  const tenantId = String(
    user.app_metadata?.tenant_id ??
      user.app_metadata?.tenantId ??
      user.user_metadata?.tenant_id ??
      user.user_metadata?.tenantId ??
      user.id,
  );
  return {
    userId: user.id,
    email: user.email ?? null,
    name: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "Mercy Attorney"),
    tenantId,
    roles: rolesFromUser(user),
    firm: typeof user.user_metadata?.firm_name === "string" ? user.user_metadata.firm_name : null,
    dcBarNumber:
      typeof user.user_metadata?.dc_bar_number === "string"
        ? user.user_metadata.dc_bar_number
        : typeof user.user_metadata?.dcBarNumber === "string"
          ? user.user_metadata.dcBarNumber
          : null,
    accessToken,
  };
}

function persistMercyContext(session: MercySession) {
  window.localStorage.setItem("mercy.auth.tenantId", session.tenantId);
  window.localStorage.setItem("mercy.auth.userId", session.userId);
  window.localStorage.setItem("mercy.auth.roles", session.roles.join(","));
  if (session.accessToken) {
    window.localStorage.setItem("mercy.auth.token", session.accessToken);
  } else {
    window.localStorage.removeItem("mercy.auth.token");
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<MercySession>(LOCAL_DEV_SESSION);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    if (!configured) {
      persistMercyContext(LOCAL_DEV_SESSION);
      setLoading(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session?.user) {
        const nextSession = sessionFromSupabase(data.session.user, data.session.access_token);
        setSession(nextSession);
        persistMercyContext(nextSession);
      }
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, authSession) => {
      if (!authSession?.user) return;
      const nextSession = sessionFromSupabase(authSession.user, authSession.access_token);
      setSession(nextSession);
      persistMercyContext(nextSession);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [configured]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      loading,
      configured,
      signOut: async () => {
        const supabase = createSupabaseBrowserClient();
        await supabase?.auth.signOut();
        window.localStorage.removeItem("mercy.auth.token");
        window.localStorage.removeItem("mercy.auth.tenantId");
        window.localStorage.removeItem("mercy.auth.userId");
        window.localStorage.removeItem("mercy.auth.roles");
        window.location.href = "/sign-in";
      },
    }),
    [configured, loading, session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useMercySession() {
  return useContext(SessionContext);
}
