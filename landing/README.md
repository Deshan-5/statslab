# Stats Lab — landing + lab (Next.js 14 / App Router)

Interactive marketing landing **and** the lab itself. 18 working tools (regression,
distributions, inference, Bayes, time series, ...) plus an interactive sign-in
experience and route-protected `/app`.

## Quick start

```bash
cd landing
npm install
cp .env.example .env.local       # then fill in any keys you have
npx prisma db push --accept-data-loss   # creates prisma/dev.db (SQLite)
npm run dev
# → http://localhost:3000
```

By default `NEXT_PUBLIC_AUTH_MODE=demo` — clicks fall through localStorage and the
Lab is reachable immediately. Flip to `NEXT_PUBLIC_AUTH_MODE=real` plus the
provider env vars below for real OAuth + magic-link.

## Auth modes

| Mode | When | Behaviour |
|---|---|---|
| `demo` | default | Sign-in page sets `localStorage.statslab_session = "demo"`. No DB writes, no real session. Useful for design / preview deployments. |
| `real` | env var set | Auth.js v5 (NextAuth) with Prisma adapter. Real Google + GitHub OAuth and magic-link via Resend. JWT session strategy, Edge-runtime middleware enforces `/app/*` protection server-side. |

### Going live (real auth)

Edit `.env.local`:

```bash
NEXT_PUBLIC_AUTH_MODE="real"
DATABASE_URL="postgres://…"      # use Neon / Supabase / RDS in production
AUTH_SECRET="$(openssl rand -base64 32)"

# Pick at least one provider:
AUTH_GOOGLE_ID="…"
AUTH_GOOGLE_SECRET="…"

AUTH_GITHUB_ID="…"
AUTH_GITHUB_SECRET="…"

AUTH_RESEND_KEY="re_…"
AUTH_EMAIL_FROM="Stats Lab <no-reply@yourdomain.com>"
```

Each provider is **optional**; missing credentials silently disable that
button. Resend requires a verified sender domain — see https://resend.com/docs.

For Postgres, change `prisma/schema.prisma` `provider = "postgresql"` then
`npx prisma migrate dev`.

## Architecture

```
landing/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Inter + Source Serif 4, SessionProvider, OG metadata
│   ├── page.tsx                      # Landing (hero, gallery, learn, customize, …)
│   ├── api/auth/[...nextauth]/       # Auth.js handler
│   ├── signin/                       # Interactive canvas sign-in
│   ├── app/                          # The Lab (route-protected)
│   ├── blog · careers · privacy · terms (stub pages)
├── components/
│   ├── tools/                        # 18 interactive lab tools
│   ├── demos/                        # 9 small live demos for the gallery
│   ├── Navbar / Hero / … / Footer
│   ├── SmartLink.tsx                 # auth-aware Link (skips /signin if authed)
│   ├── AuthGuard.tsx                 # /app client-side guard (defence in depth)
│   └── Providers.tsx                 # next-auth SessionProvider wrapper
├── lib/
│   ├── prisma.ts                     # Prisma client singleton
│   ├── tools.ts                      # Tool registry (id → component)
│   └── useAuth.ts                    # Dual-mode hook (demo | real)
├── prisma/schema.prisma              # Auth.js standard schema (User/Account/Session/VerificationToken)
├── auth.config.ts                    # Edge-safe Auth.js config (middleware imports this)
├── auth.ts                           # Full Auth.js (Prisma adapter)
├── middleware.ts                     # Edge middleware: protects /app/*
└── .env.example                      # Documented env vars
```

### Why the auth split

Auth.js v5 supports Edge middleware for instant 401s without a DB roundtrip,
**but** the Prisma adapter pulls in Node-only APIs.  The standard pattern
isolates the Edge-safe bits (`auth.config.ts`) from the Node-only bits
(`auth.ts`). Middleware imports `auth.config`; everything else imports `auth`.

## Routes

| Path | Description |
|---|---|
| `/` | Landing (Hero → Gallery → Learn → Prompt-to-Viz → Customize → Closing) |
| `/signin?next=/app` | Canvas sign-in — points repel from cursor, regression line + R² update live |
| `/app?tool=<id>` | The Lab (route-protected). 18 tool ids — see `lib/tools.ts` |
| `/app?tab=tutor` | Right-rail tutor drawer |
| `/blog`, `/careers`, `/privacy`, `/terms` | Stub pages |
| `/api/auth/*` | Auth.js callback / sign-in / session endpoints |

## Build & test

```bash
npm run build       # production build, all 8 routes prerendered static
npm run lint
```

## Production checklist (before public launch)

- [x] Real auth wired (Auth.js v5 + Prisma + Resend)
- [ ] Migrate `DATABASE_URL` from SQLite to Postgres (Neon / Supabase / RDS)
- [ ] Generate `AUTH_SECRET`, set `AUTH_URL` to your production https origin
- [ ] Verify a Resend sender domain
- [ ] Add Sentry (error tracking) + Vercel Analytics (Web Vitals)
- [ ] Replace `/privacy` and `/terms` placeholder copy with reviewed legal text
- [ ] Real OG image (`public/og.png`), favicon, sitemap, `robots.ts`
- [ ] Wire `/api/tutor` to Gemini (port logic from the Streamlit `components/chatbot.py`)
- [ ] Save / load Lab state to DB (Workspace + Result tables)
- [ ] Stripe + `/pricing` when ready to monetize
- [ ] CI: `lint && build && playwright test` on PRs
