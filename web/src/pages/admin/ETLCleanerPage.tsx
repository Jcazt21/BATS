import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Trash2, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, SkipForward, Filter, ChevronDown,
  ChevronRight, FolderOpen, FolderOpenDot, Files, Swords, Play,
} from "lucide-react";

import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input }    from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  getEtlFiles, deleteEtlFiles, runEtl,
  type EtlFileEntry,
} from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  ok:      { label: "OK",      icon: <CheckCircle2 className="size-3" />, className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  error:   { label: "Error",   icon: <XCircle      className="size-3" />, className: "bg-red-100 text-red-700 border-red-200"             },
  skipped: { label: "Skipped", icon: <SkipForward  className="size-3" />, className: "bg-yellow-100 text-yellow-700 border-yellow-200"    },
};

// ── Pending delete types ──────────────────────────────────────────────────────

type PendingDelete = { paths: string[]; label: string };

/** Agrupación por mes calculada en el cliente (ya no hay carpetas en el servidor). */
interface MonthGroup {
  key:       string;            // "2026-03"
  entries:   EtlFileEntry[];
  processed: number;            // entradas con status "ok"
}

const monthOf = (f: EtlFileEntry): string =>
  (f.battle_date ?? f.processed_at ?? "").slice(0, 7) || "sin fecha";

// ── Component ─────────────────────────────────────────────────────────────────

