import { createClient, type Session } from "@supabase/supabase-js";
import { createContext, useContext } from "react";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const authConfigured = Boolean(url && anonKey);

// Sin configuración el cliente no se crea: la app carga y el login explica qué falta.
export const supabase = authConfigured ? createClient(url!, anonKey!) : null;

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function sendMagicLink(email: string, redirectTo: string = window.location.href): Promise<void> {
  if (!supabase) throw new Error("Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.");
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    // Supabase crea el usuario de auth, pero la API solo deja pasar los emails que el
    // admin dio de alta en player_accounts (403 para el resto).
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
  });
  if (error) throw new Error("No se pudo enviar el enlace. Revisa el correo e inténtalo de nuevo.");
}

export async function signInWithGoogle(redirectTo: string = window.location.href): Promise<void> {
  if (!supabase) throw new Error("Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    // Igual que con el magic link: Supabase crea el usuario de auth, pero la API
    // solo deja pasar los emails que el admin dio de alta en player_accounts.
    options: { redirectTo },
  });
  if (error) throw new Error("No se pudo iniciar sesión con Google. Intenta de nuevo.");
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

export interface SessionState {
  session: Session | null;
  loading: boolean;
}

export const SessionContext = createContext<SessionState>({ session: null, loading: true });

export function useSession(): SessionState {
  return useContext(SessionContext);
}
