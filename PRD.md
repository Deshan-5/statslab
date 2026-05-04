# Stats Lab — Product Requirements Document

## Project Overview

Stats Lab is a Next.js web application (in `/landing`) that provides interactive statistics tools for college students. The app has a **landing page** (marketing, already complete) and a **post-signin lab** (`/app` route) with 18 statistics tools.

**The landing page is done. Do not modify it.** Focus exclusively on the `/app` experience — making each tool a fully interactive, data-accepting statistics instrument.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router) — in `/landing/`
- **Styling**: Tailwind CSS 3
- **Animation**: framer-motion (already installed)
- **Icons**: lucide-react (already installed)
- **Auth**: Stub auth via localStorage (`/landing/lib/useAuth.ts`) — do not change
- **Charts**: Pure SVG (no chart libraries) — keep this pattern
- **State**: React useState/useMemo (no external state management)

---

## Architecture

```
landing/
├── app/
│   ├── app/            ← Post-signin lab (AppClient.tsx)
│   ├── signin/         ← Sign-in page (done, don't touch)
│   └── page.tsx        ← Landing page (done, don't touch)
├── components/
│   ├── tools/          ← All 18 tool components live here
│   │   ├── shared/     ← Shared utilities (stats.ts, ui.tsx) — ALREADY CREATED
│   │   ├── LinearRegressionTool.tsx  ← ALREADY PARTIALLY REWRITTEN
│   │   └── ... (17 more tools)
│   └── demos/          ← Landing page demos (don't touch)
├── lib/
│   ├── tools.ts        ← Tool registry (ids, names, groups, components)
│   └── useAuth.ts      ← Auth hook (don't touch)
```

### Key files already created

I've already created these shared utility files. **Use them in every tool:**

1. **`/landing/components/tools/shared/stats.ts`** — Pure math library with:
   - `rngFor(seed)`, `gauss(rng, mu, sigma)` — seeded random
   - `mean()`, `variance()`, `sd()`, `sem()`, `median()`, `quantile()`, `iqr()` — descriptive stats
   - `ols(xs, ys)` — full OLS regression with R², adjusted R², p-values, residuals, standard errors
   - `normalPDF()`, `normalCDF()`, `normalInv()` — normal distribution
   - `tCDF()`, `tCrit()`, `chi2CDF()`, `chi2Crit()` — t and chi-square distributions
   - `zTest()`, `tTest()`, `welchTest()`, `pairedTTest()`, `chi2GoF()`, `oneWayANOVA()` — hypothesis tests
   - `zCI()`, `tCI()` — confidence intervals
   - `parseNumbers(text)`, `parsePairs(text)` — data parsing from text input
   - `pearsonR()`, `spearmanRho()` — correlation
   - `kde()`, `silvermanBandwidth()` — kernel density estimation
   - `acf()` — autocorrelation function

2. **`/landing/components/tools/shared/ui.tsx`** — Shared React UI components:
   - `Field` — labeled slider/input wrapper
   - `Stat` — stat display tile with label/value/subtitle
   - `Verdict` — reject/fail-to-reject pill
   - `Tabs` — tab navigation
   - `NumberInput` — labeled number input
   - `DataTextArea` — labeled textarea for pasting data
   - `Select` — labeled dropdown
   - `Collapsible` — expandable section
   - `SampleDataButton` — loads example data
   - `Panel` — rounded card wrapper
   - `ToolGrid` — 2:1 chart:controls layout
   - `Btn` — styled button (primary/secondary)
   - `StepByStep` — expandable step-by-step calculation trace
   - `Formula` — monospace formula display box

3. **`/landing/components/tools/LinearRegressionTool.tsx`** — Already rewritten (use as reference for the pattern)

---

## Current State of Each Tool (What's Broken)

Every tool below needs to be upgraded. The current versions are slider-only demos that don't accept user data input. Here's what each one needs:

---

### Tool 1: Linear Regression (`LinearRegressionTool.tsx`) — ✅ ALREADY DONE

