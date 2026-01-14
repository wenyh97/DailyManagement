"""Annual planning service scaffolding.

Phase 2 focuses on schema + plumbing so later user stories can call into
well-defined helpers. The actual business logic will arrive in upcoming tasks.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime
from typing import Dict, Generator, List, Optional
from uuid import uuid4

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..models.db import SessionLocal
from ..models.annual_plan import AnnualPlan
from ..models.plan_goal import PlanGoal


class PlanServiceError(Exception):
    """Base exception for plan service failures."""


class ScoreBudgetExceeded(PlanServiceError):
    """Raised when a user attempts to allocate more than the 100-point budget."""

    def __init__(self, remaining_score: int, requested_score: int):
        self.remaining_score = max(0, remaining_score)
        self.requested_score = requested_score
        super().__init__(
            f"当前剩余 {self.remaining_score} 分，无法再分配 {requested_score} 分"
        )


class PlanValidationError(PlanServiceError):
    """Raised when payloads are missing required fields."""


class PlanNotFoundError(PlanServiceError):
    """Raised when an annual plan cannot be found for the requesting user."""


class GoalNotFoundError(PlanServiceError):
    """Raised when a goal cannot be found or does not belong to the user."""


@contextmanager
def plan_session(commit_on_success: bool = False) -> Generator[Session, None, None]:
    """Context manager that yields a SQLAlchemy session scoped to plan workflows."""
    session = SessionLocal()
    try:
        yield session
        if commit_on_success:
            session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _goal_to_dict(goal: PlanGoal) -> Dict[str, object]:
    """Convert a PlanGoal ORM instance into the API contract shape."""
    return {
        "id": goal.id,
        "plan_id": goal.plan_id,
        "name": goal.name,
        "details": goal.details,
        "expected_timeframe": goal.expected_timeframe,
        "score_allocation": goal.score_allocation,
        "status": goal.status,
        "sort_order": goal.sort_order,
        "created_at": goal.created_at.isoformat() if goal.created_at else None,
        "updated_at": goal.updated_at.isoformat() if goal.updated_at else None,
    }


def _plan_to_dict(plan: AnnualPlan) -> Dict[str, object]:
    """Convert an AnnualPlan ORM instance (with eager goals) into a response dict."""
    ordered_goals = _ordered_goals(plan)
    return {
        "id": plan.id,
        "title": plan.title,
        "description": plan.description,
        "year": plan.plan_year,
        "score_allocation": plan.score_allocation,
        "status": plan.status,
        "created_at": plan.created_at.isoformat() if plan.created_at else None,
        "updated_at": plan.updated_at.isoformat() if plan.updated_at else None,
        "goals": [_goal_to_dict(goal) for goal in ordered_goals],
    }


def _build_list_payload(plans: List[AnnualPlan], remaining_score: int) -> Dict[str, object]:
    """Bundle plans plus score metadata for the list endpoint response."""
    return {
        "remaining_score": max(0, remaining_score),
        "plans": [_plan_to_dict(plan) for plan in plans],
    }


def _ordered_goals(plan: AnnualPlan) -> List[PlanGoal]:
    """Return goals ordered by explicit sort index with deterministic fallbacks."""
    raw_goals = getattr(plan, 'goals', []) or []
    return sorted(
        raw_goals,
        key=lambda goal: (
            goal.sort_order if goal.sort_order is not None else 0,
            goal.created_at.timestamp() if goal.created_at else 0.0,
            goal.id,
        ),
    )


def calculate_remaining_score(total_allocated: Optional[int]) -> int:
    """Helper used by both list and create workflows to enforce the 100-point budget."""
    total = total_allocated or 0
    return max(0, 100 - total)


def _normalize_title(value: Optional[str], fallback: Optional[str] = None) -> str:
    source = value if value is not None else fallback
    title = (source or "").strip()
    if not title:
        raise PlanValidationError("请填写规划名称。")
    return title


def _parse_score(
    value: Optional[object], *, default: Optional[int] = None, field_label: str = "分值"
) -> int:
    if value is None:
        if default is None:
            raise PlanValidationError(f"{field_label}不能为空。")
        return default
    try:
        score = int(value)
    except (TypeError, ValueError) as exc:
        raise PlanValidationError(f"{field_label}必须为整数。") from exc
    if score <= 0:
        raise PlanValidationError(f"{field_label}需要大于 0。")
    if score > 100:
        raise PlanValidationError(f"{field_label}不能超过 100。")
    return score


def _parse_plan_year(value: Optional[object]) -> Optional[int]:
    if value in (None, ""):
        return None
    try:
        year = int(value)
    except (TypeError, ValueError) as exc:
        raise PlanValidationError("年份需要为整数。") from exc
    if year < 2000 or year > 2100:
        raise PlanValidationError("年份需在 2000 到 2100 之间。")
    return year


def _resolve_plan_year(raw_value: Optional[object], *, fallback: Optional[int] = None) -> Optional[int]:
    parsed = _parse_plan_year(raw_value)
    if parsed is not None:
        return parsed
    return fallback


def _prepare_goals_payload(raw_goals, *, required: bool = False) -> Optional[List[Dict[str, object]]]:
    if raw_goals is None:
        if required:
            raise PlanValidationError("请至少添加一个目标。")
        return None
    if not isinstance(raw_goals, list):
        raise PlanValidationError("目标列表格式不正确。")

    goals_payload: List[Dict[str, Optional[str]]] = []
    for goal in raw_goals:
        if not isinstance(goal, dict):
            raise PlanValidationError("目标数据格式不正确。")
        name = (goal.get("name") or "").strip()
        if not name:
            raise PlanValidationError("每个目标都需要名称。")
        details = (goal.get("details") or "").strip() or None
        timeframe = (goal.get("expected_timeframe") or "").strip() or None
        goal_score = _parse_score(
            goal.get("score_allocation"),
            field_label="目标分值"
        )
        goal_data = {
            "name": name,
            "details": details,
            "expected_timeframe": timeframe,
            "score_allocation": goal_score,
        }
        
        # 保留id和status字段(如果提供)
        if "id" in goal:
            goal_data["id"] = goal["id"]
        if "status" in goal:
            goal_data["status"] = goal["status"]
        
        goals_payload.append(goal_data)

    if not goals_payload:
        raise PlanValidationError("至少添加一个目标。")
    return goals_payload


def _calculate_goal_total(goals_payload: List[Dict[str, object]]) -> int:
    total = sum(goal.get("score_allocation", 0) or 0 for goal in goals_payload)
    if total <= 0:
        raise PlanValidationError("目标分值总和需要大于 0。")
    return total


def list_plans(user_id: int) -> Dict[str, object]:
    """Return the user's plans once the listing query is implemented (US1)."""
    with plan_session() as session:
        plans = (
            session.query(AnnualPlan)
            .options(joinedload(AnnualPlan.goals))
            .filter(AnnualPlan.user_id == user_id)
            .order_by(AnnualPlan.created_at.desc())
            .all()
        )

        total_allocated = (
            session.query(func.sum(AnnualPlan.score_allocation))
            .filter(AnnualPlan.user_id == user_id)
            .scalar()
        ) or 0

        remaining = calculate_remaining_score(total_allocated)
        return _build_list_payload(plans, remaining)


