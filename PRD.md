# Stats Lab — Product Requirements Document

## Overview

Stats Lab is a free, web-based interactive statistics workbench built around three pillars:

1. **Statistical Tools** — 22 interactive instruments for analysis, inference, simulation, and visualization. Every tool works standalone with interactive controls and accepts real user data.
2. **Dataset Understanding** — Drop any CSV/TSV. See a visible data table, auto-detected column types, smart test suggestions, and detailed column statistics. The data persists across tools.
3. **AI-Assisted Learning** — An integrated tutor that explains statistical concepts, interprets results in plain language, and guides users through choosing the right test for their data.

**Target users**: Students learning statistics, researchers running quick analyses, data analysts who want results without writing code.

**Competitive positioning**: Free alternative to Numiqo (paid), JASP/jamovi (desktop install), and StatKey (toy data only). We combine the interactivity of a teaching tool with the power of a real analysis platform.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router) — all code in `/landing/`
- **Styling**: Tailwind CSS 3
- **Animation**: framer-motion (for smooth glassmorphic transitions and layout changes)
- **Icons**: lucide-react (no emojis anywhere in UI)
- **Charts**: Pure SVG (no chart libraries, custom interactive SVG canvas controls)
- **State**: React useState/useMemo + WorkspaceProvider context for shared dataset
- **Data pipeline**: Custom CSV/TSV parser in `stats.ts` with robust handling for quoted fields, currency, percentages, and messy data
- **Linear Algebra**: Custom matrix arithmetic engine (`transpose`, `multiply`, `invertMatrix` via Gaussian elimination with partial pivoting) for client-side multivariate regression solver
- **Export Serializer**: Color substitution serializer that replaces Tailwind CSS variable references with absolute HEX values during exports (SVG/PNG/CSV) for Figma/Illustrator compatibility

---

## Architecture

```
landing/
├── app/
│   ├── app/              ← Lab workspace (AppClient.tsx)
│   │   └── AppClient.tsx ← Main layout: header + sidebar + main + data strip
│   ├── api/analyze/      ← API route for dataset insights
│   ├── blog/             ← Blog placeholder
│   ├── careers/          ← Careers placeholder
│   ├── privacy/          ← Privacy page
│   ├── terms/            ← Terms page
│   ├── page.tsx          ← Landing page
│   └── layout.tsx        ← Root layout + metadata
├── components/
│   ├── tools/            ← 22 statistical tool components
│   │   ├── shared/
│   │   │   ├── stats.ts  ← Pure math library (900+ lines, matrix arithmetic, regression calculations)
│   │   │   └── ui.tsx    ← Shared UI components (Field, Stat, Tabs, etc.)
│   │   ├── LinearRegressionTool.tsx
│   │   ├── HypothesisTestTool.tsx
│   │   └── ... (20 more)
│   ├── workspace/        ← Dataset management
│   │   ├── WorkspaceProvider.tsx  ← React context for shared dataset
│   │   ├── ColumnPicker.tsx       ← Column selection dropdown
│   │   ├── DataStrip.tsx          ← Bottom dataset panel with wrangling, filters, and transforms
│   │   ├── TutorPanel.tsx         ← Slide-out AI Tutor panel
│   │   ├── NarrativeReport.tsx    ← Interactive narrative generation
│   │   └── DatasetSidebar.tsx     ← [DEPRECATED] (Replaced by DataStrip)
│   ├── DataDropZone/     ← Advanced dataset drop interface
│   │   ├── index.tsx              ← Orchestrator
│   │   ├── DataTable.tsx          ← Paginated data table (defaults to 20 rows, custom limit settings)
│   │   ├── DataQualityBadge.tsx   ← Glassmorphic quality indicator (Overview, Issues, Schema)
│   │   ├── StatCards.tsx          ← Detailed stats & distribution guess cards
│   │   └── analyse.ts             ← Rule-based analytical scanner
│   ├── CommandPalette.tsx ← Cmd+K search
│   └── demos/            ← Landing page demo components
├── lib/
│   ├── tools.ts          ← Tool registry (22 tools, ids, names, groups, components)
│   ├── dataset.ts        ← Dataset type definitions + builder
│   └── examples/         ← Built-in example datasets
```

---

## Design Principles

### No AI branding
- No emojis in the UI. Use Lucide icons only.
- No AI-style language ("Great!", "Let's analyze!"). Clinical, professional language.
- No chatbot personas. The "Ask" panel is a help utility, not a character.
- The product should feel like a research tool built by engineers.

### Dual-mode tools
- Every tool works **standalone** with interactive controls and demo data.
- When a dataset is loaded, a **"Workspace" tab** appears automatically.
- No dead-end "please load data first" screens.

