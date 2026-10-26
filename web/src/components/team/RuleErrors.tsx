import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Errores de reglas como lista. `target` decide qué errores tienen salida: devuelve el
 * manejador (p. ej. abrir el set del pokémon) o `undefined` si no hay a dónde ir.
 */
export function RuleErrors({ errors, title, target, className }: {
  errors: string[];
  title?: string;
  target?: (error: string) => (() => void) | undefined;
  className?: string;
}) {
  if (errors.length === 0) return null;
  return (
    <div role="alert" className={cn("animate-in fade-in-0 duration-150 rounded-2xl border border-destructive/40 bg-destructive-soft p-4 text-footnote text-destructive", className)}>
      {title && <p className="font-medium">{title}</p>}
      <ul role="list" className={cn("flex flex-col gap-1", title && "mt-1")}>
        {errors.map((e) => {
          const ir = target?.(e);
          return (
            <li key={e} className="flex items-start justify-between gap-3">
              <span>{e}</span>
              {ir && <Button type="button" variant="ghost" size="xs" className="shrink-0 text-destructive" onClick={ir}>Ir al set</Button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
