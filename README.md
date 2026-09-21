# WorkLedger AI

**Contingent workforce intelligence — from contract intake through invoice approval.**

A staffing vendor supplies contractors to client companies under negotiated contracts. The money at the end of that chain is only as trustworthy as the records behind it: the rate in the contract, the hours someone approved, and the line items on the invoice. WorkLedger AI runs that whole chain in one system and reconciles the three against each other before an invoice can be approved.

Spring Boot 4 · Java 21 · PostgreSQL 16 · React 19 · Spring AI

[Architecture](docs/ARCHITECTURE.md) · [Deployment](docs/DEPLOYMENT.md) · [Product spec](docs/PRODUCT-SPEC.md)

---

## What makes this more than CRUD

Two modules do work that is hard to do correctly, and both are built so that the language model cannot be the reason an answer is wrong.

### Contract intake with verifiable citations

Upload a contract; the pipeline extracts four families of attribute — **rates, billing terms, milestones, dates** — and proposes each one with a supporting quote.

The quote is then *checked against the stored document*. A citation is only marked verified when it is a verbatim span of the source text at a known offset and page. A model that invents a plausible-sounding sentence fails that check, and the attribute reaches the reviewer visibly unverified rather than quietly carrying false provenance.

Nothing extracted is ever applied automatically. The pipeline may only write `PENDING`; a person accepts, corrects or rejects every attribute, and a document with anything still pending cannot be applied to a contract.

