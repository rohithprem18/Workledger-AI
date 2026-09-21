# Architecture

How WorkLedger AI is put together, and why the parts that could have been done more simply were not.

---

## Layering

```
controller  ──▶  service  ──▶  repository  ──▶  PostgreSQL
   DTOs          business        JPA
                  rules
```

Packages are organised by feature, not by layer — `assignment/`, `worklog/`, `invoiceaudit/` each contain their own controller, service, entities and DTOs. Entities never cross the controller boundary; every endpoint speaks in DTOs.

---

## The two AI modules

Both are built on the same principle: **the model contributes recall and prose, never truth.** Anything a decision depends on is computed in Java and checkable without a model.

### Contract intake

```
 upload
   │
   ▼
 DocumentTextExtractor      PDF/text → normalised text + page map + SHA-256
   │
   ├──▶ LlmAttributeExtractor           recall on unusual phrasing
   └──▶ DeterministicAttributeExtractor exact, free, always available
   │
   ▼
 merge                      keyed by (type, field); pattern match wins ties
   │
   ▼
 CitationVerifier           is the quote REALLY in the document?
   │
   ▼
 ValueNormalizer            "₹1,250/hr" → "1250" + currency INR
   │
   ▼
 contract_extractions       every row PENDING — the only status the pipeline may write
   │
   ▼
 human review               ACCEPTED / EDITED / REJECTED, with reviewer identity
   │
   ▼
 apply to contract          refused while anything is still PENDING
```

**Why the text is stored, not re-derived.** Every citation is a character offset into `contract_documents.source_text`. If the text were re-extracted later with a different parser, existing offsets would silently point at the wrong span. The stored text is the one normalisation, applied once, never repeated.

**Why citation verification matters more than it looks.** Asking a model to cite its source is a request it may ignore; a quote that reads like the contract but appears nowhere in it is the normal failure mode, not an exotic one. `CitationVerifier` turns the request into a property the system checks: exact match first, then whitespace-insensitive (PDF extraction genuinely mangles spacing around line breaks), and it deliberately stops there. Fuzzy matching would re-admit exactly the quotes the class exists to catch.

**Why both engines always run.** The pattern engine has lower recall but its citation *is* the matched text, so it cannot fabricate. Where both engines found the same field, the pattern match wins. Where only the model found something, it is still shown — flagged by whether its citation verified.

**Why only dates are applied structurally.** Dates have an unambiguous home on `Contract`. Rates and billing terms inform the requirements a manager then creates; milestones inform the milestone schedule. Auto-creating those from a document would be inventing structure the document does not unambiguously specify.

### Invoice auditing

```
         ┌─────────────────────────────────────────┐
         │        ReconciliationContext            │
         │  loaded ONCE from all three sources     │
         └───────────────────┬─────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
  LineItemArithmetic   RateAuthorisation   ApprovedWorkCoverage
  ContractPeriod       DuplicateBilling    MilestoneAuthorisation
  UnapprovedWork
        │                    │                    │
        └────────────────────┼────────────────────┘
                             ▼
                    findings + severities
                             │
                             ▼
                          verdict            ◀── all deterministic to here
                             │
                             ▼
                     FindingNarrator          ◀── the model's only involvement
                             │
                             ▼
                    approval gate
```

**Why the context is loaded once.** If each rule queried independently, two rules could disagree about what the data said. A reconciliation that contradicts itself is worse than none.

**Why every rule runs even after a blocker.** A reviewer who fixes one problem should not then discover a second on the next run. All seven always execute; a rule that throws is caught and downgraded to a `WARNING` saying the invoice was not fully reconciled, so one buggy rule cannot suppress six good ones.

**Why an un-audited invoice cannot be approved.** Treating "not checked" as "nothing wrong" would make the auditor optional in exactly the cases it exists for.

**Why overrides are a feature.** Real businesses approve imperfect invoices for defensible reasons. Blocking absolutely would get the gate disabled. So the override exists, requires a reason of at least ten characters, and records who made it.

#### The rules

| Code | Severity | Catches |
|---|---|---|
| `LINE_ITEM_ARITHMETIC` | BLOCKER | A line ≠ quantity × rate; total ≠ sum of lines; no line items at all |
| `RATE_NOT_AUTHORISED` | BLOCKER | A unit rate the contract never authorised |
| `APPROVED_WORK_COVERAGE` | BLOCKER / WARNING | Billing more hours than were approved (blocks); leaving approved hours unbilled (warns) |
| `PERIOD_OUTSIDE_CONTRACT` | BLOCKER / WARNING | Billing before the contract starts or after it ends; inactive contract |
| `MILESTONE_AUTHORISATION` | BLOCKER / WARNING | Milestone not reached or not signed off; amount ≠ milestone; unfinished tasks |
| `OVERLAPPING_BILLING_PERIOD` | BLOCKER / WARNING | Period overlapping an approved invoice; a milestone billed twice |
| `UNAPPROVED_WORK_IN_PERIOD` | WARNING / INFO | Timesheets still in the approval queue for this period |

