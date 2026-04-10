from sqlalchemy import Column, String, DateTime, Integer, Enum, ForeignKey, Index, UniqueConstraint
from sqlalchemy.sql import func

from .base import Base


class GoalTaskStatus(Base):
    __tablename__ = 'goal_task_statuses'

    id = Column(String(32), primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    plan_id = Column(String(32), ForeignKey('annual_plans.id', ondelete='CASCADE', onupdate='CASCADE'), nullable=False, index=True)
    goal_id = Column(String(32), ForeignKey('plan_goals.id', ondelete='CASCADE', onupdate='CASCADE'), nullable=False, index=True)
    task_id = Column(String(64), nullable=False)
    status = Column(
        Enum('backlog', 'todo', 'doing', 'done', name='goal_task_status'),
        nullable=False,
        server_default='backlog'
    )
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint('user_id', 'plan_id', 'goal_id', 'task_id', name='uq_goal_task_status'),
        Index('idx_goal_task_status_user', 'user_id'),
        Index('idx_goal_task_status_status', 'status'),
    )

    def __repr__(self) -> str:
        return f"<GoalTaskStatus id={self.id} user_id={self.user_id} task_id={self.task_id}>"
