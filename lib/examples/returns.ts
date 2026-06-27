import type { ExampleDataset } from "../dataset";
import { rngFor, gauss } from "@/components/tools/shared/stats";

export const returns: ExampleDataset = {
  id: "returns",
  name: "Daily stock returns",
  description: "252 days of log-returns (one trading year) with mild AR(1) persistence. Try Q-Q against Normal — fat tails.",
  source: "Synthetic, seeded",
  build: () => {
    const rng = rngFor(11);
    const headers = ["day", "log_return"];
    const rows: (string | number)[][] = [];
    let r = 0;
    for (let i = 1; i <= 252; i++) {
      // AR(1) with t-distributed innovations (fat tails) approximated via mixture
      const heavy = rng() < 0.05;
      const eps = gauss(rng, 0, heavy ? 0.04 : 0.012);
      r = 0.08 * r + eps;
      rows.push([i, Number(r.toFixed(5))]);
    }
    return { headers, rows };
  },
};
