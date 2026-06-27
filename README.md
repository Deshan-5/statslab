# Stats Lab

A free, web-based interactive statistics and machine learning workbench. A marketing landing page plus a **33-tool interactive lab** covering regression, distributions, inference, simulation, charts, statistical methods, and AI/ML concepts — all in the browser, no install required.

## What it does

Stats Lab is built around three pillars:

1. **Interactive Tools** — 33 instruments across statistics and AI/ML. Every tool works standalone with live controls, and automatically gains a "Workspace" tab when you load your own data.
2. **Dataset Workbench** — Drop any CSV or TSV. Get a paginated data table, auto-detected column types, smart test suggestions, column statistics, and a data quality overview. Your dataset persists across every tool switch.
3. **AI-Assisted Learning** — A slide-out tutor panel explains statistical concepts, interprets results in plain language, and guides you toward the right test for your data.

**Target users**: Students learning statistics or ML, researchers running quick analyses, data analysts who want results without writing code.

**Competitive positioning**: Free, browser-based alternative to Numiqo (paid), JASP/jamovi (desktop install), and StatKey (toy data only). Combines the interactivity of a teaching tool with the power of a real analysis platform — now extended into ML and AI concepts.

---

## Quick start

Run from the **repo root** — no need to `cd` into `landing/` first:

```bash
npm install   # installs deps in landing/
npm run dev   # starts Next.js dev server → http://localhost:3005
```

Or inside the sub-package directly:

```bash
cd landing
npm install
npm run dev   # → http://localhost:3005
```

> The app runs on port **3005**. The root `package.json` delegates all commands to `landing/` via `--prefix`.

## Available commands (from repo root)

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start local dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

---

## Tool Registry (33 tools)

### Models
| Tool | Blurb |
|------|-------|
| Linear Regression | Drag the orange point to see the OLS line refit live |
| Logistic Regression | Fit binary classification models and drag the threshold to see the ROC curve update |

### Distributions
| Tool | Blurb |
|------|-------|
| Normal Distribution | Bell curve with live μ and σ controls |
| Distribution Explorer | Switch between 11 families — PDF/PMF, CDF, and tail probabilities |

### Inference
| Tool | Blurb |
|------|-------|
| Central Limit Theorem | Sampling distribution of x̄ from a skewed source — adjust n |
| Confidence Intervals | Coverage simulation: how often does a CI bracket the true mean? |
| Hypothesis Testing | Z- and T-tests with rejection regions and verdicts |
| Bootstrap Sampling | Resample with replacement — visualise sampling variability |
| Q-Q Plot | Compare your data's quantiles to Normal, Exponential, Uniform, or Log-normal |
| Power & Sample Size | Solve for power, n, or detectable effect with a live power-vs-n curve |
| Multiverse Analysis | Explore the Garden of Forking Paths — simulate hundreds of analytical decisions at once |

### Simulation
| Tool | Blurb |
|------|-------|
| Monte Carlo π | Estimate π by dropping random points into the unit square |
| Markov Chain | A 3-state chain stepping through a transition matrix |
| Random Walk | Brownian motion — a discrete-time path with mean reversion |

### Charts
| Tool | Blurb |
|------|-------|
| Bar Chart | Group means with SEM error bars — see precision improve as n grows |
| Line Chart | Two time series with a controllable treatment effect and noise |
| Scatter | Bivariate normal — slide ρ to see the cloud and ellipse rotate |
| Box Plot | Quartiles, whiskers, and outliers across four contrasting distributions |
| Heatmap | Pearson correlation matrix from a latent-factor synthetic dataset |
| Violin | Kernel-density violins reveal shape that a box plot would hide |

### Methods
| Tool | Blurb |
|------|-------|
| Bayesian Inference | Beta-Binomial — drag the prior, watch the posterior shift |
| Causal Inference | Confounder Z biases the naive slope; adjustment recovers the truth. Interactive DAG builder, backdoor path solver, minimal adjustment set selector |
| Time Series | AR(1) process with sample ACF and white-noise rejection band |
| PCA / Biplot | Project workspace numeric columns onto the top two principal components |
| Clustering Visualizer | Watch K-Means step centroids or drag a threshold line to cut a hierarchical tree dendrogram |

