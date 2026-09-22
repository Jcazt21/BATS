import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { ErrorState } from "@/components/app/States";
import { RestrictionField } from "@/components/RestrictionField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_RESTRICTION_SPEC, updateLeagueSettings, type LeagueSettings, type SeasonRestrictions } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useAdminMutation, useDex, useDexMeta, useLeagueSettings } from "@/lib/queries";
import { POKEMON_TYPES, typeLabel } from "@/lib/pokemon-types";
import { useToast } from "@/lib/toast";

const selectCls = "h-10 w-full rounded-xl border border-input bg-card px-3 text-subhead outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

/** Avisa si el snapshot estático (web/public/dex/) y el importado en la base no son el mismo commit de PS. */
function DexDriftWarning() {
  const staticDex = useDex();
  const dbMeta = useDexMeta();
  if (!staticDex.data || !dbMeta.data) return null;
  const staticCommit = staticDex.data.meta.ps_commit;
  const dbCommit = dbMeta.data.ps_commit;
  if (!staticCommit || !dbCommit || staticCommit === dbCommit) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-4 text-footnote text-warning">
      <TriangleAlert className="mt-0.5 size-5 shrink-0" />
      <p>
        El dex de la base ({dbCommit}) y el del navegador ({staticCommit}) no son el mismo commit de Showdown.
        Corre <code>node tools/export_dex.js</code> y <code>python -m bats_core dex --import</code> para actualizarlos.
      </p>
    </div>
  );
}

export function LeagueSettingsPage() {
  const q = useLeagueSettings();
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <PageHeader
        eyebrow={q.data?.season_name}
        title="Reglas de la liga"
        subtitle="Lo que cambies aquí llega solo al formato de Showdown: la próxima validación de equipos ya usa las reglas nuevas."
      />
      <DexDriftWarning />
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> :
        q.isPending ? <Skeleton className="h-96 rounded-2xl" /> :
        // key = versión guardada: al guardar, el formulario se reinicia con los valores del servidor
        <SettingsForm key={JSON.stringify(q.data)} settings={q.data} />}
    </div>
  );
}

function SettingsForm({ settings }: { settings: LeagueSettings }) {
  const { toast } = useToast();
  const save = useAdminMutation((p: Parameters<typeof updateLeagueSettings>[0]) => updateLeagueSettings(p));
  const [type, setType] = useState(settings.type_of_month);
  const [size, setSize] = useState(settings.max_team_size);
  const [changes, setChanges] = useState(settings.max_team_changes);
  const [restrictions, setRestrictions] = useState<SeasonRestrictions>(settings.restrictions ?? {});
  const spec = Object.keys(settings.restriction_spec ?? {}).length ? settings.restriction_spec : DEFAULT_RESTRICTION_SPEC;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync({ type_of_month: type, max_team_size: size, max_team_changes: changes, restrictions });
      toast({ title: "Reglas guardadas", description: "Showdown las recogerá en unos minutos.", tone: "success" });
    } catch (err) { toast({ title: "No se pudo guardar", description: errorMessage(err), tone: "error" }); }
  }

  return (
    <form onSubmit={onSave} className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
        <h2 className="text-headline">Temporada</h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="type" className="text-footnote font-medium">Tipo del mes</label>
          <select id="type" value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
            {POKEMON_TYPES.map((t) => <option key={t} value={t.charAt(0).toUpperCase() + t.slice(1)}>{typeLabel(t)}</option>)}
          </select>
          <p className="text-caption text-muted-foreground">Cada equipo debe llevar al menos un pokémon de este tipo.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="size" className="text-footnote font-medium">Pokémon por equipo</label>
            <Input id="size" type="number" min={1} value={size} onChange={(e) => setSize(Number(e.target.value))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="changes" className="text-footnote font-medium">Rotaciones permitidas</label>
            <Input id="changes" type="number" min={0} value={changes} onChange={(e) => setChanges(Number(e.target.value))} />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-5 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
        <h2 className="text-headline">Restricciones</h2>
        {Object.entries(spec).map(([key, s]) => (
          <RestrictionField key={key} rkey={key} spec={s} value={restrictions[key]} onChange={(k, v) => setRestrictions((r) => ({ ...r, [k]: v }))} />
        ))}
      </section>

      <Button type="submit" size="lg" className="self-start" disabled={save.isPending}>
        {save.isPending ? <><Loader2 className="animate-spin" /> Guardando…</> : "Guardar cambios"}
      </Button>
    </form>
  );
}
