import { mean, sd, median, quantile, ols } from "@/components/tools/shared/stats";

type Statistic = "mean" | "median" | "sd" | "p25" | "p75";

function compute(stat: Statistic, arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  if (stat === "mean")    return mean(arr);
  if (stat === "median")  return median(arr);
  if (stat === "sd")      return sd(arr);
  if (stat === "p25")     return quantile(sorted, 0.25);
  return quantile(sorted, 0.75);
}

addEventListener("message", (event: MessageEvent) => {
  const { type, payload } = event.data;

  try {
    if (type === "RUN_BOOTSTRAP") {
      const { data, stat, B } = payload as { data: number[]; stat: Statistic; B: number };
      const out: number[] = [];
      const len = data.length;
      
      for (let i = 0; i < B; i++) {
        // Fast random resample with replacement
        const re = new Array(len);
        for (let j = 0; j < len; j++) {
          re[j] = data[Math.floor(Math.random() * len)];
        }
        out.push(compute(stat, re));
      }
      
      postMessage({ type: "SUCCESS", result: out });
    } else if (type === "RUN_MULTIVERSE") {
      const { xs, ys, B } = payload as { xs: number[]; ys: number[]; B: number };
      const results: { path: string; pValue: number; slope: number }[] = [];
      const len = xs.length;

      const paths = [];
      for (const dropX of [false, true]) {
        for (const dropY of [false, true]) {
          for (const logX of [false, true]) {
            for (const logY of [false, true]) {
              paths.push({ dropX, dropY, logX, logY });
            }
          }
        }
      }

      for (const path of paths) {
        const pathName = `${path.dropX ? 'DropOutX' : 'KeepAllX'}_${path.dropY ? 'DropOutY' : 'KeepAllY'}_${path.logX ? 'LogX' : 'LinX'}_${path.logY ? 'LogY' : 'LinY'}`;

        for (let i = 0; i < B; i++) {
          const rx: number[] = [];
          const ry: number[] = [];
          for (let j = 0; j < len; j++) {
            const idx = Math.floor(Math.random() * len);
            rx.push(xs[idx]);
            ry.push(ys[idx]);
          }

          let curX = rx;
          let curY = ry;

          if (path.dropX) {
            const sortedX = [...curX].sort((a,b) => a - b);
            const q025 = quantile(sortedX, 0.025);
            const q975 = quantile(sortedX, 0.975);
            const filtX: number[] = [];
            const filtY: number[] = [];
            for(let k=0; k<curX.length; k++) {
              if (curX[k] >= q025 && curX[k] <= q975) {
                filtX.push(curX[k]); filtY.push(curY[k]);
              }
            }
            curX = filtX; curY = filtY;
          }
          
          if (path.dropY) {
            const sortedY = [...curY].sort((a,b) => a - b);
            const q025 = quantile(sortedY, 0.025);
            const q975 = quantile(sortedY, 0.975);
            const filtX: number[] = [];
            const filtY: number[] = [];
            for(let k=0; k<curY.length; k++) {
              if (curY[k] >= q025 && curY[k] <= q975) {
                filtX.push(curX[k]); filtY.push(curY[k]);
              }
            }
            curX = filtX; curY = filtY;
          }

          if (path.logX) {
            const minX = Math.min(...curX);
            const shift = minX <= 0 ? Math.abs(minX) + 1 : 0;
            curX = curX.map(v => Math.log(v + shift));
          }
          if (path.logY) {
            const minY = Math.min(...curY);
            const shift = minY <= 0 ? Math.abs(minY) + 1 : 0;
            curY = curY.map(v => Math.log(v + shift));
          }

          if (curX.length < 3) continue;
          
          // Import ols dynamically or assume it's imported at the top
          // Wait, I need to ensure ols is imported at the top of stats.worker.ts
          const reg = ols(curX, curY);
          results.push({ path: pathName, pValue: reg.pSlope, slope: reg.slope });
        }
      }
      postMessage({ type: "SUCCESS", result: results });
    } else {
      postMessage({ type: "ERROR", error: `Unknown worker message type: ${type}` });
    }
  } catch (err) {
    postMessage({ type: "ERROR", error: err instanceof Error ? err.message : "Unknown error in worker" });
  }
});
