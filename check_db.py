from backend.src.models.db import SessionLocal
from backend.src.models.event import Event
from datetime import datetime

session = SessionLocal()

# 查询12月的所有事件
events = session.query(Event).filter(
    Event.start >= datetime(2025, 12, 1),
    Event.start < datetime(2025, 12, 5)
).all()

print(f'12月1-4日事件数: {len(events)}')
print('=' * 80)

total_hours = 0
for e in events:
    if e.start and e.end:
        duration = (e.end - e.start).total_seconds() / 3600
        total_hours += duration
        print(f'事件: {e.title}')
        print(f'  开始: {e.start}')
        print(f'  结束: {e.end}')
        print(f'  时长: {duration:.2f}小时')
        print(f'  全天事件: {e.allDay}')
        print('-' * 40)

print('=' * 80)
print(f'总时长: {total_hours:.2f}小时')

# 查询所有事件（不限日期）
all_events = session.query(Event).all()
print(f'\n数据库中总事件数: {len(all_events)}')

all_total_hours = 0
for e in all_events:
    if e.start and e.end:
        duration = (e.end - e.start).total_seconds() / 3600
        all_total_hours += duration

print(f'所有事件总时长: {all_total_hours:.2f}小时')

session.close()
