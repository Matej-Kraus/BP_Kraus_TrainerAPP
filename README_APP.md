# Trainer App

[![CI](https://github.com/Matej-Kraus/bakalarska/actions/workflows/ci.yml/badge.svg)](https://github.com/Matej-Kraus/bakalarska/actions/workflows/ci.yml)

Webová aplikace pro trenéry a asistenty na evidenci zápasových událostí v reálném čase, vyhodnocení hráčů a sezónní analytiku.

## Funkce

- správa hráčů, sezón a zápasů
- příprava sestavy (starter/sub)
- live zapisování událostí během zápasu
- střídání, stavový průběh zápasu (1. poločas, poločas, 2. poločas, konec)
- hodnocení hráčů po utkání
- analytika za zápas i sezónu

## Technologie

- **Backend:** FastAPI, SQLAlchemy, Alembic, Uvicorn
- **Frontend:** React, TypeScript, Vite, Axios, TanStack Query, Recharts
- **DB:** SQLite (lokálně), PostgreSQL (produkce)
- **Auth:** JWT + RBAC (`coach`, `assistant`)

## Struktura projektu

- `backend/` - API, modely, služby, migrace
- `frontend/` - UI aplikace
- `docs/test-reports/` - test reporty

## Požadavky

- Python 3.11+
- Node.js 20+
- npm

---

## Lokální spuštění

### 1) Backend

```bash
cd backend
source ../.venv/bin/activate
pip install -r requirements.txt
```

Vytvoř `backend/.env` (můžeš vyjít z `backend/.env.example`):

```env
TRAINERAPP_SECRET_KEY=dev-secret-change-me
TRAINERAPP_DATABASE_URL=sqlite:///./app.db
TRAINERAPP_FRONTEND_BASE_URL=http://127.0.0.1:5173
```

Aplikuj migrace a naplň demo data:

```bash
alembic upgrade head
python -m app.scripts.seed
```

Spusť backend:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Ověření:

- `http://127.0.0.1:8000/health` -> `{"status":"ok"}`
- `http://127.0.0.1:8000/docs` -> Swagger UI

### 2) Frontend

V novém terminálu:

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Frontend poběží na:

- `http://127.0.0.1:5173`

Pokud je port obsazený, Vite automaticky zvolí jiný (např. `5174`/`5175`).

### Demo účty

- Trenér: `coach@demo.local` / `coach`
- Asistent: `assistant@demo.local` / `assistant`

---

## Testy a kvalita

### Backend testy

```bash
cd backend
source ../.venv/bin/activate
pip install -r requirements-dev.txt   # pytest, httpx, ruff
pytest
```

Testy lze pustit i proti PostgreSQL: `TRAINERAPP_TEST_DATABASE_URL=postgresql+psycopg://... pytest` (databáze se při testech maže, použij jednorázovou).

### Frontend lint

```bash
cd frontend
npm run lint
```

### Frontend unit testy

```bash
cd frontend
npm test
```

### Typy z API

Po změně backendového API přegeneruj TypeScript typy z OpenAPI (používá `../.venv`):

```bash
cd frontend
npm run gen:api   # vytvoří src/api/schema.d.ts
```

### Průběžná integrace (CI)

GitHub Actions (`.github/workflows/ci.yml`) při každém pushi spouští: ruff + pytest na SQLite, pytest na PostgreSQL 16 a frontend lint + Vitest + build.

### Frontend build

```bash
cd frontend
npm run build
```

Uložené reporty jsou v `docs/test-reports/`.

---

## Produkční nasazení (Render)

Architektura v produkci:

- **Backend service:** `https://bakalarska.onrender.com`
- **Frontend service:** `https://bakalarska-1.onrender.com`

### A) Backend na Renderu

**Build command:**

```bash
pip install -r requirements.txt
```

**Start command:**

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

**Environment variables (backend):**

- `TRAINERAPP_SECRET_KEY` - silný tajný klíč
- `TRAINERAPP_DATABASE_URL` - PostgreSQL URL (`postgresql+psycopg://...`)
- `TRAINERAPP_FRONTEND_BASE_URL` - URL frontendu (`https://bakalarska-1.onrender.com`)

Poznámka: po změně DB URL je potřeba aplikovat migrace (`alembic upgrade head`).

### B) Frontend na Renderu

**Build command:**

```bash
npm ci && npm run build
```

**Publish directory:**

```txt
dist
```

**Environment variables (frontend):**

- `VITE_API_URL` - URL backendu (`https://bakalarska.onrender.com`)

### C) Kontrola po deployi

1. backend health:
   - `GET https://bakalarska.onrender.com/health` -> HTTP 200
2. frontend je dostupný:
   - `https://bakalarska-1.onrender.com`
3. login funguje a načte se seznam hráčů/zápasů

---

## Běžné problémy (troubleshooting)

### Frontend volá špatné API

- zkontroluj `VITE_API_URL` na frontend service
- proveď nový deploy frontendu

### CORS chyba

- zkontroluj `TRAINERAPP_FRONTEND_BASE_URL` na backend service

### 500 při loginu/API

- nejčastěji problém DB připojení (`TRAINERAPP_DATABASE_URL`)
- ověř, že migrace proběhly

### Lokálně nefunguje login po resetu DB

Spusť znovu seed:

```bash
cd backend
source ../.venv/bin/activate
python -m app.scripts.seed
```

### V produkci nevidíš změny

- ověř push na správnou větev
- ověř, že Render udělal nový deploy
- ve frontendu proveď hard refresh (`Ctrl/Cmd + Shift + R`)

---

## Bezpečnostní poznámka

Demo účty jsou určené jen pro testovací prostředí.  
V produkčním provozu používej vlastní účty a silná hesla.

Role jsou pevně na účet (`coach` nebo `assistant`). Jeden účet nepřepíná role.
