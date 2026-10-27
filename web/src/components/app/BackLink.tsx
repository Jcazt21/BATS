import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/**
 * "Volver": si el usuario llegó desde otra página de la app, regresa a ella; si entró directo
 * (sin historial propio) va a `fallback`. Es un enlace real a `fallback`, así que abrir en otra
 * pestaña o copiar la dirección sigue funcionando.
 */
export function BackLink({ fallback, children }: { fallback: string; children: ReactNode }) {
  const navigate = useNavigate();
  const { key } = useLocation();
  return (
    <Link
      to={fallback}
      onClick={(e) => {
        // Clic normal sin modificadores: el modificado (Ctrl/Cmd/medio) conserva el comportamiento del navegador.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        if (key !== "default") navigate(-1);
        else navigate(fallback);
      }}
      className="press inline-flex min-h-11 items-center gap-1 self-start rounded-full text-subhead font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="size-4" /> {children}
    </Link>
  );
}
