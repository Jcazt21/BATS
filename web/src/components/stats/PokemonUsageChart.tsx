import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PokedexRow } from "@/lib/api";
import { usageChartData } from "./usage-chart-data";
import { TICK_CAPTION, TICK_FOOTNOTE } from "@/lib/chart";
import { num } from "@/lib/format";

const BAJO_ID = "pick-wr-bajo";

/** Gráfico de barras de la pestaña "Uso" de Estadísticas (vista por defecto; "Lista" muestra la tabla). */
export function PokemonUsageChart({ rows }: { rows: PokedexRow[] }) {
  const data = usageChartData(rows);
  return (
    <figure className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border" aria-label="Gráfico de uso de los 10 pokémon más usados">
      <div className="h-[22rem]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            {/* Win rate < 50 %: rayas además del color, para no depender solo del tono. */}
            <defs>
              <pattern id={BAJO_ID} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--chart-1)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--card)" strokeWidth="2" />
              </pattern>
            </defs>
            <CartesianGrid horizontal={false} stroke="var(--separator)" />
            <XAxis type="number" unit="%" tick={{ fill: "var(--muted-foreground)", fontSize: TICK_CAPTION }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="species" width={110} tick={{ fill: "var(--foreground)", fontSize: TICK_FOOTNOTE }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "var(--muted)" }}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--popover-foreground)" }}
              formatter={(v, name) => [`${num(Number(v), 1)}%`, name === "uso" ? "Pick rate" : "Win rate"]} />
            <Bar dataKey="uso" radius={[0, 8, 8, 0]} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.species} fill={d.wr >= 50 ? "var(--chart-6)" : `url(#${BAJO_ID})`} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 flex items-center gap-4 text-caption text-muted-foreground">
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-chart-6" /> Win rate ≥ 50 %</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full" style={{ background: "repeating-linear-gradient(45deg, var(--chart-1) 0 2px, var(--card) 2px 4px)" }} /> Win rate &lt; 50 % (rayado)</span>
      </figcaption>
    </figure>
  );
}