### AI & ML
| Tool | Blurb |
|------|-------|
| Gradient Descent | Watch a loss surface form and a learner descend it — compare SGD, Momentum, and Adam step by step |
| Bias–Variance Tradeoff | Slide polynomial degree to see underfitting ↔ overfitting and watch bias²+variance decompose live |
| KL Divergence | Morph two distributions and see cross-entropy and KL divergence update in real time |
| Transformer Engine | Type a sentence and watch a real GPT-2 architecture process it locally. Hover over tokens to see exact Self-Attention weights |
| Image Convolution | Understand how CNNs "see" images. Drag an X-ray scanner to apply live math matrices like Edge Detection and Blurring |
| Semantic Space (Embeddings) | Explore how AI understands meaning through high-dimensional geometry. Perform vector math like King − Man + Woman = Queen |
| Neural Network 3D | Watch a hidden layer warp 2D space into 3D so a flat plane can slice apart non-linear data |
| SVM Kernel Trick | Apply an RBF kernel to perfectly map overlapping 2D circles into a separated 3D bell shape |

---

## Layout

```
statslab/
├── package.json            ← root delegator (points to landing/)
├── PRD.md                  ← full product requirements doc
├── README.md
└── landing/                ← the entire app (Next.js 14 / App Router)
    ├── app/
    │   ├── app/            ← Lab workspace (AppClient.tsx)
    │   ├── api/analyze/    ← Dataset insights API route
    │   ├── api/tutor/      ← AI tutor API route
    │   ├── blog/           ← Blog placeholder
    │   ├── careers/        ← Careers placeholder
    │   ├── privacy/        ← Privacy page
    │   ├── terms/          ← Terms page
    │   ├── page.tsx        ← Landing page
    │   └── layout.tsx      ← Root layout + metadata
    ├── components/
    │   ├── tools/          ← 33 statistical and ML tool components
    │   │   └── shared/     ← stats.ts (900+ line math library) + shared UI
    │   ├── workspace/      ← Dataset management (WorkspaceProvider, DataStrip, TutorPanel, etc.)
    │   └── demos/          ← Landing page demo animations
    ├── lib/
    │   ├── tools.ts        ← Tool registry (33 tools, ids, groups, components)
    │   ├── dataset.ts      ← Dataset type definitions + builder
    │   └── examples/       ← Built-in example datasets
    └── public/
```

---

## App Layout

```
+----------------------------------------------------------+
|  Stats Lab    [Cmd+K Search]              [Theme] [Ask]  | 48px header
+--------+-------------------------------------------------+
|        |                                                 |
| DATA   |  MAIN WORKSPACE                                 |
| ----   |                                                 |
| Models |  No tool selected → DATA VIEW                   |
|  Lin.  |    Drop zone + data table + suggestions         |
|  Log.  |                                                 |
| ----   |  Tool selected → TOOL WORKSPACE                 |
| Distr. |    Chart + controls + interpretation             |
|  Norm  |    (works without any dataset loaded)            |
| ----   |                                                 |
| Infer. |                                                 |
| ----   |                                                 |
| Simul. |                                                 |
| ----   |                                                 |
| Charts |                                                 |
| ----   |                                                 |
| Method |                                                 |
| ----   |                                                 |
| AI&ML  |                                                 |
+--------+-------------------------------------------------+
| employees.csv - 500x12  [Age] [Salary] [Dept]       [+] | persistent DataStrip
+----------------------------------------------------------+
```

