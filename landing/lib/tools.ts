import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import ToolSkeleton from "@/components/tools/shared/ToolSkeleton";

// ── Lazy-loaded tool components ──────────────────────────────────────────────
// Using dynamic() so Webpack only compiles a tool when it's actually navigated
// to — not at startup. This prevents the 300KB+ of tool code from blocking the
// initial page compile.

const LinearRegressionTool    = dynamic(() => import("@/components/tools/LinearRegressionTool"), { loading: ToolSkeleton });
const NormalDistributionTool  = dynamic(() => import("@/components/tools/NormalDistributionTool"), { loading: ToolSkeleton });
const DistributionExplorerTool = dynamic(() => import("@/components/tools/DistributionExplorerTool"), { loading: ToolSkeleton });
const CLTTool                 = dynamic(() => import("@/components/tools/CLTTool"), { loading: ToolSkeleton });
const ConfidenceIntervalsTool = dynamic(() => import("@/components/tools/ConfidenceIntervalsTool"), { loading: ToolSkeleton });
const MonteCarloPiTool        = dynamic(() => import("@/components/tools/MonteCarloPiTool"), { loading: ToolSkeleton });
const MarkovChainTool         = dynamic(() => import("@/components/tools/MarkovChainTool"), { loading: ToolSkeleton });
const BootstrapTool           = dynamic(() => import("@/components/tools/BootstrapTool"), { loading: ToolSkeleton });
const HypothesisTestTool      = dynamic(() => import("@/components/tools/HypothesisTestTool"), { loading: ToolSkeleton });
const MultiverseTool          = dynamic(() => import("@/components/tools/MultiverseTool"), { loading: ToolSkeleton });
const RandomWalkTool          = dynamic(() => import("@/components/tools/RandomWalkTool"), { loading: ToolSkeleton });
const QQPlotTool              = dynamic(() => import("@/components/tools/QQPlotTool"), { loading: ToolSkeleton });
const PowerCalculatorTool     = dynamic(() => import("@/components/tools/PowerCalculatorTool"), { loading: ToolSkeleton });
const PCATool                 = dynamic(() => import("@/components/tools/PCATool"), { loading: ToolSkeleton });
const BarChartTool            = dynamic(() => import("@/components/tools/BarChartTool"), { loading: ToolSkeleton });
const LineChartTool           = dynamic(() => import("@/components/tools/LineChartTool"), { loading: ToolSkeleton });
const ScatterTool             = dynamic(() => import("@/components/tools/ScatterTool"), { loading: ToolSkeleton });
const BoxPlotTool             = dynamic(() => import("@/components/tools/BoxPlotTool"), { loading: ToolSkeleton });
const HeatmapTool             = dynamic(() => import("@/components/tools/HeatmapTool"), { loading: ToolSkeleton });
const ViolinTool              = dynamic(() => import("@/components/tools/ViolinTool"), { loading: ToolSkeleton });
const BayesianTool            = dynamic(() => import("@/components/tools/BayesianTool"), { loading: ToolSkeleton });
const CausalTool              = dynamic(() => import("@/components/tools/CausalTool"), { loading: ToolSkeleton });
const TimeSeriesTool          = dynamic(() => import("@/components/tools/TimeSeriesTool"), { loading: ToolSkeleton });
const LogisticRegressionTool  = dynamic(() => import("@/components/tools/LogisticRegressionTool"), { loading: ToolSkeleton });
const ClusteringTool          = dynamic(() => import("@/components/tools/ClusteringTool"), { loading: ToolSkeleton });
const GradientDescentTool     = dynamic(() => import("@/components/tools/GradientDescentTool"), { loading: ToolSkeleton, ssr: false });
const BiasVarianceTool        = dynamic(() => import("@/components/tools/BiasVarianceTool"), { loading: ToolSkeleton });
const KLDivergenceTool        = dynamic(() => import("@/components/tools/KLDivergenceTool"), { loading: ToolSkeleton });
const TransformerTool         = dynamic(() => import("@/components/tools/TransformerTool"), { loading: ToolSkeleton });
const ConvolutionTool         = dynamic(() => import("@/components/tools/ConvolutionTool"), { loading: ToolSkeleton });
const EmbeddingsTool          = dynamic(() => import("@/components/tools/EmbeddingsTool"), { loading: ToolSkeleton, ssr: false });
const NeuralNetworkTool       = dynamic(() => import("@/components/tools/NeuralNetworkTool"), { loading: ToolSkeleton, ssr: false });
const SVMKernelTool           = dynamic(() => import("@/components/tools/SVMKernelTool"), { loading: ToolSkeleton, ssr: false });

