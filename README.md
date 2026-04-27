# Planora

Planora is a full-stack productivity workspace app with calendar, tasks, notes, and collaboration features.

## Tech Stack

- Frontend: Next.js 16 (App Router), React 19, TypeScript
- Backend: Express, TypeScript, PostgreSQL
- Auth: NextAuth + JWT-based backend auth middleware
- Realtime: Socket.IO
- Testing: Vitest (unit tests for backend and frontend)

## Repository Structure

- `frontend/` - Next.js app
- `backend/` - Express API and DB migration scripts
- `package.json` (root) - npm workspaces and orchestration scripts

## Prerequisites

- Node.js 20+
- PostgreSQL 14+

## Environment Configuration

### Backend

Copy and adapt `backend/.env.example` into `backend/.env`.

Database configuration supports two styles:

1. Preferred: `DATABASE_URL`
2. Fallback: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

`DATABASE_URL` is used first by both runtime DB client and migration script.

### Frontend

Use `frontend/.env.local` with:

- `NEXT_PUBLIC_API_URL` (usually `http://localhost:4000`)
- `NEXTAUTH_URL` (usually `http://localhost:3000`)
- `NEXTAUTH_SECRET`

Password reset uses the same backend SMTP and app URL settings as verification and invitations; no extra env vars are required for the feature itself.

## Install

From repository root:

```bash
npm install
```

## Run in Development

From repository root:

```bash
npm run dev
```

Or run each workspace individually:

```bash
npm run dev:backend
npm run dev:frontend
```

Default local ports:

- Frontend: `3000`
- Backend: `4000`

## Build

```bash
npm run build --workspace=backend
npm run build --workspace=frontend
```

## Database Migration

```bash
npm run db:migrate --workspace=backend
```

## Testing

Run all unit tests:

```bash
npm run test:unit
```

Run by workspace:

```bash
npm run test:unit:backend
npm run test:unit:frontend
```

Current test organization:

- Backend unit tests: `backend/tests/unit/`
- Frontend unit tests: `frontend/tests/unit/`

## Routing Notes

- Main planner page is `/workspace`
- Notes page is `/notes`
- Collaboration page is `/collaboration`
- `/workspaces` is still used internally in some backend API/resource naming and as compatibility route mapping

## API Health Check

Backend exposes:

- `GET /health`

## Notes

- Realtime collaboration features use Socket.IO rooms for user and workspace channels.
- Notification, verification, invitation, and password reset flows rely on SMTP settings in backend env.
