import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { adminLogin } from "@/lib/api";

export function LoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleLogin() {
    if (!password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const token = await adminLogin(password.trim());
      sessionStorage.setItem("bats_admin_token", token);
      navigate("/admin/stats");
    } catch {
      setError("Contraseña incorrecta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-svh flex flex-col items-center justify-center px-4 bg-background">
      <header className="mb-10 text-center">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-1">
          BATS
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Panel de administración
        </h1>
      </header>

      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-semibold tracking-tight">Acceso</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Ingresa la contraseña de administrador.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <Input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            disabled={loading}
            autoFocus
          />

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button onClick={handleLogin} disabled={!password.trim() || loading} className="w-full">
            {loading ? "Verificando…" : "Entrar"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
