from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Index, UniqueConstraint
from sqlalchemy.sql import func

from .base import Base


class GoalExecutionQueue(Base):
    __tablename__ = 'goal_execution_queue'

    id = Column(String(32), primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    plan_id = Column(String(32), ForeignKey('annual_plans.id', ondelete='CASCADE', onupdate='CASCADE'), nullable=False, index=True)
    goal_id = Column(String(32), ForeignKey('plan_goals.id', ondelete='CASCADE', onupdate='CASCADE'), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint('user_id', 'plan_id', 'goal_id', name='uq_goal_execution_queue'),
        Index('idx_goal_execution_queue_user', 'user_id'),
    )

    def __repr__(self) -> str:
        return f"<GoalExecutionQueue id={self.id} user_id={self.user_id} goal_id={self.goal_id}>"
