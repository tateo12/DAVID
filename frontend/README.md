# Sentinel Command (Stitch UI)

Next.js dashboard for **Sentinel**, styled from the **Stitch “Sentinel Command”** exports (`frontend/stitch (5)/` reference HTML + `DESIGN.md`).

## What it shows

1. **Command home (`/`)** — Bento layout: health ring, integrity bars, live intercepts, shadow radar, Scout probe; **managers** see **Automation & manual runs** (`/api/ops/tick` and dispatch buttons)
2. **Employees (`/employees`)** — Roster, risk gauges, detail sheet, Skill Hub (manual curriculum assign / complete)
3. **Prompts (`/prompts`)** — Audit trail, risk chips, expandable rows (search syncs with top bar)
4. **Policies (`/policies`)** — Managers build/edit rule JSON; employees view company policies (read-only)
5. **Shadow AI (`/shadow-ai`)** — 7-day metrics + incident table (sidebar + `lg` header)
6. **Reports (`/reports`)** — Weekly executive summary
7. **Curriculum (`/curriculum`)** — Imported course outline; content lessons; assign to employees
8. **Login (`/login`)** — Backend auth; JWT stored for manager-only policy writes and ops panel
9. **Not found** — `app/not-found.tsx` styled App Router 404 (avoids dev chunk errors on bad URLs)

## Stack

- Next.js (App Router), TypeScript, Tailwind
- Design tokens: `tailwind.config.ts` (lime `#c3f400`, surfaces `#111316` / `#1a1c1f`, primary `#c1c1ff`)
- Fonts: Space Grotesk (headlines), Inter (body), JetBrains Mono (data) — see `src/app/layout.tsx`
- Material Symbols — `material-symbols-outlined` in layout `<head>`
- Shell: `src/components/stitch/stitch-layout.tsx` (sidebar + top bar)
- Shadcn-style UI under `src/components/ui/`
- Charts: Recharts

## Local setup

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Ensure NEXT_PUBLIC_API_BASE=http://localhost:8000 (default in example)
npm run dev
```

App: **http://localhost:3000**

## API

The UI calls the FastAPI backend with prefix `/api`. Base URL comes from `NEXT_PUBLIC_API_BASE` (see `.env.local.example`). For local run, env, and API mapping, see the repo root **README.md** (**Agent / maintainer onboarding** and **Run a working local demo**).

## Layout / components

- **Do not** reintroduce the old `PageHeader`, `Sidebar`, `TopBar`, or `ThreatFeed` — they were removed in favor of `StitchLayout`.
- New pages should use Stitch tokens: `bg-background`, `bg-surface-container-low`, `text-white`, `text-on-surface-variant`, `border-outline-variant/10`, `text-secondary-fixed`, `font-headline`, `font-mono`.
- Optional utilities: `.glass-edge`, `.radial-gauge` in `globals.css`.