Over-billing blocks; under-billing warns. The asymmetry is deliberate — one is a wrong charge to a client, the other costs the vendor money and is theirs to decide about.

`InvoiceAuditService` injects `List<ReconciliationRule>`, so a new check is a new `@Component` and nothing existing changes. `rules_version` is stored on each run so an old verdict stays interpretable after the rules move on.

---

## Design patterns

### Specification chain — assignment eligibility

```
ActiveStatusSpecification → SkillMatchSpecification → CapacitySpecification → NoCollisionSpecification
```

Each rule is one class answering `isSatisfiedBy(employee, requirement, dateRange)`. The chain is built once and reused by manual assignment, bulk allocation and eligibility preview, so those three can never drift apart — which is what happens when each entry point validates for itself.

### Strategy — billing and allocation

`InvoiceCalculationStrategy` has `HourlyInvoiceStrategy` and `MilestoneInvoiceStrategy`; `BillingStrategyRegistry` resolves by `Contract.billingType`. `InvoiceService` contains no billing-specific branching. A new billing model is a new class.

### AOP audit logging

`@Auditable(action, entityType)` on a service method; `AuditAspect` captures before/after state as JSONB into `audit_logs`. Cross-cutting rather than hand-called, so a newly added method cannot silently skip the audit trail.

### Table-driven RBAC

`roles` → `role_permissions` → `permissions`, with `user_roles` modelled many-to-many. Every check is `@PreAuthorize("hasAuthority('SOME_PERMISSION')")` — a *permission*, never a role name. A new role is seed data.

---

## Concurrency

Two managers can race for the same contractor. `AssignmentService.createAssignment` is the only method anywhere permitted to persist an `Assignment`, and inside one transaction it:

1. Locks the employee row (`SELECT … FOR UPDATE`).
2. Re-runs the **entire** specification chain — not just at UI-preview time, but after the lock, against data that cannot now change.
3. Persists the assignment and updates `fulfilled_count` atomically.
4. Fails with a specific exception if validation fails at write time, so the manager is told the contractor was just taken rather than silently getting someone else.

Bulk allocation is a *caller* of this method, never a second write path.

---

## Data integrity

- **Flyway owns the schema.** Eleven versioned migrations; Hibernate runs at `ddl-auto: validate`, so a mapping that has drifted from a migration fails at startup instead of altering tables under a running system.
- **Server-side computation.** Worklog durations are summed from segments; invoice totals from line items. A client-supplied total is never trusted.
- **Immutable approved records.** An approved worklog cannot be edited; corrections go through rejection.
- **UUID primary keys** throughout, so ids carry no information and are safe to expose.

### Schema map

| Migration | Adds |
|---|---|
| V1 | Core: RBAC, employees, skills, availability, contracts, assignments, worklogs, invoices, audit log |
| V2 | Seeded roles, 22 permissions, demo users |
| V3 | `billing_types` lookup, replacing a CHECK-constrained enum column |
| V4 | Minimum proficiency on requirements |
| V5 | Contract milestones |
| V6 | HR and finance roles; permissions rebalanced away from `MANAGER` |
| V7 | Nested milestone tasks |
| V8 | Token blacklist for logout |
| V9 | `contract_documents`, `contract_extractions` — intake and citations |
| V10 | `invoice_audit_runs`, `invoice_audit_findings`, invoice override columns |
| V11 | `PLATFORM_ADMIN` and `AUDITOR` roles, 9 AI-module permissions |

---

## Security

- JWT with separate access (15 min) and refresh (7 day) lifetimes; each carries its own `jti`, so one can be revoked without the other.
- Logout blacklists the `jti` until natural expiry; a scheduled task clears expired entries.
- BCrypt password hashing; Passay-backed strength rules on any password the system accepts.
- Rate limiting on login (Bucket4j) — 5/min in production, loose in dev so you cannot lock yourself out testing.
- CORS is an explicit origin list; wildcards are never used.
- HSTS, CSP and `frameOptions: deny` set at the filter chain.
- Two enforcement layers: the JWT filter authenticates, `@PreAuthorize` authorises per permission.
- `JwtProperties.validate()` refuses to start with a missing or under-32-character secret, rather than running insecurely.

---

## The AI boundary

`LlmGateway` is the single outbound path to a model, and every method returns `Optional`:

```java
Optional<String> complete(String systemPrompt, String userPrompt);
Optional<String> completeJson(String systemPrompt, String userPrompt);
```

An unavailable, slow, rate-limited or misconfigured model is an ordinary condition, not an exception — callers are *required* to have a deterministic answer ready. Nothing in the platform blocks on a model reply.

`completeJson` strips markdown fences and surrounding prose, tracking string literals so a brace inside a quoted value does not end the object early.

The implementation speaks the OpenAI-compatible chat protocol, which every provider worth using on a free tier supports. Changing provider is two environment variables. When no chat model can be auto-configured at all, `AiConfig` supplies a disabled gateway so the context still starts and every endpoint keeps working.

Temperature is pinned to `0.0`: extraction and explanation are reporting tasks, not creative ones.
