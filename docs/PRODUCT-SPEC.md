# Vendor Workforce, Timesheet & Billing Management System

## Project Context

A vendor company ("XYZ") maintains a pool of employees with specific skills and
supplies them as contractors to multiple client companies under contracts.
The system manages the full lifecycle: contract intake → employee assignment
(manual or algorithmic) → time logging → manager approval → invoicing.

This document is the authoritative specification. It is organized into
**phases**. Build Phase 1 completely, correctly, and with the architectural
seams described below _even where only one implementation exists yet_ —
later phases must be additive (new classes/tables), not rewrites.

---

## 1. Non-Negotiable Design Principles

These apply across all phases and should shape every service you write:

1. **The database is the source of truth.** Never trust computed values
   (duration, totals, hours) from the frontend. All derived values are
   calculated server-side, in the service layer, inside a transaction.
2. **One write path per invariant.** There must be exactly one service
   method that creates an `Assignment` row, one that creates a `WorkLog`,
   one that finalizes an `Invoice`. Multiple UI entry points (manual vs.
   algorithmic assignment) call into the _same_ underlying service — they
   differ only in how a candidate is _selected_, never in how the write is
   _validated or persisted_. See §4 (Architecture Patterns) for how this is
   enforced via Strategy + a single Command service.
3. **Validation logic is not duplicated per entry point.** Eligibility rules
   (skill match, availability, no time collision, active status) are
   expressed once as composable Specification objects and reused by every
   caller — manual assignment, auto-allocation, and any future "preview
   eligibility" endpoint.
4. **Everything extensible is an interface today, even with one
   implementation.** Billing calculation, allocation selection, and role
   permissions are all designed as pluggable from Phase 1, because Phase 2
   and 3 add new implementations, not new architecture.
5. **Audit logging is cross-cutting, not manually called.** Use an
   interceptor/aspect (`@Auditable` or equivalent) around service methods
   rather than hand-written `auditRepo.save()` calls scattered through
   business logic — this guarantees new methods don't silently skip
   auditing.
6. **Concurrency correctness is a first-class requirement**, not an
   afterthought bolted on later. Read §6 before implementing assignment
   creation.

---

## 2. Technology Stack

**Backend:**

- Java 21
- Spring Boot 3.x
- Spring Security (JWT-based auth)
- Spring Data JPA
- PostgreSQL
- Flyway (all schema changes via versioned migrations, never
  `ddl-auto=update`)
- Maven
- Lombok
- Bean Validation (jakarta.validation)
- OpenAPI / Swagger

**Frontend:**

- React
- React Router
- Axios
- Responsive dashboard UI (role-aware — Manager and Employee see different
  shells)

**Architecture:** REST APIs, DTOs only at the controller boundary (never
expose JPA entities directly), layered as:

```
controller → service → repository → database
```

Package by feature/module, not by layer:

```
auth
employee
skill
company
contract
allocation
assignment
worklog
extrawork
billing
invoice
audit
availability
common
exception
security
```

---

## 3. Roles & Permissions Model

**Confirmed constraint: an Employee will never also be a Manager.** Roles
are mutually exclusive per user for now, but the schema must not hardcode
this — new roles will be added later without a migration touching business
logic.

**Design:** table-driven RBAC, not an enum on `users`.

- `roles` table: id, name (e.g. `MANAGER`, `EMPLOYEE`), description
- `permissions` table: id, code (e.g. `APPROVE_TIMESHEET`,
  `GENERATE_INVOICE`), description
- `role_permissions` join table: role_id, permission_id
- `user_roles` join table: user_id, role_id — modeled as many-to-many at
  the schema level even though today it will only ever hold one row per
  user, so a future dual-role user does not require a schema change

Phase 1 seeds exactly two roles (`MANAGER`, `EMPLOYEE`) with their
permissions as Flyway seed data, not application code — adding a role later
is a data change.

