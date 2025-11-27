from sqlalchemy import Column, String, Date, Integer, Index
from .base import Base

class DailyScore(Base):
    __tablename__ = 'daily_scores'
    id = Column(String(32), primary_key=True)
    date = Column(Date, nullable=False, unique=True, index=True)  # 添加索引优化日期范围查询
    total_score = Column(Integer, default=0)
    
    # 索引已通过 unique=True 和 index=True 自动创建