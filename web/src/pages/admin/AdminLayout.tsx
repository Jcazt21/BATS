import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, BarChart2, Bot, CalendarDays, ChevronsUpDown, DatabaseZap, ExternalLink, LogOut, ScrollText,
  ShieldAlert, ShieldOff, Swords, UserCog,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, ErrorState } from "@/components/app/States";
import { PlayerAvatar } from "@/components/app/PlayerAvatar";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/http";
import { useMe } from "@/lib/queries";
import { signOut, useSession } from "@/lib/session";

const GROUPS = [
  { label: "Liga", items: [
    { label: "Estadísticas", to: "/admin/stats", icon: BarChart2 },
    { label: "Batallas", to: "/admin/battles", icon: Swords },
    { label: "Temporadas", to: "/admin/seasons", icon: CalendarDays },
    { label: "Reglas", to: "/admin/leaguesettings", icon: ScrollText },
    { label: "Jugadores", to: "/admin/jugadores", icon: UserCog },
  ] },
  { label: "Comunidad", items: [
    { label: "Bans", to: "/admin/bans", icon: ShieldOff },
    { label: "Fair play", to: "/admin/fairplay", icon: ShieldAlert },
  ] },
  { label: "Sistema", items: [
    { label: "Ingestas", to: "/admin/ingestas", icon: DatabaseZap },
    { label: "Stats · Bot", to: "/admin/stats/bot", icon: Bot },
  ] },
];

const ALL = GROUPS.flatMap((g) => g.items);

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading } = useSession();
  const me = useMe();

  if (loading) return null;
  if (!session) return <Navigate to="/admin" replace />;

  if (me.isPending) return <div className="grid min-h-svh place-items-center text-subhead text-muted-foreground" aria-busy>Verificando permisos…</div>;
  if (me.isError) {
    const forbidden = me.error instanceof ApiError && me.error.status === 403;
    return (
      <div className="grid min-h-svh place-items-center p-6">
        {forbidden
          ? <EmptyState title="Tu cuenta no está registrada" description="Pídele a un administrador que te dé de alta."
              action={<Button variant="secondary" onClick={() => { void signOut(); navigate("/"); }}>Salir</Button>} />
          : <ErrorState error={me.error} onRetry={() => me.refetch()} />}
      </div>
    );
  }
  if (!me.data.is_admin) {
    return (
      <div className="grid min-h-svh place-items-center p-6">
        <EmptyState title="Sin permisos de administrador" description="Esta sección es solo para administradores de la liga."
          action={<Button variant="secondary" onClick={() => navigate("/")}>Volver al inicio</Button>} />
      </div>
    );
  }

  const current = ALL.find((n) => n.to === location.pathname)?.label ?? "Panel de control";
  const name = me.data.username;

  return (
    <SidebarProvider>
      <Sidebar variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<NavLink to="/" />}>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-subhead font-semibold">BATS</span>
                  <span className="truncate text-caption text-sidebar-foreground/70">Administración</span>
                </span>
                <ExternalLink className="ml-auto size-4 opacity-60" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {GROUPS.map((g) => (
            <SidebarGroup key={g.label}>
              <SidebarGroupLabel className="text-caption font-medium uppercase tracking-wide">{g.label}</SidebarGroupLabel>
              <SidebarMenu>
                {g.items.map(({ label, to, icon: Icon }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton render={<NavLink to={to} />} isActive={location.pathname === to} tooltip={label}>
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                  <PlayerAvatar name={name} size={32} />
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-subhead font-semibold">{name}</span>
                    <span className="truncate text-caption text-sidebar-foreground/70">{me.data.email}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end" sideOffset={4} className="min-w-56">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>{name}</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => navigate(`/j/${encodeURIComponent(name)}`)}><Activity /> Mi perfil</DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { void signOut(); navigate("/admin"); }}><LogOut /> Cerrar sesión</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-background">
        <header className="material-regular sticky top-0 z-10 flex h-14 items-center gap-2 px-4 pt-safe shadow-[0_1px_0_var(--separator)]">
          <SidebarTrigger className="-ml-1" />
          <span className="text-headline">{current}</span>
        </header>
        <div className="flex flex-1 flex-col gap-8 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
