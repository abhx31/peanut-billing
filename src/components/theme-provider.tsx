"use client";

import * as React from "react";

type Mode = "light" | "dark" | "system";

type Ctx = {
  theme: Mode;
  resolvedTheme: "light" | "dark";
  setTheme: (m: Mode) => void;
};

const ThemeContext = React.createContext<Ctx | undefined>(undefined);
const STORAGE_KEY = "theme";

function readStored(): Mode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

function systemPref(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(resolved: "light" | "dark") {
  const el = document.documentElement;
  el.classList.toggle("dark", resolved === "dark");
  el.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy state so the first render matches whatever the inline <head> script
  // already applied — no hydration mismatch, no flash.
  const [theme, setThemeState] = React.useState<Mode>(() =>
    typeof window === "undefined" ? "system" : readStored(),
  );
  const [sys, setSys] = React.useState<"light" | "dark">(() =>
    typeof window === "undefined" ? "light" : systemPref(),
  );

  // Keep the system-preference snapshot in sync when the OS toggles.
  React.useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSys(e.matches ? "dark" : "light");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const resolvedTheme = theme === "system" ? sys : theme;

  // Apply class/colorScheme whenever the resolved value changes.
  React.useEffect(() => {
    apply(resolvedTheme);
  }, [resolvedTheme]);

  // Sync across tabs.
  React.useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const v = e.newValue;
      if (v === "light" || v === "dark" || v === "system") setThemeState(v);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setTheme = React.useCallback((m: Mode) => {
    setThemeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  const value = React.useMemo<Ctx>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    // Fallback so components don't crash if used outside the provider.
    return {
      theme: "system",
      resolvedTheme: "light",
      setTheme: () => {},
    };
  }
  return ctx;
}
