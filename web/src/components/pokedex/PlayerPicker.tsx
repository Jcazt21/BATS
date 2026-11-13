import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { useLeaderboard } from "@/lib/queries";

/**
 * "Ver la Pokédex de…": salta a la Pokédex de otro jugador sin salir de la página. La lista sale del
 * leaderboard (quienes ya jugaron) más el jugador con sesión, marcado como «Tú». Elegirse a uno mismo
 * o quitar la selección vuelve a /pokedex.
 */
export function PlayerPicker({ viewing, me, compact = false }: { viewing?: string; me?: string; compact?: boolean }) {
  const navigate = useNavigate();
  const players = useLeaderboard();
  const meId = me?.toLowerCase();
  const viewingId = viewing?.toLowerCase();

  const items = useMemo<ComboboxItem[]>(() => {
    const names = new Map<string, string>();
    for (const p of players.data ?? []) names.set(p.username.toLowerCase(), p.username);
    if (me) names.set(me.toLowerCase(), names.get(me.toLowerCase()) ?? me);
    if (viewing && !names.has(viewing.toLowerCase())) names.set(viewing.toLowerCase(), viewing);
    return [...names]
      .map(([id, label]) => ({ id, label, sublabel: id === meId ? "Tú" : undefined }))
      .sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.label.localeCompare(b.label, "es")));
  }, [players.data, me, meId, viewing]);

  const go = (id: string) => navigate(id === meId ? "/pokedex" : `/j/${encodeURIComponent(id)}/pokedex`);

  const combobox = (
      <Combobox
        ariaLabel="Ver la Pokédex de"
        items={items}
        value={viewingId ?? meId ?? null}
        onChange={go}
        placeholder="Busca un jugador"
        emptyText="Ningún jugador con ese nombre"
        onClear={viewingId && viewingId !== meId ? () => navigate("/pokedex") : undefined}
        clearLabel="Volver a mi Pokédex"
        className="w-full"
        inputClassName={compact ? "h-11 rounded-2xl bg-background/60 px-4 text-body" : "h-12 rounded-2xl bg-background/60 px-4 text-body"}
      />
  );
  // Compacto (móvil): sin superficie ni leyenda propias, va dentro del resumen (ProgressStrip).
  if (compact) return combobox;

  return (
    // Misma superficie y medidas que la barra de búsqueda (DexToolbar): quedan alineadas arriba.
    <div className="rounded-3xl bg-card p-3 shadow-sm ring-1 ring-border">
      {combobox}
      <p aria-hidden className="mt-1.5 px-1 text-caption text-muted-foreground">Ver la Pokédex de otro jugador</p>
    </div>
  );
}
