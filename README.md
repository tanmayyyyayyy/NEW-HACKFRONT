# SkillForge

SkillForge helps engineers recover the reasoning behind unfamiliar code. Open **Workspace access**, then **Private team handover**, to investigate a repository your team has already authorized you to read. Choose **Public repo learning → Continue as guest** on the same access page to study how engineering teams make changes before joining or contributing.

Both paths retrieve GitHub records and their links with fixed Neo4j queries. The chat presents original citations and shows the executed retrieval query. Sarvam can explain the selected evidence after opt-in. An empty retrieval shows an insufficient-evidence response.

## First visit

On the home page, select either PR on the decision map to inspect its source. Open Trace library and choose Investigate this trace to prefill the repository and question. Run the question to retrieve fresh graph evidence. The workspace keeps the last six questions for the active repository in tab memory. Private workspace links require sign-in, and private queries recheck GitHub authorization.

## Run locally

Node.js 24 LTS or newer and an available Neo4j instance are required. For a fresh local Docker instance, use a loopback port and a local-only password.

```sh
docker run --rm -d --name skillforge-chat-neo4j -p 127.0.0.1:7687:7687 \
  -e NEO4J_AUTH=neo4j/whygraph-local neo4j:5.26.27-community
cp .env.example .env.local
npm ci
npm run dev
```

Open http://localhost:3000. Set `SARVAM_API_KEY` in `.env.local` and restart the server to enable the optional Sarvam explanation. The three labeled Futon demos use the bundled public GitHub snapshot and require no GitHub token, Gemini extraction, or initial graph load.

## Access and data handling

- **Private:** The team grants repository access in GitHub. Each engineer supplies their own fine-grained, repository-scoped read token. GitHub access is rechecked on every request. Tokens live in tab memory and are sent only to the SkillForge server and GitHub. Workspace provisioning and single sign-on are future work.
- **Public:** Supports public GitHub repository URLs, subject to GitHub's unauthenticated quota. Live retrieval samples recent closed PRs, issues, and commits plus a limited set of explicitly referenced discussions. The bundled Futon demo includes additional captured override evidence.
- **Neo4j:** Each question creates and queries an isolated temporary projection. The transaction rolls back after retrieving evidence. Chat history stays in tab memory. Citations are linked from authorized GitHub metadata.
- **Sarvam:** Opt-in sends the question and bounded excerpts to Sarvam for explanation. Team members should enable it for private content only where their organization allows external processing. Keep server-side provider keys out of source control. Search works best with English terms, code identifiers, or a PR or issue number. Sarvam explanations support Hinglish, Hindi, and English.
- **Hosting:** Set `APP_ORIGIN` to the exact HTTPS origin and configure `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, and `NEO4J_DATABASE`. Set up authenticated ingress and request throttling before a team rollout.

## Verify

With Neo4j running, run `npx tsx --env-file-if-exists=.env.local scripts/check-chat.ts`. The test checks real Neo4j queries using the Futon snapshot. GitHub private authorization, access revocation and Sarvam use staged responses. Run `npm run build` for the production build.

The legacy collection, Gemini extraction, and load scripts remain in `scripts/` for the original demo pipeline. The SkillForge chat does not call them. Use a dedicated disposable database for the legacy loader because it replaces its existing graph.

## Run this edition on a host
Use Node 24 LTS or newer with node:sqlite. Run npm ci, npm run build, then npm start -- --hostname 0.0.0.0 --port "$PORT" from this folder. Deploy a single instance with a persistent writable volume. Set ACCOUNT_DATABASE to an absolute path on the volume, for example /var/data/accounts.sqlite. Back up the database using SQLite's online backup support. The readiness endpoint is /api/health and checks Neo4j. Set APP_ORIGIN to the exact HTTPS origin, BETTER_AUTH_SECRET to a unique random secret of at least 32 characters, and configure a private Neo4j database with authenticated TLS. Public history remains available with no identity provider configured.

Configure GitHub and Google OAuth apps with callback URLs APP_ORIGIN/api/auth/callback/github and APP_ORIGIN/api/auth/callback/google respectively. Set the matching client ID and secret from .env.example. For standalone email signup, verification and password recovery, configure a verified Resend sender and API key. Only configured sign-in methods appear on the account page. Accounts and sessions persist in SQLite. Repository access still requires the user's scoped GitHub permission. Disconnecting the repository token on GitHub denies the next private query. Keep the app secret stable across deploys.

Use npm run check:chat against a disposable local Neo4j. It creates a temporary SQLite identity store, verifies email through a mocked delivery endpoint, tests sign-in and revocation, and exercises the real graph. Use npm run check:ui against a running local server. Configure real provider callbacks and mail delivery separately in staging. See pitch/finale-readiness.md for release gates. Earlier pitch decks and scripts are prototype artifacts.

render.yaml defines a single paid Render web instance and persistent disk. Review the plan before creating it. Set OAuth, email and Sarvam secrets through Render's environment settings. Set APP_ORIGIN to the service HTTPS URL. Run the browser suite after installing Chromium with npx playwright install chromium.

## Repository chatbot
Open a trace, ask a question and use **Ask a follow-up** beneath its result. Follow-ups retrieve the selected sources again and recheck private GitHub access. Explicit PR numbers start a lookup for those PRs. The main question box starts an independent lookup. Recent questions and Clear conversation operate in tab memory. Date limits apply to sampled record dates and do not reconstruct previous revisions of edited PR descriptions.

For generated explanations add SARVAM_API_KEY to the server's .env.local or hosting environment, restart the Next server and check **Let Sarvam explain the answer**. Language selection applies to the generated explanation. Original sources remain visible if Sarvam is unavailable.
