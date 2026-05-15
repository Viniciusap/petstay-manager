# PetStay Manager

Open source pet hotel management system. Clone it, run it, own your data.

No cloud subscriptions. No external APIs. All data stays on your machine.

---

## Features

- **Reservations** — multi-step booking flow with check-in/check-out management
- **Tutors & Animals** — full registration with vaccination file uploads
- **Digital Contracts** — auto-generated PDF with unique token per booking
- **Digital Signatures** — mobile-first canvas (touch + mouse + retina support)
- **Authenticity Verification** — SHA-256 hash + QR Code on every signed contract
- **Dashboard** — KPIs and occupancy overview
- **Calendar** — visual availability and blocked dates
- **Services** — configurable services and pricing
- **Settings & Onboarding** — hotel branding, name, logo
- **Bilingual** — Portuguese and English interface
- **Dark / Light mode**
- **Versioned migrations** — schema updates never corrupt existing data
- **Automatic daily backup** — `db.json` backed up automatically

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 18+ · Express · PDFKit · QRCode |
| Frontend | React 18 · Vite · TypeScript · Tailwind CSS v3 |
| Storage | Local `db.json` (no database required) |
| Auth | None (single-tenant, local network) |

---

## Requirements

- Node.js 18 or higher
- npm 9 or higher
- Git

---

## Installation

```bash
# Clone the repository
git clone https://github.com/Viniciusap/petstay-manager.git
cd petstay-manager

# Install all dependencies (root + backend + frontend)
npm run install:all

# Copy environment file and adjust if needed
cp .env.example .env

# Start both servers
npm run dev
```

- Backend: http://localhost:3001
- Frontend: http://localhost:5173

On first run, migrations execute automatically and create `/backend/data/db.json`.

---

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

```bash
cp .env.example .env
```

### Backend (`.env` in project root)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Backend port |
| `FRONTEND_URL` | `http://localhost:5173` | CORS allowed origin — set to your frontend URL |
| `NODE_ENV` | `development` | Environment |

### Frontend (same `.env` file, read by Vite at startup)

| Variable | Default | Description |
|---|---|---|
| `BACKEND_URL` | `http://localhost:3001` | Where Vite proxies API calls — set to your backend URL |
| `PORT` | `5173` | Frontend dev server port |

**Running on a local network or custom host?** Set both variables so each side knows where the other is:

```env
# .env
PORT=3001
FRONTEND_URL=http://192.168.1.10:5173
NODE_ENV=development

BACKEND_URL=http://192.168.1.10:3001
```

Then access the app from any device on the network at `http://192.168.1.10:5173`.

---

## Project Structure

```
petstay-manager/
├── backend/
│   └── src/
│       ├── routes/         # REST API endpoints
│       ├── middleware/      # Validation, error handling, CORS
│       ├── migrations/      # Versioned schema migrations
│       └── utils/           # PDF, backup, hash, db helpers
├── frontend/
│   └── src/
│       ├── components/      # UI design system + signing canvas
│       ├── pages/           # All app pages
│       ├── contexts/        # Theme, Toast, Translation
│       └── i18n/            # PT and EN translation files
├── docs/                    # Extra documentation
├── .env.example
├── CHANGELOG.md
└── CONTRIBUTING.md
```

> `backend/data/` is listed in `.gitignore` and never committed — your data stays local.

---

## Updating

```bash
# Pull new code (never touches /backend/data)
git pull origin main

# Install any new dependencies
npm run install:all

# Restart — migrations run automatically
npm run dev
```

Schema migrations are versioned and incremental. Existing data is always preserved.

---

## How the Signing Flow Works

1. Booking created → contract token generated
2. Admin shares signing link with tutor (e.g. via WhatsApp)
3. Tutor opens link on mobile → reads contract → signs on canvas
4. Signature saved as PNG → final PDF generated with signature + QR Code
5. SHA-256 hash stored for authenticity verification
6. Anyone can verify a contract at `/verify/:token`

---

## Deploying to Production

Two supported deployment options. Choose based on your needs:

| | Option A — Railway | Option B — Vercel full-stack |
|---|---|---|
| **Storage** | Local `db.json` + disk | Vercel Postgres + Vercel Blob |
| **Complexity** | Low | Medium |
| **Free tier** | Railway Hobby plan | Vercel + Postgres + Blob free tiers |
| **Data location** | Your server volume | Vercel infrastructure |

---

### Option A — Frontend on Vercel + Backend on Railway *(recommended)*

No database setup required. Data stays in a file on your server.

