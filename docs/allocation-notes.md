# Allocation Strategy Refactoring

## What Changed

Refactored assignment suggestion logic to use Strategy pattern properly. Scoring algorithm moved out of `AssignmentService` into dedicated `ScoringAllocationStrategy`.

## Before

```
AssignmentService.suggestAssignments()
  ├─ Orchestration (loop requirements)
  ├─ Filtering (SpecificationChain inline)
  ├─ Scoring (scoreEmployee() inline)
  └─ Ranking (max score inline)
  
Private method: scoreEmployee(empId, req)
  └─ Encapsulated scoring (60% proficiency + 40% load balance)
```

**Problem:** Scoring logic buried in service. Hard to swap scoring algorithms. AllocationStrategy interface existed but was never used.

## After

```
AllocationStrategy interface (unchanged)
  └─ selectCandidates(requirementId, count, dateRange) → List<UUID>

ScoringAllocationStrategy @Component
  ├─ Owns SpecificationChain filtering (moved in)
  ├─ Owns scoreEmployee() (moved in)
  ├─ Owns ranking/sorting (moved in)
  └─ selectCandidates() does full pipeline

AssignmentService.suggestAssignments()
  ├─ Orchestration only (loop requirements)
  └─ Call allocationStrategy.selectCandidates() for each
```

**Benefit:** Scoring is pluggable. Can now add:
- `LongestIdleFirstStrategy`
- `BalancedSkillStrategy`
- Others

Without touching AssignmentService.

## Files Changed

### New File
- `src/main/java/backend/WF/allocation/strategy/ScoringAllocationStrategy.java`

### Modified Files
- `src/main/java/backend/WF/assignment/AssignmentService.java`
  - Added: `@Qualifier("scoringStrategy") AllocationStrategy allocationStrategy` field
  - Removed: `scoreEmployee()` method (moved to strategy)
  - Removed: unused imports (EmployeeSkill, EmployeeSkillRepository)
  - Refactored: `suggestAssignments()` to delegate to strategy

## Scoring Formula (Unchanged)

```
score = (proficiency / 5.0) * 0.6 + max(0, 1 - activeCount/10) * 0.4

Components:
  - Proficiency (60%): Skill level 1–5 → 0.0–1.0
  - Workload (40%): How loaded (0 active = max score, 10+ = 0 score)
  
Range: 0.0 (worst) to 1.0 (best)
```

## Next Steps

1. **Phase 2:** Build `LongestIdleFirstStrategy`
   - Score by `daysIdleSinceLastAssignment` instead
   - Implement same interface
   - Wire via `@Qualifier` in controller

2. **Optional:** Add strategy selection endpoint
   - `GET /api/contracts/{id}/suggest-assignments?strategy=scoring|idle|...`
   - Controller injects desired strategy

3. **Tests:** Add unit tests for strategy implementations
   - Currently skipped (scope: refactor, not new testing)
   - Each strategy should test its ranking algorithm independently

## Backward Compatibility

✅ Public API unchanged
- `AssignmentService.suggestAssignments(contractId)` signature same
- All existing calls work as before
- Only internal wiring changed

✅ All existing tests pass
- 5/5 AssignmentServiceTest pass
- No breaking changes

## Architecture Decision

**Why move SpecificationChain into strategy?**
- Strategy owns "who is eligible" + "how to rank them"
- Clean separation: filtering (spec chain) → ranking (scoring)
- Future strategies might want different filtering rules

**Why keep default times in suggestAssignments()?**
- Times are UI concern (how to display), not allocation concern (who to pick)
- Validation happens in `createAssignment()`, not suggest
- Keeps strategy focused on selection logic only
