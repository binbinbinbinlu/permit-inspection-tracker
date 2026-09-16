# Permit desk

MyBuildingPermit inspection tracker with grey **Available**, yellow **Pending**, and green **Passed** statuses. Includes Bellevue **26 112569 BR** and Kirkland **LSM25-02028**, status filters, source links, dates, original results and inspection history.

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
npm run sync
npm run build:pages
npx vite preview --config vite.pages.config.ts
```

`npm run dev` runs the optional Vinext server version, which pulls data on demand and lets you add permits for the current session. `npm run build` builds that Worker version. The Sites scaffold registration is retained in `.openai/hosting.json`; no Sites deployment is required for GitHub Pages.

Tests cover status precedence, duplicate history, versioned Kirkland names, same-day completed inspections, future reinspections, restrictions, date parsing, permit validation, request authorization and upstream failures. CI runs tests and type checking before deployment and on pull requests.

## Data and status rules

Public source feeds:
- `inspection.mybuildingpermit.com/api/Default/Permits`
- `inspection.mybuildingpermit.com/api/InspectionDetails/AvailableInspections`
- `inspection.mybuildingpermit.com/api/InspectionDetails/GetScheduledInspections`
- `permitsearch.mybuildingpermit.com/PermitDetails/PermitInspections/{number}/{jurisdiction}`

No MyBuildingPermit username, password, browser cookie or account token is needed or stored. Only public permit data is fetched. Scheduling and cancellation endpoints are never called. Browser requests cannot call these feeds directly because they do not provide cross-origin access; the GitHub workflow performs those reads.

Available means offered for scheduling, not necessarily required. Pending includes scheduled, partial, corrections, restricted and other unresolved results. Passed includes approved, passed and completed. Latest dated results supersede older attempts; a same-day completed record supersedes a stale scheduled feed. Future reinspections reopen an older pass. Kirkland catalog tooltips match versioned history descriptions. Exact duplicate history rows are removed. These public feeds are undocumented and can change.

The optional WebMCP refresh tool uses the same read path as the visible reload button. In GitHub Pages it reloads published data; in server mode it fetches upstream data (cached for 30 seconds).

## Organize permits

Use the Your permits panel to sort by number, jurisdiction or address. Organize lets each user set nicknames and custom groups, or move permits earlier/later in My order. Group by jurisdiction or custom group to view related permits together. These preferences are stored only in that browser and do not modify the shared permit list or inspection data. New permits are appended after any saved custom order.

