from backend.src.models.db import SessionLocal
from backend.src.models.event import Event
from datetime import datetime
from sqlalchemy import extract

session = SessionLocal()

year = 2025
month = 12

# 构建查询（与后端 API 相同的逻辑）
event_query = session.query(Event).filter(
    extract('year', Event.start) == year,
    extract('month', Event.start) == month
)

# 计算总时长（排除全天事件）
duration_events = event_query.filter(Event.allDay == False).with_entities(Event.start, Event.end).all()

total_recorded_hours = 0
for event_start, event_end in duration_events:
    if event_start and event_end:
        duration = (event_end - event_start).total_seconds() / 3600
        total_recorded_hours += duration

print(f'12月非全天事件总时长: {total_recorded_hours:.2f}小时')

# 可记录时间
days_in_period = 31
total_available_hours = days_in_period * 17
record_rate = round((total_recorded_hours / total_available_hours * 100), 2) if total_available_hours > 0 else 0

print(f'可记录时间: {total_available_hours}小时')
print(f'记录率: {record_rate}%')

session.close()
