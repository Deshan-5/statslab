"use client";

import { useMemo, useState } from "react";
import { parseNumbers, mean, sd, median, kde, silvermanBandwidth, quantile, skewness } from "./shared/stats";
import {
  Tabs, Field, DataTextArea, SampleDataButton, Panel, Btn,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const W = 720, H = 380, PAD = 40;

type Group = { name: string; raw: string };
const SAMPLES: Group[] = [
  { name: "Pre",  raw: "62, 65, 68, 70, 71, 72, 73, 74, 75, 76, 77, 78, 80, 82" },
  { name: "Mid",  raw: "55, 60, 65, 68, 70, 72, 75, 77, 78, 80, 82, 85, 88, 90" },
  { name: "Post", raw: "70, 72, 73, 73, 74, 75, 76, 76, 77, 78, 79, 80, 82, 85" },
];

export default function ViolinTool() {
  const { dataset, isSelected } = useWorkspace();
  const [tab, setTab] = useState(dataset ? "Workspace" : "Your Data");
  const [groups, setGroups] = useState<Group[]>(SAMPLES);
  const [bwMul, setBwMul] = useState(1);
  const [showPoints, setShowPoints] = useState(true);
  const [showBox, setShowBox] = useState(true);
  const [showMean, setShowMean] = useState(true);
  const [valueCol, setValueCol] = useState<string | null>(null);
  const [groupCol, setGroupCol] = useState<string | null>(null);

  const wsParsed = useMemo(() => {
    if (!dataset || !valueCol) return [];
    const v = dataset.columns.find((c) => c.name === valueCol);
    if (!v) return [];
    const g = groupCol ? dataset.columns.find((c) => c.name === groupCol) : null;
    const buckets = new Map<string, { vals: number[]; rows: number[] }>();
    for (let i = 0; i < dataset.rows.length; i++) {
      const raw = v.values[i];
      const num = typeof raw === "number" ? raw : Number(raw);
      if (raw === null || isNaN(num)) continue;
      const key = g ? String(g.values[i] ?? "—") : valueCol;
      let b = buckets.get(key);
      if (!b) { b = { vals: [], rows: [] }; buckets.set(key, b); }
      b.vals.push(num); b.rows.push(i);
    }
    return Array.from(buckets.entries())
      .filter(([, b]) => b.vals.length >= 2)
      .map(([name, b]) => ({ name, data: b.vals, rows: b.rows }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dataset, valueCol, groupCol]);

  const manualParsed = useMemo(() =>
    groups.map((g) => ({ name: g.name, data: parseNumbers(g.raw) ?? [], rows: undefined as number[] | undefined }))
          .filter((g) => g.data.length >= 2),
    [groups],
  );

  const parsed = tab === "Workspace" ? wsParsed : manualParsed;

  const all = parsed.flatMap((g) => g.data);
  const yMin = all.length ? Math.min(...all) - 1 : 0;
  const yMax = all.length ? Math.max(...all) + 1 : 10;

  const xs = Array.from({ length: 80 }, (_, i) => yMin + ((yMax - yMin) * i) / 79);
  const violins = parsed.map((g) => {
    const h = silvermanBandwidth(g.data) * bwMul;
    return kde(g.data, xs, h || 1);
  });
  const maxDens = Math.max(0.001, ...violins.flat());
  const slot = (W - 2 * PAD) / Math.max(1, parsed.length);
  const violinW = slot * 0.4;
  const sx = (i: number) => PAD + (i + 0.5) * slot;
  const sy = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin || 1)) * (H - 2 * PAD);

  const interpretation = useMemo(() => {
    if (parsed.length === 0) return null;
    const desc = parsed.map((g) => {
      const sk = g.data.length >= 3 ? skewness(g.data) : 0;
      const med = median(g.data);
      let shape: string;
      if (Math.abs(sk) < 0.3) shape = "approximately symmetric";
      else if (sk >= 0.3 && sk < 1) shape = "moderately right-skewed";
      else if (sk >= 1) shape = "strongly right-skewed";
      else if (sk > -1) shape = "moderately left-skewed";
      else shape = "strongly left-skewed";
      return `${g.name} is ${shape} (skew=${sk.toFixed(2)}); median ${med.toFixed(2)}`;
    });
    return `Distribution of ${desc.join(". ")}.`;
  }, [parsed]);

  const tabs = dataset ? ["Workspace", "Your Data"] : ["Your Data"];

  return (
    <div className="space-y-6">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
                const v = yMin + (yMax - yMin) * f;
                return (
                  <g key={i}>
                    <line x1={PAD} y1={sy(v)} x2={W - PAD} y2={sy(v)} stroke="var(--chart-grid)" />
                    <text x={PAD - 8} y={sy(v) + 4} textAnchor="end" fontSize="10" fill="var(--chart-muted)">{v.toFixed(1)}</text>
                  </g>
                );
              })}
              {parsed.map((g, i) => {
                const dens = violins[i];
                const right = xs.map((x, k) => `${k === 0 ? "M" : "L"}${(sx(i) + (dens[k] / maxDens) * violinW).toFixed(2)},${sy(x).toFixed(2)}`).join(" ");
                const left = xs.slice().reverse().map((x, k) => {
                  const idx = xs.length - 1 - k;
                  return `L${(sx(i) - (dens[idx] / maxDens) * violinW).toFixed(2)},${sy(x).toFixed(2)}`;
                }).join(" ");
                const sorted = [...g.data].sort((a, b) => a - b);
                const q1 = quantile(sorted, 0.25);
                const med = median(g.data);
                const q3 = quantile(sorted, 0.75);
                const m = mean(g.data);
                return (
                  <g key={g.name}>
                    <path d={`${right} ${left} Z`} fill="#fbbf24" fillOpacity={0.18} stroke="#fb923c" strokeWidth={1.2} />
                    {showBox && (
                      <>
                        <line x1={sx(i)} y1={sy(q1)} x2={sx(i)} y2={sy(q3)} stroke="var(--chart-ink)" strokeWidth={5} />
                        <circle cx={sx(i)} cy={sy(med)} r={3.5} fill="var(--chart-bg)" stroke="var(--chart-ink)" strokeWidth={1.5} />
                      </>
                    )}
                    {showMean && (
                      <circle cx={sx(i)} cy={sy(m)} r={4} fill="#fb923c" stroke="#fff" strokeWidth={1.5} />
                    )}
                    {showPoints && g.data.map((v, k) => {
                      const row = (g as { rows?: number[] }).rows?.[k];
                      const sel = row !== undefined && isSelected(row);
                      const j = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
                      const jitter = ((j - Math.floor(j)) - 0.5) * violinW * 0.7;
                      return (
                        <circle key={k}
                          cx={sx(i) + jitter}
                          cy={sy(v)}
                          r={sel ? 3 : 1.6}
                          fill={sel ? "#fb923c" : "var(--chart-ink)"}
                          fillOpacity={sel ? 0.95 : 0.4} />
                      );
                    })}
                    <text x={sx(i)} y={H - PAD + 18} textAnchor="middle" fontSize="11" fill="var(--chart-muted)">{g.name}</text>
                  </g>
                );
              })}
              {!parsed.length && (
                <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="var(--chart-muted)">
                  {tab === "Workspace" ? "Pick a numeric column →" : "Add data →"}
                </text>
              )}
            </svg>
          </Panel>
          {interpretation && (
            <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
                Interpretation
              </div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                {interpretation}
              </p>
            </div>
          )}
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
          <Field label="Bandwidth ×" value={bwMul.toFixed(2)}>
            <input type="range" min={0.3} max={3} step={0.05} value={bwMul} onChange={(e) => setBwMul(Number(e.target.value))} className="w-full" />
          </Field>
          <div className="space-y-1">
            <Toggle label="Show points" value={showPoints} onChange={setShowPoints} />
            <Toggle label="Show box plot" value={showBox} onChange={setShowBox} />
            <Toggle label="Show mean" value={showMean} onChange={setShowMean} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Per-group</div>
            <table className="w-full text-xs font-mono">
              <thead><tr className="text-neutral-400"><th className="text-left">Group</th><th>n</th><th>μ</th><th>median</th><th>SD</th></tr></thead>
              <tbody>
                {parsed.map((g) => (
                  <tr key={g.name} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-1">{g.name}</td>
                    <td className="text-center">{g.data.length}</td>
                    <td className="text-center">{mean(g.data).toFixed(2)}</td>
                    <td className="text-center">{median(g.data).toFixed(2)}</td>
                    <td className="text-center">{sd(g.data).toFixed(2)}</td>
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

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
