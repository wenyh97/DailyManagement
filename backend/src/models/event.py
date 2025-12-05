from sqlalchemy import Column, String, DateTime, Boolean, Integer, Date, ForeignKey, Index
import datetime
from .base import Base

class Event(Base):
    __tablename__ = 'events'
    id = Column(String(32), primary_key=True)
    title = Column(String(128), nullable=False)
    start = Column(DateTime, nullable=False, index=True)  # 添加索引优化时间范围查询
    end = Column(DateTime, nullable=False)
    allDay = Column(Boolean, default=False)
    category = Column(String(32), default='默认')
    time = Column(String(32), default='')
    urgency = Column(String(16), default='普通')
    remark = Column(String(512), default=None)
    # 新增字段：重复相关
    is_repeat = Column(Boolean, default=False, index=True)  # 添加索引优化重复事件查询
    repeat_type = Column(String(32), default=None)  # 'daily', 'workday', 'holiday', 'weekday', 'weekend'
    repeat_end_date = Column(Date, default=None)  # None 表示永久重复
    repeat_group_id = Column(String(32), default=None, index=True)  # 添加索引优化分组查询
    # 新增字段：完成状态
    is_completed = Column(Boolean, default=False, index=True)  # 添加索引优化完成状态查询
    efficiency = Column(String(16), default=None, index=True)  # 添加索引优化效率统计
    # 新增字段：自定义类型
    custom_type_id = Column(String(32), ForeignKey('event_types.id'), default=None, index=True)  # 添加索引优化类型统计
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True) # 关联用户ID

    # 复合索引优化常见查询
    __table_args__ = (
        Index('idx_start_completed', 'start', 'is_completed'),  # 优化按时间和完成状态组合查询
        Index('idx_type_completed', 'custom_type_id', 'is_completed'),  # 优化按类型和完成状态组合查询
        Index('idx_user_start', 'user_id', 'start'), # 优化用户时间范围查询
    )

# models/idea.py
from sqlalchemy import Column, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
import datetime

Base = declarative_base()

class Idea(Base):
    __tablename__ = 'ideas'
    id = Column(String(32), primary_key=True)
    text = Column(String(256), nullable=False)
    createdAt = Column(DateTime, default=datetime.datetime.utcnow)
