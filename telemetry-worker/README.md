# Camp Clips — error telemetry Worker

A tiny Cloudflare Worker that collects **privacy-minimal** error reports from the
app so you can see what breaks in the field (especially during the stake review).
It never receives photos, songs, or any media — only error text plus minimal
context (message, stack, a context label, app version, path, user-agent, country).

## Deploy (one time)

```bash
cd telemetry-worker
npx wrangler login            # if not already
npx wrangler deploy
```

This prints your Worker URL, e.g. `https://camp-clips-telemetry.<you>.workers.dev`.
The app talks to it at `<that-url>/report`.

### Optional: keep 30 days of reports (recommended)

Without this, reports are only logged (see `wrangler tail`). To store + read them:

```bash
npx wrangler kv namespace create ERRORS
# paste the printed id into wrangler.toml (uncomment the [[kv_namespaces]] block)
npx wrangler secret put READ_TOKEN     # pick any long random string
npx wrangler deploy
```

Then review anytime:

```
https://camp-clips-telemetry.<you>.workers.dev/report?token=<your-READ_TOKEN>
```

## Point the app at it

Set the endpoint as a build-time env var for the app, then rebuild + deploy the app:

```bash
# in the app root (one level up), e.g. in .env.production or your deploy env:
VITE_TELEMETRY_URL=https://camp-clips-telemetry.<you>.workers.dev/report
```

Until `VITE_TELEMETRY_URL` is set, the app's reporter is a **no-op** — nothing is
sent. So shipping the client code before the Worker exists is harmless.

## What gets sent

`{ message, stack, context, app, version, path, ua, country }` — capped in size,
fire-and-forget, max ~20 reports per browser session. CORS is locked to the Camp
Clips origins. That's it.
