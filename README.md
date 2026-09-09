# Permit desk

A responsive MyBuildingPermit inspection tracker. Starts with Bellevue **26 112569 BR** and Kirkland **LSM25-02028**. Enter a jurisdiction and exact permit number to pull another permit. The permit list is session-only.

## Run

Requires Node 22.13+ and npm.

```sh
npm install
npm run dev
npm run build
node --test tests/inspections.test.ts
```

## Live sources

The server reads public MyBuildingPermit JSON feeds: inspection scheduling (`api/Default/Permits`, `api/InspectionDetails/AvailableInspections`, `api/InspectionDetails/GetScheduledInspections`) and public permit results (`PermitDetails/PermitInspections/{number}/{jurisdiction}`). No MyBuildingPermit username, password, browser cookies, or API credentials are required or stored. Do not commit credentials.

Grey means available to request. Yellow means scheduled, partial, corrections, restricted, or another unresolved result. Green means approved, passed, or completed. Original statuses and history remain visible. Latest calendar-date results supersede older attempts. Same-day completed results supersede a stale scheduled feed; a later scheduled inspection reopens a passed item. Kirkland catalog tooltips match versioned history names. Exact duplicate history rows are removed.

Catalog availability does not mean an inspection is required. MyBuildingPermit can delay updates. Public feeds are undocumented and may change; failures appear explicitly rather than silently showing incomplete data. All four feeds must succeed before returning data. Upstream results are cached for 30 seconds, with bounded entries and concurrent requests. No scheduling or cancellation endpoints are called.

## Deployment

Vinext and Cloudflare Workers, managed by Sites. The site is published privately. `.openai/hosting.json` contains only the site identifier and binding declarations. The app exposes an optional `refresh_permit_inspections` WebMCP tool when supported by the browser.

## GitHub

This checkout is ready for a private GitHub repository named `permit-inspection-tracker`. GitHub creation requires a valid GitHub CLI login. No account credential is bundled with the source.
