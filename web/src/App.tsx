import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProvider } from "@/components/SessionProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/app/Toaster";
import { AppShell } from "@/components/app/AppShell";
import { queryClient } from "@/lib/query-client";
import { HomePage } from "@/pages/HomePage";

// Cada página se carga cuando se visita: el primer pintado no arrastra el panel admin ni los gráficos.
const StatsPage = lazy(() => import("@/pages/StatsPage").then((m) => ({ default: m.StatsPage })));
const PokedexPage = lazy(() => import("@/pages/PokedexPage").then((m) => ({ default: m.PokedexPage })));
const PokedexEntryPage = lazy(() => import("@/pages/PokedexEntryPage").then((m) => ({ default: m.PokedexEntryPage })));
const PlayerPage = lazy(() => import("@/pages/PlayerPage").then((m) => ({ default: m.PlayerPage })));
const BansPage = lazy(() => import("@/pages/BansPage").then((m) => ({ default: m.BansPage })));
const TeamPage = lazy(() => import("@/pages/TeamPage").then((m) => ({ default: m.TeamPage })));
const LoginPage = lazy(() => import("@/pages/admin/LoginPage").then((m) => ({ default: m.LoginPage })));
const AdminLayout = lazy(() => import("@/pages/admin/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const AdminStatsPage = lazy(() => import("@/pages/StatsPage").then((m) => ({ default: () => <m.StatsPage showAdminControls /> })));
const StatsBotPage = lazy(() => import("@/pages/admin/StatsBotPage").then((m) => ({ default: m.StatsBotPage })));
const BattlesPage = lazy(() => import("@/pages/admin/BattlesPage").then((m) => ({ default: m.BattlesPage })));
const AdminBansPage = lazy(() => import("@/pages/admin/BansPage").then((m) => ({ default: m.BansPage })));
const SeasonsPage = lazy(() => import("@/pages/admin/SeasonsPage").then((m) => ({ default: m.SeasonsPage })));
const PlayersPage = lazy(() => import("@/pages/admin/PlayersPage").then((m) => ({ default: m.PlayersPage })));
const RostersPage = lazy(() => import("@/pages/admin/RostersPage").then((m) => ({ default: m.RostersPage })));
const IngestPage = lazy(() => import("@/pages/admin/IngestPage").then((m) => ({ default: m.IngestPage })));
const FairPlayPage = lazy(() => import("@/pages/admin/FairPlayPage").then((m) => ({ default: m.FairPlayPage })));
const LeagueSettingsPage = lazy(() => import("@/pages/admin/LeagueSettingsPage").then((m) => ({ default: m.LeagueSettingsPage })));

function Loading() {
  return <div className="grid min-h-[40svh] place-items-center text-footnote text-muted-foreground" aria-busy>Cargando…</div>;
}

/** Enlaces antiguos: /registro y /ypkmn. */
function LegacyRedirect({ to }: { to: string }) {
  const params = useParams();
  return <Navigate to={to.replace(":species", params.species ?? "")} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SessionProvider>
          <TooltipProvider>
            <ToastProvider>
              <BrowserRouter>
                <Suspense fallback={<Loading />}>
                  <Routes>
                    <Route element={<AppShell />}>
                      <Route path="/" element={<HomePage />} />
                      <Route path="/stats" element={<StatsPage />} />
                      <Route path="/pokedex" element={<PokedexPage />} />
                      <Route path="/pokedex/:species" element={<PokedexEntryPage />} />
                      <Route path="/j/:username" element={<PlayerPage />} />
                      <Route path="/bans" element={<BansPage />} />
                      <Route path="/equipo" element={<TeamPage />} />
                    </Route>
                    <Route path="/registro" element={<LegacyRedirect to="/equipo" />} />
                    <Route path="/ypkmn" element={<Navigate to="/pokedex" replace />} />

                    <Route path="/admin" element={<LoginPage />} />
                    <Route element={<AdminLayout />}>
                      <Route path="/admin/stats" element={<AdminStatsPage />} />
                      <Route path="/admin/stats/bot" element={<StatsBotPage />} />
                      <Route path="/admin/battles" element={<BattlesPage />} />
                      <Route path="/admin/bans" element={<AdminBansPage />} />
                      <Route path="/admin/seasons" element={<SeasonsPage />} />
                      <Route path="/admin/jugadores" element={<PlayersPage />} />
                      <Route path="/admin/rosters" element={<RostersPage />} />
                      <Route path="/admin/fairplay" element={<FairPlayPage />} />
                      <Route path="/admin/ingestas" element={<IngestPage />} />
                      <Route path="/admin/leaguesettings" element={<LeagueSettingsPage />} />
                    </Route>
                    <Route path="/admin/whitelist" element={<Navigate to="/admin/seasons" replace />} />
                    <Route path="/admin/etl-cleaner" element={<Navigate to="/admin/ingestas" replace />} />

                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </ToastProvider>
          </TooltipProvider>
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
