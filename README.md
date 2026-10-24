# MEAN Stack Basic Item Viewer

A complete, standalone MEAN stack web application (**MongoDB**, **Express.js**, **Angular**, and **Node.js**) built for **Freelance Yard — Startup**. The application retrieves predefined item records stored in a MongoDB Atlas database (`khutwa_db`) through a read-only Express REST API and renders them in a responsive Angular interface.

---

## 1. Architecture & Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Database** | MongoDB Atlas (`khutwa_db`) + Mongoose 8 | Persistent document storage and schema validation for the `items` collection |
| **Backend API** | Node.js + Express.js + TypeScript | Read-only REST API (`/api/items`, `/api/health`, `/api/health/db`) |
| **Frontend UI** | Angular 19 + TypeScript + `HttpClient` | Responsive single-page application consuming the backend API via `ItemService` |

---

## 2. Project Structure

```text
mean-basic-item-viewer/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.ts          # Environment validation, URI resolution, safe logging & connection
│   │   ├── models/
│   │   │   └── item.model.ts        # Mongoose Item schema (name, description, category, timestamps)
│   │   ├── routes/
│   │   │   └── items.routes.ts      # Read-only GET /api/items route & 405 enforcement
│   │   ├── scripts/
│   │   │   ├── seed.ts              # Safe, idempotent seed script for initial sample items
│   │   │   └── verify-db.ts         # Standalone MongoDB connectivity & collection verifier
│   │   ├── tests/
│   │   │   └── api.test.ts          # Automated backend & API test suite
│   │   ├── app.ts                   # Express app, CORS, logging, health & 404/error middleware
│   │   └── server.ts                # HTTP server entry point & graceful shutdown
│   ├── .env.example                 # Placeholder environment configuration template
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── models/
│   │   │   │   └── item.model.ts    # TypeScript Item interface
│   │   │   ├── services/
│   │   │   │   └── item.service.ts  # Angular HttpClient service for GET /api/items
│   │   │   ├── tests/
│   │   │   │   └── frontend.test.ts # Automated frontend unit & state test suite
│   │   │   ├── app.component.ts     # Root component handling loading, empty, error & list states
│   │   │   ├── app.component.html   # Accessible semantic template
│   │   │   ├── app.component.css    # Responsive modern light UI styles
│   │   │   └── app.config.ts        # Angular application providers (HttpClient)
│   │   ├── environments/
│   │   │   ├── environment.ts             # Production environment configuration (never localhost)
│   │   │   └── environment.development.ts # Local development environment configuration
│   │   ├── index.html
│   │   ├── main.ts
│   │   └── styles.css
│   ├── angular.json
│   ├── package.json
│   ├── tsconfig.app.json
│   └── tsconfig.json
├── .gitignore
├── package.json
└── README.md
```

---

## 3. Prerequisites

- **Node.js**: v18.19+ / v20+ / v22+ / v24+
- **npm**: v9+
- **MongoDB Atlas**: Access to the `khutwa_db` database cluster

---

## 4. Installation

From the project root (`mean-basic-item-viewer/`), install both backend and frontend dependencies:

```bash
npm run install:all
```

Or install each package individually:

```bash
cd backend && npm install
cd ../frontend && npm install
```

---

## 5. MongoDB Environment Configuration

Database credentials are managed strictly on the backend via environment variables and are **never** hardcoded into source files or exposed to the Angular frontend.

1. Copy `backend/.env.example` to `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

2. Edit `backend/.env` and supply your real MongoDB Atlas credentials for `khutwa_db`:

```env
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:4200

MONGODB_DB_NAME=khutwa_db
MONGODB_USERNAME=your_actual_mongodb_username
MONGODB_PASSWORD=your_actual_mongodb_password
MONGODB_URI=mongodb+srv://<USERNAME>:<PASSWORD>@cluster0.cyyf018.mongodb.net/khutwa_db?retryWrites=true&w=majority
```

### Security Notes
- If `MONGODB_URI` contains `<USERNAME>` and `<PASSWORD>` placeholders, `backend/src/config/database.ts` automatically replaces them with URL-encoded values from `MONGODB_USERNAME` and `MONGODB_PASSWORD`.
- Alternatively, you may provide a full connection string directly in `MONGODB_URI`.
- `backend/.env` is excluded by `.gitignore` and must never be committed to Git.
- Terminal logs automatically redact connection strings and credentials.

---

## 6. Database Verification & Safe Initial Seeding

### Verify MongoDB Connectivity

Once `backend/.env` is configured with valid credentials, test connectivity to `khutwa_db`:

```bash
cd backend
npm run verify:db
```

### Seed Initial Sample Items

To populate `khutwa_db` with the 7 predefined sample items (electronics, office furniture, books, office supplies, accessories, and lighting):

```bash
# From the project root:
npm run seed

