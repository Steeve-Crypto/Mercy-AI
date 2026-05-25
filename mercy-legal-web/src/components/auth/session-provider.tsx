"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

type MercySession = {
  userId: string;
  email: string | null;
  name: string;
  tenantId: string;
  firmId?: string | null;
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

function localDevAuthDefaultsEnabled() {
  return process.env.NEXT_PUBLIC_MERCY_ENV === "local" && process.env.NEXT_PUBLIC_MERCY_AUTH_MODE === "dev";
}

const LOCAL_DEV_SESSION: MercySession = {
  userId: process.env.NEXT_PUBLIC_MERCY_USER_ID || "local-web-user",
  email: null,
  name: "Mercy Attorney",
  tenantId: process.env.NEXT_PUBLIC_MERCY_TENANT_ID || "local-dev-tenant",
  firmId: process.env.NEXT_PUBLIC_MERCY_FIRM_ID || null,
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

function stringFromMetadata(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firmFromUser(user: User): string | null {
  return stringFromMetadata(
    user.app_metadata?.firm_id,
    user.app_metadata?.firmId,
    user.user_metadata?.firm_id,
    user.user_metadata?.firmId,
  );
}

function sessionFromSupabase(user: User, accessToken: string | null): MercySession {
  const firmId = firmFromUser(user);
  const tenantId = String(
    user.app_metadata?.tenant_id ??
      user.app_metadata?.tenantId ??
      user.user_metadata?.tenant_id ??
      user.user_metadata?.tenantId ??
      firmId ??
      user.id,
  );
  return {
    userId: user.id,
    email: user.email ?? null,
    name: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "Mercy Attorney"),
    tenantId,
    firmId,
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

function persistMercyContext(session: MercySession, persistToken: boolean) {
  window.localStorage.setItem("mercy.auth.tenantId", session.tenantId);
  if (session.firmId) {
    window.localStorage.setItem("mercy.auth.firmId", session.firmId);
  } else {
    window.localStorage.removeItem("mercy.auth.firmId");
  }
  window.localStorage.setItem("mercy.auth.userId", session.userId);
  window.localStorage.setItem("mercy.auth.roles", session.roles.join(","));
  if (persistToken && session.accessToken) {
    window.localStorage.setItem("mercy.auth.token", session.accessToken);
  } else {
    window.localStorage.removeItem("mercy.auth.token");
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<MercySession>(LOCAL_DEV_SESSION);
  const localDevDefaults = localDevAuthDefaultsEnabled();
  const [loading, setLoading] = useState(configured && !localDevDefaults);

  useEffect(() => {
    if (!configured) {
      if (localDevDefaults) {
        persistMercyContext(LOCAL_DEV_SESSION, true);
      }
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
        persistMercyContext(nextSession, false);
      }
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, authSession) => {
      if (!authSession?.user) return;
      const nextSession = sessionFromSupabase(authSession.user, authSession.access_token);
      setSession(nextSession);
      persistMercyContext(nextSession, false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [configured, localDevDefaults]);

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
        window.localStorage.removeItem("mercy.auth.firmId");
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
