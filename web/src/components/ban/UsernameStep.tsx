import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { checkUser } from "@/lib/api";

interface Props {
  onSuccess: (username: string) => void;
}

export function UsernameStep({ onSuccess }: Props) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const MESSAGES: Record<string, string> = {
    not_registered: "Este usuario no está registrado en el torneo.",
    already_voted:  "Ya registraste tu ban. Solo se permite uno.",
  };

  async function handleContinue() {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const result = await checkUser(trimmed);
      if (result.can_vote) {
        onSuccess(trimmed);
      } else {
        setError(MESSAGES[result.reason ?? ""] ?? "No puedes votar en este momento.");
      }
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-semibold tracking-tight">
          Fase de Bans
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Ingresa tu usuario de Pokémon Showdown para votar.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <Input
          placeholder="Tu usuario de Showdown"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && handleContinue()}
          disabled={loading}
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
        />

        {error && (
          <p className="text-sm text-destructive leading-snug">{error}</p>
        )}

        <Button
          onClick={handleContinue}
          disabled={!username.trim() || loading}
          className="w-full"
        >
          {loading ? "Verificando…" : "Continuar"}
        </Button>
      </CardContent>
    </Card>
  );
}
