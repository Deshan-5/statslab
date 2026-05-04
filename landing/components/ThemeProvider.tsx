"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const KEY = "statslab_theme";

const ThemeCtx = createContext<{
  theme: Theme;
  resolved: Resolved;
  setTheme: (t: Theme) => void;
  cycle: () => void;
}>({ theme: "system", resolved: "light", setTheme: () => {}, cycle: () => {} });

function systemPref(): Resolved {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyHtmlClass(t: Resolved) {
  const html = document.documentElement;
  if (t === "dark") html.classList.add("dark");
  else html.classList.remove("dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<Resolved>("light");

  // Hydrate from localStorage. The anti-FOUC inline script in layout.tsx
  // sets the class before React hydrates; here we just sync state.
  useEffect(() => {
    let initial: Theme = "system";
    try {
      const stored = localStorage.getItem(KEY) as Theme | null;
      if (stored === "dark" || stored === "light" || stored === "system") initial = stored;
    } catch { /* ignore */ }
    setThemeState(initial);
    setResolved(initial === "system" ? systemPref() : initial);
  }, []);

  // Re-evaluate when theme or system preference changes.
  useEffect(() => {
    const r: Resolved = theme === "system" ? systemPref() : theme;
    setResolved(r);
    applyHtmlClass(r);

    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next: Resolved = mq.matches ? "dark" : "light";
      setResolved(next);
      applyHtmlClass(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
    setThemeState(t);
  }, []);

  const cycle = useCallback(() => {
    const order: Theme[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
  }, [theme, setTheme]);

  return (
    <ThemeCtx.Provider value={{ theme, resolved, setTheme, cycle }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}

/** Inline script that sets the html class before React hydrates, to prevent
 *  the brief "white flash" on dark-mode reload. */
export const themeInitScript = `
try {
  const k = "statslab_theme";
  const t = localStorage.getItem(k);
  const sys = matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = t === "dark" || (t === "system" && sys) || (!t && sys);
  if (dark) document.documentElement.classList.add("dark");
} catch (e) {}
`;