Authorization checks in services/controllers should check **permissions**,
not role names directly, so new roles automatically work if they're granted
the right permissions.

---

## 4. Architecture & Design Patterns

| Concern                                                               | Pattern                                                                              | Implementation Note                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selecting which employee(s) to assign                                 | **Strategy** — `AllocationStrategy` interface                                        | Phase 1: `ManualSelectionStrategy`. Phase 2 adds `LongestIdleFirstStrategy`. Both implement the same interface and are invoked by the same orchestrating service.                                                                                                                                                      |
| Writing an assignment                                                 | **Single transactional command service** — `AssignmentService.createAssignment(...)` | The _only_ method anywhere in the codebase permitted to `save()` an `Assignment` entity. Called by both manual and algorithmic paths after candidate selection. Performs locking + validation + persistence atomically.                                                                                                |
| Eligibility checks (skill, availability, no collision, active status) | **Specification objects**, composable                                                | `SkillMatchSpecification`, `CapacitySpecification`, `NoCollisionSpecification`, `ActiveStatusSpecification`, each with `isSatisfiedBy(Employee, ContractRequirement, DateRange)`. Chained together and reused by manual assignment, auto-allocation candidate filtering, and (future) an eligibility-preview endpoint. |
| Invoice total calculation                                             | **Strategy** — `InvoiceCalculationStrategy` interface                                | Phase 1: `HourlyInvoiceStrategy`. Phase 3 adds `MilestoneInvoiceStrategy`. `Contract.billingType` determines which strategy is invoked.                                                                                                                                                                                |
| Roles/permissions                                                     | **Table-driven RBAC** (§3)                                                           | Not an enum; new roles are data.                                                                                                                                                                                                                                                                                       |
| Audit logging                                                         | **AOP interceptor / annotation-driven**                                              | `@Auditable(action = "...", entityType = "...")` on service methods; an aspect captures before/after state as JSONB. No manual audit calls inside business logic.                                                                                                                                                      |
| Time-segment overlap detection                                        | **Isolated domain service**, pure logic                                              | `OverlapChecker` — no persistence dependency, heavily unit tested, explicitly handles overnight shifts (e.g. 22:00–02:00 crossing midnight). Used by both assignment-time collision checks and work-log-time collision checks.                                                                                         |

### Why this matters for how Claude Code should build it

- Do not let the auto-allocation algorithm (Phase 2) touch the
  `assignments` table directly. It must produce a ranked list of candidates
  and hand off to `AssignmentService`.
- Do not implement collision/availability checks twice (once for manual,
  once for algorithmic). Build the Specification chain once in Phase 1
  (used initially only by manual assignment) so Phase 2 reuses it verbatim.
- Do not hardcode invoice math as `if (billingType == HOURLY) {...} else
{...}` inside `InvoiceService`. Use the Strategy interface from Phase 1
  even though only `HourlyInvoiceStrategy` exists.

---

## 5. Core Domain Concepts

### 5.1 Employee Availability (two-layer)

- **Weekly pattern (default):** `EmployeeWeeklyAvailability` — employee_id,
  day_of_week (1–7), start_time, end_time, max_hours_per_day. Recurring,
  editable anytime by the employee.
- **Date-specific override:** `EmployeeAvailabilityOverride` — employee_id,
  specific_date, start_time, end_time, OR an `is_unavailable` flag (for
  vacation/sick days). If an override exists for a date, it fully replaces
  the weekly pattern for that date; otherwise the weekly pattern applies.
- **Effective availability resolution** must be a single service method
  (`AvailabilityResolver.getEffectiveAvailability(employeeId, date)`) used
  everywhere availability is checked — never inline the
  override-vs-pattern logic elsewhere.
- **Both constraints must hold simultaneously** when validating an
  assignment or work log: total hours on a day must not exceed
  `max_hours_per_day`, **and** every planned/logged time window must fall
  inside the effective time window for that date. (Confirmed requirement —
  hours cap alone is insufficient.)