export function ETLCleanerPage() {
  const token = sessionStorage.getItem("bats_admin_token") ?? "";

  // ── Data ───────────────────────────────────────────────────────────────────
  const [files,       setFiles]       = useState<EtlFileEntry[]>([]);
  const [filesLoading,setFilesLoading]= useState(true);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [expandedMonth,    setExpandedMonth]    = useState<string | null>(null);
  const [accordionSelected,setAccordionSelected]= useState<Set<string>>(new Set());
  const [fileSelected,     setFileSelected]     = useState<Set<string>>(new Set());
  const [search,           setSearch]           = useState("");
  const [statusFilter,     setStatusFilter]     = useState("all");

  // ── ETL run ────────────────────────────────────────────────────────────────
  const [running, setRunning] = useState(false);

  async function handleRunEtl() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await runEtl(token);
      setResult(
        `Temporadas recalculadas: ${r.seasons.updated} batallas reasignadas · vistas actualizadas` +
        (r.seasons.error ? ` (⚠ ${r.seasons.error})` : ""),
      );
      await loadFiles();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  // ── Feedback ───────────────────────────────────────────────────────────────
  const [result, setResult] = useState<string | null>(null);
  const [error,  setError]  = useState<string | null>(null);

  // ── Unified delete confirmation ────────────────────────────────────────────
  const [pending,     setPending]     = useState<PendingDelete | null>(null);
  const [deleteWord,  setDeleteWord]  = useState("");
  const [isDeleting,  setIsDeleting]  = useState(false);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      setFiles(await getEtlFiles(token));
      setFileSelected(new Set());
      setAccordionSelected(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFilesLoading(false);
    }
  }, [token]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // Reset accordion selection when a different month is opened
  useEffect(() => { setAccordionSelected(new Set()); }, [expandedMonth]);

  // ── Delete execution ───────────────────────────────────────────────────────

  async function executePending() {
    if (!pending) return;
    setIsDeleting(true);
    setError(null);
    try {
      const r = await deleteEtlFiles(token, pending.paths);
      setResult(`Borradas de la base de datos: ${r.battles_removed} batallas (${r.removed_entries} registros)`);
      await loadFiles();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsDeleting(false);
      setPending(null);
      setDeleteWord("");
    }
  }

  function openDeleteDialog(p: PendingDelete) {
    setDeleteWord("");
    setResult(null);
    setPending(p);
  }

  // ── Filtered files (tab Archivos) ──────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return files.filter((f) => {
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (!q) return true;
      return (
        f.file_name.toLowerCase().includes(q)      ||
        f.format_name?.toLowerCase().includes(q)   ||
        f.p1_username?.toLowerCase().includes(q)   ||
        f.p2_username?.toLowerCase().includes(q)   ||
        f.season_name?.toLowerCase().includes(q)   ||
        f.battle_id?.toLowerCase().includes(q)
      );
    });
  }, [files, search, statusFilter]);

  const allFileSelected = filtered.length > 0 && filtered.every((f) => fileSelected.has(f.file_path));

  function toggleFileAll() {
    setFileSelected((prev) => {
      const next = new Set(prev);
      allFileSelected
        ? filtered.forEach((f) => next.delete(f.file_path))
        : filtered.forEach((f) => next.add(f.file_path));
      return next;
    });
  }

  function toggleFileOne(path: string) {
    setFileSelected((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  // ── Accordion selection helpers ────────────────────────────────────────────

  function toggleAccordionAll(dirFiles: EtlFileEntry[]) {
    const allSel = dirFiles.every((f) => accordionSelected.has(f.file_path));
    setAccordionSelected((prev) => {
      const next = new Set(prev);
      allSel
        ? dirFiles.forEach((f) => next.delete(f.file_path))
        : dirFiles.forEach((f) => next.add(f.file_path));
      return next;
    });
  }

  function toggleAccordionOne(path: string) {
    setAccordionSelected((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  // ── Meses (agrupación en el cliente) ───────────────────────────────────────

  const months = useMemo<MonthGroup[]>(() => {
    const byMonth = new Map<string, EtlFileEntry[]>();
    for (const f of files) {
      const k = monthOf(f);
      byMonth.set(k, [...(byMonth.get(k) ?? []), f]);
    }
    return Array.from(byMonth, ([key, entries]) => ({
      key, entries, processed: entries.filter((f) => f.status === "ok").length,
    })).sort((a, b) => b.key.localeCompare(a.key));
  }, [files]);

  // ── Stats ──────────────────────────────────────────────────────────────────

  const counts = useMemo(() => ({
    ok:      files.filter((f) => f.status === "ok").length,
    error:   files.filter((f) => f.status === "error").length,
    skipped: files.filter((f) => f.status === "skipped").length,
  }), [files]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ETL Cleaner</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestiona y limpia las batallas cargadas en la base de datos</p>
        </div>
        <Button
          onClick={() => void handleRunEtl()}
          disabled={running}
          className="gap-2 shrink-0"
        >
          {running
            ? <RefreshCw className="size-4 animate-spin" />
            : <Play       className="size-4" />}
          {running ? "Recalculando…" : "Recalcular temporadas"}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          { label: "Total",   value: files.length,   color: "text-foreground"  },
          { label: "OK",      value: counts.ok,      color: "text-emerald-600" },
          { label: "Error",   value: counts.error,   color: "text-red-600"     },
          { label: "Skipped", value: counts.skipped, color: "text-yellow-600"  },
        ] as const).map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Global feedback */}
      {result && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="size-4 shrink-0" />{result}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="size-4 shrink-0" />{error}
        </div>
      )}

      <Tabs defaultValue="directories">
        <TabsList className="mb-4">
          <TabsTrigger value="directories" className="gap-2"><FolderOpen className="size-4" />Por mes</TabsTrigger>
          <TabsTrigger value="files"       className="gap-2"><Files     className="size-4" />Batallas</TabsTrigger>
        </TabsList>

        {/* ══ Tab: Por mes ════════════════════════════════════════════════════ */}
        <TabsContent value="directories">
          <div className="flex justify-end mb-3">
            <Button variant="outline" size="sm" onClick={loadFiles} disabled={filesLoading} className="gap-1.5">
              <RefreshCw className={`size-3.5 ${filesLoading ? "animate-spin" : ""}`} />Actualizar
            </Button>
          </div>

          <div className="space-y-2">
            {filesLoading && (
              <div className="rounded-lg border px-4 py-10 text-center text-sm text-muted-foreground">Cargando…</div>
            )}
            {!filesLoading && months.length === 0 && (
              <div className="rounded-lg border px-4 py-10 text-center text-sm text-muted-foreground">No hay batallas cargadas</div>
            )}
            {!filesLoading && months.map((m) => {
              const isOpen   = expandedMonth === m.key;
              const dirFiles = m.entries;
              const selInDir = dirFiles.filter((f) => accordionSelected.has(f.file_path));
              const allSel   = dirFiles.length > 0 && dirFiles.every((f) => accordionSelected.has(f.file_path));
              const allProcessed = m.processed > 0 && m.processed === dirFiles.length;

              return (
                <div key={m.key} className="rounded-lg border overflow-hidden">
                  {/* ── Cabecera del mes ──────────────────────────────── */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 bg-card transition-colors select-none"
                    onClick={() => setExpandedMonth(isOpen ? null : m.key)}
                  >
                    {isOpen
                      ? <ChevronDown  className="size-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
                    {isOpen
                      ? <FolderOpenDot className="size-4 text-blue-500 shrink-0" />
                      : <FolderOpen    className="size-4 text-muted-foreground shrink-0" />}

                    <span className="font-semibold">{m.key}</span>

                    <div className="ml-auto flex items-center gap-6 shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground leading-none mb-0.5">Registros</p>
                        <p className="text-sm font-medium">{dirFiles.length}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground leading-none mb-0.5">Cargadas</p>
                        <p className={`text-sm font-medium ${allProcessed ? "text-emerald-600" : ""}`}>
                          {m.processed} <span className="text-muted-foreground font-normal">/ {dirFiles.length}</span>
                        </p>
                      </div>
                      <Button
                        variant="destructive" size="sm" className="gap-1.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteDialog({
                            paths: dirFiles.map((f) => f.file_path),
                            label: `todas las batallas de ${m.key} (${dirFiles.length})`,
                          });
                        }}
                      >
                        <Trash2 className="size-3.5" />Borrar todo
                      </Button>
                    </div>
                  </div>

                  {/* ── Acordeón: tabla de batallas ───────────────────── */}
                  {isOpen && (
                    <div className="border-t border-border/50">
                      {/* Toolbar de selección */}
                      <div className="flex items-center gap-3 px-4 py-2 bg-muted/20 border-b border-border/40">
                        <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground">
                          <Checkbox
                            checked={allSel}
                            onCheckedChange={() => toggleAccordionAll(dirFiles)}
                            className="size-5"
                          />
                          Seleccionar todo
                        </label>
                        {selInDir.length > 0 && (
                          <>
                            <span className="text-xs text-muted-foreground">
                              {selInDir.length} seleccionada{selInDir.length !== 1 ? "s" : ""}
                            </span>
                            <Button
                              variant="destructive" size="sm" className="gap-1.5 h-7 text-xs ml-auto"
                              onClick={() => openDeleteDialog({
                                paths: selInDir.map((f) => f.file_path),
                                label: `${selInDir.length} batalla${selInDir.length !== 1 ? "s" : ""} de ${m.key}`,
                              })}
                            >
                              <Trash2 className="size-3" />Borrar seleccionadas
                            </Button>
                          </>
                        )}
                      </div>

                      {/* Tabla de batallas */}
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/40 bg-muted/30 text-xs text-muted-foreground">
                            <th className="py-2 pl-4 pr-2 w-8" />
                            <th className="py-2 px-3 text-left font-medium">Estado</th>
                            <th className="py-2 px-3 text-left font-medium">Batalla</th>
                            <th className="py-2 px-3 text-left font-medium">Formato</th>
                            <th className="py-2 px-3 text-left font-medium">Enfrentamiento</th>
                            <th className="py-2 px-3 text-left font-medium">Temporada</th>
                            <th className="py-2 px-3 text-right font-medium">Turnos</th>
                            <th className="py-2 px-3 text-right font-medium">Violaciones</th>
                            <th className="py-2 px-3 text-right font-medium">Fecha</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {dirFiles.map((f) => {
                            const meta  = STATUS_META[f.status] ?? STATUS_META.skipped;
                            const isSel = accordionSelected.has(f.file_path);
                            return (
                              <tr
                                key={f.log_id}
                                className={`transition-colors cursor-pointer ${isSel ? "bg-primary/5" : "hover:bg-muted/20"}`}
                                onClick={() => toggleAccordionOne(f.file_path)}
                              >
                                <td className="pl-4 pr-2" onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={isSel}
                                    onCheckedChange={() => toggleAccordionOne(f.file_path)}
                                    className="size-5"
                                  />
                                </td>
                                <td className="py-2.5 px-3">
                                  <Badge variant="outline" className={`gap-1 text-xs w-fit ${meta.className}`}>
                                    {meta.icon}{meta.label}
                                  </Badge>
                                </td>
                                <td className="py-2.5 px-3">
                                  <p className="font-mono text-xs truncate max-w-[180px]" title={f.battle_id ?? f.file_name}>
                                    {f.battle_id ?? f.file_name}
                                  </p>
                                  {f.battle_id && f.file_name !== f.battle_id && (
                                    <p className="text-xs text-muted-foreground truncate max-w-[180px]" title={f.file_name}>
                                      {f.file_name}
                                    </p>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                                    {f.format_name ?? "—"}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3">
                                  {f.p1_username && f.p2_username ? (
                                    <div className="flex items-center gap-1.5">
                                      <Swords className="size-3 text-muted-foreground shrink-0" />
                                      <span className={f.winner_username === f.p1_username ? "font-semibold text-emerald-600" : ""}>{f.p1_username}</span>
                                      <span className="text-muted-foreground text-xs">vs</span>
                                      <span className={f.winner_username === f.p2_username ? "font-semibold text-emerald-600" : ""}>{f.p2_username}</span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">{f.error_msg ?? "Sin datos"}</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-xs text-muted-foreground">{f.season_name ?? "—"}</td>
                                <td className="py-2.5 px-3 text-right text-xs text-muted-foreground">{f.total_turns ?? "—"}</td>
                                <td className="py-2.5 px-3 text-right">
                                  {f.violation_count > 0
                                    ? <Badge variant="outline" className="gap-1 text-xs bg-red-50 text-red-600 border-red-200">
                                        <AlertTriangle className="size-3" />{f.violation_count}
                                      </Badge>
                                    : <span className="text-xs text-muted-foreground">0</span>}
                                </td>
                                <td className="py-2.5 px-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                                  {formatDate(f.battle_date ?? f.processed_at)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ══ Tab: Archivos ════════════════════════════════════════════════════ */}
        <TabsContent value="files" className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Buscar por batalla, formato, jugador, temporada…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 max-w-xs text-sm"
            />
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
                <Filter className="size-3.5" />
                {statusFilter === "all" ? "Estado: todos" : `Estado: ${statusFilter}`}
                <ChevronDown className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {["all", "ok", "error", "skipped"].map((s) => (
                  <DropdownMenuItem key={s} onClick={() => setStatusFilter(s)}>
                    {s === "all" ? "Todos" : s}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="ml-auto flex items-center gap-2">
              {fileSelected.size > 0 && (
                <span className="text-sm text-muted-foreground">
                  {fileSelected.size} seleccionado{fileSelected.size !== 1 ? "s" : ""}
                </span>
              )}
              <Button
                variant="destructive" size="sm"
                disabled={fileSelected.size === 0}
                onClick={() => openDeleteDialog({
                  paths: Array.from(fileSelected),
                  label: `${fileSelected.size} batalla${fileSelected.size !== 1 ? "s" : ""}`,
                })}
                className="gap-1.5"
              >
                <Trash2 className="size-3.5" />Borrar seleccionados
              </Button>
              <Button variant="outline" size="sm" onClick={loadFiles} disabled={filesLoading} className="gap-1.5">
                <RefreshCw className={`size-3.5 ${filesLoading ? "animate-spin" : ""}`} />Actualizar
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-10 text-center">
                    <Checkbox
                      checked={allFileSelected}
                      onCheckedChange={toggleFileAll}
                      disabled={filtered.length === 0}
                      className="size-5"
                    />
                  </TableHead>
                  <TableHead className="w-24">Estado</TableHead>
                  <TableHead>Batalla</TableHead>
                  <TableHead>Formato</TableHead>
                  <TableHead>Jugadores</TableHead>
                  <TableHead>Temporada</TableHead>
                  <TableHead className="text-right">Turnos</TableHead>
                    <TableHead className="text-right">Violaciones</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filesLoading && (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground text-sm">Cargando batallas…</TableCell></TableRow>
                )}
                {!filesLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground text-sm">No hay batallas que coincidan con los filtros</TableCell></TableRow>
                )}
                {!filesLoading && filtered.map((f) => {
                  const meta   = STATUS_META[f.status] ?? STATUS_META.skipped;
                  const isSel  = fileSelected.has(f.file_path);
                  return (
                    <TableRow
                      key={f.log_id}
                      className={`cursor-pointer transition-colors ${isSel ? "bg-primary/5" : "hover:bg-muted/30"}`}
                      onClick={() => toggleFileOne(f.file_path)}
                    >
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={() => toggleFileOne(f.file_path)}
                          className="size-5"
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 text-xs w-fit ${meta.className}`}>{meta.icon}{meta.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <p className="font-mono text-xs truncate max-w-[180px]" title={f.battle_id ?? f.file_name}>{f.battle_id ?? f.file_name}</p>
                        {f.battle_id && f.file_name !== f.battle_id && (
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]" title={f.file_name}>{f.file_name}</p>
                        )}
                      </TableCell>
                      <TableCell><span className="text-sm">{f.format_name ?? "—"}</span></TableCell>
                      <TableCell>
                        {f.p1_username && f.p2_username ? (
                          <div className="text-sm">
                            <span className={f.winner_username === f.p1_username ? "font-semibold text-emerald-600" : ""}>{f.p1_username}</span>
                            <span className="mx-1 text-muted-foreground">vs</span>
                            <span className={f.winner_username === f.p2_username ? "font-semibold text-emerald-600" : ""}>{f.p2_username}</span>
                          </div>
                        ) : <span className="text-sm text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><span className="text-sm">{f.season_name ?? "—"}</span></TableCell>
                      <TableCell className="text-right text-sm">{f.total_turns ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {f.violation_count > 0
                          ? <Badge variant="outline" className="gap-1 bg-red-50 text-red-600 border-red-200"><AlertTriangle className="size-3" />{f.violation_count}</Badge>
                          : <span className="text-sm text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(f.battle_date ?? f.processed_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ══ Diálogo unificado: escribir "delete" para confirmar ════════════════ */}
      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o && !isDeleting) { setPending(null); setDeleteWord(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="size-4" />
              {`¿Borrar ${pending?.label ?? ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                Se borrarán de la base de datos las batallas y sus estadísticas. Los logs del servidor de Showdown no se tocan,
                pero un reenvío posterior (backfill) las volvería a cargar.
                {" "}<strong>Esta acción no se puede deshacer.</strong>
              </span>
              <span className="block text-sm">
                Escribe <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-destructive font-bold">delete</code> para confirmar:
              </span>
              <Input
                autoFocus
                placeholder="delete"
                value={deleteWord}
                onChange={(e) => setDeleteWord(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && deleteWord === "delete") executePending(); }}
                className="font-mono"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <button
              onClick={executePending}
              disabled={deleteWord !== "delete" || isDeleting}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="size-3.5" />
              {isDeleting ? "Borrando…" : "Confirmar borrado"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