**1. Deploy the backend on [Railway](https://railway.app)**

- Connect your repo, set root directory to `backend`
- Start command: `node src/index.js`
- Add a **persistent volume** mounted at `/app/data`
- Set environment variables:
  ```env
  PORT=3001
  FRONTEND_URL=https://your-app.vercel.app
  NODE_ENV=production
  STORAGE_ADAPTER=local
  ```

**2. Deploy the frontend on [Vercel](https://vercel.com)**

- Connect your repo, set root directory to `frontend`
- Build command: `npm run build` · Output: `dist`
- Add environment variable:
  ```env
  VITE_API_URL=https://petstay-backend.railway.app
  ```

**3. Set the signing link base URL**

In the app settings page, set **Base URL** to your Vercel frontend URL. This is embedded in QR Codes on signed contracts.

---

### Option B — Full Vercel deployment (frontend + backend + storage)

Runs entirely on Vercel. No external servers needed.

#### Prerequisites

- A [Vercel](https://vercel.com) account (free tier works)
- This repo pushed to GitHub

#### Step 1 — Import the project on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Add New Project** → **Import Git Repository**
3. Select your fork/copy of this repo
4. **Important:** leave the root directory as `/` (do not change to `frontend` or `backend`) — the `vercel.json` at the root handles everything
5. Click **Deploy** (it will fail the first time — that's expected, storage isn't configured yet)

#### Step 2 — Add Postgres

1. In your Vercel project → **Storage** tab → **Create Database**
2. Select **Postgres** → give it a name (e.g. `petstay-db`) → **Create**
3. Click **Connect to Project** — Vercel automatically adds `POSTGRES_URL` and related variables to your environment

#### Step 3 — Add Blob storage

1. In **Storage** tab → **Create Database** again
2. Select **Blob** → give it a name (e.g. `petstay-files`) → **Create**
3. Click **Connect to Project** — Vercel automatically adds `BLOB_READ_WRITE_TOKEN`

#### Step 4 — Set environment variables

In your project → **Settings** → **Environment Variables**, add:

| Variable | Value |
|---|---|
| `STORAGE_ADAPTER` | `vercel` |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://your-app.vercel.app` *(your actual Vercel URL)* |
| `TRUST_PROXY` | `1` |

> `POSTGRES_URL` and `BLOB_READ_WRITE_TOKEN` are already set automatically by Vercel in Steps 2–3.

#### Step 5 — Redeploy

1. Go to the **Deployments** tab
2. Click the three-dot menu on the latest deployment → **Redeploy**
3. Wait for the build to finish — the app will be live at your Vercel URL

#### Step 6 — First run

Open the app. On first load, the backend creates all database tables automatically. Go through the onboarding wizard to configure your hotel name, logo, and settings.

#### Step 7 — Set the signing link base URL

In **Settings** → **Base URL**, enter your Vercel URL (e.g. `https://your-app.vercel.app`). This is embedded in QR Codes on every signed contract so clients can verify authenticity.

---

> **Note:** the Vercel free tier has limits — 100GB Blob storage, 256MB Postgres, 100GB-hours of serverless compute per month. For a single pet hotel, this is more than enough.

---

### Environment variable reference

| Variable | Default | Where | Purpose |
|---|---|---|---|
| `STORAGE_ADAPTER` | `local` | backend | `local` or `vercel` |
| `PORT` | `3001` | backend | Backend port |
| `FRONTEND_URL` | `http://localhost:5173` | backend | CORS allowed origin |
| `NODE_ENV` | `development` | backend | Environment |
| `TRUST_PROXY` | *(unset)* | backend | Set to `1` behind a reverse proxy (Vercel, Railway) |
| `POSTGRES_URL` | *(unset)* | backend | Required when `STORAGE_ADAPTER=vercel` |
| `BLOB_READ_WRITE_TOKEN` | *(unset)* | backend | Required when `STORAGE_ADAPTER=vercel` |
| `BACKEND_URL` | `http://localhost:3001` | root `.env` | Vite dev proxy target (dev only) |
| `VITE_API_URL` | *(unset)* | frontend build | Absolute backend URL for production builds |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines.

**Quick rules:**
- Any `db.json` schema change requires a migration in `/backend/src/migrations/`
- All UI strings must use `t('key')` — no hardcoded text in components
- Follow [Conventional Commits](https://www.conventionalcommits.org)
- Branch from `main`, open a PR with description of what changed and why

---

## Data & Privacy

**Local adapter (default):** all data stays in `/backend/data/db.json` on your own machine or server. Nothing is sent to external services. Each hotel instance is fully independent.

**Vercel adapter:** data is stored in your own Vercel Postgres database and Vercel Blob store, linked to your Vercel account. No third-party services outside of Vercel are involved.

Uploaded files (vaccination proofs, signatures, PDFs) go to `/backend/data/` locally or to your Vercel Blob store when using the Vercel adapter.

---

## License

MIT — free to use, modify, and distribute.
