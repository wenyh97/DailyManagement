from sqlalchemy import Column, String, Date, Integer, Index, ForeignKey
from .base import Base

class DailyScore(Base):
    __tablename__ = 'daily_scores'
    id = Column(String(32), primary_key=True)
    date = Column(Date, nullable=False, index=True)  # 日期不再唯一，因为不同用户同一天都有分数
    total_score = Column(Integer, default=0)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True) # 关联用户ID
    
    # 复合索引：用户+日期 应该是唯一的
    __table_args__ = (
        Index('idx_user_date', 'user_id', 'date', unique=True),
    )