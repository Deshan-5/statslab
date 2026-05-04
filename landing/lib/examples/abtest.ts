import type { ExampleDataset } from "../dataset";
import { rngFor } from "@/components/tools/shared/stats";

export const abtest: ExampleDataset = {
  id: "abtest",
  name: "A/B test results",
  description: "400 users split into control and treatment with a true 4-point lift. Use for hypothesis tests and proportions.",
  source: "Synthetic, seeded",
  build: () => {
    const rng = rngFor(7);
    const headers = ["user_id", "variant", "converted", "session_minutes"];
    const rows: (string | number)[][] = [];
    for (let i = 1; i <= 400; i++) {
      const treat = rng() < 0.5;
      const pConv = treat ? 0.18 : 0.14;
      const conv = rng() < pConv ? 1 : 0;
      const mins = Math.max(0.5, -Math.log(Math.max(rng(), 1e-9)) * (treat ? 6.2 : 5.4));
      rows.push([i, treat ? "treatment" : "control", conv, Number(mins.toFixed(2))]);
    }
    return { headers, rows };
  },
};
