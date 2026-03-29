# TestSprite Runbook

## Recommended target

Use the frontend app in this repository as the TestSprite target.

- App URL: `http://127.0.0.1:4173`
- Start command: `npm.cmd run dev:testsprite`
- Project root to attach in chat: `c:\Users\rapha\OneDrive\Documentos\X9Sales`

## Prerequisites

1. Install and enable the TestSprite MCP server in your IDE.
2. Use Node.js 22 or newer.
3. Populate `.env` with valid Supabase frontend variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

This app falls back to placeholder values when those variables are missing, so login and data-backed flows will not test correctly without a real `.env`.

## Suggested TestSprite setup

When TestSprite opens its browser configuration flow, use:

- Testing type: `Frontend`
- Frontend URL: `http://127.0.0.1:4173`
- PRD file: `_bmad-output/planning-artifacts/product-brief-MonitoraIA-2026-02-27.md`

If you want stronger UI-flow context, also point TestSprite at:

- `_bmad-output/planning-artifacts/ux-design-specification.md`

## Prompt to use

In your IDE chat, with TestSprite MCP enabled, run:

`Help me test this project with TestSprite.`

Attach the repository root or tell it to test the frontend app at `http://127.0.0.1:4173`.

## Notes for this repo

- PowerShell on this machine blocks `npm.ps1`, so use `npm.cmd` in the terminal.
- `npm.cmd run lint` currently reports existing lint failures across the repo. Those are pre-existing and may show up in generated findings.
- `npm.cmd run build` could not be validated inside the current sandbox because `esbuild` failed with `spawn EPERM` while loading `vite.config.ts`. That needs to be rechecked in a normal local shell if you want a clean pre-TestSprite verification.
