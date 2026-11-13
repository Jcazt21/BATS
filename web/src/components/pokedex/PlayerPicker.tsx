import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { useLeaderboard } from "@/lib/queries";

/**
 * "Ver la Pokédex de…": salta a la Pokédex de otro jugador sin salir de la página. La lista sale del
 * leaderboard (quienes ya jugaron) más el jugador con sesión, marcado como «Tú». Elegirse a uno mismo
 * o quitar la selección vuelve a /pokedex.
 */
export function PlayerPicker({ viewing, me }: { viewing?: string; me?: string }) {
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

  return (
    <div className="flex w-full flex-col gap-1 sm:w-64">
      <span aria-hidden className="px-1 text-caption text-muted-foreground">Ver la Pokédex de</span>
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
      />
    </div>
  );
}
