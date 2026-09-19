# Permit desk

MyBuildingPermit, Clyde Hill PermitTrax, Medina SmartGov, and Redmond Civic Access inspection tracker with grey **Available**, yellow **Pending**, and green **Passed** statuses. Includes Bellevue **26 112569 BR** and Kirkland **LSM25-02028**, status filters, source links, dates, original results and inspection history.

## GitHub Pages

The Pages build is a static React app. GitHub Actions fetches public permit data hourly, on pushes, or when manually started. The site shows each permit's actual data timestamp. Source updates and scheduled Actions can be delayed. Reloading the website loads the latest published snapshot, not a new upstream request.

Use **Add permit** to enter a jurisdiction and exact permit number. The app opens a prefilled GitHub issue. Submit it as the repository owner/member/collaborator; the workflow validates it, fetches all data, persists the permit in `permits.json`, then deploys the site. Outside contributors cannot change tracked permits. You can also edit `permits.json` directly. A failed upstream fetch leaves the previous deployment intact and the workflow shows the error. An invalid new permit is not committed.

GitHub repository creation and Pages activation still require a valid GitHub login. Once the repo exists, select **Settings → Pages → Build and deployment → GitHub Actions**. Push this checkout to `main` to trigger deployment. The workflow sets its own repository URL from `GITHUB_REPOSITORY`, so forks work too. Pages site visibility follows GitHub settings and plan availability.

## Development and tests

Use Node 24 and npm.

```sh
npm ci
npm test
npm run typecheck
npx playwright install chromium
npm run sync
npm run build:pages
npx vite preview --config vite.pages.config.ts
```

`npm run dev` runs the optional Vinext server version, which pulls MyBuildingPermit data on demand and lets you add permits for the current session. `npm run build` builds that Worker version. The Sites scaffold registration is retained in `.openai/hosting.json`; no Sites deployment is required for GitHub Pages.

Tests cover status precedence, duplicate history, versioned Kirkland names, same-day completed inspections, future reinspections, restrictions, date parsing, permit validation, request authorization and upstream failures. CI runs tests and type checking before deployment and on pull requests.

## Data and status rules

Public source feeds:
- `inspection.mybuildingpermit.com/api/Default/Permits`
- `inspection.mybuildingpermit.com/api/InspectionDetails/AvailableInspections`
- `inspection.mybuildingpermit.com/api/InspectionDetails/GetScheduledInspections`
- `permitsearch.mybuildingpermit.com/PermitDetails/PermitInspections/{number}/{jurisdiction}`

No MyBuildingPermit username, password, browser cookie or account token is needed or stored. MyBuildingPermit feeds are public. The refresh job never calls scheduling or cancellation endpoints. The separate, authenticated actions backend is described below. Browser requests cannot call these feeds directly because they do not provide cross-origin access; the GitHub workflow performs those reads.

Available means offered for scheduling, not necessarily required. Pending includes scheduled, partial, corrections, restricted and other unresolved results. Passed includes approved, passed and completed. Latest dated results supersede older attempts; a same-day completed record supersedes a stale scheduled feed. Future reinspections reopen an older pass. Kirkland catalog tooltips match versioned history descriptions. Exact duplicate history rows are removed. These public feeds are undocumented and can change.

The optional WebMCP refresh tool uses the same read path as the visible reload button. In GitHub Pages it reloads published data; in server mode it fetches upstream data (cached for 30 seconds).

## Organize permits

Use the Your permits panel to sort by number, jurisdiction or address. Organize lets each user set nicknames and custom groups, or move permits earlier/later in My order. Group by jurisdiction or custom group to view related permits together. These preferences are stored only in that browser and do not modify the shared permit list or inspection data. New permits are appended after any saved custom order.


## Clyde Hill PermitTrax

The hourly GitHub job uses a headless Chromium reader for PermitTrax’s public Blazor search, inspection checklist and comment dialogs. It includes BLD2025-0125 and BLD2025-0083. Choose Clyde Hill in Add permit to request another building permit. No login is required. The reader never schedules inspections.

Blank checklist rows with a scheduling calendar appear grey. DONE/COMPLETE rows appear green unless their latest dated result is unresolved; scheduled, restricted, corrections and unknown states appear yellow. Original dated results and comments remain visible in inspection history. A source format change or missing history fails the refresh and preserves the last published site. PermitTrax does not expose a detail permalink here, so Open permit links to its search page.

The optional Worker API supports MyBuildingPermit only; Clyde Hill, Medina and Redmond refresh run in the GitHub Pages job, where Chromium is available.

## Medina SmartGov

B-26-012 is included. The refresh job signs in using the encrypted repository Actions secrets `MEDINA_USERNAME` and `MEDINA_PASSWORD`. Set them through GitHub Settings → Secrets and variables → Actions. They are passed only to the sync step, never the frontend build, snapshot, or repository. Browser sessions are ephemeral and no storage state is saved. If login or account access fails, the previous published snapshot remains intact.

The reader extracts the selected permit’s project name, location and inspection checklist, including dated statuses and links to original result reports. Reports and source permit links require SmartGov sign-in. It does not request or cancel inspections. Choose Medina in Add permit and provide the exact number and SmartGov permit link; the number must match the linked record.

## Redmond Civic Access

BLDG-2025-07156 and CGP-2025-07539 are included. The refresh job signs in through Tyler Identity using encrypted `REDMOND_USERNAME` and `REDMOND_PASSWORD` repository Actions secrets. These credentials are available only to the refresh step. No tokens, browser storage state or login diagnostics are published. If account verification requirements change, refresh fails and the previous snapshot remains live.

The reader searches an exact permit number, collects all existing, remaining and optional inspection pages, and opens each inspection’s checklist for its original comments and completion date. Scheduling controls are never activated. Completed approvals supersede older corrections; later scheduled or correction records stay pending, and reinspection flags remain pending. “Inspection Not Required” is shown green with its original label. The source permit’s hold notice is displayed when present. Select Redmond in Add permit to request another permit by number.

## Scheduling and cancellation (MyBuildingPermit)

The secure backend supports scheduling for MBP, Clyde Hill, Medina and Redmond, plus MBP cancellation, using an owner-only management key. MBP uses HTTP; the other portals use isolated server-side browsers. Requests require live validation, a review, and explicit confirmation. Passed inspections are greyed out and disabled for scheduling. The website displays confirmed success, preflight failure, or an unconfirmed result and can recheck without resubmitting. No actual inspections were scheduled or cancelled during development; unit and browser tests use mocks only. See [backend setup and behavior](backend/README.md). The deployed backend accepts owner-confirmed actions using the private management key. Reloading the public snapshot does not submit requests.
