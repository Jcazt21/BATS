# BATS

Backend + frontend for the PGL (PinchesGueys League) Pokémon Showdown tournament stack.

## Tech Stack

**Backend**
- Python 3.11+
- FastAPI 0.135.1 / Starlette 0.52.1
- psycopg2 (PostgreSQL driver)
- python-jose (JWT / Supabase Auth verification)
- PostgreSQL (Supabase-hosted)

**Frontend** (`web/`)
- React 19.2
- Vite 8.0
- TypeScript 5.9
- Tailwind CSS 4.2
- TanStack Query 5.103
- React Router 7.13
- Supabase JS client 2.116
- Recharts 3.8
- Vitest 5.0 (tests)

**Deployment**
- Vercel (static SPA + Python serverless function)
- Supabase (Postgres + Auth)

**Adjacent (separate checkout)**
- Pokémon Showdown server fork (Node.js, TypeScript) — battle simulator that BATS ingests data from
