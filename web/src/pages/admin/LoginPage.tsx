import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SignInCard } from "@/components/SignInCard";
import { useSession } from "@/lib/session";

export function LoginPage() {
  const navigate = useNavigate();
  const { session } = useSession();

  useEffect(() => {
    if (session) navigate("/admin/stats", { replace: true });
  }, [session, navigate]);

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
      <SignInCard
        title="Acceso"
        description="Te enviaremos un enlace de acceso a tu correo de administrador."
        redirectTo={`${window.location.origin}/admin/stats`}
      />
    </main>
  );
}
