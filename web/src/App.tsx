import { Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProvider } from "@/components/SessionProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { MonthTheme } from "@/components/MonthTheme";
import { ToastProvider } from "@/components/app/Toaster";
import { AppShell } from "@/components/app/AppShell";
import { PageFallback } from "@/components/app/RouteOutlet";
import { queryClient } from "@/lib/query-client";
import { lazyPage } from "@/lib/preload";
import { installIntentPreload, pages } from "@/routes";
import { HomePage } from "@/pages/HomePage";

// Cada página se carga cuando se visita (o antes, al intuir que se va a visitar: ver routes.ts).
const {
  blog: BlogPage, blogPost: BlogPostPage, stats: StatsPage, pokedex: PokedexPage, pokedexEntry: PokedexEntryPage, player: PlayerPage, bans: BansPage, team: TeamPage,
  login: LoginPage, adminLayout: AdminLayout, statsBot: StatsBotPage, battles: BattlesPage, adminBans: AdminBansPage,
  seasons: SeasonsPage, players: PlayersPage, rosters: RostersPage, ingest: IngestPage, fairPlay: FairPlayPage,
  leagueSettings: LeagueSettingsPage, adminBlog: BlogAdminPage,
} = pages;
// Demo temporal de la silueta (solo desarrollo): no entra en el build de producción.
const SilhouetteDemoPage = import.meta.env.DEV
  ? lazyPage(() => import("@/pages/SilhouetteDemoPage").then((m) => ({ default: m.SilhouetteDemoPage })))
  : null;
// Mismo chunk que /stats: precargar uno sirve para el otro.
const AdminStatsPage = lazyPage(() => pages.stats.preload().then(({ default: Stats }) => ({ default: () => <Stats showAdminControls /> })));

/** Enlaces antiguos: /registro y /ypkmn. */
function LegacyRedirect({ to }: { to: string }) {
  const params = useParams();
  return <Navigate to={to.replace(":species", params.species ?? "")} replace />;
}

export default function App() {
  useEffect(() => installIntentPreload(), []);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MonthTheme />
        <SessionProvider>
          <TooltipProvider>
            <ToastProvider>
              <BrowserRouter>
                <Suspense fallback={<PageFallback className="min-h-svh" />}>
                  <Routes>
                    <Route element={<AppShell />}>
                      <Route path="/" element={<HomePage />} />
                      <Route path="/blog" element={<BlogPage />} />
                      <Route path="/blog/:slug" element={<BlogPostPage />} />
                      <Route path="/stats" element={<StatsPage />} />
                      <Route path="/pokedex" element={<PokedexPage />} />
                      <Route path="/pokedex/:species" element={<PokedexEntryPage />} />
                      <Route path="/j/:username" element={<PlayerPage />} />
                      <Route path="/bans" element={<BansPage />} />
                      <Route path="/equipo" element={<TeamPage />} />
                      {SilhouetteDemoPage && <Route path="/dev/silueta" element={<SilhouetteDemoPage />} />}
                    </Route>
                    <Route path="/registro" element={<LegacyRedirect to="/equipo" />} />
                    <Route path="/ypkmn" element={<Navigate to="/pokedex" replace />} />

                    <Route path="/admin" element={<LoginPage />} />
                    <Route element={<AdminLayout />}>
                      <Route path="/admin/stats" element={<AdminStatsPage />} />
                      <Route path="/admin/stats/bot" element={<StatsBotPage />} />
                      <Route path="/admin/battles" element={<BattlesPage />} />
                      <Route path="/admin/bans" element={<AdminBansPage />} />
                      <Route path="/admin/blog" element={<BlogAdminPage />} />
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