def create_plan(user_id: int, payload: Dict[str, object]) -> Dict[str, object]:
    """Persist a new plan + goals transactionally (US2)."""
    if not isinstance(payload, dict):
        raise PlanValidationError("请求数据格式不正确。")

    title = _normalize_title(payload.get("title"))
    goals_payload = _prepare_goals_payload(payload.get("goals"), required=True)
    description = (payload.get("description") or "").strip() or None
    plan_year = _resolve_plan_year(payload.get("year"), fallback=datetime.utcnow().year)

    total_goal_score = _calculate_goal_total(goals_payload)

    with plan_session(commit_on_success=True) as session:
        locked_plans = (
            session.query(AnnualPlan)
            .filter(AnnualPlan.user_id == user_id)
            .with_for_update()
            .all()
        )
        current_total = sum(plan.score_allocation or 0 for plan in locked_plans)
        remaining_before = calculate_remaining_score(current_total)
        if total_goal_score > remaining_before:
            raise ScoreBudgetExceeded(remaining_before, total_goal_score)

        plan = AnnualPlan(
            id=uuid4().hex,
            user_id=user_id,
            title=title,
            description=description,
            score_allocation=total_goal_score,
            plan_year=plan_year,
            status='active' if goals_payload else 'draft'
        )
        session.add(plan)

        for sort_index, goal_payload in enumerate(goals_payload):
            plan.goals.append(
                PlanGoal(
                    id=uuid4().hex,
                    plan_id=plan.id,
                    name=goal_payload["name"],
                    details=goal_payload["details"],
                    expected_timeframe=goal_payload["expected_timeframe"],
                    score_allocation=goal_payload["score_allocation"],
                    sort_order=sort_index,
                )
            )

        session.flush()
        plan_dict = _plan_to_dict(plan)
        remaining_after = calculate_remaining_score(current_total + total_goal_score)
        return {
            "plan": plan_dict,
            "remaining_score": remaining_after,
        }