Key components:
- **Header** (48px): Logo, Cmd+K command palette, theme toggle, Ask (tutor) button
- **Sidebar** (220px): "Data" link, then tool groups (Models, Distributions, Inference, Simulation, Charts, Methods, AI & ML)
- **Main panel**: LabDashboard (data view) or the active tool
- **DataStrip** (persistent bottom bar): Collapsed = 40px bar with filename, row/col count, column type chips. Expanded = 380px animated slide-up with filters, column transforms, imputation settings, and an interactive data grid preview.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS 3
- **Animation**: framer-motion
- **Icons**: lucide-react (no emojis in UI)
- **Charts**: Pure inline SVG — no chart libraries, custom interactive SVG canvas controls
- **State**: React `useState`/`useMemo` + `WorkspaceProvider` context for shared dataset
- **Data pipeline**: Custom CSV/TSV parser in `stats.ts` with robust handling for quoted fields, currency, percentages, and messy data
- **Linear Algebra**: Custom matrix engine (`transpose`, `multiply`, `invertMatrix` via Gaussian elimination with partial pivoting) for client-side multivariate regression
- **Export**: Color-substitution serializer that replaces Tailwind CSS variable references with absolute HEX values for Figma/Illustrator-compatible SVG/PNG exports

---

## Data Pipeline

1. User drops a CSV/TSV or pastes data into the drop zone.
2. `parseCSV()` in `stats.ts` handles quoted fields, multi-line values, currency, percentages, pipe delimiters.
3. Data loads into `WorkspaceProvider` and persists to `localStorage`.
4. All 33 tools read it via the `useWorkspace()` hook — drop once, use everywhere.
5. The data view shows a paginated table (10/20/50/100 rows), smart test suggestions, column statistics, data quality badges, and an insights panel.

**Smart suggestions (rule-based, no API call):**
- 1 numeric + 1 categorical → Group comparison → Bar Chart + ANOVA
- 2 numerics with |r| > 0.5 → Correlation → Linear Regression + Scatter
- |skewness| > 1 → Distribution warning → Q-Q Plot
- 3+ numeric columns → Correlation overview → Heatmap
- Sequential first column → Time series → Time Series + Line Chart

---

## Shared Libraries

**`stats.ts`** (pure math, no React, 900+ lines):
- Descriptive: `mean`, `variance`, `sd`, `sem`, `median`, `quantile`, `iqr`, `skewness`, `kurtosis`
- Linear Algebra: `transpose`, `multiply`, `invertMatrix`
- Regression: `ols`, `multipleRegression`
- Distributions: `normalPDF/CDF/Inv`, `tCDF/Crit`, `chi2CDF`
- Hypothesis tests: `zTest`, `tTest`, `welchTest`, `pairedTTest`, `chi2GoF`, `oneWayANOVA`
- Correlation: `pearsonR`, `spearmanRho`
- Other: `kde`, `silvermanBandwidth`, `acf`, `detectDistribution`
- Parsing: `parseCSV`, `parseCSVRows`, `parseNumbers`, `parseNumericValue`

**`ui.tsx`** (shared React components):
- Layout: `Panel`, `ToolGrid`, `Tabs`, `Collapsible`
- Inputs: `Field`, `NumberInput`, `DataTextArea`, `Select`
- Display: `Stat`, `Verdict`, `Formula`, `StepByStep`
- Actions: `Btn`, `SampleDataButton`

**`WorkspaceProvider.tsx`** (dataset context):
- `useWorkspace()` exposes: `dataset`, `loadCSV`, `loadExample`, `clearDataset`, `numericColumns`, `categoricalColumns`, `selection`, `setSelection`, `isSelected`
- Persists to `localStorage`, hydrates on mount

---

## Production Roadmap

1. **Auth**: Migrate from `demo` to Auth.js v5 with Postgres + Resend
2. **Database**: Switch `DATABASE_URL` from SQLite to serverless Postgres (Neon / Supabase)
3. **AI Tutor**: Wire `/api/tutor` to a live LLM API key
4. **Web Workers**: Offload heavy compute (Bootstrap, Monte Carlo) off the main thread for 60fps UI
5. **E2E Tests**: Playwright coverage for file drop, tool navigation, and SVG exports

---

## Verification

```bash
# Type-check (must return 0 errors)
cd landing && npx tsc --noEmit

# Production build (must succeed)
npm run build
```

Every tool must function in dual mode: standalone interactive controls, and workspace-data mode when a CSV is loaded.
