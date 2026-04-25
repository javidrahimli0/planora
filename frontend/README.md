# Planora Frontend

This workspace contains the Next.js frontend for Planora.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- NextAuth
- Vitest for unit tests

## Environment

Create `frontend/.env.local` with:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=change_me
```

## Scripts

Run from `frontend/`:

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test:unit
```

Or run from repository root:

```bash
npm run dev:frontend
npm run test:unit:frontend
```

## Unit Tests

- Location: `frontend/tests/unit/`
- Run: `npm run test:unit` (inside `frontend`) or `npm run test:unit:frontend` (from root)

## Main Routes

- `/workspace` - planner/calendar view
- `/collaboration` - collaboration board
- `/notes`, `/tasks`, `/profile`

## Notes

- Auth protection for dashboard routes is handled in `src/middleware.ts`.
- Frontend only communicates with the backend API; DB access is backend-only.