def update_plan(user_id: int, plan_id: str, payload: Dict[str, object]) -> Dict[str, object]:
    if not plan_id:
        raise PlanValidationError("缺少规划 ID。")
    if not isinstance(payload, dict):
        raise PlanValidationError("请求数据格式不正确。")

    with plan_session(commit_on_success=True) as session:
        locked_plans = (
            session.query(AnnualPlan)
            .filter(AnnualPlan.user_id == user_id)
            .options(joinedload(AnnualPlan.goals))
            .with_for_update()
            .all()
        )
        plan = next((candidate for candidate in locked_plans if candidate.id == plan_id), None)
        if not plan:
            raise PlanNotFoundError("年度规划不存在或无权访问。")

        new_title = _normalize_title(payload.get("title"), fallback=plan.title)
        new_description = (payload.get("description") if "description" in payload else plan.description) or None
        new_score = plan.score_allocation or 0
        new_year = plan.plan_year or datetime.utcnow().year

        goals_payload: Optional[List[Dict[str, object]]] = None
        if "goals" in payload:
            goals_payload = _prepare_goals_payload(payload.get("goals"), required=True)
            new_score = _calculate_goal_total(goals_payload)
        else:
            existing_total = sum(goal.score_allocation or 0 for goal in plan.goals)
            if existing_total <= 0:
                raise PlanValidationError("请为规划目标设置分值。")
            new_score = existing_total

        other_total = sum(p.score_allocation or 0 for p in locked_plans if p.id != plan_id)
        allowed_capacity = 100 - other_total
        if new_score > allowed_capacity:
            raise ScoreBudgetExceeded(calculate_remaining_score(other_total), new_score)

        plan.title = new_title
        plan.description = new_description
        plan.score_allocation = new_score
        if "year" in payload:
            new_year = _resolve_plan_year(payload.get("year"), fallback=new_year)
        plan.plan_year = new_year

        if goals_payload is not None:
            # 构建现有目标的映射
            existing_goals = {goal.id: goal for goal in plan.goals}
            
            # 清空关系但保留目标对象以便更新
            plan.goals.clear()
            
            for sort_index, goal_payload in enumerate(goals_payload):
                goal_id = goal_payload.get("id")
                
                # 如果提供了ID且目标存在，则更新它
                if goal_id and goal_id in existing_goals:
                    existing_goal = existing_goals[goal_id]
                    existing_goal.name = goal_payload["name"]
                    existing_goal.details = goal_payload["details"]
                    existing_goal.expected_timeframe = goal_payload["expected_timeframe"]
                    existing_goal.score_allocation = goal_payload["score_allocation"]
                    existing_goal.sort_order = sort_index
                    # 保留状态（如果payload中提供了则使用，否则保持原有）
                    if "status" in goal_payload:
                        existing_goal.status = goal_payload["status"]
                    plan.goals.append(existing_goal)
                else:
                    # 新目标
                    new_goal = PlanGoal(
                        id=goal_id if goal_id else uuid4().hex,
                        plan_id=plan.id,
                        name=goal_payload["name"],
                        details=goal_payload["details"],
                        expected_timeframe=goal_payload["expected_timeframe"],
                        score_allocation=goal_payload["score_allocation"],
                        sort_order=sort_index,
                    )
                    # 如果payload中提供了状态则使用，否则默认为pending
                    if "status" in goal_payload:
                        new_goal.status = goal_payload["status"]
                    plan.goals.append(new_goal)

        if not plan.goals:
            raise PlanValidationError("至少需要一个目标。")

        # 如果payload中提供了规划状态，则使用；否则保持原有状态或设置为active
        if "status" in payload:
            plan.status = payload["status"]
        elif not plan.status:
            plan.status = 'active' if plan.goals else 'draft'
        
        session.flush()

        updated_plan = _plan_to_dict(plan)
        remaining_after = calculate_remaining_score(other_total + new_score)
        return {
            "plan": updated_plan,
            "remaining_score": remaining_after,
        }


