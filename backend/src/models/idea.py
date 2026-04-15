from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Boolean
import datetime
from .base import Base

class Idea(Base):
    __tablename__ = 'ideas'
    id = Column(String(32), primary_key=True)
    text = Column(String(256), nullable=False)
    createdAt = Column(DateTime, default=datetime.datetime.utcnow)
    is_completed = Column(Boolean, default=False, nullable=False, index=True)
    sort_order = Column(Integer, default=0, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True) # 关联用户ID
