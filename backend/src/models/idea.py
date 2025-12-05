from sqlalchemy import Column, String, DateTime, Integer, ForeignKey
import datetime
from .base import Base

class Idea(Base):
    __tablename__ = 'ideas'
    id = Column(String(32), primary_key=True)
    text = Column(String(256), nullable=False)
    priority = Column(String(16), default='medium')  # 优先级: high, medium, low
    createdAt = Column(DateTime, default=datetime.datetime.utcnow)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True) # 关联用户ID
