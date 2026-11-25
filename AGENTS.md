# AGENTS.md — DAYFLOW

Instructions for coding agents (Codex, Claude Code, etc.) working in this repository.

## Current work for the frontend

**Read `docs/FRONTEND_TASKS.md` first.** It lists what the backend changed, what is already wired in `src/App.tsx` (do not revert it), and the open frontend tasks in priority order with acceptance criteria.

The backend API reference is `docs/FRONTEND_INTEGRATION.md`.

## Project

- React 19 + TypeScript + Vite, Firebase Auth + Firestore (client SDK only, no server).
- UI language is Russian; keep all user-facing text in Russian.
- Frontend: `src/App.tsx`, `src/App.css`, `src/index.css`. Backend (owned by the backend developer): `src/backend/`, `firestore.rules`, `firestore.indexes.json`.

## Rules

- Import backend functions and types only from `src/backend/index.ts` (`'./backend'`). Never call Firestore directly from UI code.
- Do not change `src/backend/` or `firestore.rules` as part of frontend tasks; describe needed backend changes instead.
- Dates are `LocalDate` strings (`YYYY-MM-DD`) in the profile timezone. Do not convert them to `Date`/UTC for storage or comparison.
- Password rules live in the backend (`checkPassword`, `PASSWORD_REQUIREMENT_LABELS`). Do not duplicate them in the UI.
- Show `error.message` from backend errors directly; they are already user-facing.
- Never commit `.env.local`, `.env.test.local`, or any credentials.

## Commands

```sh
npm install
npm run dev        # local dev server
npm run lint
npm run build      # tsc + vite build
npm run test       # backend unit tests
npm run test:rules # Firestore rules on the emulator (needs a JDK)
```

Run `npm run lint`, `npm run build`, and `npm run test` before finishing a task.
