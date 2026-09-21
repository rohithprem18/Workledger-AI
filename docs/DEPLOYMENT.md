# Deployment

WorkLedger AI deploys as a single Vercel project: the React app is served as static files and the API runs as one serverless function (`api/[...path].ts`). The database is PostgreSQL — Neon's free tier is the intended pairing. Everything below runs on free tiers.

---

## 1. Database — Neon

1. Create a project at [neon.tech](https://neon.tech) (or from Vercel → Storage → Neon, which also injects `POSTGRES_URL` for you).
2. Copy the **pooled** connection string — the host contains `-pooler`. The pooled endpoint runs PgBouncer, which is what keeps a burst of serverless invocations from exhausting Postgres connections.
3. Apply the schema from your machine:

   ```bash
   DATABASE_URL="postgresql://…-pooler…/neondb?sslmode=require" npm run migrate
   ```

   Migrations are a deliberate one-off step, not something the API does on boot — otherwise every cold start would race to migrate. Re-running is a no-op.

## 2. API + frontend — Vercel

```bash
npm i -g vercel
vercel login
vercel link          # create or link the project
```

Set the environment variables (Production, and Preview if you use it):

```bash
vercel env add DATABASE_URL production     # the pooled Neon string
vercel env add JWT_SECRET production       # openssl rand -base64 48
vercel env add AI_ENABLED production       # true or false
vercel env add AI_API_KEY production       # optional — Groq/Gemini/OpenRouter key
```

Then deploy:

```bash
vercel --prod
```

`vercel.json` builds the frontend into `Frontend/dist`, serves it as static files, and routes every non-`/api` path to `index.html` so client-side routes survive a refresh. The SPA and API share one origin, so no CORS configuration is needed.

Verify:

```bash
curl https://<your-project>.vercel.app/api/health
# {"success":true,"data":{"status":"UP","database":"UP","aiAssist":"enabled"}}
```

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes* | PostgreSQL connection string (`POSTGRES_URL` is read as a fallback) |
| `JWT_SECRET` | yes | ≥ 32 characters; the API refuses to sign with less |
| `AI_ENABLED` | — | `true` to turn on model assistance; default `false` |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | — | Any OpenAI-compatible endpoint |
| `CORS_ALLOWED_ORIGINS` | — | Only when the frontend is hosted on a different origin |
| `LOGIN_RATE_LIMIT` | — | Sign-in attempts per minute; default 20 |

Full annotated list in [`.env.example`](../.env.example).

---

## Before you go live

- [ ] **Rotate every demo account.** `admin`, `manager`, `hr`, `finance`, `auditor` and `employee1` all ship with the password `password`.
- [ ] **Generate a real `JWT_SECRET`** — never reuse the example value.
- [ ] **Use the pooled Neon endpoint** for `DATABASE_URL`, not the direct one.
- [ ] **Confirm `.env` is not committed** — it is gitignored; check `git status`.

---

## Operational notes

**Cold starts.** The first request to an idle function takes a moment longer. The PDF parser is imported lazily so plain-text uploads never pay for it.

**Timeouts.** `vercel.json` gives the API function 60 seconds, enough for an LLM extraction. A model call is abandoned after `AI_TIMEOUT_MS` (default 45 s) and the pattern engine's result is used instead.

**Login rate limiting** is in-memory, so it is per-instance rather than global — a speed bump on online guessing, not a distributed limiter.

**Invoice reports** are plain text rather than PDF, to keep a PDF-generation engine out of the serverless bundle.
