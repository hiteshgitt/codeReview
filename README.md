# Web Audit Pro

A production-ready full-stack web application for comprehensive website quality auditing. Analyses performance, accessibility, SEO, code quality, responsiveness, best practices, and UX/UI — then generates a scored report with a downloadable PDF.

---

## Architecture

```
web-audit-pro/
├── backend/                 # Node.js + Express + TypeScript API
│   ├── prisma/              # PostgreSQL schema (Prisma ORM)
│   ├── src/
│   │   ├── config/          # DB, Redis, app config
│   │   ├── controllers/     # Route handlers
│   │   ├── middleware/       # Auth, error, validation
│   │   ├── routes/          # Express routers
│   │   ├── services/
│   │   │   └── analysis/    # Lighthouse, SEO, responsiveness, UX, code quality
│   │   ├── workers/         # BullMQ audit worker
│   │   └── types/           # Shared TypeScript types
│   └── Dockerfile
│
├── frontend/                # Next.js 14 (App Router) + Tailwind CSS
│   └── src/
│       ├── app/             # Pages (landing, auth, dashboard)
│       ├── components/      # Reusable UI components
│       ├── lib/             # API client, utilities
│       ├── store/           # Zustand state management
│       └── types/           # Shared types
│
└── docker-compose.yml       # PostgreSQL + Redis + API + Worker + Frontend
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Zustand, Recharts |
| Backend | Node.js, Express, TypeScript |
| Queue | BullMQ + Redis |
| Database | PostgreSQL + Prisma ORM |
| Analysis | Lighthouse, Puppeteer, Cheerio, simple-git |
| Auth | JWT (RS256) |
| PDF | Puppeteer |

---

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 7+
- Google Chrome / Chromium (for Lighthouse + PDF generation)

---

## Quick Start — Local Development

### 1. Start infrastructure

```bash
docker compose up postgres redis -d
```

### 2. Backend setup

```bash
cd backend
cp .env.example .env
# Edit .env with your settings

npm install
npm run db:migrate    # Run Prisma migrations
npm run dev           # Start API on :4000
```

In a separate terminal:

```bash
cd backend
npm run worker        # Start BullMQ audit worker
```

### 3. Frontend setup

```bash
cd frontend
cp .env.local.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:4000/api

npm install
npm run dev           # Start Next.js on :3000
```

Open [http://localhost:3000](http://localhost:3000).

---

## Production — Docker Compose

```bash
# Copy env files
cp backend/.env.example backend/.env
# Edit backend/.env with production values

docker compose up --build -d
```

All services start:
- `wap_postgres` — PostgreSQL on :5432
- `wap_redis` — Redis on :6379
- `wap_backend` — API on :4000
- `wap_worker` — BullMQ worker
- `wap_frontend` — Next.js on :3000

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | — |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `JWT_SECRET` | Secret for signing JWTs | — |
| `JWT_EXPIRES_IN` | Token expiry | `7d` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:3000` |
| `PUPPETEER_EXECUTABLE_PATH` | Path to Chrome binary | auto-detect |
| `AUDIT_TIMEOUT_MS` | Max time per audit | `120000` |
| `MAX_CONCURRENT_AUDITS` | Worker concurrency | `3` |
| `AUDIT_TMP_DIR` | Temp directory for repo cloning | `/tmp/web-audit-pro` |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL |

---

## API Reference

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Sign in |
| `GET` | `/api/auth/me` | Get current user |

### Audits

All audit routes require `Authorization: Bearer <token>`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/audits` | Create + queue audit |
| `GET` | `/api/audits` | List audits (paginated) |
| `GET` | `/api/audits/:id` | Get audit detail |
| `DELETE` | `/api/audits/:id` | Delete audit |
| `GET` | `/api/audits/stats` | Summary statistics |
| `GET` | `/api/audits/:id/report/pdf` | Download PDF report |

---

## Audit Categories

| Category | Weight | Analysis Source |
|---|---|---|
| Performance | 20% | Lighthouse (LCP, CLS, FCP, TBT) |
| Accessibility | 20% | Lighthouse + Cheerio |
| SEO | 15% | Lighthouse + custom HTML parser |
| Best Practices | 15% | Lighthouse |
| Code Quality | 15% | Repository static analysis |
| Responsiveness | 10% | Cheerio + CSS analysis |
| UX / UI | 5% | Cheerio + heuristics |

---

## Issue Severity

| Severity | Description |
|---|---|
| **Critical** | Blocks users or search engines; must fix immediately |
| **Major** | Significant impact on UX, SEO, or security |
| **Minor** | Small improvements that improve quality |
| **Suggestion** | Best-practice recommendations |

---

## Development Commands

```bash
# Backend
npm run dev          # Development server (nodemon + ts-node)
npm run build        # Compile TypeScript
npm run worker       # Start BullMQ worker
npm run db:generate  # Regenerate Prisma client
npm run db:migrate   # Run migrations
npm run db:studio    # Open Prisma Studio

# Frontend
npm run dev          # Next.js dev server
npm run build        # Production build
npm run type-check   # TypeScript check
npm run lint         # ESLint
```

---

## License

MIT
