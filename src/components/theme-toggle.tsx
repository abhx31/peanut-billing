"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

// subscribe is a no-op — we only need the browser-side snapshot to differ from
// the SSR snapshot so React re-renders once hydrated.
const subscribe = () => () => {};
const useIsMounted = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const mounted = useIsMounted();

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle theme">
        <Sun className="h-4 w-4" />
      </Button>
    );
  }
  const isDark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
