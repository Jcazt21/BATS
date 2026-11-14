import type { MatchResult } from "@/lib/api";
import { resultLetter } from "@/lib/match-result";
import { cn } from "@/lib/utils";

const TONO: Record<MatchResult, string> = {
  W: "bg-success-soft text-success",
  L: "bg-destructive-soft text-destructive",
  T: "bg-secondary text-muted-foreground",
};

/** Últimas batallas como fichas V/D/E (la más reciente a la derecha). La letra va siempre: no depende solo del color. */
export function FormDots({ form, className }: { form: MatchResult[]; className?: string }) {
  if (!form.length) return <span className="text-muted-foreground">—</span>;
  const letras = form.map(resultLetter);
  return (
    <span role="img" aria-label={`Forma: ${letras.join(", ")}`} className={cn("inline-flex items-center gap-1", className)}>
      {form.map((r, i) => (
        <span key={i} aria-hidden="true"
          className={cn("grid size-5 place-items-center rounded-full font-card-mono text-[10px] font-semibold leading-none", TONO[r])}>
          {letras[i]}
        </span>
      ))}
    </span>
  );
}
