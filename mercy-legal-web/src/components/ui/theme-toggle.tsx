"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark";

function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
  window.localStorage.setItem("mercy-theme", mode);
}

export function ThemeToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem("mercy-theme");
    const preferred =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setMode(preferred);
    applyTheme(preferred);
  }, []);

  function toggle() {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border border-[var(--mercy-border)] bg-[var(--mercy-card)] text-[var(--mercy-fg-muted)] transition hover:bg-[var(--mercy-secondary)] hover:text-[var(--mercy-fg-strong)]",
        compact ? "size-9" : "h-9 px-3 text-xs font-medium",
        className,
      )}
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={mode === "dark" ? "Light mode" : "Dark mode"}
    >
      {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {!compact ? <span>{mode === "dark" ? "Light" : "Dark"}</span> : null}
    </button>
  );
}
