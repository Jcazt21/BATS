import { NavLink } from "react-router-dom";
import { Swords, ShieldBan, UserRoundPlus, Lock, BarChart2 } from "lucide-react";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-10 px-4">

      {/* Title */}
      <div className="flex flex-col items-center gap-2 text-center">
        <Swords className="size-8 text-muted-foreground" />
        <h1 className="text-3xl font-bold tracking-tight">PinchesGueys League</h1>
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-3 w-full max-w-[200px]">
        <NavLink
          to="/stats"
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/20 hover:bg-muted/50 transition-colors px-4 py-2.5 text-sm font-medium"
        >
          <BarChart2 className="size-4" />
          Stats
        </NavLink>

        <NavLink
          to="/bans"
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/20 hover:bg-muted/50 transition-colors px-4 py-2.5 text-sm font-medium"
        >
          <ShieldBan className="size-4" />
          Bans
        </NavLink>

        <NavLink
          to="/registro"
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/20 hover:bg-muted/50 transition-colors px-4 py-2.5 text-sm font-medium"
        >
          <UserRoundPlus className="size-4" />
          Register Team
        </NavLink>

        <NavLink
          to="/admin"
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/20 hover:bg-muted/50 transition-colors px-4 py-2.5 text-sm font-medium text-muted-foreground"
        >
          <Lock className="size-4" />
          Admin Page
        </NavLink>
      </div>

    </div>
  );
}
