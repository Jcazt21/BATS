import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** Posición de scroll de cada entrada del historial (por `location.key`). */
const positions = new Map<string, number>();

/**
 * Scroll como en una app nativa: una página nueva empieza arriba y "atrás" devuelve
 * al punto exacto donde estabas. Los cambios que solo tocan la query o el hash (filtros,
 * el enlace "Saltar al contenido") no mueven nada.
 */
export function useScrollRestoration(): void {
  const location = useLocation();
  const type = useNavigationType();
  // Entrada del historial a la que pertenece el scroll actual. Se actualiza en el mismo
  // commit que pinta la página nueva, antes de que llegue ningún evento de scroll suyo.
  const current = useRef(location.key);
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    const prev = "scrollRestoration" in history ? history.scrollRestoration : undefined;
    // El navegador restauraría antes de que la página nueva exista: lo hacemos nosotros.
    if (prev) history.scrollRestoration = "manual";
    const save = () => positions.set(current.current, window.scrollY);
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      window.removeEventListener("scroll", save);
      if (prev) history.scrollRestoration = prev;
    };
  }, []);

  useLayoutEffect(() => {
    current.current = location.key;
    const samePage = prevPath.current === location.pathname;
    prevPath.current = location.pathname;
    if (location.hash) return;
    if (type === "POP") window.scrollTo({ top: positions.get(location.key) ?? 0, behavior: "instant" });
    else if (!samePage) window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.key, location.pathname, location.hash, type]);
}
