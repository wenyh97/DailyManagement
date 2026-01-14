---
description: "Task list for Annual Planning Tabs & Score Budget feature"
---

# Tasks: Annual Planning Tabs & Score Budget

**Input**: Design artifacts from `/specs/main/` (plan, data-model, contracts, research, quickstart)
**Note**: `specs/main/spec.md` is not present; user stories below derive from the latest user brief plus `plan.md`.

**Tests**: Not explicitly requested; verification relies on independent manual checks defined per story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no direct dependency)
- **[Story]**: US1/US2/US3 labels map tasks to user stories for traceability
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Ensure local environment and seed data are ready for incremental UI work.

- [x] T001 Run backend & frontend per `quickstart.md` to confirm login + existing灵感/日程功能仍工作 (`backend/`, `frontend/`). (2025-12-05: backend `/health` smoke test via app factory OK.)
- [x] T002 [P] Add temporary demo plan/goal seed inside `backend/src/app.py::seed_demo_data` controlled by env flag so UI has data before creation flow exists. (Added `SEED_PLANNING_DEMO` flag and guarded seed inserts.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database + shared modules every story depends on.

- [x] T003 Create migration `backend/migrations/20251205_add_annual_plans.sql` to add `annual_plans` / `plan_goals` tables with FK indexes and defaults from `data-model.md`. (New SQL script adds both tables + indexes + cascading FKs.)
- [x] T004 [P] Implement `backend/src/models/annual_plan.py` (SQLAlchemy model + relationship to PlanGoal, status enum, timestamps). (Model includes TINYINT score budget, status enum, cascaded goals relationship.)
- [x] T005 [P] Implement `backend/src/models/plan_goal.py` (child model, status enum, back_populates definition). (Goal model defines enum + timeframe + back_populates.)
- [x] T006 Update `backend/src/models/__init__.py` and `backend/src/models/db.py` to import new models so `Base.metadata.create_all` and migrations pick them up. (Package now re-exports plan models and db.py registers them for metadata.)
- [x] T007 Create `backend/src/services/plan_service.py` scaffolding with session helpers, DTO mappers, and placeholders for `list_plans`, `create_plan`, `update_goal_status`. (File adds DTO helpers, score calc utility, and stubbed service methods/exceptions.)
- [x] T008 [P] Add `frontend/js/plans-api.js` exporting authenticated wrappers for `GET /api/plans`, `POST /api/plans`, and `PATCH /api/plan-goals/{id}/status` (using existing token utilities). (New frontend helper wraps apiRequest with list/create/updateGoalStatus.)

**Checkpoint**: Database schema + shared service/API helpers ready → user stories can run in parallel.

---

## Phase 3: User Story 1 – Tabbed Planning Workspace (Priority: P1) 🎯 MVP

**Goal**: Users see the new “年度规划 / 目标执行 / 任务管理” subtabs ahead of the inspiration board and can browse existing plans/goals that preload from the API.

**Independent Test**: Launch frontend, click the first top-level nav → verify subtab buttons render; select “年度规划” to see accordion of seeded plans; switching tabs does not break original灵感列表.

### Implementation Tasks

- [x] T009 [US1] Implement `list_plans(user_id)` in `backend/src/services/plan_service.py` to query `AnnualPlan` + eager-loaded `PlanGoal`, compute `remaining_score` (100 - sum), and serialize per contract. (Uses joinedload + SUM to emit DTO payload with remaining score.)
- [x] T010 [US1] Add `GET /api/plans` endpoint in `backend/src/app.py` (JWT-protected) wiring to `plan_service.list_plans` and returning `{remaining_score, plans}`. (New `/api/plans` route wraps service + error handling.)
- [x] T011 [P] [US1] Update `frontend/index.html` to insert the sub-tab markup + accordion container before the legacy 灵感 section, and rename the original tab label to “任务管理”. (Planning sub-tabs + accordion shell inserted; nav label updated; `plans-api.js` loaded.)
- [x] T012 [P] [US1] Extend `frontend/css/style.css` with tab button states, accordion styling, and responsive layout for the new planning block. (Added bespoke styles for tabs, score chip, accordion, goal execution list.)
- [x] T013 [US1] Enhance `frontend/js/main.js` to initialize tab switching, call `plansApi.list()`, render plan/goal accordion in Annual Planning tab, and preserve existing functionality for other tabs. (Main JS now loads plans via `plansApi`, renders accordion/goals, and wires tab switching.)

**Checkpoint**: MVP achieved—new tabs visible and list view shows seeded data without creation flow.

---

## Phase 4: User Story 2 – Create Plans with Score Budget (Priority: P1)

**Goal**: Users can click “添加规划”, enter plan + multiple goals, see remaining score hint (100-total), and create plans without exceeding the cap.

**Independent Test**: Open modal, add plan with ≥1 goal and a score <= remaining; submission closes modal, accordion refreshes, and remaining score label updates. Try exceeding 100 to confirm UI disables button and API returns 409 surfaced as toast.

### Implementation Tasks

- [ ] T014 [US2] Implement transactional validation + insert logic inside `plan_service.create_plan` (lock user rows via `with_for_update`, ensure sum+incoming ≤100, cascade goals, return DTO).
- [ ] T015 [US2] Add `POST /api/plans` handler in `backend/src/app.py` to parse payload (`title`, `description`, `score_allocation`, `goals[]`), call service, and map 409 conflicts to JSON errors with `remaining_score` hint.
- [ ] T016 [P] [US2] Add modal markup (fields for 规划/描述/目标 rows/预计时间/分值) and remaining-score helper text to `frontend/index.html` right inside the Annual Planning tab.
- [ ] T017 [US2] Extend `frontend/js/main.js` to manage modal lifecycle (open/close/add-goal-row), sync score input with server-reported remaining points, call `plansApi.create`, refresh list, and handle 409 responses with inline message.
- [ ] T018 [P] [US2] Add modal + validation styles (goal row grid, disabled submit state, remaining-score badge) to `frontend/css/style.css`.

**Checkpoint**: Users can create plans + goals end-to-end while respecting the 100-point rule.

---

## Phase 5: User Story 3 – Goal Execution Actions (Priority: P2)

**Goal**: Users expand a plan, click “执行” on a goal to mark it executing/done, and view executing goals aggregated inside the Goal Execution tab.

**Independent Test**: From accordion, press “执行” → backend updates goal status, accordion badge changes, and the goal appears in Goal Execution tab list with an action to open EventManager (stub). Refresh page to ensure persistence.

### Implementation Tasks

- [ ] T019 [US3] Implement `plan_service.update_goal_status(goal_id, status, user_id)` to validate ownership + allowed transitions (pending→executing/done, executing→done) and return updated DTOs.
- [ ] T020 [US3] Add `PATCH /api/plan-goals/<goal_id>/status` route in `backend/src/app.py` reading `{status}` payload, calling service, and emitting updated plan + remaining score.
- [ ] T021 [US3] Extend `plan_service.list_plans` (and DTO) to include a derived `executing_goals` collection (goal id, plan title, goal name) for Goal Execution tab rendering.
- [ ] T022 [P] [US3] Update `frontend/index.html` (and minimal CSS) to add Goal Execution panel markup plus “执行” buttons beside each goal row inside the accordion.
- [ ] T023 [US3] Enhance `frontend/js/main.js` to bind goal buttons, call `plansApi.updateGoalStatus`, refresh plan data, and render the Goal Execution tab list with quick links for future Event Manager integration.

**Checkpoint**: Execution workflow operational; Goal Execution tab stays current with backend state.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Wrap-up tasks impacting multiple stories.

- [ ] T024 [P] Document manual QA steps (score overflows, execute flow) in `specs/main/quickstart.md` and update screenshots if needed.
- [ ] T025 Run final regression of 思想/日程/统计 tabs plus new planning flows; capture findings in `README.md` or project wiki before release.

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2**: Setup must finish before schema work starts.
- **Phase 2 → Stories**: All user stories depend on migrations, models, and shared service/API helpers.
- **User Story Order**: US1 (P1, MVP) → US2 (P1, extends creation) → US3 (P2, execution). Later stories rely on earlier endpoints/UI shells but each remains independently testable once prerequisites done.
- **Polish**: Runs after desired stories complete.

### Story Dependency Graph
- US1 unlocks basic listing UI + GET API.
- US2 builds on US1’s listing to create data; depends on US1 for accordion refresh but can be tested independently once list exists.
- US3 consumes plan + goal structures from US1/US2; focuses on status transitions and separate tab.

### Parallel Execution Examples
- **US1**: T011 (HTML structure) and T012 (CSS) can proceed in parallel once API contract settled.
- **US2**: T016 (modal markup) and T018 (modal styles) can run alongside backend work while T017 wires JS when APIs ready.
- **US3**: T022 (markup) can start as soon as status endpoint spec (T019/T020) is defined, enabling frontend to stub data while backend finalizes.

## Implementation Strategy

1. **MVP (US1)**: Deliver tabbed UI + read-only plan list so stakeholders immediately see structural change in the frontend.
2. **Incremental Enhancements**: Layer US2 for creation/score validation, then US3 for execution actions, demoing after each checkpoint.
3. **Parallel Work**: After foundational phase, backend + frontend pairs can split per story (e.g., one dev on US1 backend while another handles HTML/CSS) using [P]-marked tasks to avoid blocking each other.
4. **Validation**: After every story, run the Independent Test steps plus quick regression of legacy tabs to ensure no regressions before proceeding.
