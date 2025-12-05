
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv, find_dotenv

from .base import Base  # 导入共享 Base，以一次性生成全部模型表
from . import event  # noqa: F401, 导入以注册模型到元数据
from . import idea  # noqa: F401, 导入以注册模型到元数据
from . import event_type  # noqa: F401, 导入以注册模型到元数据
from . import daily_score  # noqa: F401, 导入以注册模型到元数据
from . import user  # noqa: F401, 导入以注册模型到元数据

# 自动加载仓库根目录下的 .env 配置
load_dotenv(find_dotenv(filename=".env", raise_error_if_not_found=False))

MYSQL_USER = os.getenv('MYSQL_USER', 'root')
MYSQL_PASSWORD = os.getenv('MYSQL_PASSWORD', 'password')
MYSQL_HOST = os.getenv('MYSQL_HOST', 'localhost')
MYSQL_PORT = os.getenv('MYSQL_PORT', '3306')
MYSQL_DB = os.getenv('MYSQL_DB', 'daily_management')

DATABASE_URL = f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}?charset=utf8mb4"

# 启用 pool_pre_ping 与 pool_recycle 防止 MySQL 空闲连接被服务器断开
engine = create_engine(
    DATABASE_URL,
    echo=True,
    future=True,
    pool_pre_ping=True,  # 每次取用连接前先发送 ping，失效则自动重连
    pool_recycle=1800,   # 定期回收空闲连接（单位秒）避免 MySQL wait_timeout 断开
    connect_args={"connect_timeout": 10}  # 设置连接超时时间，避免长时间阻塞
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """Create tables for all SQLAlchemy models defined in the project."""
    Base.metadata.create_all(bind=engine)
    _ensure_event_table_columns()
    _ensure_user_id_columns()


def _ensure_user_id_columns() -> None:
    """Add user_id column to tables if missing."""
    inspector = inspect(engine)
    tables = ['events', 'ideas', 'daily_scores', 'event_types']
    
    with engine.begin() as connection:
        for table in tables:
            if table not in inspector.get_table_names():
                continue
                
            existing_columns = {column['name'] for column in inspector.get_columns(table)}
            if 'user_id' not in existing_columns:
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN user_id INT NULL"))
                connection.execute(text(f"ALTER TABLE {table} ADD CONSTRAINT fk_{table}_user FOREIGN KEY (user_id) REFERENCES users(id)"))
                # Data migration will be handled in seed_demo_data after admin user is ensured

def _ensure_event_table_columns() -> None:
    """Add newly introduced columns on existing databases without manual migrations."""
    inspector = inspect(engine)
    if 'events' not in inspector.get_table_names():
        return

    existing_columns = {column['name'] for column in inspector.get_columns('events')}
    alter_clauses = []

    if 'is_repeat' not in existing_columns:
        alter_clauses.append('ADD COLUMN is_repeat TINYINT(1) DEFAULT 0')
    if 'repeat_type' not in existing_columns:
        alter_clauses.append("ADD COLUMN repeat_type VARCHAR(32) NULL")
    if 'repeat_end_date' not in existing_columns:
        alter_clauses.append('ADD COLUMN repeat_end_date DATE NULL')
    if 'is_completed' not in existing_columns:
        alter_clauses.append('ADD COLUMN is_completed TINYINT(1) DEFAULT 0')
    if 'efficiency' not in existing_columns:
        alter_clauses.append("ADD COLUMN efficiency VARCHAR(16) NULL")
    if 'remark' not in existing_columns:
        alter_clauses.append('ADD COLUMN remark VARCHAR(512) NULL')
    needs_custom_type = False
    if 'custom_type_id' not in existing_columns:
        alter_clauses.append('ADD COLUMN custom_type_id VARCHAR(32) NULL')
        needs_custom_type = True

    if alter_clauses:
        alter_sql = f"ALTER TABLE events {', '.join(alter_clauses)}"
        with engine.begin() as connection:
            connection.execute(text(alter_sql))

    if needs_custom_type:
        inspector = inspect(engine)
        fk_name = 'fk_events_custom_type'
        existing_fks = {fk['name'] for fk in inspector.get_foreign_keys('events')}
        if fk_name not in existing_fks:
            with engine.begin() as connection:
                connection.execute(text(
                    "ALTER TABLE events "
                    "ADD CONSTRAINT fk_events_custom_type "
                    "FOREIGN KEY (custom_type_id) REFERENCES event_types(id) "
                    "ON DELETE SET NULL ON UPDATE CASCADE"
                ))
