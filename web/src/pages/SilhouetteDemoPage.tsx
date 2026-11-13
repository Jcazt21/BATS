import { useState } from "react";
import { PokemonSilhouette } from "@/components/app/PokemonSilhouette";

const DEX_NUM = 7;

/** Demo temporal (solo en desarrollo, /dev/silueta): una casilla de la futura Pokédex por cuenta. */
export function SilhouetteDemoPage() {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="flex flex-col items-center gap-8 py-10">
      <h1 className="text-title2 font-semibold">Demo de silueta</h1>

      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="flex w-40 flex-col items-center gap-2 rounded-2xl border bg-card p-4 shadow-sm transition hover:shadow-md"
      >
        <PokemonSilhouette species="Squirtle" revealed={revealed} size={112} />
        <span className="font-mono text-subhead text-muted-foreground">{`#${String(DEX_NUM).padStart(3, "0")}`}</span>
        <span className="text-subhead font-medium">{revealed ? "Squirtle" : "???"}</span>
      </button>
      <p className="max-w-xs text-center text-footnote text-muted-foreground">
        Toca la casilla para descubrirlo u ocultarlo. Cambia el tema: la silueta es un gris cálido en ambos.
      </p>
    </div>
  );
}
