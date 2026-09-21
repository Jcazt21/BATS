import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ThemeContext, applyTheme, readPreference, resolveDark, storePreference, type ThemePreference,
} from "@/lib/theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);

  const setPreference = useCallback((pref: ThemePreference) => {
    storePreference(pref);
    setPreferenceState(pref);
    applyTheme(resolveDark(pref), true);
  }, []);

  // Con "Sistema", seguir los cambios del SO en vivo.
  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(mq.matches, true);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
