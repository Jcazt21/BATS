import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LandingPage }         from "@/pages/LandingPage";
import { BanPage }             from "@/pages/BanPage";
import { StatsPage }           from "@/pages/StatsPage";
import { YellowPokemonPage }   from "@/pages/YellowPokemonPage";
import { LoginPage }      from "@/pages/admin/LoginPage";
import { AdminLayout }    from "@/pages/admin/AdminLayout";
import { BansPage }       from "@/pages/admin/BansPage";
import { StatsBotPage }   from "@/pages/admin/StatsBotPage";
import { BattlesPage }    from "@/pages/admin/BattlesPage";
import { SeasonsPage }    from "@/pages/admin/SeasonsPage";
import { WhitelistPage }    from "@/pages/admin/WhitelistPage";
import { ETLCleanerPage }       from "@/pages/admin/ETLCleanerPage";
import { LeagueSettingsPage }   from "@/pages/admin/LeagueSettingsPage";
import { TeamRegisterPage }     from "@/pages/TeamRegisterPage";

export default function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"          element={<LandingPage />} />
          <Route path="/bans"      element={<BanPage />} />
          <Route path="/ypkmn"    element={<YellowPokemonPage />} />
          <Route path="/registro" element={<TeamRegisterPage />} />
          <Route path="/stats"    element={<StatsPage />} />
          <Route path="/admin"    element={<LoginPage />} />

          <Route element={<AdminLayout />}>
            <Route path="/admin/stats"     element={<StatsPage showAdminControls />} />
            <Route path="/admin/stats/bot" element={<StatsBotPage />} />
            <Route path="/admin/battles"   element={<BattlesPage />} />
            <Route path="/admin/bans"      element={<BansPage />} />
            <Route path="/admin/seasons"   element={<SeasonsPage />} />
            <Route path="/admin/whitelist"    element={<WhitelistPage />} />
            <Route path="/admin/etl-cleaner"     element={<ETLCleanerPage />} />
            <Route path="/admin/leaguesettings" element={<LeagueSettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
}
