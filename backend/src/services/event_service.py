from datetime import datetime, timedelta, date
from typing import List, Optional
from uuid import uuid4
from ..models.event import Event
from ..models.daily_score import DailyScore

def generate_repeat_events(
    base_event_data: dict,
    repeat_type: str,
    repeat_end_date: Optional[date],
    repeat_group_id: Optional[str] = None
) -> List[Event]:
    """
    根据重复规则生成事件实例
    
    repeat_type 可选值:
    - 'daily': 每天
    - 'workday': 中国大陆法定非节假日
    - 'holiday': 中国大陆法定节假日  
    - 'weekday': 周一至周五
    - 'weekend': 周末
    
    repeat_end_date: None 表示永久重复（默认生成一年）
    repeat_group_id: 重复事件组ID，如果不提供则自动生成
    """
    events = []
    start_date = base_event_data['start'].date()
    
    # 如果没有提供 repeat_group_id，生成一个新的
    if not repeat_group_id:
        repeat_group_id = uuid4().hex
    
    # 永久重复默认生成一年内的事件
    if repeat_end_date is None:
        end_date = start_date + timedelta(days=365)
    else:
        end_date = repeat_end_date
    
    current_date = start_date
    
    while current_date <= end_date:
        should_create = False
        
        if repeat_type == 'daily':
            should_create = True
        elif repeat_type == 'weekday':
            should_create = current_date.weekday() < 5  # 0-4 为周一到周五
        elif repeat_type == 'weekend':
            should_create = current_date.weekday() >= 5  # 5-6 为周六周日
        elif repeat_type == 'workday':
            # 简化实现：周一至周五（实际应对接节假日 API）
            should_create = current_date.weekday() < 5
        elif repeat_type == 'holiday':
            # 简化实现：周末（实际应对接节假日 API）
            should_create = current_date.weekday() >= 5
        
        if should_create:
            # 计算当日事件的开始和结束时间
            time_delta = base_event_data['start'] - datetime.combine(start_date, datetime.min.time())
            event_start = datetime.combine(current_date, datetime.min.time()) + time_delta
            event_duration = base_event_data['end'] - base_event_data['start']
            event_end = event_start + event_duration
            
            event = Event(
                id=uuid4().hex,
                title=base_event_data['title'],
                start=event_start,
                end=event_end,
                allDay=base_event_data.get('allDay', False),
                category=base_event_data.get('category', '默认'),
                time=base_event_data.get('time', ''),
                urgency=base_event_data.get('urgency', '普通'),
                remark=base_event_data.get('remark'),
                is_repeat=True,
                repeat_type=repeat_type,
                repeat_end_date=repeat_end_date,
                repeat_group_id=repeat_group_id,
                custom_type_id=base_event_data.get('custom_type_id')
            )
            events.append(event)
        
        current_date += timedelta(days=1)
    
    return events


def calculate_event_score(event: Event) -> int:
    """
    计算单个事件的积分
    
    规则：
    - 7:00-23:59，每半小时为一个单位时间
    - 高效率：2分/半小时
    - 中效率：1分/半小时
    - 低效率：-1分/半小时
    """
    if not event.is_completed or not event.efficiency:
        return 0
    
    # 计算事件时长（分钟）
    duration_minutes = (event.end - event.start).total_seconds() / 60
    
    # 转换为半小时单位
    half_hour_units = duration_minutes / 30
    
    # 根据效率计算积分
    if event.efficiency == "high":
        return int(half_hour_units * 2)
    elif event.efficiency == "medium":
        return int(half_hour_units * 1)
    elif event.efficiency == "low":
        return int(half_hour_units * -1)
    
    return 0


def recalculate_daily_score_for_date(session, target_date: date, user_id: int) -> DailyScore:
    """重新计算指定日期的积分总和"""
    daily_score = session.query(DailyScore).filter(DailyScore.date == target_date, DailyScore.user_id == user_id).first()
    if not daily_score:
        daily_score = DailyScore(
            id=uuid4().hex,
            date=target_date,
            total_score=0,
            user_id=user_id
        )
        session.add(daily_score)

    from sqlalchemy import and_  # 延迟导入避免循环
    completed_events = session.query(Event).filter(
        and_(
            Event.user_id == user_id,
            Event.is_completed == True,
            Event.start >= datetime.combine(target_date, datetime.min.time()),
            Event.start < datetime.combine(target_date + timedelta(days=1), datetime.min.time())
        )
    ).all()

    total_score = sum(calculate_event_score(e) for e in completed_events)
    daily_score.total_score = total_score
    return daily_score


def calculate_and_update_daily_score(session, event: Event, user_id: int):
    """根据事件日期更新每日积分"""
    if not event or not event.start:
        return None
    return recalculate_daily_score_for_date(session, event.start.date(), user_id)
