# Research Log

## Decision 1: Model annual plans with SQLAlchemy parent/child tables
- **Decision**: Introduce `annual_plans` (plan metadata + score allocation) and `plan_goals` (multiple rows per plan) tables using SQLAlchemy relationships with cascade delete and eager loading for nested reads.
- **Rationale**: Separate tables keep plan-level validations (score cap, ownership) isolated from per-goal fields (description, expected_time, status). SQLAlchemy's `relationship(..., cascade="all, delete-orphan")` lets the API create/update plans and nested goals within a single session while ensuring orphan goals cannot survive deleted plans.
- **Alternatives Considered**: (1) JSON column on `annual_plans` to store goals — rejected because MySQL JSON indexing is limited and makes querying/partial updates difficult. (2) Re-using the existing `events` table — rejected since yearly planning has different lifecycle/fields (score budget, textual descriptions) and would overburden the event schema.

## Decision 2: Enforce the 100-point budget inside a DB transaction
- **Decision**: Before inserting/updating a plan, issue `SELECT SUM(score_allocation) ... FOR UPDATE` scoped to the user to lock their plan rows, verify the total + incoming score does not exceed 100, then commit. Raise `409 Conflict` if the cap would be exceeded.
- **Rationale**: The hard 100-point rule must remain consistent even when multiple browser tabs or future mobile clients submit data concurrently. Doing the check under a transaction prevents race conditions without needing complex DB constraints (MySQL has no native aggregate constraint across rows).
- **Alternatives Considered**: (1) Client-only validation — rejected because it cannot prevent concurrent oversubscription. (2) MySQL trigger — rejected due to complexity and lack of portability in migrations; logic belongs in the service layer where it can also return contextual error messages (remaining points).

## Decision 3: Build the new Annual Planning/Goal Execution/Task tabs with progressive-enhancement friendly markup
- **Decision**: Render a semantic `<div role="tablist">` with three buttons and data attributes, reuse the existing `main.js` controller to switch panels, and lazy-load heavy widgets (calendar, plan accordion) only when the tab becomes active.
- **Rationale**: The current frontend is plain HTML/JS, so keeping the toggle logic inside `main.js` minimizes dependencies while still delivering accessible navigation (keyboard focus, ARIA states). Lazy init avoids bloating the initial load for users who only need task management.
- **Alternatives Considered**: (1) Introduce a front-end framework (React/Vue) for tab state — rejected because it would balloon bundle size and conflict with the static-file delivery. (2) Multiple standalone pages — rejected since the spec explicitly wants tabs "before" the original inspiration section to keep workflow contiguous.
