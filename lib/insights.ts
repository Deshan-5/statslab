"use client";

/**
 * Auto-Insights Engine
 * 
 * Scans a dataset and surfaces statistically interesting findings in plain, easy-to-interpret language:
 * - Simpson's Paradox (counter-intuitive subgroup correlation reversal)
 * - Multicollinearity Clusters (pairwise redundant correlation triads)
 * - Ordinary Least Squares (OLS) Regression Equations for correlated pairs
 * - ANOVA Variance Explanation (Eta-squared statistic for categorical/numeric splits)
 * - Statistically significant differences between category groups (Cohen's d)
 * - Sub-population mixtures (Sarle's Bimodality Coefficient)
 * - Normality Failures (Jarque-Bera goodness-of-fit test)
 * - Asymmetric Skewness
 * - Outliers (values beyond 3 standard deviations)
 */

import type { Dataset } from "@/lib/dataset";
import { mean, sd } from "@/components/tools/shared/stats";

export type Insight = {
  id: string;
  type: "correlation" | "outlier" | "skewness" | "missing" | "comparison" | "bimodality";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  suggestedTool?: string;
  columns: string[];
};

function pearsonR(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i]; sumB += b[i];
    sumAB += a[i] * b[i];
    sumA2 += a[i] * a[i];
    sumB2 += b[i] * b[i];
  }
  const denom = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));
  if (denom === 0) return 0;
  return (n * sumAB - sumA * sumB) / denom;
}

function skewness(values: number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const m = mean(values);
  const s = sd(values);
  if (s === 0) return 0;
  let sum = 0;
  for (const v of values) sum += Math.pow((v - m) / s, 3);
  return (n / ((n - 1) * (n - 2))) * sum;
}

function kurtosis(values: number[]): number {
  const n = values.length;
  if (n < 4) return 0;
  const m = mean(values);
  const s = sd(values);
  if (s === 0) return 0;
  let sum4 = 0;
  for (const v of values) {
    sum4 += Math.pow(v - m, 4);
  }
  const variance = s * s;
  return (sum4 / n) / (variance * variance) - 3;
}

