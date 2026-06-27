import type { ExampleDataset } from "../dataset";
import { rngFor, gauss } from "@/components/tools/shared/stats";

export const heights: ExampleDataset = {
  id: "heights",
  name: "Heights & weights",
  description: "120 adults — height (cm) and weight (kg) with realistic ρ ≈ 0.78. Great for regression and correlation.",
  source: "Synthetic, seeded",
  build: () => {
    const rng = rngFor(42);
    const headers = ["sex", "height_cm", "weight_kg"];
    const rows: (string | number)[][] = [];
    for (let i = 0; i < 120; i++) {
      const female = rng() < 0.5;
      const muH = female ? 162 : 176;
      const muW = female ? 62 : 78;
      const h = gauss(rng, muH, 6.5);
      // weight correlated with height + sex baseline
      const w = muW + 0.85 * (h - muH) + gauss(rng, 0, 6);
      rows.push([female ? "F" : "M", Number(h.toFixed(1)), Number(w.toFixed(1))]);
    }
    return { headers, rows };
  },
};
