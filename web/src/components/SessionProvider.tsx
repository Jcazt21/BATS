import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { SessionContext, authConfigured, supabase, type SessionState } from "@/lib/session";

// `npm run dev:mock`: sesión falsa para ver la app sin Supabase (las rutas las responde dev-mocks/).
const DEV_MOCK = import.meta.env.DEV && import.meta.env.VITE_DEV_MOCK === "1";
const MOCK_SESSION = { access_token: "dev-mock", user: { id: "dev-mock", email: "dev@bats.local" } } as Session;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(
    DEV_MOCK ? { session: MOCK_SESSION, loading: false } : { session: null, loading: authConfigured },
  );

  useEffect(() => {
    if (DEV_MOCK || !supabase) return;
    void supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}