Two engines run on every document and their results are merged: a language model for recall on unusual phrasing, and a pattern matcher whose citations are correct by construction. **With no API key configured, the pattern engine alone still does the job** — see [Running without an API key](#running-without-an-api-key).

### Deterministic invoice auditing

Before an invoice can be approved it is reconciled against three authoritative sources:

| | Source | What it establishes |
|---|---|---|
| 1 | **Contract** | Which rates are authorised, and the period the agreement covers |
| 2 | **Approved work** | Approved timesheets and approved milestones — what may legitimately be billed |
| 3 | **Invoice** | The line items as presented for payment |

Seven versioned rules run as pure functions over those three, producing typed findings with expected value, actual value and a signed delta. Severity decides the verdict: any `BLOCKER` and approval is refused.

**Then**, and only then, a language model is asked to explain the findings in plain English. It never produces a number, a severity or a verdict — every figure is final before it is called. Delete every AI explanation from the database and the audit is still complete, actionable and correct.

Approving anyway is possible, but it requires a written reason and is recorded against the invoice with the approver's identity.

```
                 ┌──────────────┐
   Contract ────▶│              │
                 │  7 rules,    │──▶ findings ──▶ verdict ──▶ approval gate
Approved work ──▶│  pure Java   │       │
                 │              │       ▼
    Invoice ────▶└──────────────┘   LLM writes prose about findings
                                     that already exist
```

---

## Modules

Eight operational modules, six access-controlled roles.

| Module | What it covers |
|---|---|
| **Access control** | Table-driven RBAC — roles and permissions are data, not code |
| **Workforce** | Contractor profiles, skills with proficiency, weekly availability |
| **Clients & contracts** | Client companies, contracts, requirements, rates, headcount |
| **Contract intelligence** | Document intake, AI-assisted extraction, cited attributes, human validation |
| **Allocation** | Skill-matched assignment with in-transaction locking against double-booking |
| **Time tracking** | Multi-segment daily worklogs, overlap detection, submit → approve → immutable |
| **Milestones** | Milestone schedules with nested tasks and finance sign-off |
| **Billing & audit** | Strategy-based invoice generation, three-way reconciliation, approval gate |

Roles: `PLATFORM_ADMIN` · `HR_MANAGER` · `MANAGER` (delivery) · `FINANCE_MANAGER` · `AUDITOR` (read-only) · `EMPLOYEE` (contractor).

Permission checks are on *permissions*, never role names, so a new role is a row in a table — no redeploy.

---

## Running it

### Docker (everything, one command)

```bash
git clone <your-repository-url>
cd Workledger-AI
docker compose up --build
```

- App — http://localhost:3000
- API docs — http://localhost:8080/swagger-ui.html

### Locally

**Requirements:** Java 21+, Node 20+, PostgreSQL 15+.

```bash
createdb workledger
cp .env.example .env          # edit DB credentials if yours differ

cd Backend  && ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
cd Frontend && npm install && npm run dev
```

Flyway applies all 11 migrations on first start, including the seed accounts.

### Demo accounts

All six use the password `password`. They exist for demonstration — [rotate them](docs/DEPLOYMENT.md#before-you-go-live) before any real deployment.

| Username | Role |
|---|---|
| `admin` | Platform administrator |
| `manager` | Delivery manager |
| `hr` | HR manager |
| `finance` | Finance manager |
| `auditor` | Compliance auditor (read-only) |
| `employee1` | Contractor |

### A five-minute tour

1. Sign in as `manager` → **INTAKE · AI** → upload [`docs/samples/sample-contract.txt`](docs/samples/sample-contract.txt) → **RUN EXTRACTION**.
   Rates, payment terms, milestones and both contract dates come back, each with a green ✓ where the quote was found in the source. Accept, correct or reject each one.
2. Still as `manager`: create a client and an hourly contract, add a skill requirement, assign an eligible contractor.
3. As `employee1`: submit a worklog. Back as `manager`: approve it.
4. As `finance`: generate an invoice for the period, then **AUDITOR · AI** → **RUN AUDIT**.
   You will see the three source totals side by side and a `CLEAN` verdict.
5. Now make it disagree — approve fewer hours than were billed, or edit a rate — and re-run. The audit turns `BLOCKED`, names the discrepancy with its delta, and invoice approval is refused until it is resolved or overridden with a reason.

---

## Running without an API key

`AI_ENABLED=false` is the default and a **supported production configuration**, not a degraded one:

- Contract extraction falls back to the pattern engine. Lower recall on unusual wording; citations exact.
- The invoice auditor is unaffected — it was never using a model for anything that matters.
- Audit summaries are templated instead of model-written.

To turn the model on, point it at any OpenAI-compatible endpoint. Groq, Google Gemini and OpenRouter all have free tiers, and a local Ollama needs no key at all — exact values are in [`.env.example`](.env.example).

```bash
AI_ENABLED=true
AI_API_KEY=your_key
AI_BASE_URL=https://api.groq.com/openai
AI_MODEL=llama-3.3-70b-versatile
```

A model that is slow, rate-limited, misconfigured or down never fails a request: every call returns an `Optional`, and every caller has a deterministic answer ready.

---

## Design

Four patterns carry most of the structure. [Architecture](docs/ARCHITECTURE.md) has the detail.

- **Specification chain** — assignment eligibility (skill, capacity, collision, active status) expressed once, reused by manual assignment, bulk allocation and eligibility preview.
- **Strategy** — `InvoiceCalculationStrategy` and `AllocationStrategy`; a new billing model is a new class, not an `if` in a service.
- **Reconciliation rules** — the auditor discovers every `ReconciliationRule` bean, so a new check is a new class and nothing existing changes.
- **AOP audit logging** — `@Auditable` captures before/after JSONB snapshots around service methods, so a new method cannot silently skip the audit trail.

**Correctness properties the code actually enforces:**

- Assignment creation locks the employee row and re-runs the full specification chain *inside* the transaction, so two managers racing for the same contractor cannot both succeed.
- Worklog durations and invoice totals are computed server-side. A total is never accepted from a client.
- Approved worklogs are immutable; corrections go through rejection.
- Flyway owns the schema and Hibernate is set to `validate`, so a mapping that drifts from a migration fails at startup rather than altering tables under a running system.

---

## Tests

```bash
cd Backend && ./mvnw verify
```

95 tests. The ones worth reading:

- `CitationVerifierTest` — an invented quote must not verify; PDF whitespace damage must not cause a real one to fail.
- `ReconciliationRuleTest` — one case per discrepancy an auditor is actually asked to catch: unauthorised rates, billing unapproved hours, periods outside the contract term, overlapping invoices.
- `DatabaseUrlEnvironmentPostProcessorTest` — the URL shapes each hosting platform actually emits.
- `OverlapCheckerTest` — time-segment collisions, including shifts crossing midnight.

The full-context test needs a real PostgreSQL and skips without one; [CI](.github/workflows/ci.yml) starts a container so it runs there.

---

## Deploying

Deployable end to end on free tiers — [full guide](docs/DEPLOYMENT.md).

`render.yaml` is a Render Blueprint covering database, API and frontend. A `DATABASE_URL` in `postgres://` form (which Render, Railway, Heroku and Fly all inject) is converted to JDBC at startup, so the datasource needs no manual transcription.

---

## Repository

```
Backend/     Spring Boot API — package-by-feature
  ai/            LLM gateway; the single outbound boundary to a model
  intelligence/  Contract extraction, citation verification, human validation
  invoiceaudit/  Reconciliation context, rules, findings, narration
  ...            assignment, worklog, invoice, milestone, security, audit
Frontend/    React 19 + Vite, role-aware shell
docs/        Architecture, deployment, product spec, sample contract
```

---

## License

MIT — see [LICENSE](LICENSE).
