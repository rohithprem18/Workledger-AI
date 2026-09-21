# Architecture

How WorkLedger AI is put together, and why the parts that could have been done more simply were not.

---

## Shape

```
Browser ──▶ Vercel
             ├── static:   Frontend/dist  (React SPA)
             └── function: api/index.ts  ──▶  Express app (server/app.ts)
                                                     │
                                                     ▼
                                               PostgreSQL (Neon, pooled)
```

One Vercel project, one origin. The API is a single serverless function wrapping an Express app. `vercel.json` rewrites every `/api/*` request to `api/index.ts`; the function still receives the original URL, so Express routes as it would on a normal server. (A `[...path]` catch-all filename is not an alternative outside Next.js — it matches only one path segment.)

The code is organised by feature (`modules/`, `intelligence/`, `invoiceaudit/`) with pure domain logic isolated in `domain/`, so the rules that matter are testable without a database.

---

## Data access

- **node-postgres, not a vendor driver.** The same code runs against Neon in production, a plain PostgreSQL container in CI, and a laptop database — a driver that only speaks to one host makes the tests depend on the vendor.
- **A tiny pool against a pooled endpoint.** Each serverless instance holds at most a few connections; Neon's `-pooler` host (PgBouncer) absorbs the fan-out.
- **Parameterised SQL only.** Every query uses `$n` placeholders. SQL is the source of truth for row shapes; columns are aliased to the camelCase the React client expects.
- **DATE and TIME stay strings.** The default parser turns them into JS `Date`s, which serialize as UTC timestamps and shift a date across the day boundary west of UTC.
- **Migrations are plain SQL**, applied by `server/db/migrate.ts` with Flyway-like semantics: numeric ordering, one transaction per file, and a checksum check that refuses to run if an applied migration was edited. They run as a deploy step, never on boot.

---

## The two AI modules

Both follow one principle: **the model contributes recall and prose, never truth.** Anything a decision depends on is computed in code and checkable without a model.

### Contract intake

```
upload → text extraction → pattern engine + model engine → merge
       → citation verification → normalization → PENDING rows
       → human review (ACCEPTED / EDITED / REJECTED) → apply dates to contract
```

- **Text is stored, not re-derived.** Every citation is an offset into `contract_documents.source_text`; re-extracting with a different parser would silently move them.
- **Citation verification** (`intelligence/citation.ts`) accepts an exact match, then a whitespace-insensitive one (PDF extraction genuinely mangles spacing), and stops there. Fuzzy matching would re-admit the invented quotes it exists to catch.
- **Merge rule:** where both engines found a field, the pattern match wins — its value came from a regex over the document, so it cannot be fabricated.
- **Only dates are applied structurally.** Rates and milestones inform requirements and schedules a person then creates.
- **Uploads are parsed on byte boundaries** without a multipart library, so a PDF is never corrupted by string decoding.

### Invoice auditing

```
buildContext()  — contract, approved work, invoice: loaded once
      │
      ▼
RULES (pure):  arithmetic · rate authorisation · approved-work coverage
               contract period · milestone authorisation
               duplicate billing · unapproved work
      │
      ▼
findings → verdict (CLEAN / ADVISORY / BLOCKED)     ◀── deterministic to here
      │
      ▼
narrate()  — the model's only involvement: prose about findings that exist
      │
      ▼
approval gate: no audit → refused;  BLOCKED → refused unless overridden with a reason
```

| Rule | Severity | Catches |
|---|---|---|
| `LINE_ITEM_ARITHMETIC` | BLOCKER | A line ≠ quantity × rate; total ≠ sum of lines; no lines |
| `RATE_NOT_AUTHORISED` | BLOCKER | A unit rate the contract never authorised |
| `APPROVED_WORK_COVERAGE` | BLOCKER / WARNING | Billing more hours than approved (blocks); approved hours left unbilled (warns) |
| `PERIOD_OUTSIDE_CONTRACT` | BLOCKER / WARNING | Billing outside the contract term; inactive contract |
| `MILESTONE_AUTHORISATION` | BLOCKER / WARNING | Milestone not reached or not signed off; wrong amount; unfinished tasks |
| `OVERLAPPING_BILLING_PERIOD` | BLOCKER / WARNING | Overlap with an approved invoice; a milestone billed twice |
| `UNAPPROVED_WORK_IN_PERIOD` | WARNING / INFO | Timesheets still awaiting approval in the period |

Every rule runs even after a blocker, so fixing one problem does not reveal a second on the next run. A rule that throws is downgraded to a warning saying the invoice was not fully reconciled, rather than silencing the others. `rules_version` is stored on each run so an old verdict stays interpretable.

---

## Core invariants

- **Single write path for assignments.** `createAssignment` locks the contractor row (`SELECT … FOR UPDATE`), re-runs the full specification chain after the lock, inserts, and bumps `fulfilled_count` — all in one transaction. Bulk allocation calls it; it is never a second path.
- **Specification chain** (`domain/specifications.ts`) — active status, skill match, capacity, no collision. One definition, used by assignment, bulk allocation and the eligibility preview.
- **Overlap detection** (`domain/timeWindow.ts`) — pure, half-open intervals, overnight shifts split at midnight. Shared by assignment collisions and worklog collisions.
- **Server-side computation.** Worklog minutes are summed from segments; invoice totals from line items.
- **Immutable approved work.** An approved worklog cannot be edited; an invoice cannot be approved twice; a milestone's marker cannot also be its approver.
- **Audit trail.** Every write path calls `recordAudit` inside its own transaction, so a rolled-back action leaves no audit row claiming it happened.

---

## Security

- JWT (HS256 via `jose`) with separate 15-minute access and 7-day refresh tokens, each with its own `jti`; refresh tokens rotate and the old one is blacklisted.
- Logout blacklists the access token's `jti` until expiry.
- Roles and permissions are loaded per request, so a revoked permission or deactivated account takes effect immediately.
- Authorisation checks **permissions**, never role names — a new role is seed data.
- bcrypt password hashing; unknown usernames are compared against a dummy hash so timing does not reveal which accounts exist.
- The API refuses to start signing with a JWT secret under 32 characters.

---

## The AI boundary

`server/ai/llm.ts` is the only code that calls a model. It speaks the OpenAI-compatible chat protocol over plain `fetch` (no SDK in the serverless bundle), pins temperature to 0, aborts after `AI_TIMEOUT_MS`, and returns `null` on any failure. It is enabled only when `AI_ENABLED=true` **and** a key is present, so a half-configured deployment quietly uses the deterministic engines.