### 5.2 Skills

- `skills` table: id, name (unique), description
- `employee_skills` join table: employee_id, skill_id, proficiency_level
  (1–5, CHECK constraint)
- Contract requirements specify a required skill; allocation (manual and
  algorithmic) filters candidates by skill match as the first eligibility
  gate.

### 5.3 Contracts

```
Company (Client)
  └─ Contract (1:N)
       ├─ billing_type: HOURLY | MILESTONE (enum, extensible)
       └─ ContractRequirement (1:N)
             ├─ skill_id
             ├─ required_employee_count
             ├─ hourly_rate
             ├─ expected_hours_per_day
             ├─ start_date / end_date
             ├─ fulfilled_count (denormalized, kept in sync transactionally)
             └─ RequirementSchedule (1:N, optional — shift-level, day-of-week)
```

- `fulfilled_count` on `ContractRequirement` must be updated in the same
  transaction as `Assignment` creation/cancellation, so partial fulfillment
  (manager mixes manual + auto-allocated employees against the same
  requirement) is queryable without recomputing from `assignments` every
  time.
- A single `ContractRequirement` can be fulfilled through **any mix** of
  manual and algorithmic assignment — confirmed requirement. The UI should
  let a manager auto-fill some slots and manually pick others against the
  same requirement.

### 5.4 Assignment

- Links one `employee` to one `ContractRequirement` for a date range.
- **Assignments themselves must never have overlapping planned windows for
  the same employee** — this is enforced at creation time via the
  Specification chain (confirmed requirement — not just checked at
  logging time).
- Both the manual and algorithmic paths produce assignments through
  `AssignmentService.createAssignment()` only (see §4, §6).

### 5.5 Work Logs (time tracking)

- An employee can log **multiple start/end time segments per day**
  (confirmed requirement — not a single start/end per day).
- `WorkLog`: id, assignment_id, employee_id, work_date, status
  (DRAFT/SUBMITTED/APPROVED/REJECTED), submitted_at, approved_at,
  approved_by, rejection_reason
- `WorkLogSegment`: id, work_log_id, start_time, end_time — one or more
  rows per `WorkLog`
- `total_actual_minutes` is **always computed server-side** as the sum of
  segment durations — never accepted from the client.
- Approved work logs are immutable (cannot be edited after approval; must
  be reversed/rejected first if a correction is needed).

### 5.6 Overlap / Collision Detection

Collision must be checked against **both**:

1. The employee's other **planned assignments** (assignment-creation time)
   — assignments never plan overlapping windows (confirmed).
2. The employee's other **logged work segments** on the same date
   (work-log-submission time) — actual logged time across different
   contracts on the same day must not overlap either.

Both checks go through the same `OverlapChecker` domain service (§4),
parameterized by which set of time windows it's comparing against. This
service must correctly handle shifts crossing midnight.

### 5.7 Overtime / Extra Work

- If actual logged time (sum of segments for a work log, or across the
  day) exceeds the assignment's `expected_hours_per_day`, the excess is
  "extra."
- Extra time requires a **mandatory reason** at submission.
- Extra time is **not automatically billable**. It enters a
  `PENDING`/`APPROVED`/`REJECTED` approval workflow (`ExtraWorkRequest`),
  reviewed by a manager (not the employee who logged it).
- **Only approved extra work becomes billable**, as a separate invoice
  line item, charged to the client (confirmed: client is billed for
  approved overtime; this is not an employee payroll feature in this
  system).
- Both capacity constraints coexist (confirmed "likely both" for Gap 6):
  - **Assignment-time**: planned assignments should not schedule an
    employee beyond their availability/capacity in the first place.
  - **Log-time**: actual work can still exceed what was planned (real
    life happens), which is exactly when the extra-work approval flow
    kicks in. Assignment-time capacity checks prevent _planning_
    overallocation; extra-work approval handles _actual_ overallocation
    after the fact.

