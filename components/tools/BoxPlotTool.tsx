"use client";

import { useMemo, useState } from "react";
import { parseNumbers, quantile, mean } from "./shared/stats";
import {
  Tabs, DataTextArea, SampleDataButton, Panel, Btn,
  useRegisterToolState,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const W = 720, H = 380, PAD = 40;

type Group = { name: string; raw: string };

const SAMPLES: Group[] = [
  { name: "A", raw: "62, 65, 68, 71, 73, 75, 78, 82, 85, 90, 95" },
  { name: "B", raw: "70, 72, 73, 73, 74, 75, 76, 76, 77, 79, 80" },
  { name: "C", raw: "55, 60, 62, 64, 66, 68, 70, 73, 78, 88, 105" },
];

function boxStats(arr: number[]) {
  const sorted = [...arr].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const med = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const inner = sorted.filter((v) => v >= lo && v <= hi);
  const out = sorted.filter((v) => v < lo || v > hi);
  return {
    q1, med, q3, iqr,
    whiskerLo: inner.length ? Math.min(...inner) : sorted[0],
    whiskerHi: inner.length ? Math.max(...inner) : sorted[sorted.length - 1],
    outliers: out,
    mean: mean(arr),
    n: arr.length,
  };
}

type GroupStats = ReturnType<typeof boxStats> & { name: string; data: number[]; rowsByValue?: number[] };

export default function BoxPlotTool() {
  const { dataset, selection, setSelection, isSelected } = useWorkspace();

  const [tab, setTab] = useState<string>(dataset ? "Workspace" : "Your Data");
  const [groups, setGroups] = useState<Group[]>(SAMPLES);
  const [strip, setStrip] = useState(true);
  const [valueCol, setValueCol] = useState<string | null>(null);
  const [groupCol, setGroupCol] = useState<string | null>(null);

  const onBoxClick = (rows: number[] | undefined) => {
    if (tab !== "Workspace" || !rows || rows.length === 0) return;
    // Toggle: if this group's rows already match the current selection, clear it.
    if (selection && selection.size === rows.length && rows.every((r) => selection.has(r))) {
      setSelection(null);
    } else {
      setSelection(new Set(rows));
    }
  };

  const groupIsSelected = (rows: number[] | undefined) => {
    if (!selection || !rows || rows.length === 0) return false;
    return selection.size === rows.length && rows.every((r) => selection.has(r));
  };

  const wsStats: GroupStats[] = useMemo(() => {
    if (!dataset || !valueCol) return [];
    const vCol = dataset.columns.find((c) => c.name === valueCol);
    if (!vCol) return [];
    const gCol = groupCol ? dataset.columns.find((c) => c.name === groupCol) : null;
    const buckets = new Map<string, { vals: number[]; rows: number[] }>();
    for (let i = 0; i < dataset.rows.length; i++) {
      const v = vCol.values[i];
      const num = typeof v === "number" ? v : Number(v);
      if (v === null || isNaN(num)) continue;
      const key = gCol ? String(gCol.values[i] ?? "—") : valueCol;
      let b = buckets.get(key);
      if (!b) { b = { vals: [], rows: [] }; buckets.set(key, b); }
      b.vals.push(num);
      b.rows.push(i);
    }
    return Array.from(buckets.entries())
      .filter(([, b]) => b.vals.length > 0)
      .map(([name, b]) => ({ name, data: b.vals, rowsByValue: b.rows, ...boxStats(b.vals) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dataset, valueCol, groupCol]);

  const manualStats: GroupStats[] = useMemo(() =>
    groups
      .map((g) => ({ name: g.name, data: parseNumbers(g.raw) ?? [] }))
      .filter((g) => g.data.length > 0)
      .map((g) => ({ ...g, ...boxStats(g.data) })),
    [groups],
  );

  const stats = tab === "Workspace" ? wsStats : manualStats;

  const all = stats.flatMap((s) => s.data);
  const yMin = all.length ? Math.min(...all) - 1 : 0;
  const yMax = all.length ? Math.max(...all) + 1 : 10;
  const slot = (W - 2 * PAD) / Math.max(1, stats.length);
  const sx = (i: number) => PAD + (i + 0.5) * slot;
  const sy = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin || 1)) * (H - 2 * PAD);
  const boxW = slot * 0.45;

  const tabs = dataset ? ["Workspace", "Your Data"] : ["Your Data"];

  useRegisterToolState("box-plot", { tab, strip, valueCol, groupCol }, { tab: setTab, strip: setStrip, valueCol: setValueCol, groupCol: setGroupCol });
  return (
    <div className="space-y-6">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
        <Panel>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              {[0.2, 0.4, 0.6, 0.8].map((f, i) => {
                const v = yMin + (yMax - yMin) * f;
                return (
                  <g key={i}>
                    <line x1={PAD} y1={sy(v)} x2={W - PAD} y2={sy(v)} stroke="var(--chart-grid)" />
                    <text x={PAD - 8} y={sy(v) + 4} textAnchor="end" fontSize="10" fill="var(--chart-muted)">{v.toFixed(1)}</text>
                  </g>
                );
              })}
              {stats.map((s, i) => {
                const boxSel = tab === "Workspace" && groupIsSelected(s.rowsByValue);
                const boxClickable = tab === "Workspace" && !!s.rowsByValue && s.rowsByValue.length > 0;
                return (
                <g key={s.name}>
                  <line x1={sx(i)} y1={sy(s.whiskerLo)} x2={sx(i)} y2={sy(s.whiskerHi)} stroke="var(--chart-ink)" strokeWidth={1} />
                  <line x1={sx(i) - boxW / 4} y1={sy(s.whiskerLo)} x2={sx(i) + boxW / 4} y2={sy(s.whiskerLo)} stroke="var(--chart-ink)" />
                  <line x1={sx(i) - boxW / 4} y1={sy(s.whiskerHi)} x2={sx(i) + boxW / 4} y2={sy(s.whiskerHi)} stroke="var(--chart-ink)" />
                  <rect x={sx(i) - boxW / 2} y={sy(s.q3)} width={boxW} height={sy(s.q1) - sy(s.q3)}
                        fill="var(--chart-bg)"
                        stroke={boxSel ? "#fb923c" : "var(--chart-ink)"}
                        strokeWidth={boxSel ? 2 : 1.5} rx={2}
                        style={boxClickable ? { cursor: "pointer" } : undefined}
                        onClick={boxClickable ? () => onBoxClick(s.rowsByValue) : undefined} />
                  <line x1={sx(i) - boxW / 2} y1={sy(s.med)} x2={sx(i) + boxW / 2} y2={sy(s.med)} stroke="#fb923c" strokeWidth={2.5} />
                  <circle cx={sx(i)} cy={sy(s.mean)} r={3} fill="#fb923c" stroke="#fff" strokeWidth={1} />
                  {s.outliers.map((o, k) => (
                    <circle key={k} cx={sx(i)} cy={sy(o)} r={2.5} fill="#dc2626" fillOpacity={0.7} />
                  ))}
                  {strip && s.data.map((v, k) => {
                    const row = s.rowsByValue?.[k];
                    const sel = row !== undefined && isSelected(row);
                    // Deterministic jitter — stable across renders, no jank.
                    const j = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
                    const jitter = ((j - Math.floor(j)) - 0.5) * boxW * 0.9;
                    return (
                      <circle key={`s${k}`}
                        cx={sx(i) + jitter}
                        cy={sy(v)}
                        r={sel ? 3 : 1.6}
                        fill={sel ? "#fb923c" : "var(--chart-ink)"}
                        fillOpacity={sel ? 0.95 : 0.35} />
                    );
                  })}
                    {(() => {
                      const isRotated = stats.length > 5 || stats.some(s => s.name.length > 8);
                      const displayVal = s.name.length > 15 ? s.name.slice(0, 13) + "..." : s.name;
                      const tx = sx(i);
                      const ty = H - PAD + 18;
                      return (
                        <text
                          x={tx}
                          y={ty}
                          textAnchor={isRotated ? "end" : "middle"}
                          fontSize="10"
                          fill="var(--chart-muted)"
                          transform={isRotated ? `rotate(-25, ${tx}, ${ty})` : undefined}
                        >
                          {displayVal}
                        </text>
                      );
                    })()}
                  </g>
                );
              })}
              {!stats.length && (
                <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="var(--chart-muted)">
                  {tab === "Workspace" ? "Pick a numeric column →" : "Add a group with data →"}
                </text>
              )}
            </svg>
          </Panel>
        </div>
        <Panel className="space-y-5">
          {tab === "Workspace" && dataset && (
            <>
              <ColumnPicker label="Value (numeric)" value={valueCol} onChange={setValueCol} kind="numeric" />
              <ColumnPicker label="Group by (optional)" value={groupCol} onChange={setGroupCol} kind="categorical" autoPick={false} />
            </>
          )}
          {tab === "Your Data" && groups.map((g, i) => (
            <div key={i} className="space-y-2 pb-3 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
              <div className="flex items-center justify-between">
                <input value={g.name}
                       onChange={(e) => setGroups(groups.map((x, k) => k === i ? { ...x, name: e.target.value } : x))}
                       className="text-sm font-medium bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-neutral-700 focus:border-neutral-500 focus:outline-none px-1 py-0.5" />
                {groups.length > 1 && (
                  <button onClick={() => setGroups(groups.filter((_, k) => k !== i))} className="text-xs text-neutral-400 hover:text-red-600">×</button>
                )}
              </div>
              <DataTextArea label="" value={g.raw}
                onChange={(v) => setGroups(groups.map((x, k) => k === i ? { ...x, raw: v } : x))}
                rows={2} />
            </div>
          ))}
          {tab === "Your Data" && (
            <div className="flex gap-2">
              <Btn onClick={() => setGroups([...groups, { name: `Group ${groups.length + 1}`, raw: "" }])}>+ Add group</Btn>
              <SampleDataButton onClick={() => setGroups(SAMPLES)} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input type="checkbox" checked={strip} onChange={(e) => setStrip(e.target.checked)} />
            Strip plot overlay
          </label>
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Box stats</div>
            <table className="w-full text-xs font-mono">
              <thead><tr className="text-neutral-400"><th className="text-left">Group</th><th>Q1</th><th>Med</th><th>Q3</th><th>IQR</th><th>Out</th></tr></thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.name} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-1">{s.name}</td>
                    <td className="text-center">{s.q1.toFixed(1)}</td>
                    <td className="text-center">{s.med.toFixed(1)}</td>
                    <td className="text-center">{s.q3.toFixed(1)}</td>
                    <td className="text-center">{s.iqr.toFixed(1)}</td>
                    <td className="text-center">{s.outliers.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
