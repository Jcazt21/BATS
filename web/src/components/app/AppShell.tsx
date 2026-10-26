import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion, type Transition } from "motion/react";
import { BarChart3, BookOpen, House, LogOut, Monitor, Moon, Newspaper, ShieldBan, ShieldCheck, Sun, UserRound, Users } from "lucide-react";
import { GlobalSearch } from "@/components/app/GlobalSearch";
import { OfflineNotice } from "@/components/app/OfflineNotice";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RouteOutlet } from "@/components/app/RouteOutlet";
import { PlayerAvatar } from "@/components/app/PlayerAvatar";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { SignInCard } from "@/components/SignInCard";
import { spring, useReducedMotion } from "@/lib/motion";
import { useMe } from "@/lib/queries";
import { signOut, useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { preloadWhenIdle, publicPages } from "@/routes";

const NAV = [
  { to: "/", label: "Inicio", icon: House, end: true },
  { to: "/blog", label: "Blog", icon: Newspaper },
  { to: "/stats", label: "Estadísticas", icon: BarChart3 },
  { to: "/pokedex", label: "Pokédex", icon: BookOpen },
  { to: "/bans", label: "Bans", icon: ShieldBan },
  { to: "/equipo", label: "Mi equipo", icon: Users },
] as const;

/** Barra inferior del móvil: 5 destinos con etiqueta corta (el Blog vive en la cabecera). */
const TAB_NAV = [
  { to: "/", label: "Inicio", icon: House, end: true },
  { to: "/stats", label: "Stats", icon: BarChart3 },
  { to: "/pokedex", label: "Pokédex", icon: BookOpen },
  { to: "/bans", label: "Bans", icon: ShieldBan },
  { to: "/equipo", label: "Equipo", icon: Users },
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

  // Con la portada ya pintada, el resto de secciones se descargan en reposo.
  useEffect(() => preloadWhenIdle(publicPages), []);

  return (
    <div className="min-h-svh">
      <a href="#contenido" className="sr-only rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70]">
        Saltar al contenido
      </a>
      <div ref={sentinel} aria-hidden className="absolute top-0 h-px w-px" />
      <TopBar scrolled={scrolled} />
      <OfflineNotice />
      <main id="contenido" className="mx-auto w-full max-w-6xl px-4 pt-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-16">
        <RouteOutlet />
      </main>
      <TabBar />
    </div>
  );
}

function TopBar({ scrolled }: { scrolled: boolean }) {
  const pill = usePillTransition();
  const onTab = useTabReselect();
  return (
    <header
      className={cn(
        "material-regular sticky top-0 z-40 pt-safe transition-shadow duration-300",
        scrolled ? "shadow-[0_1px_0_var(--separator)]" : "shadow-[0_1px_0_transparent]",
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <NavLink to="/" className="press flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="BATS, inicio">
          <span className="font-heading text-title3 tracking-tight">BATS</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-wider text-muted-foreground">
            Beta
          </span>
        </NavLink>

        <nav aria-label="Principal" className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map(({ to, label, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={"end" in rest}
              onClick={onTab(to)}
              className={({ isActive }) =>
                cn(
                  "press relative isolate rounded-full px-3.5 py-1.5 text-subhead font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="topnav-pill" transition={pill} className="absolute inset-0 -z-10 rounded-full bg-secondary" />}
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <NavLink to="/blog" aria-label="Blog" className="press grid size-11 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring md:hidden">
            <Newspaper className="size-5" />
          </NavLink>
          <GlobalSearch />
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
        <DropdownMenuGroup>
          <DropdownMenuLabel>Apariencia</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setPreference("light")}><Sun /> Claro</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPreference("dark")}><Moon /> Oscuro</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPreference("system")}><Monitor /> Sistema</DropdownMenuItem>
        </DropdownMenuGroup>
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
        <DropdownMenuGroup>
          <DropdownMenuLabel>{name}</DropdownMenuLabel>
          {me.data && <DropdownMenuItem onClick={() => navigate(`/j/${encodeURIComponent(me.data!.username)}`)}><UserRound /> Mi perfil</DropdownMenuItem>}
          {me.data?.is_admin && <DropdownMenuItem onClick={() => navigate("/admin/stats")}><ShieldCheck /> Administración</DropdownMenuItem>}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}><LogOut /> Salir</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Barra inferior del móvil: translúcida, con etiquetas siempre visibles y objetivos ≥ 44 pt. */
function TabBar() {
  const pill = usePillTransition();
  const onTab = useTabReselect();
  return (
    <nav
      aria-label="Principal"
      className="material-regular material-edge-top pb-safe fixed inset-x-0 bottom-0 z-40 md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 pt-1.5">
        {TAB_NAV.map(({ to, label, icon: Icon, ...rest }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={"end" in rest}
              onClick={onTab(to)}
              className={({ isActive }) =>
                cn(
                  "press relative isolate flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1 text-caption font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="tabbar-pill" transition={pill} className="absolute inset-x-0.5 inset-y-0 -z-10 rounded-2xl bg-primary/10" />}
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

/** El indicador de la pestaña activa se desliza con un resorte crítico; sin movimiento si se pide. */
function usePillTransition(): Transition {
  return useReducedMotion() ? { duration: 0 } : spring.snappy;
}

/** Como en iOS: tocar la pestaña en la que ya estás te lleva arriba del todo. */
function useTabReselect() {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  return (to: string) => () => {
    if (pathname === to) window.scrollTo({ top: 0, behavior: reduce ? "instant" : "smooth" });
  };
}