### 5.8 Invoicing

- `Invoice` aggregates **approved** work log hours (never draft/submitted)
  plus **approved** extra work, over a manager-chosen billing period, for
  one contract.
- Calculation is delegated to `InvoiceCalculationStrategy` per
  `Contract.billingType` (§4). Phase 1 implements `HourlyInvoiceStrategy`
  only; the interface must already support a future
  `MilestoneInvoiceStrategy` without changes to `Invoice`/`InvoiceLineItem`
  schema beyond what's defined below.
- `InvoiceLineItem` breaks the invoice into explainable parts (e.g.
  "Contracted Full Stack Work — 400 hrs @ ₹1000", "Approved Extra Work — 6
  hrs @ ₹1000") — never a single opaque total.
- Invoice totals are **always backend-calculated**; the frontend never
  submits or overrides a total.

---

## 6. Concurrency Strategy

Two managers may attempt to allocate different (or the same) contract
requirements concurrently. The system must guarantee no employee is
double-booked into overlapping assignments, regardless of whether the
assignment came from manual selection or the auto-allocation algorithm.

**Resolved design (single write path):**

`AssignmentService.createAssignment(employeeId, requirementId, dateRange,
timeWindows)` is the only method that persists an `Assignment`. It:

1. Locks the target employee's row (`SELECT ... FOR UPDATE`) within the
   transaction.
2. Re-runs the full Specification chain (skill match, availability,
   capacity, no-collision) **inside the transaction**, after acquiring the
   lock — not just at UI-preview time — so a race between two concurrent
   calls cannot both pass validation against stale data.
3. Persists the `Assignment` and updates `ContractRequirement.fulfilled_
count` atomically.
4. Fails loudly (specific exception, not a silent skip) if validation
   fails at write time — e.g., "Employee was just booked by another
   assignment, please reselect" for the manual path.

**Auto-allocation** (Phase 2) is a _caller_ of this same method:

1. `LongestIdleFirstStrategy` queries eligible candidates using
   `SELECT ... FOR UPDATE SKIP LOCKED` to avoid two concurrent allocation
   batches selecting the same pool of candidates.
2. For each selected candidate, it calls
   `AssignmentService.createAssignment()` — which independently
   re-validates and locks as above.
3. Allocation for a given requirement batch is **all-or-nothing**: if the
   required headcount cannot be fully satisfied within the transaction,
   roll back the entire batch rather than partially assigning. (Manual
   assignment is inherently one-at-a-time and is not subject to this
   all-or-nothing batch rule — each manual pick either succeeds or fails
   independently.)

**Manual assignment** locks only the specific employee being assigned
(not skip-locked — the manager needs an immediate, specific failure if
that employee was just taken, not a silent skip to another candidate).

---

## 7. Audit Logging

`audit_logs` table: id, user_id, action, entity_type, entity_id, old_value
(JSONB), new_value (JSONB), created_at.

Implemented via an AOP aspect around an `@Auditable` annotation — Phase 1
applies it to: assignment creation/cancellation, work log submission/
approval/rejection, invoice generation/approval. Phase 2 extends coverage
to allocation attempts/failures and extra-work decisions. New annotated
methods automatically get audit coverage without additional wiring.

---

## PHASE 1 — Core Loop (MVP)

**Goal:** prove the full pipeline end-to-end — contract → assignment
(manual only) → work log → approval → invoice — with the architectural
seams from §4 already in place, so Phase 2/3 are additive.

### Phase 1 Scope

**Entities / Tables:**

- `users`, `roles`, `permissions`, `role_permissions`, `user_roles`
- `employees`, `skills`, `employee_skills`
- `employee_weekly_availability`
- `client_companies`, `contracts`, `contract_requirements`
- `assignments`
- `work_logs`, `work_log_segments`
- `invoices`, `invoice_line_items`
- `audit_logs`

**Explicitly deferred to later phases:**

- `employee_availability_overrides` (date-specific overrides) — Phase 2
- `LongestIdleFirstStrategy` / auto-allocation — Phase 2
- `extra_work_requests` and overtime billing — Phase 2
- `requirement_schedules` (shift-level day-of-week schedules) — Phase 3
  unless Phase 1/2 usage clearly needs it sooner
- `MilestoneInvoiceStrategy` — Phase 3

**Functional requirements:**

1. **Auth & RBAC:** JWT login; two seeded roles (MANAGER, EMPLOYEE) with
   permission checks on every endpoint (§3).
2. **Employee & skill management:** Manager CRUD for employees; employees
   have skills with proficiency; employee sets their own weekly
   availability pattern (max hours/day + time window per day of week).
3. **Client & contract management:** Manager CRUD for client companies and
   contracts; contracts contain one or more `ContractRequirement`s, each
   with a required skill, headcount, rate, expected hours/day, and date
   range.
4. **Manual assignment:** Manager views skill-eligible, available,
   non-colliding employees for a requirement (via the Specification
   chain) and assigns them one at a time through
   `AssignmentService.createAssignment()`. Partial fulfillment is
   tracked via `fulfilled_count`.
5. **Time tracking:** Employee logs one or more time segments per day
   against an assignment; server computes total duration; submits for
   approval. Collision checked against both other planned assignments and
   other logged segments same day (§5.6), using `OverlapChecker`.
6. **Approval:** Manager reviews submitted work logs, approves or rejects
   with a reason. Approved logs are immutable.
7. **Invoicing:** Manager selects a contract + billing period; system
   aggregates approved work log hours via `HourlyInvoiceStrategy`,
   produces a draft invoice with line items, manager approves it.
8. **Audit logging:** applied to assignment, work log approval, and
   invoice actions via the `@Auditable` aspect.

**Concurrency requirement for Phase 1:** even without the auto-allocator,
`AssignmentService.createAssignment()` must implement the full locking +
in-transaction re-validation described in §6, because manual assignment
alone is already subject to two managers racing for the same employee.

**Testing priorities for Phase 1:**

- Skill mismatch rejected
- Inactive/unavailable employee rejected
- Overlapping assignment rejected (including same-day, different
  contracts)
- Overlapping work log segments rejected (including overnight shifts
  crossing midnight)
- Two concurrent manual assignments cannot double-book the same employee
- Approved work log cannot be edited
- Invoice totals match sum of approved work log hours × rate, and are
  never accepted from the frontend
- Duplicate work log segment submission handled correctly

---

## PHASE 2 — Fairness Algorithm, Availability Overrides, Overtime

**Goal:** add algorithmic allocation alongside manual (mixable per
requirement), date-specific availability, and the full overtime/extra-work
billing loop — all as additive implementations against Phase 1's
interfaces.

### Phase 2 Scope

**New tables:**

- `employee_availability_overrides`
- `extra_work_requests`

**New/changed functionality:**

1. **`LongestIdleFirstStrategy`** implementing `AllocationStrategy`:
   - Eligibility: correct skill → active → available (via
     `AvailabilityResolver`, now including overrides) → no conflicting
     assignment (via `OverlapChecker`) — reusing the exact same
     Specification chain built in Phase 1.
   - Priority order: employees who have **never** had an approved work log
     first, then oldest `last_worked_at` (derived from `MAX(work_date +
end_time)` over **approved** work logs only — never assignment count),
     with `employee_id` as the deterministic tie-breaker.
   - Selection uses `SELECT ... FOR UPDATE SKIP LOCKED` to avoid
     concurrent allocation batches colliding on the same candidate pool.
   - Each selected candidate is handed to
     `AssignmentService.createAssignment()` — the algorithm never writes
     `assignments` directly.
   - Allocation batch is all-or-nothing: if the full requested headcount
     can't be satisfied, roll back the batch.
2. **Manager UI/API supports mixing strategies** per `ContractRequirement`
   — auto-fill N slots, manually pick the rest, in any order, against the
   same requirement's `fulfilled_count`.
3. **Date-specific availability overrides:** employee can mark a specific
   date unavailable or override their hours for that date; overrides take
   precedence over the weekly pattern in `AvailabilityResolver`.
4. **Extra work / overtime:**
   - Work log submission computes actual vs. expected minutes; if actual
     exceeds expected, `reason` becomes mandatory and an
     `ExtraWorkRequest` (status `PENDING`) is created — extra minutes
     computed server-side, never trusted from the client.
   - Manager (not the submitting employee) approves or rejects, with a
     mandatory comment on rejection.
   - Only `APPROVED` extra work feeds into invoicing as a separate line
     item, billed to the client at the contract's rate (confirmed: client
     billed, not employee payroll).
