from sqlalchemy import Column, String
from .base import Base

class EventType(Base):
    __tablename__ = 'event_types'
    id = Column(String(32), primary_key=True)
    name = Column(String(64), nullable=False, unique=True)
    color = Column(String(16), nullable=False)  # 颜色代码，如 '#FF0000'