# Or from backend/:
cd backend && npm run seed
```

#### Seed Safeguards
- **Never deletes or drops data**: The seed script never invokes `dropDatabase`, `dropCollection`, or `deleteMany`.
- **Inspects before inserting**: Queries the `items` collection first and logs the existing document count.
- **Reuses suitable records**: If 6 or more records already exist in `khutwa_db.items`, the script reuses them without inserting duplicates.
- **Idempotent**: Uses `$setOnInsert` upserts keyed by item `name` so repeated executions never create duplicate items.
- **Manual execution only**: The seed script is never run automatically on server startup.

---

## 7. Running the Application Locally

### 1. Start the Express Backend API

```bash
# From the project root:
npm run dev:backend

# Or from backend/:
cd backend && npm run dev
```

The backend API listens on `http://localhost:3000` by default.

### 2. Start the Angular Frontend

In a second terminal:

```bash
# From the project root:
npm run dev:frontend

# Or from frontend/:
cd frontend && npm start
```

Open `http://localhost:4200` in your browser. The Angular app fetches live records from `http://localhost:3000/api/items` via `ItemService`.

---

## 8. API Endpoints Reference

| Method | Endpoint | Description | Responses |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Reports whether the Express API server is running | `200 OK` with server & DB state summary |
| `GET` | `/api/health/db` | Dedicated database-readiness probe | `200 OK` when connected to `khutwa_db`, `503 Service Unavailable` when disconnected |
| `GET` | `/api/items` | Queries MongoDB `items` collection and returns all documents | `200 OK` (`Item[]`, including `[]` when empty), `503` if DB disconnected, `500` on query error |
| `POST / PUT / DELETE` | `/api/items` | Blocked (read-only API) | `405 Method Not Allowed` |
| `ANY` | `/api/*` (unknown) | Structured 404 handler | `404 Not Found` |

### Example `GET /api/items` Response

```json
[
  {
    "_id": "671a00000000000000000001",
    "name": "Mechanical Wireless Keyboard",
    "description": "Compact 75% tactile mechanical keyboard with multi-device Bluetooth and USB-C connectivity.",
    "category": "Electronics",
    "createdAt": "2026-10-24T18:00:00.000Z",
    "updatedAt": "2026-10-24T18:00:00.000Z"
  }
]
```

---

## 9. Building for Production & Deployment Guide

### Build Both Applications

```bash
npm run build
```

- **Backend output**: `backend/dist/` (run in production with `npm --prefix backend start`)
- **Frontend output**: `frontend/dist/mean-basic-item-viewer-frontend/browser/`

### Production Environment & Hosting Configuration

1. **Backend Hosting (e.g., Render, Railway, Fly.io, AWS, DigitalOcean)**:
   - Root directory: `backend`
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Environment variables to set in hosting provider dashboard:
     - `NODE_ENV=production`
     - `PORT=3000` (or provider-assigned port)
     - `MONGODB_DB_NAME=khutwa_db`
     - `MONGODB_USERNAME=<your_production_db_username>`
     - `MONGODB_PASSWORD=<your_production_db_password>`
     - `MONGODB_URI=mongodb+srv://<USERNAME>:<PASSWORD>@cluster0.cyyf018.mongodb.net/khutwa_db?retryWrites=true&w=majority`
     - `CORS_ORIGIN=https://your-deployed-frontend-domain.com`

2. **Frontend Hosting (e.g., Vercel, Netlify, Cloudflare Pages, Render Static Site, Nginx)**:
   - Root directory: `frontend`
   - Build command: `npm install && npm run build`
   - Publish directory: `dist/mean-basic-item-viewer-frontend/browser`
   - API URL Configuration:
     - By default, `frontend/src/environments/environment.ts` uses `/api` (never `localhost`).
     - You can either configure a reverse proxy/rewrite rule on your static host (`/api/*` -> `https://your-backend-service.com/api/:splat`) **or** set your deployed backend URL directly in `frontend/src/environments/environment.ts` (or via `window.__API_BASE_URL__` before application bootstrap).

---

## 10. Running Automated Tests

Run both backend and frontend automated test suites from the root directory:

```bash
npm test
```

Or individually:

```bash
npm run test:backend
npm run test:frontend
```

---

## 11. Git & GitHub Repository Setup

An isolated Git repository is initialized in `mean-basic-item-viewer/` with `.gitignore` configured to exclude `node_modules/`, `.env` files, and build artifacts (`dist/`, `.angular/`).

To push this standalone repository to GitHub:

```bash
cd mean-basic-item-viewer
git status # Verify that no .env files are staged
git remote add origin https://github.com/<your-username>/mean-basic-item-viewer.git
git branch -M main
git push -u origin main
```

