"use client";

import { useMemo, useState } from "react";
import {
  parseNumbers, mean, sd, sem, oneWayANOVA, tCrit,
} from "./shared/stats";
import {
  Tabs, DataTextArea, Select, SampleDataButton, Panel, Btn, Verdict, Interpretation,
  useRegisterToolState,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const W = 720, H = 320, PAD = 40;
const COLORS = ["#6366f1", "#fb923c", "#0ea5e9", "#16a34a", "#a855f7", "#dc2626"];

type Group = { name: string; raw: string };
const SAMPLES = [
  { name: "Control", raw: "5.0, 4.8, 5.2, 4.9, 5.1, 4.7, 5.3, 4.6" },
  { name: "Drug A",  raw: "5.5, 5.7, 5.6, 5.9, 5.4, 5.8, 5.6, 5.7" },
  { name: "Drug B",  raw: "5.1, 5.0, 5.3, 4.9, 5.2, 5.0, 5.1, 4.8" },
];

export default function BarChartTool() {
  const { dataset } = useWorkspace();
  const [tab, setTab] = useState(dataset ? "Workspace" : "Your Data");
  const [groups, setGroups] = useState<Group[]>(() => SAMPLES.map((g) => ({ ...g })));
  const [errBars, setErrBars] = useState<"sem" | "sd" | "ci">("sem");
  const [sortBy, setSortBy] = useState<"name" | "value">("name");
  const [valueCol, setValueCol] = useState<string | null>(null);
  const [groupCol, setGroupCol] = useState<string | null>(null);

  useRegisterToolState("bar-chart", { tab, errBars, sortBy, valueCol, groupCol }, { tab: setTab, errBars: setErrBars, sortBy: setSortBy, valueCol: setValueCol, groupCol: setGroupCol });
  const wsValid = useMemo(() => {
    if (!dataset || !valueCol) return [];
    const v = dataset.columns.find((c) => c.name === valueCol);
    if (!v) return [];
    const g = groupCol ? dataset.columns.find((c) => c.name === groupCol) : null;
    const buckets = new Map<string, number[]>();
    for (let i = 0; i < dataset.rows.length; i++) {
      const raw = v.values[i];
      const num = typeof raw === "number" ? raw : Number(raw);
      if (raw === null || isNaN(num)) continue;
      const key = g ? String(g.values[i] ?? "—") : valueCol;
      const arr = buckets.get(key) ?? [];
      arr.push(num);
      buckets.set(key, arr);
    }
    return Array.from(buckets.entries())
      .map(([name, data]) => ({ name, data }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dataset, valueCol, groupCol]);

  const manualValid = useMemo(() =>
    groups.map((g) => ({ name: g.name, data: parseNumbers(g.raw) ?? [] }))
          .filter((g) => g.data.length > 0),
    [groups],
  );

  const valid = tab === "Workspace" ? wsValid : manualValid;

  const stats = valid.map((g) => {
    const m = mean(g.data);
    const s = g.data.length > 1 ? sd(g.data) : 0;
    const seVal = g.data.length > 1 ? sem(g.data) : 0;
    const tStar = g.data.length > 1 ? tCrit(0.05, g.data.length - 1) : 0;
    return { name: g.name, n: g.data.length, mean: m, sd: s, sem: seVal, ci: tStar * seVal };
  });

  const sorted = [...stats].sort((a, b) => sortBy === "name" ? a.name.localeCompare(b.name) : b.mean - a.mean);
  const anova = valid.length >= 2 ? oneWayANOVA(valid.map((v) => v.data), 0.05) : null;

  const interpretation = useMemo(() => {
    if (sorted.length === 0) return null;
    if (sorted.length === 1) {
      const g = sorted[0];
      return `Mean of ${g.name} is ${g.mean.toFixed(2)} (n=${g.n}, SD=${g.sd.toFixed(2)}). Add another group to compare.`;
    }
    const hi = sorted.reduce((a, b) => (b.mean > a.mean ? b : a));
    const lo = sorted.reduce((a, b) => (b.mean < a.mean ? b : a));
    const gap = hi.mean - lo.mean;
    let txt = `Mean of ${hi.name} is highest at ${hi.mean.toFixed(2)} (n=${hi.n}); ${lo.name} is lowest at ${lo.mean.toFixed(2)} (n=${lo.n}) — a gap of ${gap.toFixed(2)}.`;
    if (anova) {
      const verdict = anova.reject
        ? `the difference is statistically significant at α=0.05`
        : `we cannot reject equal means at α=0.05`;
      txt += ` ANOVA F=${anova.testStat.toFixed(2)}, p=${anova.pValue.toFixed(4)} — ${verdict}.`;
    }
    return txt;
  }, [sorted, anova]);

  const yMax = Math.max(1, ...sorted.map((s) => s.mean + (errBars === "ci" ? s.ci : errBars === "sd" ? s.sd : s.sem))) * 1.1;
  const sx = (i: number) => PAD + (i + 0.5) * ((W - 2 * PAD) / Math.max(1, sorted.length));
  const sy = (v: number) => H - PAD - (v / yMax) * (H - 2 * PAD);
  const barW = ((W - 2 * PAD) / Math.max(1, sorted.length)) * 0.55;

  function setGroup(i: number, patch: Partial<Group>) {
    setGroups(groups.map((g, k) => k === i ? { ...g, ...patch } : g));
  }

  const tabs = dataset ? ["Workspace", "Your Data"] : ["Your Data"];

  return (
    <div className="space-y-6">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Panel>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-axis)" />
              {sorted.map((g, i) => {
                const err = errBars === "ci" ? g.ci : errBars === "sd" ? g.sd : g.sem;
                const top = sy(g.mean);
                return (
                  <g key={g.name}>
                    <rect x={sx(i) - barW / 2} y={top} width={barW} height={H - PAD - top}
                          fill={COLORS[i % COLORS.length]} fillOpacity={0.85} rx={3}
                          style={{ transition: "y 0.3s, height 0.3s" }} />
                    <line x1={sx(i)} y1={sy(g.mean - err)} x2={sx(i)} y2={sy(g.mean + err)} stroke="var(--chart-muted)" strokeWidth={1.5} />
                    <line x1={sx(i) - 8} y1={sy(g.mean + err)} x2={sx(i) + 8} y2={sy(g.mean + err)} stroke="var(--chart-muted)" strokeWidth={1.5} />
                    <line x1={sx(i) - 8} y1={sy(g.mean - err)} x2={sx(i) + 8} y2={sy(g.mean - err)} stroke="var(--chart-muted)" strokeWidth={1.5} />
                    {(() => {
                      const isRotated = sorted.length > 5 || sorted.some(s => s.name.length > 8);
                      const displayVal = g.name.length > 15 ? g.name.slice(0, 13) + "..." : g.name;
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
                    <text x={sx(i)} y={top - 8} textAnchor="middle" fontSize="10" fill="var(--chart-ink)" fontWeight={500}>{g.mean.toFixed(2)}</text>
                  </g>
                );
              })}
              {!sorted.length && (
                <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="var(--chart-muted)">
                  {tab === "Workspace" ? "Pick a numeric column →" : "Add a group →"}
                </text>
              )}
            </svg>
          </Panel>
          {anova && (
            <Panel>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs uppercase tracking-wider text-neutral-500">One-way ANOVA</div>
                  <div className="font-mono text-sm mt-1">
                    F = {anova.testStat.toFixed(3)} · df = {anova.df}, {valid.flatMap((v) => v.data).length - valid.length} · p = {anova.pValue.toFixed(4)}
                  </div>
                </div>
                <Verdict reject={anova.reject} pValue={anova.pValue} alpha={0.05} />
              </div>
            </Panel>
          )}
          <Interpretation text={interpretation} />
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
                <input value={g.name} onChange={(e) => setGroup(i, { name: e.target.value })}
                       className="text-sm font-medium bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-neutral-700 focus:border-neutral-500 focus:outline-none px-1 py-0.5" />
                {groups.length > 1 && (
                  <button onClick={() => setGroups(groups.filter((_, k) => k !== i))} className="text-xs text-neutral-400 hover:text-red-600">×</button>
                )}
              </div>
              <DataTextArea label="" value={g.raw} onChange={(v) => setGroup(i, { raw: v })} rows={2} placeholder="comma-separated…" />
            </div>
          ))}
          {tab === "Your Data" && (
            <div className="flex gap-2">
              <Btn onClick={() => setGroups([...groups, { name: `Group ${groups.length + 1}`, raw: "" }])}>+ Add group</Btn>
              <SampleDataButton onClick={() => setGroups(SAMPLES.map((g) => ({ ...g })))} />
            </div>
          )}
          <Select label="Error bars" value={errBars} onChange={(v) => setErrBars(v as typeof errBars)}
            options={[{ value: "sem", label: "± SEM" }, { value: "sd", label: "± SD" }, { value: "ci", label: "95% CI" }]} />
          <Select label="Sort by" value={sortBy} onChange={(v) => setSortBy(v as typeof sortBy)}
            options={[{ value: "name", label: "Name" }, { value: "value", label: "Value" }]} />
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Per-group stats</div>
            <table className="w-full text-xs font-mono">
              <thead><tr className="text-neutral-400"><th className="text-left">Group</th><th>n</th><th>μ</th><th>SD</th></tr></thead>
              <tbody>
                {sorted.map((s) => (
                  <tr key={s.name} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-1">{s.name}</td>
                    <td className="text-center">{s.n}</td>
                    <td className="text-center">{s.mean.toFixed(2)}</td>
                    <td className="text-center">{s.sd.toFixed(2)}</td>
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