### Data follows you
- Loaded dataset persists across tool switches via WorkspaceProvider context.
- Dataset info shown in a **persistent bottom strip** (`DataStrip.tsx`), not inside tools.
- Drop a CSV once, use it in every tool.

### Visual design
- Clean, neutral color palette. Orange (#fb923c) accent.
- Full dark mode support.
- Two-column layout: chart (2/3) + controls (1/3) via `ToolGrid`.
- All charts are inline SVG, responsive.

---

## App Layout

```
+----------------------------------------------------------+
|  Stats Lab    [Cmd+K Search]              [Theme] [Ask]  | 48px header
+--------+-------------------------------------------------+
|        |                                                 |
| DATA   |  MAIN WORKSPACE                                 |
| ----   |                                                 |
| Models |  No tool selected = DATA VIEW                   |
|  Lin.  |    Drop zone + data table + suggestions         |
|  Reg.  |                                                 |
| ----   |  Tool selected = TOOL WORKSPACE                 |
| Distr. |    Chart + controls + interpretation             |
|  Norm  |    (works without any dataset loaded)            |
| ----   |                                                 |
| Infer. |                                                 |
|  CLT   |                                                 |
| ----   |                                                 |
| Charts |                                                 |
|  Bar   |                                                 |
+--------+-------------------------------------------------+
| employees.csv - 500x12  [Age] [Salary] [Dept]       [+] | persistent DataStrip
+----------------------------------------------------------+
```

### Components
- **Header** (48px): Logo, Cmd+K search, theme toggle, Ask button
- **Sidebar** (220px, resizable): "Data" link at top, then tool groups (Models, Distributions, Inference, Simulation, Charts, Methods)
- **Main panel**: Either LabDashboard (data view) or ToolCanvas (active tool)
- **Data panel (DataStrip)**: Persistent bottom panel showing loaded dataset.
  - **Collapsed**: 40px bar with filename, row/col count, column type chips.
  - **Expanded**: Animated slide-up panel (380px) displaying active tabular filters, column settings dropdowns (transforms, imputation, row cleaning), and an interactive grid preview.

---

## Data Pipeline

### Flow
1. User drops CSV/TSV file or pastes data into DataDropZone.
2. `parseCSV()` in `stats.ts` handles: quoted fields, multi-line values, currency, percentages, pipe delimiters.
3. Data is sent to WorkspaceProvider via `loadCSV()`.
4. All tools can access data via `useWorkspace()` hook.
5. DataDropZone shows: paginated data table (defaults to 20 rows, supports 10, 20, 50, 100 limit selectors), smart suggestions, column stats, insights, and a glassmorphic quality assessment.

### Smart Analyze (rule-based, no API)
After parsing, auto-detect patterns and suggest tests:
- 1 numeric + 1 categorical → Group comparison → Bar Chart + ANOVA
- 2 numerics with |r| > 0.5 → Correlation → Linear Regression + Scatter
- |skewness| > 1 → Distribution warning → Q-Q Plot
- 3+ numeric columns → Correlation overview → Heatmap
- Sequential first column → Time series → Time Series + Line Chart

Each suggestion shows a Lucide icon, title, one-line explanation, and tool links.

### Interpretation panels
Every tool that produces results includes a structured interpretation block:
```
Verdict:  Reject H0
Test:     One-way ANOVA, F(4, 495) = 4.82
P-value:  0.003
Effect:   eta-squared = 0.14 (medium)
Summary:  Salary means differ significantly across departments.
```
Style: rounded border, neutral background, monospace numbers, professional language.

### Export Services
- **Vector SVG Export**: Extracts inline SVG charts, Substitutes Tailwind CSS theme variables (e.g. `var(--chart-ink)`, `var(--chart-accent)`) with absolute HEX codes (`#171717`, `#fb923c`), making assets directly compatible with Adobe Illustrator and Figma.
- **PNG Export**: Automatically generates high-definition raster versions scaled at 2x crispness using canvas rendering, fallback sizing, and background color matching.
- **CSV Data Export**: Sanitizes tabular statistics during copy/download by stripping auxiliary DOM elements (e.g. icons, control buttons, screen-reader text) for raw spreadsheet compatibility.

---

## Tool Registry (All 22 tools completed)

### Models
| Tool | ID | Status |
|------|----|--------|
| Linear Regression | `linear-regression` | Complete (workspace support + interactive + data input) |

### Distributions
| Tool | ID | Status |
|------|----|--------|
| Normal Distribution | `normal-distribution` | Complete (workspace support) |
| Distribution Explorer | `distribution-explorer` | Complete (workspace support) |

### Inference
| Tool | ID | Status |
|------|----|--------|
| Central Limit Theorem | `central-limit-theorem` | Complete (workspace support) |
| Confidence Intervals | `confidence-intervals` | Complete (workspace support + interpretation) |
| Hypothesis Testing | `hypothesis-test` | Complete (workspace support + interpretation) |
| Bootstrap Sampling | `bootstrap-sampling` | Complete (workspace support + interpretation) |
| Q-Q Plot | `qq-plot` | Complete (workspace support) |
| Power & Sample Size | `power-calculator` | Complete (workspace support + interpretation) |

### Simulation
| Tool | ID | Status |
|------|----|--------|
| Monte Carlo Pi | `monte-carlo-pi` | Complete (standalone) |
| Markov Chain | `markov-chain` | Complete (standalone) |
| Random Walk | `random-walk` | Complete (standalone) |

### Charts
| Tool | ID | Status |
|------|----|--------|
| Bar Chart | `bar-chart` | Complete (workspace support + error bars + interpretation) |
| Line Chart | `line-chart` | Complete (workspace support + interpretation) |
| Scatter | `scatter` | Complete (workspace support + interactive correlation ρ control) |
| Box Plot | `box-plot` | Complete (workspace support) |
| Heatmap | `heatmap` | Complete (workspace support + interpretation) |
| Violin | `violin` | Complete (workspace support + interpretation) |

### Methods
| Tool | ID | Status |
|------|----|--------|
| Bayesian Inference | `bayesian` | Complete (workspace support + interpretation) |
| Causal Inference | `causal` | Complete (Interactive DAG builder, backdoor path solver, minimal adjustment set selector, multivariate regression estimator) |
| Time Series | `time-series` | Complete (workspace support + interpretation) |
| PCA / Biplot | `pca` | Complete (workspace support) |

---

## Shared Libraries

### stats.ts (pure math, no React)
- **Random**: `rngFor(seed)`, `gauss()`
- **Descriptive**: `mean()`, `variance()`, `sd()`, `sem()`, `median()`, `quantile()`, `iqr()`, `skewness()`, `kurtosis()`
- **Linear Algebra**: `transpose()`, `multiply()`, `invertMatrix()` (Gaussian elimination with partial pivoting)
- **Regression**: `ols()`, `multipleRegression()` (multivariate regression coefficients and stats)
- **Distributions**: `normalPDF()`, `normalCDF()`, `normalInv()`, `tCDF()`, `tCrit()`, `chi2CDF()`
- **Hypothesis tests**: `zTest()`, `tTest()`, `welchTest()`, `pairedTTest()`, `chi2GoF()`, `oneWayANOVA()`
- **CI**: `zCI()`, `tCI()`
- **Correlation**: `pearsonR()`, `spearmanRho()`
- **Other**: `kde()`, `silvermanBandwidth()`, `acf()`, `detectDistribution()`
- **Parsing**: `parseNumbers()`, `parsePairs()`, `parseCSV()`, `parseCSVRows()`, `parseNumericValue()`

### ui.tsx (shared React components)
- **Layout**: `Panel`, `ToolGrid`, `Tabs`, `Collapsible`
- **Inputs**: `Field`, `NumberInput`, `DataTextArea`, `Select`
- **Display**: `Stat`, `Verdict`, `Formula`, `StepByStep`
- **Actions**: `Btn`, `SampleDataButton`

### WorkspaceProvider.tsx (dataset context)
- `useWorkspace()` returns: `dataset`, `loadCSV()`, `loadExample()`, `clearDataset()`, `numericColumns`, `categoricalColumns`, `selection`, `setSelection`, `isSelected`
- Dataset persists to localStorage and hydrates on mount
- Tools consume via `useWorkspace()` and `ColumnPicker`

---

## Next Steps / Production Roadmap

1. **Authentication Mode Activation**: Migrate from `demo` to `real` Auth.js v5 with Postgres and Resend in production.
2. **Database Integration**: Switch `DATABASE_URL` from local SQLite to a serverless Postgres instance (Neon / Supabase).
3. **AI Chatbot Connection**: Connect the tutoring panel (`/api/tutor` route) to a Gemini API key.
4. **WASM / Web Workers Offloading**: Move heavy computations (e.g. Bootstrap Sampling, Monte Carlo simulations) to Web Workers to ensure a 60fps main UI thread.
5. **E2E Test Suite**: Add Playwright test suite coverage for critical user journeys (file drop, tool navigation, SVG exports).

---

## Verification

To verify build correctness:
1. Run strict type-checks: `cd landing && npx tsc --noEmit` — must return 0 errors.
2. Run production build: `npm run build` — must finish successfully.
3. Every tool must function in dual mode (standalone interactive / workspace data).
