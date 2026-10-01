# Permit desk — Codex handoff

Prepared October 1, 2026. This is a portable project summary, not a full chat transcript. It combines the conversation available to the preparing agent, repository inspection, and read-only checks of GitHub Actions and the published snapshot. Recheck live state before making changes.

## Start here

This project tracks municipal permit inspections and lets the owner review and confirm supported scheduling/cancellation actions. Continue working in the existing repository and hosting setup. Read this file, `README.md`, and `backend/README.md`, then inspect Git status before editing.

- Repository: https://github.com/binbinbinbinlu/permit-inspection-tracker
- Production frontend: https://binbinbinbinlu.github.io/permit-inspection-tracker/
- Actions backend: https://permit-desk-actions.binbin-0db.workers.dev
- Branch: `main`
- Inspected source revision: `e1014a071e7c4e7305b843dcc11f48206cda718d`
- Original Windows checkout: `C:\Users\vanni\Documents\Codex\2026-09-09\c-r\permit-tracker`
- Working tree was clean before adding this document. This handoff is tracked in the repository and transfers with a clone or pull of `main`.

The user wants continuity on another computer or with another Codex. The repository contains code and Git history, not the conversation. Do not assume access to earlier chats. The user prefers direct completion of authorized work and concise updates. Previous publishing authorization covered the previous fixes, not unspecified future changes.

## Current verified status and next priority

The phone-input fix is published. Full data refresh also succeeded on October 1; the site is no longer limited to the September snapshot used for the initial fix deployment.

