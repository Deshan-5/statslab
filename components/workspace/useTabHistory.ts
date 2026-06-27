"use client";

import { useEffect, useState, useCallback } from "react";
import { findTool, type Tool } from "@/lib/tools";

const SESSION_KEY = "statslab:tab-history";
const MAX_TABS = 8;

interface TabEntry {
  id: string;
  lastAccessed: number;
}

function readEntries(): TabEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as TabEntry[]) : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: TabEntry[]): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(entries));
}

export function useTabHistory(activeToolId: string | null) {
  const [entries, setEntries] = useState<TabEntry[]>(readEntries);

  // Push/update active tool whenever it changes
  useEffect(() => {
    if (!activeToolId) return;
    setEntries((prev) => {
      const now = Date.now();
      const alreadyOpen = prev.some((e) => e.id === activeToolId);

      if (alreadyOpen) {
        // Already a tab — just bump lastAccessed, keep position
        const next = prev.map((e) =>
          e.id === activeToolId ? { ...e, lastAccessed: now } : e
        );
        writeEntries(next);
        return next;
      }

      // New tab: append to the right
      let next = [...prev, { id: activeToolId, lastAccessed: now }];

      // Evict least-recently-accessed non-active tab when over limit
      if (next.length > MAX_TABS) {
        const lru = next
          .filter((e) => e.id !== activeToolId)
          .reduce((min, e) => (e.lastAccessed < min.lastAccessed ? e : min));
        next = next.filter((e) => e.id !== lru.id);
      }

      writeEntries(next);
      return next;
    });
  }, [activeToolId]);

  const closeTab = useCallback((toolId: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== toolId);
      writeEntries(next);
      return next;
    });
  }, []);

  const tabs: (Tool & { isActive: boolean })[] = entries
    .map((e) => {
      const t = findTool(e.id);
      return t ? { ...t, isActive: e.id === activeToolId } : null;
    })
    .filter((t): t is Tool & { isActive: boolean } => t !== null);

  return { tabs, closeTab };
}
