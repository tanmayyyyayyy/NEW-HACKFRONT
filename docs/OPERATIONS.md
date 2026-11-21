
# Running SkillForge

## Windows and macOS launchers

Double-click [Run-SkillForge.bat](../Run-SkillForge.bat) on Windows or [Run-SkillForge.command](../Run-SkillForge.command) on macOS. The launcher checks Node.js and npm, uses uv to prepare Python 3.12 and the locked API dependencies, and installs the locked web dependencies when needed. The first run may require internet access. It rebuilds the website, serves it with the API at a single loopback URL, and opens the browser after verifying the API, database and web build. Keep the terminal open while using the app and press Ctrl+C to stop it.

The launcher tries port 8765 first and then checks the next 19 ports. In PowerShell, run `.\Run-SkillForge.bat`; in macOS Terminal run `./Run-SkillForge.command`. Both accept `--port 8765` to require a specific port, `--no-browser` to print the URL only, `--check` to verify startup with a temporary database and stop, and `--reinstall` to repair web dependencies. If a download or file copy removed the macOS executable permission, restore it with `chmod +x Run-SkillForge.command`.

Local data is saved in the ignored `.skillforge.db` file. For optional GitHub, Gemini or judge settings, copy `.env.example` to `.env.local` and fill in the integrations you want to use. The launcher reads `.env.local` and sets the origin, local SQLite database, scan worker and GitHub callback for the current run. If you use GitHub sign-in, pin the port and register the callback printed by the launcher. The practice catalog works locally and code submissions become available when you configure a compatible isolated evaluator.

## Local development

Use Node 22.12 or later, Python 3.12 and uv. Install the locked frontend and backend dependencies from their respective directories. Start the API and web app in separate terminals.

From `services`:

```sh
uv sync --locked
uv run --locked uvicorn skillforge.main:app --host 127.0.0.1 --port 8765 --no-access-log
```

From `apps/web`:

```sh
npm ci
npm run dev
```

Open [the local workspace](http://localhost:5173/). The seeded example, public URL import, graph, practice catalog and portfolio plan work without account credentials. The judge needs a separate service. By default the API creates an ignored SQLite database and hosts the scan worker. To serve a compiled web build directly from the API, run `npm run build` and set `APP_ORIGIN=http://127.0.0.1:8765` before starting the API.

For optional integrations, copy `.env.example` to an ignored `.env` at the repo root. From `services`, add `--env-file ../.env` to the `uv run` arguments.

## Deploy to Render

1. Open [Deploy NEW-HACKFRONT to Render](https://render.com/deploy?repo=https://github.com/tanmayyyyayyy/NEW-HACKFRONT) and sign in. If Render requests GitHub access, connect the destination repository and select its `main` branch.
2. Review and deploy the [Blueprint](../render.yaml). It creates one Docker web service and one PostgreSQL database in Singapore. Render provides the database connection and public origin. The service applies the schema, starts the scan worker, and listens on Render's assigned port.
3. When the service shows **Live**, open its assigned URL and visit `/api/health` to check database connectivity. In the app, use **Open Source** to find an issue, import a public repository, and verify that the worker completes the scan. Open **Decision history** to check that the answer links to evidence or reports insufficient context.

The free web service can spin down between visits. The free database expires 30 days after creation. For a persistent launch, choose paid service and database plans in Render and verify the production setup below. [Render free-plan limits](https://render.com/docs/free)

Core features require no additional provider secrets. Add optional integrations in the Render service's **Environment** settings. For GitHub sign-in, register the assigned HTTPS origin plus `/api/auth/github/callback` as the OAuth callback. For Neo4j, set the Aura connection values documented in the [environment guide](ENVIRONMENT.md) and check an answer with **Use Neo4j for this question**. For a custom domain, set `APP_ORIGIN` to the exact HTTPS origin visitors use and update the OAuth callback to match.

## Persistent deployment

1. Build the root Dockerfile. Deploy the API and static web app behind one HTTPS reverse proxy. Set `APP_ORIGIN` to the public URL and use PostgreSQL over TLS. Apply a request size cap, per-IP limits for session creation and imports, and an API timeout longer than the evaluator request timeout.
2. Run `python -m skillforge.migrate` as a one-off schema task with a privileged database role. Run the API and scan worker with a separate role that has table access. The production API verifies the schema revision at startup.
3. Deploy a worker using the same image and `python -m skillforge.worker` as its command. Start with one worker to limit shared GitHub quota. Scale after measuring queue age, throttling and upstream calls. Keep the API's embedded worker disabled.
4. Configure separate GitHub OAuth credentials and the callback `/api/auth/github/callback` using the staging origin. The picker lists public repos owned by the connected account, and the service discards the OAuth token after profile lookup. An optional separate read-only API token raises public scan quotas.
5. Configure the judge on its own isolated Linux worker before enabling assessed submissions. Require private networking or authenticated TLS for the API-to-judge link. Keep cloud credentials, data volumes and database routes away from the evaluator host. Pre-pull vetted Python and Node images by digest and install an isolated container runtime such as gVisor. Use `python -m uvicorn skillforge.judge:app` on the judge host, with the Docker CLI available and a high-entropy service token. Pin its images with `JUDGE_PYTHON_IMAGE` and `JUDGE_JAVASCRIPT_IMAGE`. Point the web API at the judge using `JUDGE_URL` and the same `JUDGE_TOKEN`. Keep the judge service off public ingress.
6. If enabling optional Gemini findings, configure a supported model and a server-side key. A scan sends its bounded source excerpts only when the user opts in. The adaptive score remains based on measured checks. Deploy the API and evaluator with the same problem catalog version.
7. Verify GitHub OAuth, live scans, source references, durable recovery, PostgreSQL restore, provider timeouts, and the evaluator's limits and isolation before public rollout. Use separate staging data and values. Rebuild from an earlier image to roll back code only when the running schema supports it.

## Current release boundary

The implementation covers public GitHub import and opt-in connected selection, bounded static structure analysis for JavaScript, TypeScript and Python, adaptive repository scoring, practice scoring and portfolio planning. See [adaptive scoring](SCORING.md) for score interpretation and limits. Dynamic dispatch and provider history outside the sample are outside graph coverage. The editor drafts stay in tab memory.

The current database stores graph metadata in the scan snapshot. Decision context can use a temporary Neo4j projection when configured. Private repository access, Google and email sign-in, resume extraction, the full legacy career simulation suite, and legacy data migrations remain follow-up work. Keep the inherited inventory as a roadmap and confirm environment and provider choices before enabling those features.

## Security verification

Production API mutations require the configured HTTPS origin and enforce a 64 KB body limit on both declared lengths and streamed payloads. Validation responses omit submitted values. Session cookies are Secure and HttpOnly in production, and workspace lookups are scoped to the owning session or account. The production frontend's content security policy restricts scripts and connections to the same origin and blocks framing. Inline styles are permitted for the graph and scorecard.

CI audits the locked JavaScript dependencies and Python runtime dependencies and runs regression tests for request boundaries and workspace isolation. A dependency audit checks published advisories for the installed versions. Validate Render's public headers and TLS after deployment and keep any optional evaluator on its separate isolated host.

## Operational checks

Use `GET /api/health` for API liveness and current database connectivity. Monitor the oldest queued scan, failed scans by rate limits or provider outages, evaluator availability, and PostgreSQL backups. Keep access-log redaction at the reverse proxy and exclude HTTP bodies, cookies, credentials, and callback query values from logs.
