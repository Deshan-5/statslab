"use client";

import { useEffect } from "react";
import { Hash, Type } from "lucide-react";
import { useWorkspace } from "./WorkspaceProvider";

type Props = {
  label: string;
  value: string | null;
  onChange: (col: string | null) => void;
  kind?: "numeric" | "categorical" | "any";
  /** Auto-pick the first matching column when value is null. Default true. */
  autoPick?: boolean;
};

export default function ColumnPicker({
  label, value, onChange, kind = "numeric", autoPick = true,
}: Props) {
  const { dataset, numericColumns, categoricalColumns } = useWorkspace();
  const cols =
    kind === "numeric" ? numericColumns :
    kind === "categorical" ? categoricalColumns :
    dataset?.columns ?? [];

  useEffect(() => {
    if (!autoPick) return;
    if (!cols.length) return;
    if (value && cols.some((c) => c.name === value)) return;
    onChange(cols[0].name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.id, cols.length]);

  if (!dataset) return null;

  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">{label}</div>
      <div className="relative">
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full appearance-none rounded-lg border border-neutral-300 dark:border-neutral-700 pl-8 pr-8 py-2 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500"
        >
          <option value="">— none —</option>
          {cols.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center">
          {kind === "categorical"
            ? <Type className="w-3.5 h-3.5 text-emerald-500" />
            : <Hash className="w-3.5 h-3.5 text-blue-500" />}
        </span>
      </div>
    </label>
  );
}
