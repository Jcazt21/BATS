import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BarChart3, BookOpen, House, LogOut, Monitor, Moon, ShieldBan, ShieldCheck, Sun, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageTransition } from "@/components/app/PageTransition";
import { PlayerAvatar } from "@/components/app/PlayerAvatar";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { SignInCard } from "@/components/SignInCard";
import { useMe } from "@/lib/queries";
import { signOut, useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Inicio", icon: House, end: true },
  { to: "/stats", label: "Estadísticas", icon: BarChart3 },
  { to: "/pokedex", label: "Pokédex", icon: BookOpen },
  { to: "/bans", label: "Bans", icon: ShieldBan },
  { to: "/equipo", label: "Mi equipo", icon: Users },
] as const;

/** Estructura de las páginas públicas: barra superior translúcida + barra de pestañas en móvil. */
export function AppShell() {
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // Sin línea divisoria fija: aparece un filo sutil solo cuando el contenido pasa por debajo.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="min-h-svh">
      <a href="#contenido" className="sr-only rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70]">
        Saltar al contenido
      </a>
      <div ref={sentinel} aria-hidden className="absolute top-0 h-px w-px" />
      <TopBar scrolled={scrolled} />
      <main id="contenido" className="mx-auto w-full max-w-6xl px-4 pt-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-16">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <TabBar />
    </div>
  );
}

function TopBar({ scrolled }: { scrolled: boolean }) {
  return (
    <header
      className={cn(
        "material-regular sticky top-0 z-40 pt-safe transition-shadow duration-300",
        scrolled ? "shadow-[0_1px_0_var(--separator)]" : "shadow-[0_1px_0_transparent]",
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <NavLink to="/" className="press flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="BATS, inicio">
          <span className="text-headline">BATS</span>
        </NavLink>

        <nav aria-label="Principal" className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map(({ to, label, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={"end" in rest}
              className={({ isActive }) =>
                cn(
                  "press rounded-full px-3.5 py-1.5 text-subhead font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeMenu />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

function ThemeMenu() {
  const { preference, setPreference } = useTheme();
  const Icon = preference === "dark" ? Moon : preference === "light" ? Sun : Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Apariencia" />}>
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Apariencia</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setPreference("light")}><Sun /> Claro</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setPreference("dark")}><Moon /> Oscuro</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setPreference("system")}><Monitor /> Sistema</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const { session } = useSession();
  const me = useMe();
  const navigate = useNavigate();
  const [signingIn, setSigningIn] = useState(false);

  if (!session) {
    return (
      <>
        <Button size="sm" onClick={() => setSigningIn(true)}>Entrar</Button>
        <ResponsiveSheet open={signingIn} onOpenChange={setSigningIn} title="Entrar" description="Sin contraseñas: te enviamos un enlace.">
          <div className="flex justify-center py-2"><SignInCard title="Correo" /></div>
        </ResponsiveSheet>
      </>
    );
  }

  const name = me.data?.username ?? session.user.email ?? "Yo";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Cuenta" />}>
        <PlayerAvatar name={name} size={30} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{name}</DropdownMenuLabel>
        {me.data && <DropdownMenuItem onClick={() => navigate(`/j/${encodeURIComponent(me.data!.username)}`)}><UserRound /> Mi perfil</DropdownMenuItem>}
        {me.data?.is_admin && <DropdownMenuItem onClick={() => navigate("/admin/stats")}><ShieldCheck /> Administración</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}><LogOut /> Salir</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Barra inferior del móvil: translúcida, con etiquetas siempre visibles y objetivos ≥ 44 pt. */
function TabBar() {
  return (
    <nav
      aria-label="Principal"
      className="material-regular material-edge-top pb-safe fixed inset-x-0 bottom-0 z-40 md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 pt-1.5">
        {NAV.map(({ to, label, icon: Icon, ...rest }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={"end" in rest}
              className={({ isActive }) =>
                cn(
                  "press flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[0.6875rem] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="size-[1.375rem]" strokeWidth={isActive ? 2.4 : 1.8} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
