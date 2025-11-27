from datetime import datetime

def event_to_dict(event):
    return {
        "id": event.id,
        "title": event.title,
        "start": event.start.isoformat() if event.start else None,
        "end": event.end.isoformat() if event.end else None,
        "allDay": event.allDay,
        "category": event.category,
        "time": event.time,
        "urgency": event.urgency,
        "remark": event.remark,
        "isRepeat": event.is_repeat,
        "repeatType": event.repeat_type,
        "repeatEndDate": event.repeat_end_date.isoformat() if event.repeat_end_date else None,
        "isCompleted": event.is_completed,
        "efficiency": event.efficiency,
        "customTypeId": event.custom_type_id,
    }

def idea_to_dict(idea):
    return {
        "id": idea.id,
        "text": idea.text,
        "priority": idea.priority if hasattr(idea, 'priority') else 'medium',
        "createdAt": idea.createdAt.isoformat() + "Z" if idea.createdAt else None,
    }

def event_type_to_dict(event_type):
    return {
        "id": event_type.id,
        "name": event_type.name,
        "color": event_type.color,
    }

def daily_score_to_dict(daily_score):
    return {
        "id": daily_score.id,
        "date": daily_score.date.isoformat() if daily_score.date else None,
        "totalScore": daily_score.total_score,
    }
