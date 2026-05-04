"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "./ThemeProvider";

const LABEL = { light: "Light", dark: "Dark", system: "System" } as const;

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, cycle } = useTheme();
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <button
      onClick={cycle}
      title={`Theme: ${LABEL[theme]} (click to cycle)`}
      aria-label={`Theme: ${LABEL[theme]}. Click to change.`}
      className={`inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
        compact ? "p-2" : "px-3 py-1.5 text-sm"
      }`}
    >
      <Icon className="w-4 h-4" />
      {!compact && <span className="hidden md:inline">{LABEL[theme]}</span>}
    </button>
  );
}
