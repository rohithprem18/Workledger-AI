# WorkLedger AI

**Contingent workforce intelligence — from contract intake through invoice approval.**

A staffing vendor supplies contractors to client companies under negotiated contracts. The money at the end of that chain is only as trustworthy as the records behind it: the rate in the contract, the hours someone approved, and the line items on the invoice. WorkLedger AI runs that whole chain in one system and reconciles the three against each other before an invoice can be approved.

Node.js · TypeScript · Express · PostgreSQL · React 19 · deployed on Vercel

[Architecture](docs/ARCHITECTURE.md) · [Deployment](docs/DEPLOYMENT.md) · [Product spec](docs/PRODUCT-SPEC.md)

---

## What makes this more than CRUD

Two modules do work that is hard to do correctly, and both are built so that the language model cannot be the reason an answer is wrong.

### Contract intake with verifiable citations

Upload a contract; the pipeline extracts four families of attribute — **rates, billing terms, milestones, dates** — and proposes each one with a supporting quote.

The quote is then *checked against the stored document*. A citation is only marked verified when it is a verbatim span of the source text at a known offset and page. A model that invents a plausible-sounding sentence fails that check, and the attribute reaches the reviewer visibly unverified rather than quietly carrying false provenance.

Nothing extracted is applied automatically. The pipeline may only write `PENDING`; a person accepts, corrects or rejects every attribute, and a document with anything still pending cannot be applied to a contract.

Two engines run on every document and their results are merged: a language model for recall on unusual phrasing, and a pattern matcher whose citations are correct by construction. **With no API key configured, the pattern engine alone still does the job.**

### Deterministic invoice auditing

Before an invoice can be approved it is reconciled against three authoritative sources:

| | Source | What it establishes |
|---|---|---|
| 1 | **Contract** | Which rates are authorised, and the period the agreement covers |
| 2 | **Approved work** | Approved timesheets and approved milestones — what may legitimately be billed |
| 3 | **Invoice** | The line items as presented for payment |

Seven versioned rules run as pure functions over those three, producing typed findings with expected value, actual value and a signed delta. Any `BLOCKER` and approval is refused.

**Then**, and only then, a language model is asked to explain the findings in plain English. It never produces a number, a severity or a verdict — every figure is final before it is called. Delete every AI explanation and the audit is still complete and correct.

Approving anyway is possible, but it requires a written reason and is recorded against the invoice with the approver's identity.

---

## Modules

Eight operational modules, six access-controlled roles.

| Module | What it covers |
|---|---|
| **Access control** | Table-driven RBAC — roles and permissions are rows, not code |
| **Workforce** | Contractor profiles, skills with proficiency, weekly availability |
| **Clients & contracts** | Client companies, contracts, requirements, rates, headcount |
| **Contract intelligence** | Document intake, AI-assisted extraction, cited attributes, human validation |
| **Allocation** | Skill-matched assignment with row locking against double-booking |
| **Time tracking** | Multi-segment daily worklogs, overlap detection, submit → approve → immutable |
| **Milestones** | Milestone schedules with nested tasks and finance sign-off |
| **Billing & audit** | Strategy-based invoice generation, three-way reconciliation, approval gate |

Roles: `PLATFORM_ADMIN` · `HR_MANAGER` · `MANAGER` · `FINANCE_MANAGER` · `AUDITOR` (read-only) · `EMPLOYEE`.

---

## Running it locally

**Requirements:** Node 20+, a PostgreSQL 15+ database (a free [Neon](https://neon.tech) project works).

```bash
npm install
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
npm run migrate               # applies all 12 migrations, seeds demo accounts

npm run dev                   # API on :8080
cd Frontend && npm install && npm run dev   # app on :5173

npm run seed:demo             # optional: a realistic client, contracts, timesheets and invoices
npm run ui:check              # Playwright pass over every page, desktop and phone
```

### Demo accounts

All six use the password `password` — [rotate them](docs/DEPLOYMENT.md#before-you-go-live) before any real use.

| Username | Role |
|---|---|
| `admin` | Platform administrator |
| `manager` | Delivery manager |
| `hr` | HR manager |
| `finance` | Finance manager |
| `auditor` | Compliance auditor (read-only) |
| `employee1` | Contractor |

### A five-minute tour

1. Sign in as `manager` → **Contract intake** → upload [`docs/samples/sample-contract.txt`](docs/samples/sample-contract.txt) → **Run extraction**. Accept, correct or reject each attribute.
2. Create a client and an hourly contract, add a requirement, assign an eligible contractor.
3. As `employee1`: submit a worklog. As `manager`: approve it.
4. As `finance`: generate an invoice, then **Invoice auditor** → **Run audit** — `CLEAN`.
5. Make the sources disagree and re-run. The audit turns `BLOCKED`, names the discrepancy with its delta, and approval is refused until it is resolved or overridden.

---

## Running without an API key

`AI_ENABLED=false` is the default and a supported configuration. Contract extraction falls back to the pattern engine, the auditor is unaffected, and summaries are templated. To turn the model on, point it at any OpenAI-compatible endpoint — Groq, Gemini and OpenRouter all have free tiers (see [`.env.example`](.env.example)).

A model that is slow, rate-limited or down never fails a request: every call returns `null` on failure and every caller has a deterministic answer ready.

---

## Design

- **Specification chain** — assignment eligibility (active, skill, capacity, collision) expressed once and reused by single assignment, bulk allocation and the eligibility preview.
- **Single write path** — one function inserts assignments; it locks the contractor row and re-runs the full chain *inside* the transaction, so two managers racing for the same contractor cannot both succeed.
- **Strategy** — invoice calculation per billing model; a new model is a new strategy, not an `if`.
- **Pure reconciliation rules** — the auditor runs every rule in `RULES`; a new check is a new function.
- **Server-side truth** — worklog durations and invoice totals are always computed from rows, never accepted from a request.

## Tests

```bash
npm test
```

54 tests over the pure domain logic: overlap detection (including overnight shifts), citation verification, value normalization, pattern extraction, every reconciliation rule, and migration ordering. [CI](.github/workflows/ci.yml) also applies the migrations to a real PostgreSQL and checks a re-run is a no-op.

## Repository

```
api/            Vercel serverless entry — the Express app as one function
server/
  auth/           JWT, permission middleware
  domain/         time windows, specification chain (pure)
  modules/        contracts, assignments, worklogs, milestones, invoices, RBAC
  intelligence/   contract extraction, citation verification, human review
  invoiceaudit/   reconciliation context, rules, narration
  ai/             the single outbound boundary to a model
  db/             pool, migration runner, SQL migrations
Frontend/       React 19 + Vite
docs/           architecture, deployment, spec, sample contract
```

## License

MIT — see [LICENSE](LICENSE).
