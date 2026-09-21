import { createContext, useContext } from "react";

export type ThemePreference = "system" | "light" | "dark";

const KEY = "bats-theme";

export function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function storePreference(pref: ThemePreference): void {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* modo privado o almacenamiento bloqueado: el tema sigue funcionando sin persistir */
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveDark(pref: ThemePreference): boolean {
  return pref === "dark" || (pref === "system" && systemPrefersDark());
}

/**
 * Aplica el tema al <html>. El cambio se suaviza con un fundido breve (no un salto de
 * brillo), salvo que el usuario pida menos movimiento.
 */
export function applyTheme(dark: boolean, animate: boolean): void {
  const root = document.documentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (animate && !reduce) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 320);
  }
  root.classList.toggle("dark", dark);
}

export interface ThemeState {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeState>({ preference: "system", setPreference: () => {} });

export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}
