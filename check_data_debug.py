from backend.src.models.db import SessionLocal
from backend.src.models.user import User
from backend.src.models.event import Event
from backend.src.models.event_type import EventType
from sqlalchemy import text

def check_data():
    session = SessionLocal()
    try:
        print("--- Users ---")
        users = session.query(User).all()
        for u in users:
            print(f"ID: {u.id}, Username: {u.username}, IsAdmin: {u.is_admin}")
            
        print("\n--- Events (First 5) ---")
        events = session.query(Event).limit(5).all()
        for e in events:
            print(f"ID: {e.id}, Title: {e.title}, UserID: {e.user_id}")
            
        print("\n--- Event Types ---")
        types = session.query(EventType).all()
        for t in types:
            print(f"ID: {t.id}, Name: {t.name}, UserID: {t.user_id}")

        print("\n--- Raw Check for NULL user_id ---")
        result = session.execute(text("SELECT count(*) FROM events WHERE user_id IS NULL")).scalar()
        print(f"Events with NULL user_id: {result}")

    finally:
        session.close()

if __name__ == "__main__":
    check_data()
