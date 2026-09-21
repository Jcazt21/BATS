import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authConfigured, sendMagicLink, signInWithGoogle } from "@/lib/session";

interface Props {
  title?: string;
  description?: string;
  /** Adónde vuelve el enlace del correo. Por defecto, la página actual. */
  redirectTo?: string;
}

export function SignInCard({
  title = "Iniciar sesión",
  description = "Te enviaremos un enlace a tu correo. Usa el email con el que te registró el admin.",
  redirectTo,
}: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await sendMagicLink(email, redirectTo);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);
    try {
      // Redirige a Google; si esto resuelve sin navegar es porque falló.
      await signInWithGoogle(redirectTo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      setGoogleLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-semibold tracking-tight">{title}</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          {sent ? "Listo. Abre el enlace que te enviamos para entrar." : description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!authConfigured ? (
          <p className="text-sm text-destructive">
            Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
          </p>
        ) : sent ? (
          <Button variant="ghost" className="w-full" onClick={() => setSent(false)}>
            Usar otro correo
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={handleGoogle}
              disabled={googleLoading || loading}
            >
              <GoogleIcon className="size-4" />
              {googleLoading ? "Redirigiendo…" : "Continuar con Google"}
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              o
              <span className="h-px flex-1 bg-border" />
            </div>
            <Input
              type="email"
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={loading}
              autoFocus
              autoComplete="email"
            />
            {error && <p className="text-sm text-destructive leading-snug">{error}</p>}
            <Button onClick={handleSend} disabled={!email.trim() || loading} className="w-full">
              {loading ? "Enviando…" : "Enviar enlace"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.48a5.54 5.54 0 0 1-2.4 3.64v3h3.88c2.27-2.09 3.58-5.17 3.58-8.83Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3a7.15 7.15 0 0 1-10.64-3.76H1.44v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.43 14.33A7.2 7.2 0 0 1 5.05 12c0-.81.14-1.6.38-2.33V6.58H1.44A12 12 0 0 0 0 12c0 1.94.46 3.77 1.44 5.42l3.99-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.44 6.58l3.99 3.09A7.16 7.16 0 0 1 12 4.77Z"
      />
    </svg>
  );
}
