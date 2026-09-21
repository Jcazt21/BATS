import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authConfigured, sendMagicLink } from "@/lib/session";

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