def delete_plan(user_id: int, plan_id: str) -> Dict[str, object]:
    if not plan_id:
        raise PlanValidationError("缺少规划 ID。")

    with plan_session(commit_on_success=True) as session:
        plan = (
            session.query(AnnualPlan)
            .filter(AnnualPlan.user_id == user_id, AnnualPlan.id == plan_id)
            .first()
        )
        if not plan:
            raise PlanNotFoundError("年度规划不存在或已删除。")

        session.delete(plan)
        session.flush()

        total_allocated = (
            session.query(func.sum(AnnualPlan.score_allocation))
            .filter(AnnualPlan.user_id == user_id)
            .scalar()
        ) or 0
        return {
            "deleted": True,
            "remaining_score": calculate_remaining_score(total_allocated),
        }


def reorder_plan_goals(user_id: int, plan_id: str, goal_ids: Optional[List[str]]) -> Dict[str, object]:
    if not plan_id:
        raise PlanValidationError("缺少规划 ID。")
    if goal_ids is None:
        raise PlanValidationError("请提供目标顺序。")
    if not isinstance(goal_ids, list) or not goal_ids:
        raise PlanValidationError("目标顺序数据格式不正确。")

    normalized_ids: List[str] = []
    for goal_id in goal_ids:
        if not goal_id:
            raise PlanValidationError("目标 ID 无效。")
        normalized_ids.append(str(goal_id))
    if len(set(normalized_ids)) != len(normalized_ids):
        raise PlanValidationError("目标顺序包含重复条目。")

    with plan_session(commit_on_success=True) as session:
        plan = (
            session.query(AnnualPlan)
            .options(joinedload(AnnualPlan.goals))
            .filter(AnnualPlan.user_id == user_id, AnnualPlan.id == plan_id)
            .with_for_update()
            .first()
        )
        if not plan:
            raise PlanNotFoundError("年度规划不存在或已删除。")
        if not plan.goals:
            raise PlanValidationError("该规划还没有目标，无法调整顺序。")

        existing_ids = [goal.id for goal in plan.goals]
        if len(existing_ids) != len(normalized_ids):
            raise PlanValidationError("提交的目标顺序数量不正确。")
        if sorted(existing_ids) != sorted(normalized_ids):
            raise PlanValidationError("目标顺序与现有目标不匹配。")

        order_map = {goal_id: index for index, goal_id in enumerate(normalized_ids)}
        for goal in plan.goals:
            goal.sort_order = order_map.get(goal.id, goal.sort_order or 0)

        session.flush()
        refreshed_plan = _plan_to_dict(plan)
        return {"plan": refreshed_plan}


def update_goal_status(goal_id: str, status: str, user_id: int) -> Dict[str, object]:
    """Update goal state and emit refreshed aggregates (US3)."""
    raise NotImplementedError("User Story 3 will implement update_goal_status().")
