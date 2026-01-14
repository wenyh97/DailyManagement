# Data Model – Annual Planning Feature

## Entities

### AnnualPlan (`annual_plans`)
| Field | Type | Notes |
| --- | --- | --- |
| `id` | CHAR(32) | UUID hex generated in service layer |
| `user_id` | INT FK → `users.id` | Ownership + row-level filtering |
| `title` | VARCHAR(120) | "规划"名称 |
| `description` | TEXT | 规划描述，可为空 |
| `score_allocation` | TINYINT UNSIGNED | 0–100; total per user cannot exceed 100 |
| `remaining_score_hint` | VIRTUAL (not stored) | Derived on read: `100 - SUM(score_allocation)` |
| `status` | ENUM("draft","active","archived") | Defaults to `draft` until goals added |
| `created_at` | DATETIME | server default `utcnow()` |
| `updated_at` | DATETIME | auto-updated on change |

**Relationships**: `AnnualPlan.goals = relationship("PlanGoal", back_populates="plan", cascade="all, delete-orphan")`

**Validations**:
- Require `title`.
- Reject insert/update when `(existing sum for user - current plan score + incoming score_allocation) > 100`.
- Auto flip `status` to `active` when at least one goal exists.

### PlanGoal (`plan_goals`)
| Field | Type | Notes |
| --- | --- | --- |
| `id` | CHAR(32) | UUID |
| `plan_id` | CHAR(32) FK → `annual_plans.id` | On delete cascade |
| `name` | VARCHAR(120) | Goal label supplied by user |
| `details` | TEXT | "目标详情" field |
| `expected_timeframe` | VARCHAR(64) | Free-form month/quarter or date range |
| `status` | ENUM("pending","executing","done") | `执行`按钮 flips to `executing` and optionally `done` later |
| `created_at` | DATETIME | server default |
| `updated_at` | DATETIME | auto-updated |

**Relationships**: `PlanGoal.plan = relationship("AnnualPlan", back_populates="goals")`

**Validations**:
- Require `name`.
- `expected_timeframe` optional but limited to 64 chars (UI hint for "预计时间").
- `status` transitions: pending → executing (triggered by "执行"按钮) → done (future automation).

## Derived Views
- **Plan Summary DTO**: `AnnualPlan` with nested goals, plus `remaining_score` (computed per user) to show in modal tip.
- **Goal Execution Feed**: minimal payload (goal id, plan title, description) for the "目标执行" tab, enabling quick start for `EventManager` conversions.

## Migration Notes
1. Create both tables with `utf8mb4` charset and add FK indexes (`idx_plan_user`, `idx_goal_plan`).
2. Backfill existing users with a default plan row? Not required; UI hides list until data exists.
3. Ensure Alembic-style migration or raw SQL script adds new tables before deploying frontend changes.