- [Latest checked successful run](https://github.com/binbinbinbinlu/permit-inspection-tracker/actions/runs/36910132542): created `2026-10-01T18:52:51Z`, source revision above. The live `npm run sync` step succeeded; reuse of published data was skipped.
- Published snapshot `generatedAt`: `2026-10-01T19:00:44.144Z` (12:00:44 PM Pacific). All 16 configured permits were present. Individual source timestamps ranged from `18:54:32Z` to `19:00:44Z`.
- An earlier October 1 run and a September 30 run failed. Failures are intermittent, not proof that all tests fail.
- [Inspected failed run](https://github.com/binbinbinbinlu/permit-inspection-tracker/actions/runs/36821761824): Redmond building permit refreshed, then `CGP-2025-07539` timed out during **permit details**. Error: `Redmond could not complete permit details for CGP-2025-07539 (TimeoutError). Check source availability and saved account access.`

If asked to improve reliability next, investigate Redmond detail-page readiness, navigation, and session behavior using this evidence. The exact cause is not established. Do not claim the direct-link change eliminated all portal timeouts. Preserve full-snapshot validation and accurate source timestamps; do not make failures appear successful by publishing incomplete data.

The actions backend's currently deployed source revision was not verified during this handoff. The September 21 publication updated GitHub Pages and refresh code; no separate Cloudflare actions-backend redeployment was performed in that publication. `backend/portals.ts` now uses the shared Redmond URL resolver in source; confirm deployed backend state before assuming that refactor is live.

## Architecture and important files

| Area | Files | Purpose |
| --- | --- | --- |
| Frontend | `app/page.tsx`, `app/pages-entry.tsx`, `app/globals.css` | React tracker, static Pages entry, styles |
| Management UI | `components/inspection-management.tsx` | Unlock, schedule/cancel review, explicit confirmation, result recovery |
| Phone cleanup | `lib/contact-phone.ts` | Normalize formatting before strict 10-digit validation |
| Organization | `components/permit-organizer.tsx`, `lib/permit-organization.ts` | Browser-local nicknames, groups, custom order |
| Permit configuration | `permits.json`, `lib/permit-request.ts`, `scripts/add-permit.ts` | Shared tracked permits and authorized issue requests |
| MBP source/status | `lib/permit-source.ts`, `lib/permit-details.ts`, `lib/inspections.ts` | HTTP reads, detail fallback, status/history normalization |
| Browser source readers | `scripts/permittrax-source.ts`, `scripts/smartgov-source.ts`, `scripts/energov-source.ts` | Clyde Hill, Medina, Redmond refresh |
| Portal normalization | `lib/permittrax.ts`, `lib/smartgov.ts`, `lib/energov.ts` | Source-specific statuses; shared Redmond permit URLs |
| Snapshot pipeline | `scripts/sync-permits.ts`, `scripts/reuse-published-data.mjs` | Full refresh or explicit reuse with original timestamps |
| Actions service | `backend/worker.ts`, `backend/actions.ts`, `backend/mbp.ts`, `backend/portals.ts` | Authentication, review/confirmation, source adapters |
| Durable state | `backend/schema.sql`, `backend/wrangler.jsonc` | D1 operations/locks, Worker settings and Browser binding |
| CI/deployment | `.github/workflows/pages.yml`, `.github/workflows/test.yml` | Tests, refresh, Pages deployment |

Production frontend is a static Vite/React build in `dist-pages`. It reads `public/data/permits.json`, which is generated and Git-ignored. Reloading the website reloads the published snapshot; it does not perform a new upstream refresh.

The separate authenticated Cloudflare Worker performs live inspection management. The optional Vinext server (`npm run dev`, `npm run build`) is a different execution path and supports MBP refresh only. `.openai/hosting.json` is retained Sites scaffold metadata; production currently uses GitHub Pages plus the separate Cloudflare actions Worker. Do not migrate hosting merely because this file exists.

`permits.json` is authoritative: currently 3 Bellevue, 8 Kirkland, 2 Clyde Hill, 1 Medina, and 2 Redmond permits. Medina includes its SmartGov source ID. Do not infer configuration from screenshots or duplicate the list in a new datastore.

## Completed changes and relevant history

- `e1014a0`: Phone field removes ordinary/invisible paste separators, spaces, parentheses, dots, and hyphens; accepts a leading US `1` or `+1` for a complete number. Invalid letters, extensions, and extra digits still fail validation. Clear validation message and correction recovery were added. A screenshot showed a visually valid ten-digit number rejected; hidden paste characters were a plausible cause, not directly proven from the screenshot.
- Same revision: refresh and actions source share `resolveRedmondPermitUrl` in `lib/energov.ts`. Known direct permit links bypass unreliable search for `BLDG-2025-07156` and `CGP-2025-07539`; other permits still use exact-number search. Destination validation and permit-detail number checks remain.
- `f0db8e7`: Confirmed scheduling support for Clyde Hill, Medina, and Redmond.
- `c3c7aac`: Explicit frontend deployment using the last published snapshot.
- `c1bfa0e`: Inspection actions in status rows and a review dialog.
- `593bd28`: MBP cancellation read-back can recognize a reopened future slot when cancellation history is absent.

Last local functional validation on September 21: **73 unit tests**, **16 mocked browser scenarios**, TypeScript checks, and Pages build passed. The later successful GitHub run also passed the deployment workflow. No new tests were run just to author this handoff.

## Setup on another computer

Install Git, Node.js 24 with npm, and the Codex app. Sign in to GitHub when repository operations require it. Open the cloned directory in Codex and provide this document.

```sh
git clone https://github.com/binbinbinbinlu/permit-inspection-tracker.git
cd permit-inspection-tracker
npm ci
npx playwright install chromium
npm test
npm run typecheck
npm run test:ui
```

For a local preview using existing data, without needing portal credentials:

```sh
node scripts/reuse-published-data.mjs
npm run build:pages
npx vite preview --config vite.pages.config.ts
```

Open the printed local URL. Snapshot reuse requires the configured permit set to match the published set. Alternatively, copy the existing `public/data/permits.json` into the clone. Do not copy `node_modules` between computers; reinstall from the lockfile.

The management UI is included when `NEXT_PUBLIC_ACTIONS_URL` is set **before building**. Its production value is the actions-backend URL above. This is public configuration, not a secret. For tests, `tests/inspection-management.ui.mjs` supplies a mock endpoint and intercepts external requests. A local origin may not be accepted by the production backend; use mocked tests rather than weakening its origin restriction to test locally.

For a full refresh, `npm run sync` needs Chromium and the Medina/Redmond credentials listed below. GitHub repository secrets do not automatically appear on a new computer.

Original Codex environment quirks: `node` was available while `npm` was sometimes absent from PATH. Direct equivalents were `node --test tests/*.test.ts`, `node node_modules/typescript/bin/tsc --noEmit`, and `node node_modules/vite/bin/vite.js build --config vite.pages.config.ts`. Prefer a normal Node/npm install on the new computer. A Windows ownership mismatch sometimes required a per-command `git -c safe.directory=<verified-checkout-path>`; do not broadly disable Git ownership checks.

## Configuration and credentials

Only names and locations belong in the handoff; secret values are intentionally omitted.

| Location | Names / resources |
| --- | --- |
| GitHub Actions secrets | `MEDINA_USERNAME`, `MEDINA_PASSWORD`, `REDMOND_USERNAME`, `REDMOND_PASSWORD` |
| GitHub repository variable | `NEXT_PUBLIC_ACTIONS_URL` |
| Cloudflare Worker secrets | `ADMIN_TOKEN`, `PORTAL_CREDENTIALS` |
| Cloudflare D1 | `permit-desk-actions`, binding `DB`; existing ID in `backend/wrangler.jsonc` |
| Cloudflare browser | Binding `BROWSER`, `nodejs_compat` enabled |
| Worker variables | `ALLOWED_ORIGIN=https://binbinbinbinlu.github.io`, `WRITES_ENABLED=true` in source configuration |

Use the owner's existing accounts/resources. Do not recreate the database, rotate secrets, or change write enablement as part of ordinary setup. Read `backend/README.md` before any backend deployment. Browser preferences do not transfer with Git. The management key is held only in frontend memory; unresolved operation IDs can be retained in browser storage.

## Publishing and troubleshooting

Pushes to `main` trigger tests, browser tests, full refresh, build, and Pages deployment. The schedule is configured for minute 17 of each hour, but observed runs can be delayed. Any source failure preserves the previous deployed snapshot. `scripts/sync-permits.ts` currently makes up to two attempts per permit and writes the snapshot only after all configured permits succeed.

Use these read-only commands to diagnose a red workflow before changing tests:

```sh
gh run list --repo binbinbinbinlu/permit-inspection-tracker --limit 5
gh run view RUN_ID --repo binbinbinbinlu/permit-inspection-tracker --log-failed
```

When publication is authorized and a UI fix must ship independently of a portal refresh, the existing fallback is:

```sh
gh workflow run pages.yml --repo binbinbinbinlu/permit-inspection-tracker --ref main -f reuse_published_data=true
```

This publishes the current `main` frontend using the existing snapshot and original timestamps. It does not prove fresh source access. Wait for terminal deployment success and verify the served assets. The September 21 fix used this route after canceling a slow refresh; successful run: https://github.com/binbinbinbinlu/permit-inspection-tracker/actions/runs/35665245158.

Backend deployment is separate. A Pages push does not deploy `backend/worker.ts`. Follow `backend/README.md` and `scripts/build-actions.mjs`, preserve the Playwright chunk, D1 binding, Browser binding, and secrets. Adding a tracked permit also requires updating the deployed backend allowlist via redeployment. This handoff does not request a deployment.

## Behavior to preserve

- Grey Available means offered for scheduling, not necessarily required. Yellow Pending includes scheduled/corrections/partial/unresolved results. Green Passed includes approved/completed and supported not-required statuses.
- Newer results take precedence; a future reinspection can reopen an old pass. Preserve source dates, notes, reports, and deduplicated history. Unknown restrictions must not become a pass.
- Scheduling supports MBP, Clyde Hill, Medina, Redmond; cancellation is MBP-only. Unavailable or passed inspections cannot be scheduled.
- Every mutation requires live validation, a review, and explicit user confirmation. Refresh and automated tests must never book or cancel real inspections.
- Confirmation is single-submission with durable locks. A timeout may mean the source accepted the request: retain `unknown`, offer read-only checking, and do not automatically resubmit or delete the unresolved lock.
- Successful mutations require source read-back. A subsequent display refresh failure must not erase a confirmed success.
- Never expose credentials, session cookies, identity-provider URLs containing tokens, private operation/contact data, or browser storage state in logs, public builds, snapshots, or Git.

## Suggested message to the next Codex

> Read HANDOFF.md, README.md, and backend/README.md in this repository. Inspect Git status and recent GitHub Actions before editing. This is the existing Permit desk project on GitHub Pages with a separate Cloudflare actions backend. Phone validation is fixed and published; Redmond refresh still has intermittent detail-page timeouts, although a full refresh succeeded October 1. Preserve the existing hosting, accurate timestamps, and owner-confirmed scheduling safeguards. Use mocked tests for inspection actions. Ask me what change to work on next if I have not supplied one.
