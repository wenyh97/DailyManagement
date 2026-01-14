from sqlalchemy import Column, String, Text, DateTime, Enum, Integer, Index, ForeignKey
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .base import Base


class AnnualPlan(Base):
    __tablename__ = 'annual_plans'

    id = Column(String(32), primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    title = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    score_allocation = Column(TINYINT(unsigned=True), nullable=False, server_default='0')
    plan_year = Column(Integer, nullable=True)
    status = Column(
        Enum('draft', 'active', 'archived', name='annual_plan_status'),
        nullable=False,
        server_default='draft'
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

    goals = relationship(
        'PlanGoal',
        back_populates='plan',
        cascade='all, delete-orphan',
        order_by='PlanGoal.sort_order'
    )

    __table_args__ = (
        Index('idx_annual_plans_user', 'user_id'),
        Index('idx_annual_plans_status', 'status'),
    )

    def __repr__(self) -> str:
        return f"<AnnualPlan id={self.id} title={self.title!r} score={self.score_allocation}>"
