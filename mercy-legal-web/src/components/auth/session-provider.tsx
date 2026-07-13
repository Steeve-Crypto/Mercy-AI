"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { trustedAccountClaims } from "@/lib/auth/trusted-claims";

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

const EMPTY_SESSION: MercySession = {
  userId: "",
  email: null,
  name: "Mercy Attorney",
  tenantId: "",
  firmId: null,
  roles: [],
  firm: null,
  dcBarNumber: null,
  accessToken: null,
};

const SessionContext = createContext<SessionContextValue>({
  session: EMPTY_SESSION,
  loading: true,
  configured: false,
  signOut: async () => undefined,
});

function sessionFromSupabase(user: User, accessToken: string | null): MercySession {
  const claims = trustedAccountClaims(user);
  return {
    userId: user.id,
    email: user.email ?? null,
    name: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "Mercy Attorney"),
    tenantId: claims.tenantId ?? claims.firmId ?? "",
    firmId: claims.firmId,
    roles: claims.roles,
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
  if (session.tenantId) {
    window.localStorage.setItem("mercy.auth.tenantId", session.tenantId);
  } else {
    window.localStorage.removeItem("mercy.auth.tenantId");
  }
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

function clearMercyContext() {
  window.localStorage.removeItem("mercy.auth.token");
  window.localStorage.removeItem("mercy.auth.tenantId");
  window.localStorage.removeItem("mercy.auth.firmId");
  window.localStorage.removeItem("mercy.auth.userId");
  window.localStorage.removeItem("mercy.auth.roles");
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const localDevDefaults = localDevAuthDefaultsEnabled();
  const [session, setSession] = useState<MercySession>(localDevDefaults ? LOCAL_DEV_SESSION : EMPTY_SESSION);
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
    let authRevision = 0;

    const applyVerifiedSession = async (accessToken?: string) => {
      const revision = ++authRevision;
      const { data, error } = await supabase.auth.getUser(accessToken);
      if (!mounted || revision !== authRevision) return;
      if (!error && data.user) {
        const nextSession = sessionFromSupabase(data.user, null);
        setSession(nextSession);
        persistMercyContext(nextSession, false);
      } else {
        setSession(EMPTY_SESSION);
        clearMercyContext();
      }
      setLoading(false);
    };

    void applyVerifiedSession();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, authSession) => {
      if (!authSession?.user) {
        authRevision += 1;
        setSession(EMPTY_SESSION);
        clearMercyContext();
        setLoading(false);
        return;
      }
      void applyVerifiedSession(authSession.access_token);
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
        clearMercyContext();
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