export function generateInsights(dataset: Dataset): Insight[] {
  const insights: Insight[] = [];
  const numCols = dataset.columns.filter(c => c.type === "numeric" && c.numeric.length >= 5);
  const catCols = dataset.columns.filter(c => c.type === "categorical");

  const highCorrPairs: [string, string][] = [];

  // 1. Simpson's Paradox Detector (Subgroup correlation reversals)
  for (const catCol of catCols) {
    const uniqueCats = Array.from(new Set(catCol.values.filter(v => v !== null && v !== ""))).map(String);
    if (uniqueCats.length < 2 || uniqueCats.length > 5) continue; 

    for (let i = 0; i < numCols.length; i++) {
      for (let j = i + 1; j < numCols.length; j++) {
        const a = numCols[i];
        const b = numCols[j];
        
        const overallX: number[] = [];
        const overallY: number[] = [];
        for (let k = 0; k < a.numeric.length; k++) {
          const valX = a.numeric[k];
          const valY = b.numeric[k];
          if (!isNaN(valX) && !isNaN(valY)) {
            overallX.push(valX);
            overallY.push(valY);
          }
        }
        if (overallX.length < 20) continue;

        const rOverall = pearsonR(overallX, overallY);
        if (Math.abs(rOverall) < 0.25) continue; 

        const groupCorrs: { cat: string; r: number; n: number }[] = [];
        for (const cat of uniqueCats) {
          const subX: number[] = [];
          const subY: number[] = [];
          for (let k = 0; k < catCol.values.length; k++) {
            if (String(catCol.values[k]) === cat) {
              const valX = a.numeric[k];
              const valY = b.numeric[k];
              if (valX !== undefined && valY !== undefined && !isNaN(valX) && !isNaN(valY)) {
                subX.push(valX);
                subY.push(valY);
              }
            }
          }

          if (subX.length >= 10) {
            const rSub = pearsonR(subX, subY);
            if (!isNaN(rSub)) {
              groupCorrs.push({ cat, r: rSub, n: subX.length });
            }
          }
        }

        if (groupCorrs.length < 2) continue;

        const overallPositive = rOverall > 0;
        const reversedGroups = groupCorrs.filter(gc => {
          return overallPositive ? gc.r < -0.15 : gc.r > 0.15;
        });

        if (reversedGroups.length >= 2 && reversedGroups.length / groupCorrs.length >= 0.6) {
          const groupDetails = reversedGroups.map(g => `"${g.cat}" (r = ${g.r.toFixed(2)})`).join(", ");
          insights.push({
            id: `simpson-${catCol.name}-${a.name}-${b.name}`,
            type: "comparison",
            severity: "critical",
            title: `⚠️ Conflicting Trends: ${a.name} & ${b.name}`,
            description: `Overall, there is a ${rOverall > 0 ? "positive" : "negative"} link between ${a.name} and ${b.name} (r = ${rOverall.toFixed(2)}). However, when you look at subgroups within ${catCol.name}, this pattern completely reverses: ${groupDetails}. Looking at the combined data alone could easily mislead you.`,
            suggestedTool: "linear-regression",
            columns: [catCol.name, a.name, b.name],
          });
        }
      }
    }
  }

  // 2. Ordinary Least Squares (OLS) Regression Fit & High Correlation tracking
  for (let i = 0; i < numCols.length; i++) {
    for (let j = i + 1; j < numCols.length; j++) {
      const a = numCols[i];
      const b = numCols[j];
      
      const pairedX: number[] = [];
      const pairedY: number[] = [];
      for (let k = 0; k < a.numeric.length; k++) {
        if (!isNaN(a.numeric[k]) && !isNaN(b.numeric[k])) {
          pairedX.push(a.numeric[k]);
          pairedY.push(b.numeric[k]);
        }
      }
      if (pairedX.length < 15) continue;

      const r = pearsonR(pairedX, pairedY);
      const r2 = r * r;

      if (Math.abs(r) >= 0.78) {
        highCorrPairs.push([a.name, b.name]);
      }

      if (r2 < 0.35) continue; 

      const meanX = mean(pairedX);
      const meanY = mean(pairedY);
      const sdX = sd(pairedX);
      const sdY = sd(pairedY);
      if (sdX === 0) continue;

      const slope = r * (sdY / sdX);
      const intercept = meanY - slope * meanX;

      const sign = slope >= 0 ? "+" : "-";
      const absSlope = Math.abs(slope);

      insights.push({
        id: `ols-${a.name}-${b.name}`,
        type: "correlation",
        severity: "info",
        title: `Predictive Rule: Estimating ${b.name} from ${a.name}`,
        description: `We can predict "${b.name}" based on "${a.name}". For every 1-unit change in "${a.name}", "${b.name}" shifts by ${slope >= 0 ? "" : "-"}${absSlope.toFixed(2)}. This simple rule explains about ${(r2 * 100).toFixed(0)}% of the fluctuations in "${b.name}".`,
        suggestedTool: "linear-regression",
        columns: [a.name, b.name],
      });
    }
  }

  // 3. Multicollinearity Cluster (Triad Search)
  const colsWithHighCorrs = Array.from(new Set(highCorrPairs.flat()));
  for (let x = 0; x < colsWithHighCorrs.length; x++) {
    for (let y = x + 1; y < colsWithHighCorrs.length; y++) {
      for (let z = y + 1; z < colsWithHighCorrs.length; z++) {
        const c1 = colsWithHighCorrs[x];
        const c2 = colsWithHighCorrs[y];
        const c3 = colsWithHighCorrs[z];
        
        const has12 = highCorrPairs.some(p => (p[0] === c1 && p[1] === c2) || (p[0] === c2 && p[1] === c1));
        const has23 = highCorrPairs.some(p => (p[0] === c2 && p[1] === c3) || (p[0] === c3 && p[1] === c2));
        const has13 = highCorrPairs.some(p => (p[0] === c1 && p[1] === c3) || (p[0] === c3 && p[1] === c1));
        
        if (has12 && has23 && has13) {
          insights.push({
            id: `collinear-${c1}-${c2}-${c3}`,
            type: "correlation",
            severity: "warning",
            title: `Redundant Columns: ${c1}, ${c2}, & ${c3}`,
            description: `These three columns are highly correlated with each other, meaning they carry almost identical information. If you build a model, try to use only one of them; keeping all of them will confuse standard statistical models.`,
            suggestedTool: "pca-tool",
            columns: [c1, c2, c3],
          });
        }
      }
    }
  }

  // 4. ANOVA Variance Explanation (Eta-squared) & Group Comparisons
  for (const catCol of catCols) {
    const uniqueCats = Array.from(new Set(catCol.values.filter(v => v !== null && v !== ""))).map(String);
    if (uniqueCats.length < 2 || uniqueCats.length > 8) continue; 

    for (const numCol of numCols) {
      const groups: Record<string, number[]> = {};
      for (let k = 0; k < catCol.values.length; k++) {
        const catVal = catCol.values[k];
        const numVal = numCol.numeric[k];
        if (catVal !== null && catVal !== "" && numVal !== null && !isNaN(numVal)) {
          const key = String(catVal);
          if (!groups[key]) groups[key] = [];
          groups[key].push(numVal);
        }
      }

      const catMeans: { cat: string; mean: number; sd: number; n: number }[] = [];
      const overallMean = mean(numCol.numeric);
      let ssb = 0; 
      let ssw = 0; 
      
      for (const cat of uniqueCats) {
        const vals = groups[cat];
        if (vals && vals.length >= 5) {
          const m = mean(vals);
          const s = sd(vals);
          catMeans.push({ cat, mean: m, sd: s, n: vals.length });
          
          ssb += vals.length * Math.pow(m - overallMean, 2);
          for (const v of vals) {
            ssw += Math.pow(v - m, 2);
          }
        }
      }

      const tss = ssb + ssw;
      if (tss > 0) {
        const etaSquared = ssb / tss;
        if (etaSquared > 0.18) { 
          insights.push({
            id: `anova-${catCol.name}-${numCol.name}`,
            type: "comparison",
            severity: etaSquared > 0.35 ? "critical" : "warning",
            title: `${catCol.name} drives ${numCol.name}`,
            description: `Knowing which group an entry belongs to in "${catCol.name}" explains ${(etaSquared * 100).toFixed(0)}% of all the differences in "${numCol.name}". This indicates that group membership is a very strong factor.`,
            suggestedTool: "hypothesis-test",
            columns: [catCol.name, numCol.name],
          });
        }
      }

      // Add a single comprehensive comparison card if the group averages differ significantly
      if (catMeans.length >= 2) {
        // Sort category groups by average value descending
        catMeans.sort((a, b) => b.mean - a.mean);
        
        const gMax = catMeans[0];
        const gMin = catMeans[catMeans.length - 1];
        const diff = gMax.mean - gMin.mean;
        const pooledSd = Math.sqrt(
          ((gMax.n - 1) * gMax.sd * gMax.sd + (gMin.n - 1) * gMin.sd * gMin.sd) / (gMax.n + gMin.n - 2)
        );
        
        if (pooledSd > 0 && !isNaN(pooledSd)) {
          const cohensD = diff / pooledSd;
          if (cohensD >= 0.45) { // Moderate to large variance between top and bottom groups
            const groupSummaries = catMeans.map(g => `"${g.cat}" (${g.mean.toFixed(1)})`).join(", ");
            insights.push({
              id: `compare-${catCol.name}-${numCol.name}`,
              type: "comparison",
              severity: cohensD >= 0.8 ? "warning" : "info",
              title: `Clear gap in ${numCol.name} by ${catCol.name}`,
              description: `Averages for "${numCol.name}" show noticeable differences across "${catCol.name}" groups: ${groupSummaries}. The overall gap is statistically strong and noticeable.`,
              suggestedTool: "hypothesis-test",
              columns: [catCol.name, numCol.name],
            });
          }
        }
      }
    }
  }

  // 5. Sub-population Mixtures (Sarle's Bimodality Coefficient > 0.555)
  for (const col of numCols) {
    if (col.numeric.length < 15) continue;
    const sk = skewness(col.numeric);
    const kt = kurtosis(col.numeric);
    const bCoeff = (sk * sk + 1) / (kt + 3);
    if (bCoeff > 0.555) {
      insights.push({
        id: `bimodal-${col.name}`,
        type: "bimodality",
        severity: "warning",
        title: `Two distinct groups in ${col.name}`,
        description: `The values in "${col.name}" cluster around two separate averages rather than a single bell curve. This suggests your dataset is mixing two completely different groups of entries together.`,
        suggestedTool: "qq-plot",
        columns: [col.name],
      });
    }
  }

  // 6. Normality Failures (Jarque-Bera Goodness-of-Fit Test)
  for (const col of numCols) {
    if (col.numeric.length < 10) continue;
    const sk = skewness(col.numeric);
    const kt = kurtosis(col.numeric);
    const jb = (col.numeric.length / 6) * (sk * sk + (kt * kt) / 4);
    
    if (jb > 30) {
      insights.push({
        id: `normality-${col.name}`,
        type: "skewness",
        severity: jb > 150 ? "warning" : "info",
        title: `Highly uneven spread in ${col.name}`,
        description: `The data in "${col.name}" does not follow a balanced, symmetrical bell curve. Keep this in mind, as standard models that assume a perfect bell curve might give you slightly off results here.`,
        suggestedTool: "qq-plot",
        columns: [col.name],
      });
    }
  }

  // 7. Skewness
  for (const col of numCols) {
    const sk = skewness(col.numeric);
    const absSk = Math.abs(sk);
    if (absSk > 1.8) {
      const direction = sk > 0 ? "right-skewed" : "left-skewed";
      insights.push({
        id: `skew-${col.name}`,
        type: "skewness",
        severity: absSk > 2.8 ? "warning" : "info",
        title: `Asymmetric skew in ${col.name}`,
        description: `Most of the values in "${col.name}" are grouped on one side with a long tail stretching out to the ${direction}. Consider transforming this data (like taking the log or square root) to balance it out.`,
        suggestedTool: "qq-plot",
        columns: [col.name],
      });
    }
  }

  // 8. Outliers (values beyond 3 SDs)
  for (const col of numCols) {
    const m = mean(col.numeric);
    const s = sd(col.numeric);
    if (s === 0) continue;
    const outlierCount = col.numeric.filter(v => Math.abs(v - m) > 3 * s).length;
    if (outlierCount > 0 && outlierCount < col.numeric.length * 0.08) {
      const pct = ((outlierCount / col.numeric.length) * 100).toFixed(1);
      insights.push({
        id: `outlier-${col.name}`,
        type: "outlier",
        severity: outlierCount > col.numeric.length * 0.03 ? "warning" : "info",
        title: `Extreme values in ${col.name}`,
        description: `There are ${outlierCount} unusually high or low values in "${col.name}" (about ${pct}% of the data) that lie far away from the rest. Double-check if these are errors or special cases.`,
        suggestedTool: "box-plot",
        columns: [col.name],
      });
    }
  }

  // Sort by severity (critical > warning > info), prioritize paradoxes, multicollinearity, and ANOVA
  const sevOrder = { critical: 0, warning: 1, info: 2 };
  const typeOrder = { comparison: 0, correlation: 1, bimodality: 2, skewness: 3, outlier: 4, missing: 5 };
  
  insights.sort((a, b) => {
    const sDiff = sevOrder[a.severity] - sevOrder[b.severity];
    if (sDiff !== 0) return sDiff;
    return typeOrder[a.type] - typeOrder[b.type];
  });

  return insights.slice(0, 8); // Cap at 8
}
