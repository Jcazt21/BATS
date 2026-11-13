import { useMemo, useState } from "react";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { ErrorState } from "@/components/app/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trainerPath, type TrainerSprite } from "@/lib/api";
import { useMe, useTrainers, useUpdateAvatar } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Sin acentos ni mayúsculas, para que "cientifico" encuentre "Científico". */
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Selector del sprite de entrenador del carnet (catálogo curado de Showdown).
 * Elegir uno lo guarda y cierra; "Quitar sprite" vuelve a las iniciales.
 */
export function TrainerAvatarPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const trainers = useTrainers();
  const me = useMe();
  const save = useUpdateAvatar();
  const [query, setQuery] = useState("");
  const current = me.data?.avatar ?? null;

  const groups = useMemo(() => {
    const q = fold(query.trim());
    const out = new Map<string, TrainerSprite[]>();
    for (const t of trainers.data ?? []) {
      if (q && !fold(t.label).includes(q) && !fold(t.category).includes(q)) continue;
      out.set(t.category, [...(out.get(t.category) ?? []), t]);
    }
    return [...out];
  }, [trainers.data, query]);

  function pick(avatar: string | null) {
    save.mutate(avatar, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Sprite de entrenador"
      description="Aparece en tu carnet y en tu perfil."
      className="sm:max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o categoría"
            aria-label="Buscar sprite"
          />
          {current && (
            <Button variant="secondary" disabled={save.isPending} onClick={() => pick(null)}>Quitar sprite</Button>
          )}
        </div>

        {save.isError && <p role="alert" className="text-footnote text-destructive">{save.error.message}</p>}

        {trainers.isPending ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : trainers.isError ? (
          <ErrorState error={trainers.error} onRetry={() => trainers.refetch()} />
        ) : groups.length === 0 ? (
          <p className="py-8 text-center text-footnote text-muted-foreground">Ningún sprite coincide con “{query}”.</p>
        ) : (
          groups.map(([category, items]) => (
            <section key={category} aria-label={category} className="flex flex-col gap-2">
              <h3 className="text-footnote font-semibold text-muted-foreground">{category}</h3>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2">
                {items.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={save.isPending}
                      aria-pressed={t.id === current}
                      aria-label={t.label}
                      title={t.label}
                      onClick={() => pick(t.id)}
                      className={cn(
                        "flex w-full flex-col items-center gap-1 rounded-xl border border-border bg-muted/40 p-1.5 text-caption transition-colors",
                        "hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60",
                        t.id === current && "border-primary bg-primary/10 ring-2 ring-primary",
                      )}
                    >
                      <img
                        src={trainerPath(t.id)}
                        alt=""
                        loading="lazy"
                        width={64}
                        height={64}
                        className="size-16 object-contain [image-rendering:pixelated]"
                      />
                      <span className="w-full truncate text-center">{t.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </ResponsiveSheet>
  );
}
