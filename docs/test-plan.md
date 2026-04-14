# Test Plan — Oro Verde Backend

> Aligned with ISO 29119 (Software Testing Standard)

## 1. Scope

### In scope
- Backend NestJS API (`oroverde-api-standalone`)
- Unit tests: service-level logic with mocked repositories
- Integration tests: controller-level with real NestJS test module (planned C-5)
- E2E tests: Playwright full-flow tests (planned C-6)

### Out of scope
- Frontend Angular components (separate Nx test runner, planned C-7)
- Infrastructure/DevOps (Azure deployment, Redis cluster)
- Manual / exploratory testing

## 2. Strategy

### 2.1 Test Levels

| Level | Tool | Scope | Iteration |
|---|---|---|---|
| Unit | Jest + mocks | Service methods, guards, filters, pipes | C-3 (done), C-5 |
| Integration | Jest + `@nestjs/testing` | Controller → Service → mock DB | C-5 |
| E2E | Playwright | Full HTTP flow with real DB | C-6 |
| Regression | Jest (file content analysis) | Detect dangerous patterns in source | C-2 (done) |

### 2.2 Mocking Strategy

- **Repositories:** `jest.fn()` objects mimicking TypeORM Repository API (findOne, find, save, create, createQueryBuilder)
- **DataSource:** Mock object with `getRepository()`, `createQueryRunner()`, `query()`
- **QueryRunner:** Mock with `connect`, `startTransaction`, `commitTransaction`, `rollbackTransaction`, `release`, `manager.*`
- **External services:** MailerService, NotificationsService — `jest.fn()` mocks
- **bcrypt:** Module-level `jest.mock('bcrypt')` for password operations
- **No DB mocking:** Guards and middleware tested via E2E (C-6)

### 2.3 Test Naming Convention

```
describe('ServiceName', () => {
  describe('methodName', () => {
    it('should [expected behavior] when [condition]', async () => {
      // Arrange → Act → Assert
    });
  });
});
```

## 3. Coverage Targets

### By iteration

| Iteration | Target | Actual |
|---|---|---|
| Pre-C-3 | — | ~15% (112 tests) |
| C-3 | >= 40% | 24% lines / 163 tests |
| C-5 | >= 60% | — |
| C-6 | >= 65% | — |
| C-7 (IOC) | >= 70% | — |

### By module (C-3 achieved)

| Module | Lines | Branches | Functions |
|---|---|---|---|
| auth | ~80% | ~70% | ~85% |
| tenancy | ~89% | ~83% | ~78% |
| products | Partial (service only) | — | — |
| tasks | Partial (service only) | — | — |
| strategy | Partial (service only) | — | — |
| product-members | Partial (service only) | — | — |

### Gap analysis
The overall 24% is below the 40% target because:
1. Controllers (22 files) have 0% coverage — they're thin wrappers but add to the denominator
2. DTOs, entities, and enums inflate the file count without needing tests
3. The 6 services tested are the most critical paths (~80%+ each)

### Plan to reach 40%+
- C-5: 7 additional service spec files (+~77 tests)
- Consider `--collectCoverageFrom` to exclude DTOs/entities from coverage calculation

## 4. Test Inventory

### C-3: Test Foundation (completed)

| Spec File | Service | Tests | Status |
|---|---|---|---|
| `auth.service.spec.ts` | Auth (login, tokens, passwords, sessions) | 32 | ✅ |
| `tenant-connection.service.spec.ts` | Pool, TTL, slug validation, isolation | 13 | ✅ |
| `products.service.spec.ts` | CRUD, matrix, metrics, EAV | 27 | ✅ |
| `tasks.service.spec.ts` | CRUD, status transitions | 17 | ✅ |
| `product-members.service.spec.ts` | Add/remove, roles, notifications | 12 | ✅ |
| `strategy.service.spec.ts` | Outputs, indicators, values, codes | 15 | ✅ |

### Pre-existing (C-2)

| Spec File | Tests | Status |
|---|---|---|
| `countries.service.spec.ts` | ~20 | ✅ |
| `all-exceptions.filter.spec.ts` | ~15 | ✅ |
| `tenant-sync.listener.spec.ts` | ~25 | ✅ |
| `query-safety.spec.ts` | ~4 | ✅ |

### C-5: Extended Tests (planned)

| Spec File | Tests est. |
|---|---|
| `notifications.service.spec.ts` | ~10 |
| `project-checkins.service.spec.ts` | ~12 |
| `catalogs.service.spec.ts` | ~15 |
| `field-definitions.service.spec.ts` | ~10 |
| `workspace-members.service.spec.ts` | ~10 |
| `organizations.service.spec.ts` | ~10 |
| `product-requests.service.spec.ts` | ~10 |

### C-6: E2E Tests (planned)

| Test Suite | Scope |
|---|---|
| Auth flow | Login → hub → tenant selection |
| Product CRUD | Create → add member → create task → verify |
| Tenant isolation | User A cannot see tenant B data |

## 5. Entry / Exit Criteria

### Entry criteria (per test level)
- **Unit:** Service implementation complete; dependencies identified
- **Integration:** Controller + service implemented; DTOs validated
- **E2E:** Feature deployed to test environment; test data seeded

### Exit criteria
- All tests pass (`npm test` exit code 0)
- No regressions in existing tests
- Each spec file has at least 1 happy path + 1 error case per public method
- Coverage meets iteration target

## 6. Risk-Based Priority

| Priority | Module | Reason |
|---|---|---|
| P0 | auth | Security-critical: passwords, sessions, tokens |
| P0 | tenancy | Data isolation: multi-tenant boundary |
| P1 | products | Core domain: most business logic |
| P1 | tasks | Core domain: status transitions |
| P1 | product-members | ACL enforcement: role-based access |
| P2 | strategy | Business domain: indicator calculations |
| P2 | notifications | Cross-cutting but best-effort |
| P3 | catalogs, settings | Configuration: lower risk |

## 7. Commands

```bash
npm test                    # Run all tests
npm run test:cov            # Coverage report
npm run test:watch          # Watch mode
npx jest src/path/file.spec.ts  # Single file
npx jest --verbose          # Detailed output
```