5. **Audit coverage extended** to allocation attempts (including
   failures/rollbacks) and extra-work approval decisions.

**Testing priorities for Phase 2 (in addition to Phase 1 suite):**

- Never-worked employee always outranks any employee with prior approved
  work
- Oldest `last_worked_at` wins among employees who have worked before
- `employee_id` tie-break is deterministic
- Concurrent auto-allocation batches for different requirements never
  select overlapping employee sets when the pool is exactly sufficient
- Mixed manual+auto fulfillment correctly updates `fulfilled_count`
  without double-counting or racing
- Extra work below zero (actual ≤ expected) never creates an
  `ExtraWorkRequest`
- Rejected/pending extra work never appears in invoice totals
- Approved extra work appears as a distinct, correctly-rated line item

---

## PHASE 3 — Milestone Billing & Structural Flexibility

**Goal:** add a second billing model and any remaining structural
flexibility, without touching Phase 1/2 schemas beyond additive changes.

### Phase 3 Scope

1. **`MilestoneInvoiceStrategy`** implementing
   `InvoiceCalculationStrategy`: contract-level milestones with their own
   completion criteria and fixed billing amounts, selectable via
   `Contract.billingType = MILESTONE`. Coexists with hourly requirements
   on the same contract if the business needs that flexibility (confirm
   with product owner before assuming mixed-billing-per-contract is
   in scope — default assumption is one billing type per contract unless
   told otherwise).
