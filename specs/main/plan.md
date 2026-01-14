# Implementation Plan: Annual Planning Tabs & Score Budget

**Branch**: `feature/annual-planning-tabs` | **Date**: 2025-12-05 | **Spec**: `specs/main/spec.md` (living brief captured from latest request)
**Input**: Feature specification from `/specs/main/spec.md`

**Note**: This plan was produced via the `/speckit.plan` workflow. Supporting artifacts live in `specs/main/`.

## Summary

Transform the existing “灵感收集” screen into a three-tab workspace (年度规划 / 目标执行 / 任务管理) that lets users define annual plans, attach multiple goals per plan, and enforce a global 100-point score budget. Backend work adds `annual_plans` and `plan_goals` tables plus REST endpoints (`/api/plans`, `/api/plan-goals/...`) that validate the budget transactionally. Frontend work wires new tabs, a multi-goal modal, accordion display, remaining-score hints, and Goal → 执行 actions that prepare future calendar integrations.

## Technical Context

**Language/Version**: Python 3.10 (backend, per `Dockerfile`) + vanilla HTML/CSS/ES6 modules on the frontend  
**Primary Dependencies**: Flask + Flask-JWT-Extended, SQLAlchemy ORM, MySQL (PyMySQL driver), Choices.js/Flatpickr/FullCalendar on the client  
**Storage**: MySQL database managed via SQLAlchemy `SessionLocal` (per `backend/src/models/db.py`)  
**Testing**: pytest for backend service units + Playwright smoke flows for the new tab UX (to be added with this feature)  
**Target Platform**: Containerized Linux deployment for API (`gunicorn` command) and modern evergreen browsers for the static frontend  
**Project Type**: Web application split into `backend/` (Flask API) and `frontend/` (static assets)  
**Performance Goals**: New plan APIs should respond in <200 ms at p95 for single-user workloads; frontend tab switch should not add >50 ms of main-thread blocking time  
**Constraints**: Hard 100-point score cap per user, preserve current idea + calendar behavior, keep bundle size minimal (no new frameworks)  
**Scale/Scope**: Single-tenant personal productivity app (<1k daily users) with lightweight data volume (<10k plans/goals per year)

## Constitution Check

*Gate verdict*: **PASS (Provisional)** — `.specify/memory/constitution.md` currently contains placeholder text, so no enforceable principles are defined. Logged a follow-up to author real principles; until then we default to repository standards (tests for new logic, accessible UI, transactional DB changes).

## Project Structure

### Documentation (this feature)

```
specs/main/
├── plan.md          # This file
├── research.md      # Phase 0 output
├── data-model.md    # Phase 1 entity definitions
├── quickstart.md    # Dev/QA instructions
└── contracts/
   └── planning-api.yaml
```

### Source Code (repository root)

```
backend/
├── app.py
├── requirements.txt
├── src/
│   ├── app.py
│   ├── models/
│   ├── services/
│   └── api/
├── migrations/
└── tests/

frontend/
├── index.html
├── js/
├── css/
└── libs/
```

**Structure Decision**: Maintain the existing Flask + static-frontend split. All new backend code lives under `backend/src/` (models, services, routes). Frontend updates stay inside `frontend/index.html`, `frontend/js/main.js`, and new modular JS helpers if necessary. Shared docs remain under `specs/main/`.

## Complexity Tracking

Not applicable — no constitution violations introduced.

## Phase 0 – Outline & Research

- Identified unknowns: (a) how to store plans + multi-goal payloads, (b) how to enforce the 100-point aggregate cap, (c) how to extend the existing vanilla JS UI without a framework.  
- Conducted focused research tasks (see `specs/main/research.md`) covering SQLAlchemy parent/child modeling, transactional score validation, and accessible tab patterns.  
- Outcome: All clarifications resolved; decisions documented with rationale and rejected alternatives. Ready to proceed to design.

## Phase 1 – Design & Contracts

### Data & API design
- Authenticated users gain two new tables defined in `specs/main/data-model.md`: `annual_plans` (plan metadata + score allocation) and `plan_goals` (child rows with目标/详情/预计时间/state).  
- `specs/main/contracts/planning-api.yaml` publishes OpenAPI endpoints for CRUD + goal execution transitions (list/create/update plans, append goals, patch goal status).  
- Service layer will wrap inserts/updates in a transaction that locks the user’s plan rows before summing scores to guard the 100-point rule.

### Frontend design
- `frontend/index.html` gains an inline tablist inserted before the current ideas board; corresponding panels mount Annual Planning (accordion + modal), Goal Execution (filtered list of executing goals), and Task Management (existing inspiration UI).  
- `frontend/js/main.js` orchestrates tab switching, renders the plan accordion, and handles modals for creating/editing plans with multiple goals plus remaining-score hints.  
- Goal “执行” buttons send `/api/plan-goals/{goalId}/status` requests and push items into the Goal Execution tab.

### Quickstart & onboarding
- `specs/main/quickstart.md` documents how to boot backend/frontend, create plans, verify API responses, and test the score-cap rejection path.  
- Research + design artifacts combined provide the hand-off package for implementation and review.

### Constitution re-check (post-design)
- Still PASS — plan keeps scope inside existing projects, adds tests for new service logic, and retains lightweight tech choices as required.

## Phase 2 – Implementation Plan (Preview)

1. **Backend**  
  - Add SQLAlchemy models + Alembic/raw migrations for `annual_plans` and `plan_goals`.  
  - Implement plan service helpers (score cap validation, CRUD, DTO assembly).  
  - Expose REST routes in `backend/src/app.py` (or dedicated blueprint) mirroring `planning-api.yaml`.  
  - Write pytest coverage (model factory + route tests verifying 409 behavior and nested serialization).

2. **Frontend**  
  - Update `index.html` layout + CSS for the new tablist and accordion.  
  - Extend `main.js` with state stores for plans/goals, modal UI for plan creation, and fetch helpers hitting the new APIs.  
  - Ensure remaining-score hints update after each mutation and block submissions that exceed server-reported budget.  
  - Wire “执行” buttons to trigger status PATCH and optional future integrations (EventManager bridging stub).

3. **Verification**  
  - Follow `quickstart.md` to run manual smoke tests.  
  - Capture API responses in Postman or `httpie` to confirm schema adherence.  
  - Add Playwright (or equivalent) smoke covering tab toggles + modal validation as part of regression suite.

Artifacts ready for hand-off: `specs/main/research.md`, `specs/main/data-model.md`, `specs/main/contracts/planning-api.yaml`, `specs/main/quickstart.md`.
