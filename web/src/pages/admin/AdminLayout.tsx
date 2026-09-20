import { useCallback } from "react";
import { Outlet, useNavigate, useLocation, NavLink } from "react-router-dom";
import {
  ChevronsUpDown,
  GalleryVerticalEnd,
  ShieldOff,
  LogOut,
  Trash2,
  BarChart2,
  Bot,
  Swords,
  CalendarDays,
  Users,
} from "lucide-react";

import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";

import { Separator } from "@/components/ui/separator";

const NAV_ITEMS = [
  { label: "Stats",       to: "/admin/stats",      icon: BarChart2    },
  { label: "Stats · Bot", to: "/admin/stats/bot",  icon: Bot          },
  { label: "Batallas",    to: "/admin/battles",    icon: Swords       },
  { label: "Ban List",    to: "/admin/bans",       icon: ShieldOff    },
  { label: "Temporadas",  to: "/admin/seasons",    icon: CalendarDays },
  { label: "Whitelist",   to: "/admin/whitelist",  icon: Users        },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = sessionStorage.getItem("bats_admin_token");

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem("bats_admin_token");
    navigate("/admin");
  }, [navigate]);

  if (!token) {
    navigate("/admin");
    return null;
  }

  return (
    <SidebarProvider>
      <Sidebar variant="inset" className="border-r">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-blue-600 text-sidebar-primary-foreground">
                  <GalleryVerticalEnd className="size-4 text-white" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold text-sidebar-foreground">
                    PinchesGueys
                  </span>
                  <span className="truncate text-xs text-sidebar-foreground/70">
                    BATS League
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        {/* ── Nav ────────────────────────────────────────────────────────── */}
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-semibold uppercase text-sidebar-foreground/50 tracking-wider mb-2 mt-2">Platform</SidebarGroupLabel>
            <SidebarMenu>
              {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    render={<NavLink to={to} />}
                    isActive={location.pathname === to}
                    tooltip={label}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-semibold uppercase text-sidebar-foreground/50 tracking-wider mb-2">System</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<NavLink to="/admin/etl-cleaner" />}
                  isActive={location.pathname === "/admin/etl-cleaner"}
                  tooltip="ETL Cleaner"
                >
                  <Trash2 />
                  <span>ETL Cleaner</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton
                      size="lg"
                      className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    />
                  }
                >
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarImage src="" alt="Admin" />
                      <AvatarFallback className="rounded-lg bg-indigo-500 text-white font-bold">A</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold text-sidebar-foreground">Admin</span>
                      <span className="truncate text-xs text-sidebar-foreground/70">admin@bats.local</span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg border-border"
                  side="right"
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarImage src="" alt="Admin" />
                        <AvatarFallback className="rounded-lg bg-indigo-500 text-white font-bold">A</AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">Admin</span>
                        <span className="truncate text-xs text-muted-foreground">admin@bats.local</span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-500 cursor-pointer focus:bg-red-50 focus:text-red-600">
                    <LogOut className="mr-2 size-4" />
                    Cerrar sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <SidebarInset className="bg-background">
        {/* Toolbar / breadcrumb */}
        <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border/50 bg-background/80 px-4 backdrop-blur-md">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4 opacity-40" />
          <span className="text-sm font-medium text-foreground/80 tracking-tight">
            {location.pathname === "/admin/etl-cleaner"
              ? "ETL Cleaner"
              : NAV_ITEMS.find((n) => n.to === location.pathname)?.label ?? "Panel de Control"}
          </span>
        </header>

        {/* Content — centrado, espaciado HIG */}
        <div className="flex flex-1 flex-col overflow-y-auto px-6 py-8 md:px-10 md:py-10">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
