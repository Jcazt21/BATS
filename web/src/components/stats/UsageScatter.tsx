import { useNavigate } from "react-router-dom";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { SeasonChoice } from "@/components/app/SeasonSelect";
import MagicBento from "@/components/effects/MagicBento";
import type { PokedexRow } from "@/lib/api";
import { TICK_CAPTION } from "@/lib/chart";
import { num } from "@/lib/format";
import { fichaHref } from "@/lib/stats-links";
import { scatterPoints, type ScatterPoint } from "./scatter-data";

const TICK = { fill: "var(--muted-foreground)", fontSize: TICK_CAPTION };

/**
 * Dispersión uso (pick %) contra win rate: arriba a la derecha, lo que se usa mucho y gana; abajo a la
 * derecha, lo sobrevalorado. Win rate ≥ 50 % = círculo; < 50 % = triángulo (no depende solo del color).
 * Tocar un punto abre la ficha; la tabla de abajo es la alternativa accesible con teclado.
 */
export function UsageScatter({ rows, temporada }: { rows: PokedexRow[]; temporada: SeasonChoice }) {
  const navigate = useNavigate();
  const pts = scatterPoints(rows);
  const altos = pts.filter((p) => p.wr >= 50);
  const bajos = pts.filter((p) => p.wr < 50);
  const abrir = (p: { payload?: ScatterPoint }) => { if (p.payload) navigate(fichaHref(p.payload.species, temporada)); };

  const figura = (
    <figure className="flex flex-1 flex-col" aria-label="Uso contra win rate de los pokémon">
      <div className="h-64 md:h-[22rem]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--separator)" />
            <XAxis type="number" dataKey="pick" name="Pick rate" unit="%" tick={TICK} axisLine={false} tickLine={false} />
            <YAxis type="number" dataKey="wr" name="Win rate" unit="%" domain={[0, 100]} tick={TICK} axisLine={false} tickLine={false} width={44} />
            <ZAxis type="number" dataKey="used" range={[60, 360]} name="Batallas" />
            <ReferenceLine y={50} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<Punto />} />
            <Scatter name="Win rate ≥ 50 %" data={altos} fill="var(--chart-6)" shape="circle" onClick={abrir} isAnimationActive={false} className="cursor-pointer" />
            <Scatter name="Win rate < 50 %" data={bajos} fill="var(--chart-1)" shape="triangle" onClick={abrir} isAnimationActive={false} className="cursor-pointer" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
        <span>Cuanto más arriba a la derecha, más se usa y más gana. El tamaño es el número de batallas.</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-chart-6" /> Win rate ≥ 50 %</span>
        <span className="flex items-center gap-1.5"><i aria-hidden="true" className="text-chart-1">▲</i> Win rate &lt; 50 %</span>
      </figcaption>
    </figure>
  );

  return <MagicBento columns={1} rowHeight={120} items={[{ id: "scatter", label: "Uso contra win rate", content: figura }]} />;
}

function Punto({ active, payload }: { active?: boolean; payload?: { payload: ScatterPoint }[] }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-footnote text-popover-foreground shadow-md">
      <p className="font-semibold">{p.species}</p>
      <p className="tabular">Pick rate {num(p.pick, 1)}% · Win rate {num(p.wr, 1)}%</p>
      <p className="tabular text-muted-foreground">{p.used} batallas</p>
    </div>
  );
}
