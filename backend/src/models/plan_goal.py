from sqlalchemy import Column, String, Text, DateTime, Enum, Index, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.mysql import TINYINT, SMALLINT

from .base import Base


class PlanGoal(Base):
    __tablename__ = 'plan_goals'

    id = Column(String(32), primary_key=True)
    plan_id = Column(String(32), ForeignKey('annual_plans.id', ondelete='CASCADE', onupdate='CASCADE'), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    details = Column(Text, nullable=True)
    expected_timeframe = Column(String(64), nullable=True)
    score_allocation = Column(TINYINT(unsigned=True), nullable=False, server_default='0')
    sort_order = Column(SMALLINT(unsigned=True), nullable=False, server_default='0')
    status = Column(
        Enum('pending', 'executing', 'done', name='plan_goal_status'),
        nullable=False,
        server_default='pending'
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

    plan = relationship('AnnualPlan', back_populates='goals')

    __table_args__ = (
        Index('idx_plan_goals_status', 'status'),
    )

    def __repr__(self) -> str:
        return f"<PlanGoal id={self.id} plan_id={self.plan_id} status={self.status}>"
