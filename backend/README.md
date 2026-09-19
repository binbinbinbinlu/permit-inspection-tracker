# Inspection actions backend

Backend deployed at `https://permit-desk-actions.binbin-0db.workers.dev`; authenticated owner-confirmed writes are enabled. No real scheduling or cancellation has been used in testing.

This Cloudflare Worker uses plain HTTP to MBP, with D1 storing confirmation operations and atomic permit locks. The public GitHub Pages snapshot remains separate. Only permits in `permits.json` are accepted. MBP uses HTTP; Clyde Hill, Medina and Redmond use isolated Cloudflare Browser Run sessions. Redeploy this Worker after adding a tracked permit.

## Deployment

1. Connect the owner's Cloudflare account with Wrangler. Create a D1 database named `permit-desk-actions` and set its ID in `backend/wrangler.jsonc`. The current database is already configured.
2. Apply `backend/schema.sql` to that database using `wrangler d1 execute permit-desk-actions --remote --file backend/schema.sql --config backend/wrangler.jsonc`.
3. Generate a cryptographically random management key of at least 32 characters and save it using `wrangler secret put ADMIN_TOKEN --config backend/wrangler.jsonc`. Deliver the key privately to the owner. Never place it in frontend environment variables, git, workflow logs, URLs, or snapshots.
4. For the three portal adapters, set `PORTAL_CREDENTIALS` as a Worker secret containing JSON with `username` and `password`. It is never included in Pages assets or API responses. The browser binding and Node compatibility flags are configured in `backend/wrangler.jsonc`.
5. Deploy with `wrangler deploy --config backend/wrangler.jsonc`. Keep `WRITES_ENABLED=false` while checking authentication and read-only access. This state rejects both review and confirmation requests.
6. Set GitHub repository variable `NEXT_PUBLIC_ACTIONS_URL` to the HTTPS Worker origin (no trailing slash). Rebuild Pages. The owner enters the management key into the website; it is held only in React memory, not browser storage.
7. Enable `WRITES_ENABLED=true` and redeploy only when ready for owner-confirmed requests. Testing must continue to use mocks, not live submissions.

## Result handling

- `/live` retrieves live source availability, scheduled inspections and history. Passed/restricted rows cannot be scheduled, even if a crafted frontend request tries to bypass the disabled controls.
- `/review` validates contact information, exact booking/date and current restrictions, then stores an immutable five-minute review. No external mutation occurs.
- `/confirm` takes only the review ID and `confirm:true`. A durable atomic lock is acquired before revalidation and submission. A replay does not POST again.
- `/operations/:id` checks an existing result without resubmitting. The browser retains only that operation ID to recover after reload.
- `succeeded` requires source read-back. Scheduling must appear for the exact inspection/date. MBP cancellation requires a matching cancelled history record, or a future slot reopened for requests with no conflicting booking or result; disappearance alone could mean completion. If MBP doesn't expose that evidence, the result stays unconfirmed.
- `failed` means preflight rejected the request before submission. A transport error after submission may still mean the source accepted it, so it stays `unknown`. No automatic mutation retries are performed. A failed display refresh never overwrites an already confirmed success.
- Unknown operations retain their lock. The owner must check the source portal or contact the jurisdiction before an administrator manually resolves the operation/lock. Do not delete a lock just to retry an uncertain request. Cancellation failure or uncertainty is visible on the website.

Operation records contain site contact details for the reviewed request. D1 is private; authenticated management requests can retrieve them. Remove old resolved records according to the owner's retention needs; never remove unresolved locks during cleanup.

## Tests

`npm test` covers state transitions, authorization, SQL reservations, source restrictions and HTTP payloads with injected mocks. `npm run test:ui` runs local Vite/Playwright tests with all external requests intercepted. It covers confirmation gating, successful scheduling/cancellation, failure, unconfirmed results and disabled passed rows. Neither test command submits real inspections.

The source HTTP contract was read from MBP's public page scripts. Portal sign-in, availability and contact fields were checked without clicking final submission controls. Live write behavior is deliberately untested. Keep the first real request under the owner's explicit confirmation and verify its result in the source portal.

## Portal scheduling

Clyde Hill and Medina offer the next available date reported by their source; Medina also exposes its time slots. Redmond offers enabled dates from its displayed calendar month. All adapters reread source permissions and dates at confirmation. Cancel remains MBP-only; use the source portal for other cancellations. Site contact details are entered into the source contact fields, or comments when the portal has no separate contact fields.

Browser sessions are closed in `finally`. A browser-start rate limit may trigger one delayed startup retry, before any source submission; submission itself is never retried. Cloudflare Free browser runtime has daily and startup limits: https://developers.cloudflare.com/browser-run/limits/. The UI reports unavailable service rather than assuming a request succeeded.

`npm run build:actions` produces the Worker and its Playwright module chunk in `.wrangler/actions-build`; a manual multipart deployment must upload every generated JavaScript module with `nodejs_compat`, the BROWSER binding and both private secrets. Do not use a deployment helper that drops the portal secret or browser binding.