Already rewritten with:
- Click-to-add points on SVG, drag to move, right-click to remove
- Data Input tab (paste X,Y pairs)
- Interactive points table with delete
- Full regression output (slope, intercept, R², adj R², SE, t-stats, p-values)
- Residual plot toggle
- Prediction with confidence interval
- Step-by-step calculation
- Formula display

**Use this as the reference pattern for all other tools.**

---

### Tool 2: Normal Distribution (`NormalDistributionTool.tsx`)

**Current**: Two sliders for μ and σ, draws bell curve. That's it.

**Upgrade to:**
- Keep the SVG bell curve visualization (it's good)
- Add **number inputs alongside sliders** for μ and σ (not just sliders)
- Add **Probability Calculator** tab:
  - Input field for value `a` → compute and shade P(X ≤ a)
  - Input fields for `a` and `b` → compute and shade P(a ≤ X ≤ b)
  - Radio: P(X < a), P(X > a), P(a < X < b)
  - Show the shaded area on the curve in real-time
- Add **Z-Score Calculator**:
  - Input raw value → output z-score and percentile
  - Input z-score → output raw value
- Add **Data Overlay** option:
  - Paste data → overlay histogram bars on the bell curve
  - Show sample mean and sample SD
  - Indicate whether data appears normal (compare sample stats to parameters)
- Show computed stats: variance σ², 68/95/99.7 intervals
- Use `normalCDF`, `normalPDF`, `normalInv` from `shared/stats.ts`
- Import `Tabs`, `NumberInput`, `DataTextArea`, `Stat`, `Panel`, `Field` from `shared/ui.tsx`

---

### Tool 3: Central Limit Theorem (`CLTTool.tsx`)

**Current**: Slider for n, auto-resampling histogram. Decent but limited.

**Upgrade to:**
- Add **number input for n** alongside the slider
- Add **source distribution selector** (dropdown): Normal, Uniform, Exponential, Bimodal, Custom
- For **Custom**: textarea to paste your own population data, samples drawn from it
- Add **speed control** for auto-resample (slow/medium/fast/manual)
- Show **overlaid theoretical normal curve** on the sampling distribution (the one CLT predicts)
- Show stats: population mean, population SD, theoretical SE = σ/√n, sample mean of means, sample SD of means
- Add **pause/resume** button
- Import shared components

---

### Tool 4: Confidence Intervals (`ConfidenceIntervalsTool.tsx`)

**Current**: Coverage simulation with sliders for n and k. No data input.

**Upgrade to two tabs:**

**Tab 1: "Your Data"**
- Textarea to paste raw data values
- Auto-compute sample mean, sample SD, n
- Compute CI using t-distribution (since σ unknown)
- Show: point estimate, SE, margin of error, lower bound, upper bound
- Confidence level selector: 90%, 95%, 99%, or custom (number input)
- Visual: horizontal CI bar with point estimate marked
- Interpretation text: "We are 95% confident that the true population mean lies between [L, U]"
- Sample data button

**Tab 2: "Summary Stats"**  
- Number inputs for: x̄, s (or σ), n
- Toggle: σ known (z-interval) vs σ unknown (t-interval)
- Same output as Tab 1

**Tab 3: "Coverage Simulation"** (keep current visualization)
- Keep the existing coverage simulation but add number inputs alongside sliders
- Add confidence level selector

Use `zCI`, `tCI` from `shared/stats.ts`

---

### Tool 5: Hypothesis Testing (`HypothesisTestTool.tsx`)

**Current**: Only a z-test with sliders for z-stat and alpha. Very limited.

**Complete rewrite with tabs for each test type:**

**Tab: "One-Sample Z"**
- Number inputs: x̄, μ₀, σ, n
- Alpha selector: 0.01, 0.05, 0.10, or custom
- Tail selector: two-tailed, left-tailed, right-tailed
- Keep the SVG bell curve with shaded rejection regions and test statistic marker
- Output: z-stat, p-value, critical value, verdict pill, effect size (Cohen's d)
- Step-by-step calculation

**Tab: "One-Sample T"**
- Textarea to paste raw data OR number inputs for summary stats (x̄, s, n)
- μ₀ input
- Same alpha/tail selectors
- Same visualization but t-distribution curve
- Output: t-stat, df, p-value, critical value, verdict, effect size
- Sample data button

**Tab: "Two-Sample T"**
- Two textareas for Sample 1 and Sample 2 data
- OR summary stat inputs for each (x̄₁, s₁, n₁, x̄₂, s₂, n₂)
- Welch's t-test (default)
- Same visualization and outputs

**Tab: "Paired T"**
- Two textareas (must be same length)
- Computes differences, runs one-sample t-test on diffs vs 0
- Shows difference distribution

**Tab: "Chi-Square"**
- Table input for observed frequencies (add/remove categories)
- Expected frequencies (auto-compute uniform or enter manually)
- Chi-square distribution visualization
- Output: χ², df, p-value, critical value, verdict

Use `zTest`, `tTest`, `welchTest`, `pairedTTest`, `chi2GoF` from `shared/stats.ts`
Use `Verdict`, `Tabs`, `NumberInput`, `DataTextArea`, `StepByStep` from `shared/ui.tsx`

---

### Tool 6: Bootstrap Sampling (`BootstrapTool.tsx`)

**Current**: Just wraps a demo component. Nearly empty (20 lines).

**Complete rewrite:**
- **Data input**: Textarea to paste data or sample data button
- **Statistic selector** (dropdown): Mean, Median, Standard Deviation, Custom percentile
- **B (# resamples)** control: slider + number input, range 100–10,000
- **Run button**: generates all bootstrap resamples
- **Visualization**: Histogram of bootstrap statistics with vertical line at observed statistic
- **Output stats**:
  - Original sample statistic
  - Bootstrap mean of statistic
  - Bootstrap standard error
  - 95% Bootstrap CI (percentile method): [2.5th, 97.5th percentile]
- **Animation mode**: toggle to watch resamples accumulate one by one
- Show formula/explanation of bootstrap method

---

### Tool 7: Monte Carlo π (`MonteCarloPiTool.tsx`) — Minor Polish

**Current**: Actually decent — auto-running simulation with pause/reset.

**Minor additions:**
- Add **speed control** (slow/medium/fast)
- Add **convergence chart**: small line chart below showing π estimate over time
- Add number input for manual point count
- Keep everything else

---

### Tool 8: Markov Chain (`MarkovChainTool.tsx`)

**Current**: Just wraps a demo. Nearly empty.

**Complete rewrite:**
- **Editable transition matrix**: 2×2, 3×3, or 4×4 (dropdown to choose size)
  - Grid of number inputs for each probability
  - Row sums displayed; warning if row doesn't sum to 1.0
  - "Normalize rows" button
- **State graph**: SVG visualization with nodes (circles) and directed edges (arrows)
  - Edge thickness proportional to transition probability
  - Current state highlighted (orange)
  - Active outgoing edges highlighted
- **Simulation controls**:
  - "Step" button (advance one step)
  - "Auto-run" toggle with speed control
  - "Reset" button
  - Starting state selector
- **Visit frequency**: Bar chart showing empirical visit frequency vs. theoretical stationary distribution
- **Stationary distribution**: Compute and display π vector
- **Step history**: Scrollable log showing state sequence

---

### Tool 9: Random Walk (`RandomWalkTool.tsx`)

**Current**: Single path with drift slider.

**Upgrade to:**
- Add **number input for drift** alongside slider
- Add **number of paths** selector: 1, 5, 10, 25, 50 (draw multiple simultaneous paths)
- Add **step distribution** selector: Normal, Uniform, Custom
- Add **mean reversion strength** slider
- **Stats panel**: Current value, max reached, min reached, mean across paths, variance
- **2D mode** toggle: switch between 1D line chart and 2D scatter path
- Reset and pause buttons

---

### Tool 10: Bar Chart (`BarChartTool.tsx`)

**Current**: Hardcoded groups with random data, sliders for n and σ.

**Upgrade to:**
- **Editable groups**:
  - Default 3 groups with editable names
  - Add/remove group buttons
  - Textarea per group OR one big textarea (tab-separated)
  - Sample data button
- **Computed stats per group**: Mean, SD, SEM, 95% CI, n
- **One-way ANOVA** (auto-computed when ≥ 2 groups):
  - F-statistic, df, p-value, verdict
  - Display as a card below the chart
- **Sort toggle**: By name or by value
- **Error bar options**: SEM, SD, 95% CI
- Keep the SVG bar chart with transitions
- Use `oneWayANOVA` from `shared/stats.ts`

---

### Tool 11: Line Chart (`LineChartTool.tsx`)

**Current**: Two hardcoded series with treatment effect.

**Upgrade to:**
- **Data input**: Textarea for each series (or single textarea with columns)
- Default: keep the treatment/control demo with sliders
- **Add/remove series** (up to 4)
- **Moving average overlay**: Toggle on/off, window size slider
- **Summary stats** per series in side panel: mean, SD, min, max, trend
- Sample data button
- Keep SVG rendering

---

### Tool 12: Scatter Plot (`ScatterTool.tsx`)

**Current**: Random bivariate normal with ρ slider.

**Upgrade to:**
- **Data Input tab**: Textarea to paste X,Y pairs
- Keep **Simulation tab** with ρ, n sliders (current behavior)
- **Regression overlay toggle**: Show/hide OLS line
- **Correlation output**: Pearson r, Spearman ρ, r², p-value for r
- **Click-to-add points** in interactive mode
- Sample data button
- Use `pearsonR`, `spearmanRho`, `ols` from `shared/stats.ts`

---

### Tool 13: Box Plot (`BoxPlotTool.tsx`)

**Current**: 4 hardcoded distribution groups with n slider.

**Upgrade to:**
- **Data Input tab**: Textarea per group, add/remove groups, editable names
- Keep **Simulation tab** (current behavior)
- **Strip plot overlay** toggle: Show individual data points (jittered) on top of box
- **Stats table**: Show Q1, median, Q3, IQR, whisker bounds, # outliers, mean per group
- Sample data button

---

### Tool 14: Heatmap (`HeatmapTool.tsx`)

**Current**: Random correlation matrix with n slider.

**Upgrade to:**
- **Data Input tab**: Paste CSV/TSV data matrix (rows = observations, columns = variables)
  - Parse header row for variable names
  - Compute Pearson correlation matrix
- Keep **Simulation tab** (current latent factor demo)
- **Cell click detail**: Click a cell to see scatter plot of those two variables (small inset)
- **Color scale** selector: Diverging (default), Sequential
- **Significance indicators**: Asterisks (* p<0.05, ** p<0.01, *** p<0.001) in cells
- Sample data button

---

### Tool 15: Violin Plot (`ViolinTool.tsx`)

**Current**: 3 hardcoded groups with n slider.

**Upgrade to:**
- **Data Input tab**: Textarea per group, add/remove groups, editable names
- Keep **Simulation tab** (current behavior)
- **Bandwidth control** slider (Silverman default, but adjustable)
- **Overlay options** checkboxes:
  - Show individual data points (beeswarm/jittered)
  - Show box plot inside violin
  - Show mean marker
- **Stats per group**: n, mean, median, SD
- Sample data button
- Use `kde`, `silvermanBandwidth` from `shared/stats.ts`

---

### Tool 16: Bayesian Inference (`BayesianTool.tsx`)

**Current**: Sliders for prior α, β, trials n, successes k. Good viz but limited.

**Upgrade to:**
- **Number inputs alongside all sliders** (α, β, n, k)
- **Sequential update mode**:
  - "Add observation" button (success/failure) — updates posterior step by step
  - Log showing the posterior after each observation: "Obs 1: success → Beta(3, 2)"
  - Reset button
- **Credible interval**: Show 95% HPD interval on the posterior curve
- **Prior presets** dropdown: Uniform Beta(1,1), Jeffreys Beta(0.5,0.5), Informative Beta(10,10), Custom
- **Posterior summary**: Mean, Mode, Variance, 95% CI
- Keep the prior/posterior overlay SVG (it's good)

---

### Tool 17: Causal Inference (`CausalTool.tsx`)

**Current**: Confounder strength slider, nice dual-panel viz. Decent.

**Upgrade to:**
- **Number inputs for confounder strength and true effect** alongside sliders
- **Editable true effect** (currently hardcoded at 0.4)
- **Sample size control** (currently hardcoded at 160) — add slider + number input
- **Data paste option**: Three columns (X, Y, Z) textarea
- **More adjustment methods** in a tab: Naive, Adjusted (current), Matching (basic)
- Keep the DAG visualization (it's great)

---

### Tool 18: Time Series (`TimeSeriesTool.tsx`)

**Current**: AR(1) with φ slider, series + ACF plot. Good viz.

**Upgrade to:**
- **Data Input tab**: Paste your own time series values
  - Compute and display ACF from user data
  - Show series plot + ACF
- Keep **Simulation tab** (current AR(1) behavior)
- **Model selector** in simulation: AR(1), AR(2), MA(1), ARMA(1,1)
  - AR(2): two φ sliders
  - MA(1): one θ slider
  - ARMA(1,1): φ + θ sliders
- **Sample stats**: Mean, variance, ADF-like stationarity indicator
- **Number input for φ** alongside slider
- Use `acf` from `shared/stats.ts`

---

## Lab Dashboard (AppClient.tsx Modification)

When the user navigates to `/app` with **no `?tool=` query param**, show a **dashboard home** instead of loading the default tool.

### Dashboard contents:
- **Welcome header**: "Welcome to the Lab" with subtitle
- **Quick-launch grid**: 6 featured tools as clickable cards with:
  - Tool name, group badge, one-line description
  - Hover effect: slight scale + shadow
  - Cards: Linear Regression, Hypothesis Testing, Confidence Intervals, Normal Distribution, CLT, Bayesian
- **All Tools section**: Full grouped list (Models, Distributions, Inference, Simulation, Charts, Methods) as a card grid
- **Recent tools**: Show last 3 tools used (from localStorage) at the top if available

### Implementation:
- Create a new `LabDashboard.tsx` component in `/landing/components/`
- Modify `AppClient.tsx`: if no `tool` param and no matching tool, render `<LabDashboard />` instead of `<NotFound />`
- Store recent tools in localStorage key `statslab_recent_tools` (array of tool IDs, max 5)

---

## Design Guidelines

1. **Keep the current design system** — neutral colors, clean borders, Inter + Source Serif fonts, orange (#fb923c) accent
2. **Every tool must have**:
   - A way to **input your own data** (textarea, number inputs, or both)
   - A **sample data button** that loads example data
   - **Computed output stats** in the side panel
   - **SVG visualization** that updates reactively
3. **Use the shared components** from `shared/ui.tsx` — don't recreate Field, Stat, Tabs, etc.
4. **Use the shared stats functions** from `shared/stats.ts` — don't re-implement mean, sd, regression, etc.
5. **Two-column layout**: Chart on left (2/3 width), controls on right (1/3 width) using `grid grid-cols-1 lg:grid-cols-3`
6. **Tabs** for tools with multiple modes (e.g., "Interactive" | "Data Input" | "Simulation")
7. **No external chart libraries** — all charts are inline SVG
8. **Mobile responsive** — single column on small screens

---

## Files NOT to Modify

- `/landing/app/page.tsx` (landing page)
- `/landing/app/signin/` (sign-in page)
- `/landing/components/Hero.tsx`, `Navbar.tsx`, `Footer.tsx`, etc. (landing components)
- `/landing/components/demos/` (landing page demos)
- `/landing/lib/useAuth.ts` (auth stub)
- Anything in the root `/` Streamlit app (app.py, pages/, components/, core/, tools/)

---

## Verification

After implementing all tools:
1. Run `cd landing && npm run build` — must pass with zero TypeScript errors
2. Run `cd landing && npm run dev` — verify each tool loads and works
3. Each tool should:
   - Accept user data input (paste or type)
   - Show correct statistical computations
   - Render SVG visualizations that update reactively
   - Have a sample data button that works
   - Be mobile responsive (single column on small screens)