2. **`requirement_schedules`** (shift-level, day-of-week schedules) if
   Phase 1/2 real usage shows a need for shift granularity beyond a single
   daily window per requirement.
3. **Role/permission expansion**: new roles (e.g. Admin, Finance) added as
   seed data against the existing `roles`/`permissions` tables — no schema
   change required, per the design in §3.
4. **Reporting/dashboards, notifications** — deferred UX layer.

---

## 8. Explicit Non-Goals (all phases, unless stated otherwise above)

- No employee-side payroll/overtime-pay computation — overtime is billed
  to the client only, per confirmed requirement.
- No client-facing external portal in any phase covered by this document.
- No multi-role users (employee ≠ manager, confirmed) — though the schema
  must not block it structurally.
- Frontend never computes or submits authoritative totals (durations,
  invoice amounts) — always server-side.

---

## 9. How to Use This Document

Build strictly in phase order. Within Phase 1, build the architectural
seams (Strategy interfaces, Specification chain, single
`AssignmentService` write path, AOP audit interceptor, table-driven RBAC)
even though only one implementation of each exists — this is what makes
Phase 2 and 3 additive rather than refactors. Do not defer these patterns
"until Phase 2 needs them" — retrofitting them after Phase 1 code exists
without them is exactly the rework this design is meant to avoid.

For each phase, deliver: ER diagram / Flyway migrations, entities, DTOs,
repositories, services (with the patterns above), controllers, security
config, the relevant test suite from the "Testing priorities" list, and an
updated OpenAPI spec.
