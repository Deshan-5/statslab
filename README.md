# Stats Lab

An AI-powered statistics learning + visualisation tool. Marketing landing
page plus a 18-tool interactive lab (regression, distributions, inference,
simulation, charts, methods).

## Quick start

```bash
cd landing
npm install
npm run dev
# → http://localhost:3000
```

## Layout

```
probability-lab/
├── PRD.md                  ← product requirements doc
├── README.md
└── landing/                ← the entire app (Next.js 14 / App Router)
    ├── app/                ← landing + /app + stub pages
    ├── components/         ← landing chrome, tool components, shared UI
    ├── lib/                ← tool registry
    └── public/
```

See `landing/README.md` for full Next.js setup, dark-mode notes, and the
production-readiness checklist.
