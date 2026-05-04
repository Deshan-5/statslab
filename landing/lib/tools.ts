import type { ComponentType } from "react";

import LinearRegressionTool from "@/components/tools/LinearRegressionTool";
import NormalDistributionTool from "@/components/tools/NormalDistributionTool";
import DistributionExplorerTool from "@/components/tools/DistributionExplorerTool";
import CLTTool from "@/components/tools/CLTTool";
import ConfidenceIntervalsTool from "@/components/tools/ConfidenceIntervalsTool";
import MonteCarloPiTool from "@/components/tools/MonteCarloPiTool";
import MarkovChainTool from "@/components/tools/MarkovChainTool";
import BootstrapTool from "@/components/tools/BootstrapTool";
import HypothesisTestTool from "@/components/tools/HypothesisTestTool";
import RandomWalkTool from "@/components/tools/RandomWalkTool";
import QQPlotTool from "@/components/tools/QQPlotTool";
import PowerCalculatorTool from "@/components/tools/PowerCalculatorTool";
import PCATool from "@/components/tools/PCATool";

import BarChartTool from "@/components/tools/BarChartTool";
import LineChartTool from "@/components/tools/LineChartTool";
import ScatterTool from "@/components/tools/ScatterTool";
import BoxPlotTool from "@/components/tools/BoxPlotTool";
import HeatmapTool from "@/components/tools/HeatmapTool";
import ViolinTool from "@/components/tools/ViolinTool";
import BayesianTool from "@/components/tools/BayesianTool";
import CausalTool from "@/components/tools/CausalTool";
import TimeSeriesTool from "@/components/tools/TimeSeriesTool";

export type Tool = {
  id: string;
  name: string;
  group: "Models" | "Distributions" | "Inference" | "Simulation" | "Charts" | "Methods";
  built: boolean;
  blurb: string;
  Component?: ComponentType;
};

export const TOOLS: Tool[] = [
  // Models
  { id: "linear-regression",     name: "Linear Regression",     group: "Models",        built: true,
    blurb: "Drag the orange point to see the OLS line refit live.",
    Component: LinearRegressionTool },

  // Distributions
  { id: "normal-distribution",   name: "Normal Distribution",   group: "Distributions", built: true,
    blurb: "Bell curve with live μ and σ controls.",
    Component: NormalDistributionTool },
  { id: "distribution-explorer", name: "Distribution Explorer", group: "Distributions", built: true,
    blurb: "Switch between 11 families — PDF/PMF, CDF, and tail probabilities.",
    Component: DistributionExplorerTool },

  // Inference
  { id: "central-limit-theorem", name: "Central Limit Theorem", group: "Inference",     built: true,
    blurb: "Sampling distribution of x̄ from a skewed source — adjust n.",
    Component: CLTTool },
  { id: "confidence-intervals",  name: "Confidence Intervals",  group: "Inference",     built: true,
    blurb: "Coverage simulation: how often does a CI bracket the true mean?",
    Component: ConfidenceIntervalsTool },
  { id: "hypothesis-test",       name: "Hypothesis Testing",    group: "Inference",     built: true,
    blurb: "Z- and T-tests with rejection regions and verdicts.",
    Component: HypothesisTestTool },
  { id: "bootstrap-sampling",    name: "Bootstrap Sampling",    group: "Inference",     built: true,
    blurb: "Resample with replacement — visualise sampling variability.",
    Component: BootstrapTool },
  { id: "qq-plot",               name: "Q-Q Plot",              group: "Inference",     built: true,
    blurb: "Compare your data's quantiles to Normal, Exponential, Uniform, or Log-normal.",
    Component: QQPlotTool },
  { id: "power-calculator",      name: "Power & Sample Size",   group: "Inference",     built: true,
    blurb: "Solve for power, n, or detectable effect with a live power-vs-n curve.",
    Component: PowerCalculatorTool },

  // Simulation
  { id: "monte-carlo-pi",        name: "Monte Carlo π",         group: "Simulation",    built: true,
    blurb: "Estimate π by dropping random points into the unit square.",
    Component: MonteCarloPiTool },
  { id: "markov-chain",          name: "Markov Chain",          group: "Simulation",    built: true,
    blurb: "A 3-state chain stepping through a transition matrix.",
    Component: MarkovChainTool },
  { id: "random-walk",           name: "Random Walk",           group: "Simulation",    built: true,
    blurb: "Brownian motion — a discrete-time path with mean reversion.",
    Component: RandomWalkTool },

  // Charts
  { id: "bar-chart",  name: "Bar Chart",  group: "Charts", built: true,
    blurb: "Group means with SEM error bars — see precision improve as n grows.",
    Component: BarChartTool },
  { id: "line-chart", name: "Line Chart", group: "Charts", built: true,
    blurb: "Two time series with a controllable treatment effect and noise.",
    Component: LineChartTool },
  { id: "scatter",    name: "Scatter",    group: "Charts", built: true,
    blurb: "Bivariate normal — slide ρ to see the cloud and ellipse rotate.",
    Component: ScatterTool },
  { id: "box-plot",   name: "Box Plot",   group: "Charts", built: true,
    blurb: "Quartiles, whiskers, and outliers across four contrasting distributions.",
    Component: BoxPlotTool },
  { id: "heatmap",    name: "Heatmap",    group: "Charts", built: true,
    blurb: "Pearson correlation matrix from a latent-factor synthetic dataset.",
    Component: HeatmapTool },
  { id: "violin",     name: "Violin",     group: "Charts", built: true,
    blurb: "Kernel-density violins reveal shape that a box plot would hide.",
    Component: ViolinTool },

  // Methods
  { id: "bayesian",    name: "Bayesian Inference", group: "Methods", built: true,
    blurb: "Beta-Binomial — drag the prior, watch the posterior shift.",
    Component: BayesianTool },
  { id: "causal",      name: "Causal Inference",   group: "Methods", built: true,
    blurb: "Confounder Z biases the naive slope; adjustment recovers the truth.",
    Component: CausalTool },
  { id: "time-series", name: "Time Series",        group: "Methods", built: true,
    blurb: "AR(1) process with sample ACF and white-noise rejection band.",
    Component: TimeSeriesTool },
  { id: "pca",         name: "PCA / Biplot",       group: "Methods", built: true,
    blurb: "Project workspace numeric columns onto the top two principal components.",
    Component: PCATool },
];

export function findTool(id: string | null | undefined): Tool | undefined {
  return TOOLS.find((t) => t.id === id);
}

export const DEFAULT_TOOL_ID = "linear-regression";