export type Tool = {
  id: string;
  name: string;
  group: "Models" | "Distributions" | "Inference" | "Simulation" | "Charts" | "Methods" | "AI & ML";
  built: boolean;
  blurb: string;
  Component?: ComponentType;
  wikiUrl?: string;
};

export const TOOLS: Tool[] = [
  // Models
  { id: "linear-regression",     name: "Linear Regression",     group: "Models",        built: true,
    blurb: "Drag the orange point to see the OLS line refit live.",
    Component: LinearRegressionTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Linear_regression" },
  { id: "logistic-regression",   name: "Logistic Regression",   group: "Models",        built: true,
    blurb: "Fit binary classification models and drag the threshold to see the ROC curve update.",
    Component: LogisticRegressionTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Logistic_regression" },

  // Distributions
  { id: "normal-distribution",   name: "Normal Distribution",   group: "Distributions", built: true,
    blurb: "Bell curve with live μ and σ controls.",
    Component: NormalDistributionTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Normal_distribution" },
  { id: "distribution-explorer", name: "Distribution Explorer", group: "Distributions", built: true,
    blurb: "Switch between 11 families — PDF/PMF, CDF, and tail probabilities.",
    Component: DistributionExplorerTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Probability_distribution" },

  // Inference
  { id: "central-limit-theorem", name: "Central Limit Theorem", group: "Inference",     built: true,
    blurb: "Sampling distribution of x̄ from a skewed source — adjust n.",
    Component: CLTTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Central_limit_theorem" },
  { id: "confidence-intervals",  name: "Confidence Intervals",  group: "Inference",     built: true,
    blurb: "Coverage simulation: how often does a CI bracket the true mean?",
    Component: ConfidenceIntervalsTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Confidence_interval" },
  { id: "hypothesis-test",       name: "Hypothesis Testing",    group: "Inference",     built: true,
    blurb: "Z- and T-tests with rejection regions and verdicts.",
    Component: HypothesisTestTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Statistical_hypothesis_testing" },
  { id: "bootstrap-sampling",    name: "Bootstrap Sampling",    group: "Inference",     built: true,
    blurb: "Resample with replacement — visualise sampling variability.",
    Component: BootstrapTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Bootstrapping_(statistics)" },
  { id: "qq-plot",               name: "Q-Q Plot",              group: "Inference",     built: true,
    blurb: "Compare your data's quantiles to Normal, Exponential, Uniform, or Log-normal.",
    Component: QQPlotTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Q%E2%80%93Q_plot" },
  { id: "power-calculator",      name: "Power & Sample Size",   group: "Inference",     built: true,
    blurb: "Solve for power, n, or detectable effect with a live power-vs-n curve.",
    Component: PowerCalculatorTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Power_of_a_test" },
  { id: "multiverse-analysis",   name: "Multiverse Analysis",   group: "Inference",     built: true,
    blurb: "Explore the Garden of Forking Paths — simulate hundreds of analytical decisions at once.",
    Component: MultiverseTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Multiverse_analysis" },

  // Simulation
  { id: "monte-carlo-pi",        name: "Monte Carlo π",         group: "Simulation",    built: true,
    blurb: "Estimate π by dropping random points into the unit square.",
    Component: MonteCarloPiTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Monte_Carlo_method" },
  { id: "markov-chain",          name: "Markov Chain",          group: "Simulation",    built: true,
    blurb: "A 3-state chain stepping through a transition matrix.",
    Component: MarkovChainTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Markov_chain" },
  { id: "random-walk",           name: "Random Walk",           group: "Simulation",    built: true,
    blurb: "Brownian motion — a discrete-time path with mean reversion.",
    Component: RandomWalkTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Random_walk" },

  // Charts
  { id: "bar-chart",  name: "Bar Chart",  group: "Charts", built: true,
    blurb: "Group means with SEM error bars — see precision improve as n grows.",
    Component: BarChartTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Bar_chart" },
  { id: "line-chart", name: "Line Chart", group: "Charts", built: true,
    blurb: "Two time series with a controllable treatment effect and noise.",
    Component: LineChartTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Line_chart" },
  { id: "scatter",    name: "Scatter",    group: "Charts", built: true,
    blurb: "Bivariate normal — slide ρ to see the cloud and ellipse rotate.",
    Component: ScatterTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Scatter_plot" },
  { id: "box-plot",   name: "Box Plot",   group: "Charts", built: true,
    blurb: "Quartiles, whiskers, and outliers across four contrasting distributions.",
    Component: BoxPlotTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Box_plot" },
  { id: "heatmap",    name: "Heatmap",    group: "Charts", built: true,
    blurb: "Pearson correlation matrix from a latent-factor synthetic dataset.",
    Component: HeatmapTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Heat_map" },
  { id: "violin",     name: "Violin",     group: "Charts", built: true,
    blurb: "Kernel-density violins reveal shape that a box plot would hide.",
    Component: ViolinTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Violin_plot" },

  // Methods
  { id: "bayesian",    name: "Bayesian Inference", group: "Methods", built: true,
    blurb: "Beta-Binomial — drag the prior, watch the posterior shift.",
    Component: BayesianTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Bayesian_inference" },
  { id: "causal",      name: "Causal Inference",   group: "Methods", built: true,
    blurb: "Confounder Z biases the naive slope; adjustment recovers the truth.",
    Component: CausalTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Causal_inference" },
  { id: "time-series", name: "Time Series",        group: "Methods", built: true,
    blurb: "AR(1) process with sample ACF and white-noise rejection band.",
    Component: TimeSeriesTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Time_series" },
  { id: "pca",         name: "PCA / Biplot",       group: "Methods",       built: true,
    blurb: "Project workspace numeric columns onto the top two principal components.",
    Component: PCATool,
    wikiUrl: "https://en.wikipedia.org/wiki/Principal_component_analysis" },
  { id: "clustering",  name: "Clustering Visualizer", group: "Methods",     built: true,
    blurb: "Watch K-Means step centroids or drag a threshold line to cut a Hierarchical tree dendrogram.",
    Component: ClusteringTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Cluster_analysis" },

  // AI & ML
  { id: "gradient-descent",    name: "Gradient Descent",      group: "AI & ML", built: true,
    blurb: "Watch a loss surface form and a learner descend it — compare SGD, Momentum, and Adam step by step.",
    Component: GradientDescentTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Gradient_descent" },
  { id: "bias-variance",       name: "Bias–Variance Tradeoff", group: "AI & ML", built: true,
    blurb: "Slide polynomial degree to see underfitting ↔ overfitting and watch bias²+variance decompose live.",
    Component: BiasVarianceTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Bias%E2%80%93variance_tradeoff" },
  { id: "kl-divergence",       name: "KL Divergence",          group: "AI & ML", built: true,
    blurb: "Morph two distributions and see cross-entropy and KL divergence update in real time — the math behind LLM training.",
    Component: KLDivergenceTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Kullback%E2%80%93Leibler_divergence" },
  { id: "transformer-engine",  name: "Transformer Engine",     group: "AI & ML", built: true,
    blurb: "Type a sentence and watch a real GPT-2 architecture process it locally. Hover over tokens to see exact Self-Attention weights.",
    Component: TransformerTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)" },
  { id: "image-convolution",   name: "Image Convolution",      group: "AI & ML", built: true,
    blurb: "Understand how CNNs 'see' images. Drag an X-ray scanner to apply live math matrices like Edge Detection and Blurring.",
    Component: ConvolutionTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Convolutional_neural_network" },
  { id: "semantic-space",      name: "Semantic Space (Embeddings)", group: "AI & ML", built: true,
    blurb: "Explore how AI understands the meaning of words through high-dimensional geometry. Perform vector math like King - Man + Woman = Queen.",
    Component: EmbeddingsTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Word_embedding" },
  { id: "neural-network",      name: "Neural Network 3D", group: "AI & ML", built: true,
    blurb: "Watch a hidden layer warp 2D space into 3D so a flat plane can slice apart non-linear data.",
    Component: NeuralNetworkTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Artificial_neural_network" },
  { id: "svm-kernel",          name: "SVM Kernel Trick", group: "AI & ML", built: true,
    blurb: "Apply a Radial Basis Function to perfectly map overlapping 2D circles into a 3D separated bell shape.",
    Component: SVMKernelTool,
    wikiUrl: "https://en.wikipedia.org/wiki/Kernel_method" },
];

export function findTool(id: string | null | undefined): Tool | undefined {
  return TOOLS.find((t) => t.id === id);
}

export const DEFAULT_TOOL_ID = "linear-regression";
