import type { ExampleDataset } from "../dataset";
import { rngFor, gauss } from "@/components/tools/shared/stats";

export const exams: ExampleDataset = {
  id: "exams",
  name: "Class exam scores",
  description: "60 students across 3 sections — math, reading, writing scores. Use for ANOVA, box plots, t-tests.",
  source: "Synthetic, seeded",
  build: () => {
    const rng = rngFor(23);
    const headers = ["student", "section", "math", "reading", "writing"];
    const rows: (string | number)[][] = [];
    const sections = ["A", "B", "C"];
    const meansBySec: Record<string, [number, number, number]> = {
      A: [72, 78, 75], B: [68, 70, 71], C: [80, 76, 79],
    };
    for (let i = 1; i <= 60; i++) {
      const sec = sections[i % 3];
      const [mM, mR, mW] = meansBySec[sec];
      const m = Math.max(0, Math.min(100, gauss(rng, mM, 9)));
      const r = Math.max(0, Math.min(100, gauss(rng, mR, 8)));
      const w = Math.max(0, Math.min(100, gauss(rng, mW, 8.5)));
      rows.push([i, sec, Math.round(m), Math.round(r), Math.round(w)]);
    }
    return { headers, rows };
  },
};
