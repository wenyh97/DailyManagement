from sqlalchemy import Column, String, Integer, ForeignKey, Index
from .base import Base

class EventType(Base):
    __tablename__ = 'event_types'
    id = Column(String(32), primary_key=True)
    name = Column(String(64), nullable=False) # 名称不再全局唯一，而是用户内唯一
    color = Column(String(16), nullable=False)  # 颜色代码，如 '#FF0000'
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True) # 关联用户ID

    __table_args__ = (
        Index('idx_user_type_name', 'user_id', 'name', unique=True),
    )