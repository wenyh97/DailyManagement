from datetime import datetime, timedelta  # 引入 datetime 用于生成时间戳
from typing import Dict, List  # 引入类型注解确保数据结构清晰
from uuid import uuid4  # 引入 uuid4 用于生成唯一标识符
import os

from flask import Flask, jsonify, request  # 引入 Flask 核心类以及 JSON 工具

from flask_cors import CORS  # 引入 CORS 以支持跨域请求
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity, get_jwt
from werkzeug.security import generate_password_hash, check_password_hash
import logging
from sqlalchemy import case, func, or_
from sqlalchemy.exc import IntegrityError

from .models.db import init_db, SessionLocal
from .models.event import Event
from .models.idea import Idea
from .models.event_type import EventType
from .models.daily_score import DailyScore
from .models.annual_plan import AnnualPlan
from .models.plan_goal import PlanGoal
from .models.goal_execution_queue import GoalExecutionQueue
from .models.goal_task_status import GoalTaskStatus
from .models.user import User
from .utils import event_to_dict, idea_to_dict, event_type_to_dict, daily_score_to_dict
from .services.event_service import (
    generate_repeat_events,
    calculate_and_update_daily_score,
    recalculate_daily_score_for_date,
    calculate_event_score,
    calculate_event_units
)
from .services import plan_service

# 统计数据缓存
stats_cache = {
    'data': None,
    'timestamp': None,
    'ttl': 60  # 缓存有效期60秒
}

# 全局内存数据存储（后续阶段将替换为 MySQL 持久化）
EVENTS_STORE: List[Dict[str, str]] = []  # 存放日程事件的临时列表
IDEAS_STORE: List[Dict[str, str]] = []  # 存放灵感记录的临时列表

DEFAULT_EVENT_TYPES = [
    {"name": "工作", "color": "#3b82f6"},
    {"name": "学习", "color": "#10b981"},
    {"name": "生活", "color": "#f59e0b"},
    {"name": "娱乐", "color": "#ef4444"},
    {"name": "运动", "color": "#8b5cf6"}
]


def ensure_global_event_types(session) -> bool:
    """仅在系统中没有任何全局事件类型时，注入默认类型。"""
    has_global = session.query(EventType.id).filter(EventType.user_id.is_(None)).first()
    if has_global:
        return False

    for item in DEFAULT_EVENT_TYPES:
        session.add(EventType(
            id=uuid4().hex,
            name=item["name"],
            color=item["color"],
            user_id=None
        ))

    session.flush()
    return True


def create_app() -> Flask:  # 创建并配置 Flask 应用的工厂函数
    app = Flask(__name__)
    from .config import Config
    app.config.from_object(Config)
    # 日志配置：INFO 级别，输出到控制台
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    
    # JWT 配置
    app.config["JWT_SECRET_KEY"] = "your-super-secret-key-change-in-production"
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=24)
    jwt = JWTManager(app)

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        logging.error(f"Invalid Token: {error}")
        return jsonify({"error": "Invalid token", "details": error}), 422

    @jwt.unauthorized_loader
    def missing_token_callback(error):
        logging.error(f"Missing Token: {error}")
        return jsonify({"error": "Request does not contain an access token", "details": error}), 401

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        logging.error(f"Expired Token: {jwt_payload}")
        return jsonify({"error": "Token has expired", "token_expired": True}), 401

    # 配置CORS，支持所有方法包括OPTIONS
    CORS(app, 
         resources={r"/*": {"origins": "*"}},
         methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
         allow_headers=["Content-Type", "Authorization"])
    
    register_routes(app)
    init_db()
    seed_demo_data()

    # 全局错误处理
    @app.errorhandler(Exception)
    def handle_exception(e):
        logging.exception("全局异常捕获：%s", e)
        return jsonify({"error": str(e)}), 500

    @app.errorhandler(404)
    def handle_404(e):
        return jsonify({"error": "未找到资源"}), 404

    @app.errorhandler(400)
    def handle_400(e):
        return jsonify({"error": "请求参数错误"}), 400

    return app


def register_routes(app: Flask) -> None:  # 定义路由注册函数以保持结构清晰
    @app.route("/", methods=["GET"])  # 注册根路由用于快速检查服务可用性
    def index() -> tuple:  # 定义根路由处理函数
        return jsonify({"message": "DailyManagement API is running."}), 200  # 返回成功消息

    @app.route("/favicon.ico", methods=["GET"])  # 处理浏览器自动请求的favicon
    def favicon() -> tuple:  # 返回204无内容状态避免404错误
        return "", 204  # 返回空响应，浏览器不会报错

    @app.route("/health", methods=["GET"])  # 注册健康检查接口
    def health() -> tuple:  # 定义健康检查处理函数
        payload = {  # 构建健康检查返回体
            "status": "ok",  # 标记当前服务状态
            "timestamp": datetime.utcnow().isoformat() + "Z",  # 记录响应生成时间
            "data_sources": {"events": len(EVENTS_STORE), "ideas": len(IDEAS_STORE)}  # 统计内存数据量
        }  # 健康检查数据组装完成
        return jsonify(payload), 200  # 返回健康信息


    # --- Auth Routes ---
    @app.route("/api/auth/register", methods=["POST"])
    def register():
        data = request.get_json()
        username = data.get("username")
        password = data.get("password")
        
        if not username or not password:
            return jsonify({"error": "Username and password are required"}), 400
            
        session = SessionLocal()
        try:
            if session.query(User).filter_by(username=username).first():
                return jsonify({"error": "Username already exists"}), 400
                
            user = User(
                username=username,
                password_hash=generate_password_hash(password),
                is_admin=False # Default to normal user
            )
            session.add(user)
            session.flush() # Get user ID

            ensure_global_event_types(session)

            session.commit()
            return jsonify({"message": "User registered successfully"}), 201
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()

    @app.route("/api/auth/login", methods=["POST"])
    def login():
        data = request.get_json()
        username = data.get("username")
        password = data.get("password")
        
        session = SessionLocal()
        try:
            user = session.query(User).filter_by(username=username).first()
            if not user or not check_password_hash(user.password_hash, password):
                return jsonify({"error": "Invalid username or password"}), 401
                
            access_token = create_access_token(identity=str(user.id), additional_claims={"is_admin": user.is_admin, "username": user.username})
            return jsonify({"access_token": access_token, "user": user.to_dict()}), 200
        finally:
            session.close()

    @app.route("/api/auth/me", methods=["GET"])
    @jwt_required()
    def me():
        current_user_id = get_jwt_identity()
        session = SessionLocal()
        try:
            user = session.query(User).get(int(current_user_id))
            if not user:
                return jsonify({"error": "User not found"}), 404
            return jsonify(user.to_dict()), 200
        finally:
            session.close()

    # --- User Management Routes (Admin only) ---
    @app.route("/api/users", methods=["GET"])
    @jwt_required()
    def list_users():
        claims = get_jwt()
        if not claims.get("is_admin"):
            return jsonify({"error": "Admin access required"}), 403
            
        session = SessionLocal()
        try:
            users = session.query(User).all()
            return jsonify([u.to_dict() for u in users]), 200
        finally:
            session.close()

    @app.route("/api/users", methods=["POST"])
    @jwt_required()
    def create_user():
        claims = get_jwt()
        if not claims.get("is_admin"):
            return jsonify({"error": "Admin access required"}), 403
            
        data = request.get_json()
        username = data.get("username")
        password = data.get("password")
        is_admin = data.get("is_admin", False)
        
        if not username or not password:
            return jsonify({"error": "Username and password are required"}), 400
            
        session = SessionLocal()
        try:
            if session.query(User).filter_by(username=username).first():
                return jsonify({"error": "Username already exists"}), 400
                
            user = User(
                username=username,
                password_hash=generate_password_hash(password),
                is_admin=is_admin
            )
            session.add(user)
            session.commit()
            return jsonify(user.to_dict()), 201
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()

    @app.route("/api/users/<int:user_id>", methods=["PUT"])
    @jwt_required()
    def update_user(user_id):
        claims = get_jwt()
        if not claims.get("is_admin"):
            return jsonify({"error": "Admin access required"}), 403
            
        data = request.get_json()
        session = SessionLocal()
        try:
            user = session.query(User).get(user_id)
            if not user:
                return jsonify({"error": "User not found"}), 404
                
            if "password" in data:
                user.password_hash = generate_password_hash(data["password"])
            if "is_admin" in data:
                user.is_admin = data["is_admin"]
                
            session.commit()
            return jsonify(user.to_dict()), 200
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()

    @app.route("/api/users/<int:user_id>", methods=["DELETE"])
    @jwt_required()
    def delete_user(user_id):
        claims = get_jwt()
        if not claims.get("is_admin"):
            return jsonify({"error": "Admin access required"}), 403
            
        session = SessionLocal()
        try:
            user = session.query(User).get(user_id)
            if not user:
                return jsonify({"error": "User not found"}), 404

            deleted_counts = {
                "goal_task_statuses": session.query(GoalTaskStatus)
                .filter(GoalTaskStatus.user_id == user_id)
                .delete(synchronize_session=False),
                "goal_execution_queue": session.query(GoalExecutionQueue)
                .filter(GoalExecutionQueue.user_id == user_id)
                .delete(synchronize_session=False),
                "events": session.query(Event)
                .filter(Event.user_id == user_id)
                .delete(synchronize_session=False),
                "ideas": session.query(Idea)
                .filter(Idea.user_id == user_id)
                .delete(synchronize_session=False),
                "daily_scores": session.query(DailyScore)
                .filter(DailyScore.user_id == user_id)
                .delete(synchronize_session=False),
                "annual_plans": session.query(AnnualPlan)
                .filter(AnnualPlan.user_id == user_id)
                .delete(synchronize_session=False),
                "event_types": session.query(EventType)
                .filter(EventType.user_id == user_id)
                .delete(synchronize_session=False),
            }
                
            session.delete(user)
            session.commit()
            clear_stats_cache()
            return jsonify({"message": "User deleted", "deleted_counts": deleted_counts}), 200
        except IntegrityError as exc:
            session.rollback()
            logging.exception("Delete user failed because of integrity constraint: %s", exc)
            return jsonify({"error": "该用户仍被其他数据引用，无法删除"}), 409
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()


    @app.route("/events", methods=["GET"])
    @jwt_required()
    def list_events():
        current_user_id = int(get_jwt_identity())
        session = SessionLocal()
        try:
            events = session.query(Event).filter_by(user_id=current_user_id).all()
            return jsonify([event_to_dict(e) for e in events]), 200
        finally:
            session.close()

    @app.route("/events", methods=["POST"])
    @jwt_required()
    def create_event():
        current_user_id = int(get_jwt_identity())
        payload = request.get_json(force=True)
        session = SessionLocal()
        try:
            remark_value = payload.get("remark")
            if isinstance(remark_value, str):
                remark_value = remark_value.strip()
                if not remark_value:
                    remark_value = None
            # 检查是否为重复事件
            is_repeat = payload.get("isRepeat", False)
            logging.info(f"[创建事件] isRepeat={is_repeat}, repeatType={payload.get('repeatType')}, repeatEndDate={payload.get('repeatEndDate')}")
            
            if is_repeat:
                # 构建基础事件数据
                base_event_data = {
                    "title": payload.get("title", "未命名事件"),
                    "start": datetime.fromisoformat(payload.get("start")) if payload.get("start") else datetime.utcnow(),
                    "end": datetime.fromisoformat(payload.get("end")) if payload.get("end") else datetime.utcnow(),
                    "allDay": payload.get("allDay", False),
                    "category": payload.get("category", "默认"),
                    "time": payload.get("time", ""),
                    "urgency": payload.get("urgency", "普通"),
                    "remark": remark_value,
                    "custom_type_id": payload.get("customTypeId"),
                    "plan_id": payload.get("planId"),
                    "goal_id": payload.get("goalId"),
                    "task_id": payload.get("taskId")
                }
                
                repeat_type = payload.get("repeatType") or "daily"
                allowed_repeat_types = {"daily", "weekday", "weekend", "workday", "holiday"}
                if repeat_type not in allowed_repeat_types:
                    return jsonify({"error": "重复类型无效"}), 400
                repeat_end_date = None
                if payload.get("repeatEndDate"):
                    repeat_end_date = datetime.fromisoformat(payload.get("repeatEndDate")).date()
                
                # 生成重复事件
                events = generate_repeat_events(base_event_data, repeat_type, repeat_end_date)
                logging.info(f"[生成重复事件] 生成了 {len(events)} 个事件")
                for event in events:
                    event.user_id = current_user_id
                    session.add(event)
                session.commit()
                clear_stats_cache()  # 清除统计缓存
                
                return jsonify({
                    "message": f"成功创建 {len(events)} 个重复事件",
                    "count": len(events),
                    "events": [event_to_dict(e) for e in events[:10]]  # 只返回前10个
                }), 201
            else:
                # 创建单个事件
                event = Event(
                    id=uuid4().hex,
                    title=payload.get("title", "未命名事件"),
                    start=datetime.fromisoformat(payload.get("start")) if payload.get("start") else datetime.utcnow(),
                    end=datetime.fromisoformat(payload.get("end")) if payload.get("end") else datetime.utcnow(),
                    allDay=payload.get("allDay", False),
                    category=payload.get("category", "默认"),
                    time=payload.get("time", ""),
                    urgency=payload.get("urgency", "普通"),
                    remark=remark_value,
                    custom_type_id=payload.get("customTypeId"),
                    plan_id=payload.get("planId"),
                    goal_id=payload.get("goalId"),
                    task_id=payload.get("taskId"),
                    user_id=current_user_id
                )
                session.add(event)
                session.commit()
                clear_stats_cache()  # 清除统计缓存
                return jsonify(event_to_dict(event)), 201
        finally:
            session.close()

    @app.route("/events/<event_id>", methods=["PUT"])
    @jwt_required()
    def update_event(event_id: str):
        current_user_id = int(get_jwt_identity())
        payload = request.get_json(force=True)
        session = SessionLocal()
        try:
            event = session.query(Event).filter(Event.id == event_id, Event.user_id == current_user_id).first()
            if not event:
                return jsonify({"error": "事件不存在"}), 404

            allowed_repeat_types = {"daily", "weekday", "weekend", "workday", "holiday"}

            def normalize_remark(value):
                if isinstance(value, str):
                    trimmed = value.strip()
                    return trimmed or None
                return value

            def parse_datetime(value, fallback):
                if value in (None, ""):
                    return fallback
                return datetime.fromisoformat(value)

            def parse_repeat_end(value):
                if value in (None, ""):
                    return None
                return datetime.fromisoformat(value).date()

            updated_title = payload.get("title", event.title)
            updated_start = parse_datetime(payload.get("start"), event.start)
            updated_end = parse_datetime(payload.get("end"), event.end)
            updated_all_day = payload.get("allDay", event.allDay)
            updated_category = payload.get("category", event.category)
            updated_time = payload.get("time", event.time or "")
            updated_urgency = payload.get("urgency", event.urgency)
            remark_supplied = "remark" in payload
            updated_remark = normalize_remark(payload.get("remark")) if remark_supplied else event.remark
            updated_custom_type_id = payload.get("customTypeId", event.custom_type_id)
            updated_plan_id = payload.get("planId", event.plan_id)
            updated_goal_id = payload.get("goalId", event.goal_id)
            updated_task_id = payload.get("taskId", event.task_id)
            completion_supplied = "isCompleted" in payload
            efficiency_supplied = "efficiency" in payload

            has_repeat_flag = "isRepeat" in payload
            requested_repeat_flag = bool(payload["isRepeat"]) if has_repeat_flag else event.is_repeat
            repeat_type_raw = payload.get("repeatType")
            requested_repeat_type = (repeat_type_raw or event.repeat_type or "daily")
            if requested_repeat_flag and requested_repeat_type not in allowed_repeat_types:
                return jsonify({"error": "重复类型无效"}), 400
            repeat_end_supplied = "repeatEndDate" in payload
            requested_repeat_end = parse_repeat_end(payload.get("repeatEndDate")) if repeat_end_supplied else event.repeat_end_date

            if requested_repeat_flag and not event.is_repeat:
                base_event_data = {
                    "title": updated_title,
                    "start": updated_start,
                    "end": updated_end,
                    "allDay": updated_all_day,
                    "category": updated_category,
                    "time": '' if updated_all_day else (updated_time or ''),
                    "urgency": updated_urgency,
                    "remark": updated_remark,
                    "custom_type_id": updated_custom_type_id,
                    "plan_id": updated_plan_id,
                    "goal_id": updated_goal_id,
                    "task_id": updated_task_id
                }
                repeat_group_id = uuid4().hex
                events = generate_repeat_events(
                    base_event_data,
                    requested_repeat_type,
                    requested_repeat_end,
                    repeat_group_id=repeat_group_id
                )
                session.delete(event)
                session.flush()
                for generated in events:
                    generated.user_id = current_user_id
                    session.add(generated)
                session.commit()
                clear_stats_cache()
                return jsonify({
                    "message": f"成功转换为重复事件，共 {len(events)} 次",
                    "count": len(events),
                    "events": [event_to_dict(e) for e in events[:10]],
                    "repeatGroupId": repeat_group_id
                }), 200

            original_date = event.start.date() if event.start else None

            event.title = updated_title
            event.start = updated_start
            event.end = updated_end
            event.allDay = updated_all_day
            event.category = updated_category
            event.time = None if updated_all_day else (updated_time or '')
            event.urgency = updated_urgency
            if remark_supplied:
                event.remark = updated_remark
            event.custom_type_id = updated_custom_type_id
            event.plan_id = updated_plan_id
            event.goal_id = updated_goal_id
            event.task_id = updated_task_id
            if completion_supplied:
                event.is_completed = payload["isCompleted"]
            if efficiency_supplied:
                event.efficiency = payload["efficiency"]

            if has_repeat_flag:
                if payload["isRepeat"]:
                    event.is_repeat = True
                    event.repeat_type = requested_repeat_type
                    if repeat_end_supplied:
                        event.repeat_end_date = requested_repeat_end
                    if not event.repeat_group_id:
                        event.repeat_group_id = uuid4().hex
                else:
                    if event.is_repeat and event.repeat_group_id:
                        session.query(Event).filter(
                            Event.repeat_group_id == event.repeat_group_id,
                            Event.user_id == current_user_id,
                            Event.id != event.id
                        ).delete(synchronize_session=False)
                    event.is_repeat = False
                    event.repeat_type = None
                    event.repeat_end_date = None
                    event.repeat_group_id = None
            else:
                if event.is_repeat:
                    event.repeat_type = requested_repeat_type
                    if repeat_end_supplied:
                        event.repeat_end_date = requested_repeat_end

            if event.start and original_date and event.start.date() != original_date:
                calculate_and_update_daily_score(session, event, current_user_id)
                recalculate_daily_score_for_date(session, original_date, current_user_id)
            else:
                calculate_and_update_daily_score(session, event, current_user_id)

            session.commit()
            clear_stats_cache()
            return jsonify(event_to_dict(event)), 200
        finally:
            session.close()

    @app.route("/events/<event_id>", methods=["DELETE"])
    @jwt_required()
    def delete_event(event_id: str):
        current_user_id = int(get_jwt_identity())
        delete_all = request.args.get('deleteAll', 'false').lower() == 'true'
        session = SessionLocal()
        try:
            event = session.query(Event).filter(Event.id == event_id, Event.user_id == current_user_id).first()
            if not event:
                return jsonify({"error": "事件不存在"}), 404

            affected_dates = set()
            
            if delete_all and event.is_repeat and event.repeat_group_id:
                # 删除所有重复事件
                repeat_events = session.query(Event).filter(
                    Event.repeat_group_id == event.repeat_group_id,
                    Event.user_id == current_user_id
                ).all()
                
                for repeat_event in repeat_events:
                    if repeat_event.is_completed and repeat_event.start:
                        affected_dates.add(repeat_event.start.date())
                    session.delete(repeat_event)
            else:
                # 只删除当前事件
                if event.is_completed and event.start:
                    affected_dates.add(event.start.date())
                session.delete(event)
            
            session.flush()
            # 重新计算受影响日期的积分
            for date in affected_dates:
                recalculate_daily_score_for_date(session, date, current_user_id)
            session.commit()
            clear_stats_cache()  # 清除统计缓存
            return jsonify({"status": "deleted"}), 200
        finally:
            session.close()

    @app.route("/events/<event_id>/complete", methods=["POST"])
    @jwt_required()
    def complete_event(event_id: str):
        current_user_id = int(get_jwt_identity())
        payload = request.get_json(force=True)
        session = SessionLocal()
        try:
            event = session.query(Event).filter(Event.id == event_id, Event.user_id == current_user_id).first()
            if not event:
                return jsonify({"error": "事件不存在"}), 404
            
            efficiency = payload.get("efficiency")
            if efficiency not in ["high", "medium", "low"]:
                return jsonify({"error": "效率评分必须为 high/medium/low"}), 400
            
            event.is_completed = True
            event.efficiency = efficiency
            session.flush()
            calculate_and_update_daily_score(session, event, current_user_id)
            session.commit()
            clear_stats_cache()  # 清除统计缓存
            return jsonify(event_to_dict(event)), 200
        finally:
            session.close()

    @app.route("/events/<event_id>/complete", methods=["DELETE"])
    @jwt_required()
    def undo_complete_event(event_id: str):
        current_user_id = int(get_jwt_identity())
        session = SessionLocal()
        try:
            event = session.query(Event).filter(Event.id == event_id, Event.user_id == current_user_id).first()
            if not event:
                return jsonify({"error": "事件不存在"}), 404

            if not event.is_completed:
                return jsonify(event_to_dict(event)), 200

            event.is_completed = False
            event.efficiency = None
            session.flush()
            calculate_and_update_daily_score(session, event, current_user_id)
            session.commit()
            clear_stats_cache()  # 清除统计缓存
            return jsonify(event_to_dict(event)), 200
        finally:
            session.close()

    @app.route("/api/plans", methods=["GET", "OPTIONS"])
    def list_plans_api():
        if request.method == "OPTIONS":
            return "", 204
        # JWT验证只对非OPTIONS请求生效
        from flask_jwt_extended import verify_jwt_in_request
        verify_jwt_in_request()
        current_user_id = int(get_jwt_identity())
        try:
            payload = plan_service.list_plans(current_user_id)
            return jsonify(payload), 200
        except plan_service.PlanServiceError as exc:
            logging.error("List plans failed: %s", exc)
            return jsonify({"error": str(exc)}), 400

    @app.route("/api/plans", methods=["POST", "OPTIONS"])
    def create_plan_api():
        if request.method == "OPTIONS":
            return "", 204
        # JWT验证只对非OPTIONS请求生效
        from flask_jwt_extended import verify_jwt_in_request
        verify_jwt_in_request()
        current_user_id = int(get_jwt_identity())
        data = request.get_json(force=True) or {}
        try:
            payload = plan_service.create_plan(current_user_id, data)
            return jsonify(payload), 201
        except plan_service.ScoreBudgetExceeded as exc:
            return jsonify({"error": str(exc), "remaining_score": exc.remaining_score}), 409
        except plan_service.PlanValidationError as exc:
            return jsonify({"error": str(exc)}), 400
        except plan_service.PlanServiceError as exc:
            logging.error("Create plan failed: %s", exc)
            return jsonify({"error": str(exc)}), 400

    @app.route("/api/plans/<plan_id>", methods=["PUT", "OPTIONS"])
    def update_plan_api(plan_id: str):
        if request.method == "OPTIONS":
            return "", 204
        # JWT验证只对非OPTIONS请求生效
        from flask_jwt_extended import verify_jwt_in_request
        verify_jwt_in_request()
        current_user_id = int(get_jwt_identity())
        data = request.get_json(force=True) or {}
        try:
            logging.info(f"Update plan {plan_id} - payload: {data}")
            payload = plan_service.update_plan(current_user_id, plan_id, data)
            return jsonify(payload), 200
        except plan_service.ScoreBudgetExceeded as exc:
            logging.error(f"Update plan {plan_id} - ScoreBudgetExceeded: {exc}")
            return jsonify({"error": str(exc), "remaining_score": exc.remaining_score}), 409
        except plan_service.PlanNotFoundError as exc:
            logging.error(f"Update plan {plan_id} - PlanNotFoundError: {exc}")
            return jsonify({"error": str(exc)}), 404
        except plan_service.PlanValidationError as exc:
            logging.error(f"Update plan {plan_id} - PlanValidationError: {exc}")
            return jsonify({"error": str(exc)}), 400
        except plan_service.PlanServiceError as exc:
            logging.error(f"Update plan {plan_id} - PlanServiceError: {exc}")
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            logging.exception(f"Update plan {plan_id} - Unexpected error: {exc}")
            return jsonify({"error": "服务器内部错误"}), 500

    @app.route("/api/plans/<plan_id>/goal-order", methods=["PATCH", "OPTIONS"])
    def reorder_plan_goals_api(plan_id: str):
        if request.method == "OPTIONS":
            return "", 204
        # JWT验证只对非OPTIONS请求生效
        from flask_jwt_extended import verify_jwt_in_request
        verify_jwt_in_request()
        current_user_id = int(get_jwt_identity())
        data = request.get_json(force=True) or {}
        try:
            payload = plan_service.reorder_plan_goals(current_user_id, plan_id, data.get("goal_ids"))
            return jsonify(payload), 200
        except plan_service.PlanNotFoundError as exc:
            return jsonify({"error": str(exc)}), 404
        except plan_service.PlanValidationError as exc:
            return jsonify({"error": str(exc)}), 400
        except plan_service.PlanServiceError as exc:
            logging.error("Reorder plan goals failed: %s", exc)
            return jsonify({"error": str(exc)}), 400

    @app.route("/api/plans/<plan_id>", methods=["DELETE", "OPTIONS"])
    def delete_plan_api(plan_id: str):
        if request.method == "OPTIONS":
            return "", 204
        # JWT验证只对非OPTIONS请求生效
        from flask_jwt_extended import verify_jwt_in_request
        verify_jwt_in_request()
        current_user_id = int(get_jwt_identity())
        try:
            payload = plan_service.delete_plan(current_user_id, plan_id)
            return jsonify(payload), 200
        except plan_service.PlanNotFoundError as exc:
            return jsonify({"error": str(exc)}), 404
        except plan_service.PlanServiceError as exc:
            logging.error("Delete plan failed: %s", exc)
            return jsonify({"error": str(exc)}), 400

    def _load_user_goal_pairs(session, user_id: int) -> set:
        rows = (
            session.query(PlanGoal.id, PlanGoal.plan_id)
            .join(AnnualPlan, PlanGoal.plan_id == AnnualPlan.id)
            .filter(AnnualPlan.user_id == user_id)
            .all()
        )
        return {(row.plan_id, row.id) for row in rows}

    @app.route("/api/goal-execution-queue", methods=["GET", "PUT", "OPTIONS"])
    def goal_execution_queue_api():
        if request.method == "OPTIONS":
            return "", 204
        from flask_jwt_extended import verify_jwt_in_request
        verify_jwt_in_request()
        current_user_id = int(get_jwt_identity())
        session = SessionLocal()
        try:
            if request.method == "GET":
                items = (
                    session.query(GoalExecutionQueue)
                    .filter(GoalExecutionQueue.user_id == current_user_id)
                    .order_by(GoalExecutionQueue.created_at.asc())
                    .all()
                )
                return jsonify({
                    "items": [
                        {"plan_id": item.plan_id, "goal_id": item.goal_id}
                        for item in items
                    ]
                }), 200

            payload = request.get_json(force=True) or {}
            raw_items = payload.get("items", [])
            if not isinstance(raw_items, list):
                return jsonify({"error": "队列数据格式不正确"}), 400

            valid_pairs = _load_user_goal_pairs(session, current_user_id)
            normalized = []
            seen = set()
            for item in raw_items:
                if not isinstance(item, dict):
                    continue
                plan_id = str(item.get("plan_id") or "").strip()
                goal_id = str(item.get("goal_id") or "").strip()
                if not plan_id or not goal_id:
                    continue
                key = (plan_id, goal_id)
                if key not in valid_pairs or key in seen:
                    continue
                seen.add(key)
                normalized.append({"plan_id": plan_id, "goal_id": goal_id})

            session.query(GoalExecutionQueue).filter(
                GoalExecutionQueue.user_id == current_user_id
            ).delete(synchronize_session=False)

            for entry in normalized:
                session.add(GoalExecutionQueue(
                    id=uuid4().hex,
                    user_id=current_user_id,
                    plan_id=entry["plan_id"],
                    goal_id=entry["goal_id"]
                ))

            session.commit()
            return jsonify({"items": normalized}), 200
        finally:
            session.close()

    @app.route("/api/goal-task-statuses", methods=["GET", "PATCH", "OPTIONS"])
    def goal_task_statuses_api():
        if request.method == "OPTIONS":
            return "", 204
        from flask_jwt_extended import verify_jwt_in_request
        verify_jwt_in_request()
        current_user_id = int(get_jwt_identity())
        session = SessionLocal()
        try:
            if request.method == "GET":
                items = (
                    session.query(GoalTaskStatus)
                    .filter(GoalTaskStatus.user_id == current_user_id)
                    .all()
                )
                return jsonify({
                    "items": [
                        {
                            "plan_id": item.plan_id,
                            "goal_id": item.goal_id,
                            "task_id": item.task_id,
                            "status": item.status
                        }
                        for item in items
                    ]
                }), 200

            payload = request.get_json(force=True) or {}
            plan_id = str(payload.get("plan_id") or "").strip()
            goal_id = str(payload.get("goal_id") or "").strip()
            task_id = str(payload.get("task_id") or "").strip()
            status = str(payload.get("status") or "").strip()
            allowed_status = {"backlog", "todo", "doing", "done"}

            if not plan_id or not goal_id or not task_id:
                return jsonify({"error": "缺少任务标识"}), 400
            if status not in allowed_status:
                return jsonify({"error": "任务状态不合法"}), 400

            valid_pairs = _load_user_goal_pairs(session, current_user_id)
            if (plan_id, goal_id) not in valid_pairs:
                return jsonify({"error": "目标不存在或无权访问"}), 404

            existing = (
                session.query(GoalTaskStatus)
                .filter(
                    GoalTaskStatus.user_id == current_user_id,
                    GoalTaskStatus.plan_id == plan_id,
                    GoalTaskStatus.goal_id == goal_id,
                    GoalTaskStatus.task_id == task_id
                )
                .first()
            )
            if existing:
                existing.status = status
            else:
                session.add(GoalTaskStatus(
                    id=uuid4().hex,
                    user_id=current_user_id,
                    plan_id=plan_id,
                    goal_id=goal_id,
                    task_id=task_id,
                    status=status
                ))

            session.commit()
            return jsonify({
                "plan_id": plan_id,
                "goal_id": goal_id,
                "task_id": task_id,
                "status": status
            }), 200
        finally:
            session.close()

    @app.route("/api/task-progress", methods=["GET", "OPTIONS"])
    def task_progress_api():
        if request.method == "OPTIONS":
            return "", 204
        from flask_jwt_extended import verify_jwt_in_request
        verify_jwt_in_request()
        current_user_id = int(get_jwt_identity())
        session = SessionLocal()
        try:
            rows = (
                session.query(
                    Event.plan_id,
                    Event.goal_id,
                    Event.task_id,
                    func.count(Event.id).label("total"),
                    func.sum(case((Event.is_completed == True, 1), else_=0)).label("completed")
                )
                .filter(
                    Event.user_id == current_user_id,
                    Event.task_id.isnot(None)
                )
                .group_by(Event.plan_id, Event.goal_id, Event.task_id)
                .all()
            )

            items = [
                {
                    "plan_id": row.plan_id,
                    "goal_id": row.goal_id,
                    "task_id": row.task_id,
                    "total": int(row.total or 0),
                    "completed": int(row.completed or 0)
                }
                for row in rows
            ]
            return jsonify({"items": items}), 200
        finally:
            session.close()

    @app.route("/api/task-events/reset", methods=["DELETE", "OPTIONS"])
    def reset_task_events_api():
        if request.method == "OPTIONS":
            return "", 204
        from flask_jwt_extended import verify_jwt_in_request
        verify_jwt_in_request()
        current_user_id = int(get_jwt_identity())
        payload = request.get_json(force=True) or {}
        plan_id = str(payload.get("plan_id") or "").strip()
        goal_id = str(payload.get("goal_id") or "").strip()
        task_id = str(payload.get("task_id") or "").strip()

        if not plan_id or not goal_id or not task_id:
            return jsonify({"error": "缺少任务标识"}), 400

        session = SessionLocal()
        try:
            valid_pairs = _load_user_goal_pairs(session, current_user_id)
            if (plan_id, goal_id) not in valid_pairs:
                return jsonify({"error": "目标不存在或无权访问"}), 404

            deleted = (
                session.query(Event)
                .filter(
                    Event.user_id == current_user_id,
                    Event.plan_id == plan_id,
                    Event.goal_id == goal_id,
                    Event.task_id == task_id,
                    Event.is_completed == True
                )
                .delete(synchronize_session=False)
            )
            session.commit()
            clear_stats_cache()
            return jsonify({"deleted": int(deleted or 0)}), 200
        finally:
            session.close()

    @app.route("/ideas", methods=["GET"])
    @jwt_required()
    def list_ideas():
        current_user_id = int(get_jwt_identity())
        session = SessionLocal()
        try:
            ideas = session.query(Idea).filter_by(user_id=current_user_id).order_by(Idea.sort_order.asc(), Idea.createdAt.desc()).all()
            return jsonify([idea_to_dict(i) for i in ideas]), 200
        finally:
            session.close()

    @app.route("/ideas", methods=["POST"])
    @jwt_required()
    def create_idea():
        current_user_id = int(get_jwt_identity())
        payload = request.get_json(force=True)
        session = SessionLocal()
        try:
            min_sort_order = session.query(func.min(Idea.sort_order)).filter(Idea.user_id == current_user_id).scalar()
            is_completed = bool(payload.get("isCompleted", payload.get("is_completed", False)))
            idea = Idea(
                id=uuid4().hex,
                text=payload.get("text", "新的待办"),
                createdAt=datetime.utcnow(),
                is_completed=is_completed,
                completed_at=datetime.utcnow() if is_completed else None,
                sort_order=(int(min_sort_order) - 1) if min_sort_order is not None else 0,
                user_id=current_user_id
            )
            session.add(idea)
            session.commit()
            return jsonify(idea_to_dict(idea)), 201
        finally:
            session.close()

    @app.route("/ideas/<idea_id>", methods=["PUT"])
    @jwt_required()
    def update_idea(idea_id: str):
        current_user_id = int(get_jwt_identity())
        payload = request.get_json(force=True)
        session = SessionLocal()
        try:
            idea = session.query(Idea).filter(Idea.id == idea_id, Idea.user_id == current_user_id).first()
            if not idea:
                return jsonify({"error": "待办不存在"}), 404
            
            if "text" in payload:
                idea.text = payload["text"]
            if "isCompleted" in payload or "is_completed" in payload:
                next_completed = bool(payload.get("isCompleted", payload.get("is_completed", False)))
                idea.is_completed = next_completed
                idea.completed_at = datetime.utcnow() if next_completed else None
            if "sortOrder" in payload or "sort_order" in payload:
                raw_sort_order = payload.get("sortOrder", payload.get("sort_order", idea.sort_order))
                idea.sort_order = int(raw_sort_order)
            
            session.commit()
            return jsonify(idea_to_dict(idea)), 200
        finally:
            session.close()

    @app.route("/ideas/reorder", methods=["PATCH"])
    @jwt_required()
    def reorder_ideas():
        current_user_id = int(get_jwt_identity())
        payload = request.get_json(force=True) or {}
        ordered_ids = payload.get("orderedIds")
        if not isinstance(ordered_ids, list) or not ordered_ids:
            return jsonify({"error": "orderedIds 必须是非空数组"}), 400

        normalized_ids = [str(idea_id) for idea_id in ordered_ids if idea_id]
        session = SessionLocal()
        try:
            ideas = session.query(Idea).filter(Idea.user_id == current_user_id, Idea.id.in_(normalized_ids)).all()
            if len(ideas) != len(normalized_ids):
                return jsonify({"error": "存在无效的待办条目"}), 400

            idea_map = {idea.id: idea for idea in ideas}
            for index, idea_id in enumerate(normalized_ids):
                idea_map[idea_id].sort_order = index

            session.commit()

            ordered_ideas = session.query(Idea).filter_by(user_id=current_user_id).order_by(Idea.sort_order.asc(), Idea.createdAt.desc()).all()
            return jsonify([idea_to_dict(idea) for idea in ordered_ideas]), 200
        finally:
            session.close()

    @app.route("/ideas/<idea_id>", methods=["DELETE"])
    @jwt_required()
    def delete_idea(idea_id: str):
        current_user_id = int(get_jwt_identity())
        session = SessionLocal()
        try:
            idea = session.query(Idea).filter(Idea.id == idea_id, Idea.user_id == current_user_id).first()
            if not idea:
                return jsonify({"status": "not_found"}), 404
            session.delete(idea)
            session.commit()
            return jsonify({"status": "deleted"}), 200
        finally:
            session.close()

    # 事件类型管理 API
    @app.route("/event-types", methods=["GET"])
    @jwt_required()
    def list_event_types():
        current_user_id = int(get_jwt_identity())
        claims = get_jwt()
        is_admin = bool(claims.get("is_admin"))
        session = SessionLocal()
        try:
            global_types = (
                session
                .query(EventType)
                .filter(EventType.user_id.is_(None))
                .order_by(EventType.name.asc())
                .all()
            )

            types: List[EventType] = list(global_types)

            if not is_admin:
                user_types = (
                    session
                    .query(EventType)
                    .filter(EventType.user_id == current_user_id)
                    .order_by(EventType.name.asc())
                    .all()
                )
                if global_types:
                    existing_names = {
                        (t.name or "").strip().lower() for t in global_types if t.name
                    }
                    for item in user_types:
                        normalized = (item.name or "").strip().lower()
                        if normalized and normalized in existing_names:
                            continue
                        types.append(item)
                else:
                    types.extend(user_types)
            elif not global_types:
                # 管理员在无全局类型时回退到个人类型列表
                types = (
                    session
                    .query(EventType)
                    .filter(EventType.user_id == current_user_id)
                    .order_by(EventType.name.asc())
                    .all()
                )

            ordered_unique_types: List[EventType] = []
            seen_ids = set()
            for item in types:
                if item.id in seen_ids:
                    continue
                seen_ids.add(item.id)
                ordered_unique_types.append(item)

            ordered_unique_types.sort(key=lambda t: (t.name or "").lower())
            return jsonify([event_type_to_dict(t) for t in ordered_unique_types]), 200
        finally:
            session.close()

    @app.route("/event-types", methods=["POST"])
    @jwt_required()
    def create_event_type():
        current_user_id = int(get_jwt_identity())
        claims = get_jwt()
        is_admin = bool(claims.get("is_admin"))
        payload = request.get_json(force=True)
        session = SessionLocal()
        try:
            name = (payload.get("name") or "新类型").strip()
            color = (payload.get("color") or "#000000").strip()

            if not name:
                return jsonify({"error": "事件类型名称不能为空"}), 400

            target_user_id = None if is_admin else current_user_id
            normalized_name = name.lower()

            global_conflict = session.query(EventType).filter(
                EventType.user_id.is_(None),
                func.lower(EventType.name) == normalized_name
            ).first()

            if global_conflict:
                return jsonify({"error": "事件类型名称已存在"}), 409

            if target_user_id is not None:
                user_conflict = session.query(EventType).filter(
                    EventType.user_id == target_user_id,
                    func.lower(EventType.name) == normalized_name
                ).first()
                if user_conflict:
                    return jsonify({"error": "事件类型名称已存在"}), 409

            event_type = EventType(
                id=uuid4().hex,
                name=name,
                color=color or "#000000",
                user_id=target_user_id
            )
            session.add(event_type)
            session.commit()
            return jsonify(event_type_to_dict(event_type)), 201
        except IntegrityError:
            session.rollback()
            return jsonify({"error": "事件类型名称已存在"}), 409
        finally:
            session.close()

    @app.route("/event-types/<type_id>", methods=["PUT"])
    @jwt_required()
    def update_event_type(type_id: str):
        current_user_id = int(get_jwt_identity())
        claims = get_jwt()
        is_admin = bool(claims.get("is_admin"))
        payload = request.get_json(force=True)
        session = SessionLocal()
        try:
            query = session.query(EventType).filter(EventType.id == type_id)
            if not is_admin:
                query = query.filter(EventType.user_id == current_user_id)

            event_type = query.first()
            if not event_type:
                return jsonify({"error": "类型不存在"}), 404

            original_name = event_type.name

            if "name" in payload:
                new_name = (payload["name"] or "").strip()
                if not new_name:
                    return jsonify({"error": "事件类型名称不能为空"}), 400
                normalized_name = new_name.lower()
                if event_type.user_id is None:
                    conflict = session.query(EventType).filter(
                        EventType.user_id.is_(None),
                        func.lower(EventType.name) == normalized_name,
                        EventType.id != type_id
                    ).first()
                else:
                    conflict = session.query(EventType).filter(
                        EventType.user_id == event_type.user_id,
                        func.lower(EventType.name) == normalized_name,
                        EventType.id != type_id
                    ).first()
                if conflict:
                    return jsonify({"error": "事件类型名称已存在"}), 409
                event_type.name = new_name

            if "color" in payload:
                new_color = (payload["color"] or "").strip()
                if new_color:
                    event_type.color = new_color

            session.commit()

            if event_type.user_id is None and original_name:
                normalized_original = original_name.strip().lower()
                duplicates = session.query(EventType).filter(
                    EventType.user_id.isnot(None),
                    func.lower(EventType.name) == normalized_original
                ).all()
                for duplicate in duplicates:
                    if "name" in payload:
                        duplicate.name = event_type.name
                    if "color" in payload and event_type.color:
                        duplicate.color = event_type.color
                if duplicates:
                    session.commit()

            return jsonify(event_type_to_dict(event_type)), 200
        finally:
            session.close()

    @app.route("/event-types/<type_id>", methods=["DELETE"])
    @jwt_required()
    def delete_event_type(type_id: str):
        current_user_id = int(get_jwt_identity())
        claims = get_jwt()
        is_admin = bool(claims.get("is_admin"))
        session = SessionLocal()
        try:
            query = session.query(EventType).filter(EventType.id == type_id)
            if not is_admin:
                query = query.filter(EventType.user_id == current_user_id)

            event_type = query.first()
            if not event_type:
                return jsonify({"error": "类型不存在"}), 404

            affected_type_ids = [event_type.id]
            duplicates = []
            if is_admin and event_type.user_id is None and event_type.name:
                normalized_name = event_type.name.strip().lower()
                if normalized_name:
                    duplicates = session.query(EventType).filter(
                        EventType.user_id.isnot(None),
                        func.lower(EventType.name) == normalized_name
                    ).all()
                    affected_type_ids.extend([dup.id for dup in duplicates])

            if affected_type_ids:
                session.query(Event).filter(Event.custom_type_id.in_(affected_type_ids)).update(
                    {Event.custom_type_id: None}, synchronize_session=False
                )

            for duplicate in duplicates:
                session.delete(duplicate)
            session.delete(event_type)
            session.commit()
            return jsonify({"status": "deleted"}), 200
        finally:
            session.close()

    # 每日积分查询 API
    @app.route("/daily-scores", methods=["GET"])
    @jwt_required()
    def get_daily_scores():
        start_date_str = request.args.get("start_date")
        end_date_str = request.args.get("end_date")
        current_user_id = int(get_jwt_identity())

        session = SessionLocal()
        try:
            query = session.query(DailyScore).filter(DailyScore.user_id == current_user_id)

            start_date = None
            end_date = None
            if start_date_str:
                start_date = datetime.fromisoformat(start_date_str).date()
                query = query.filter(DailyScore.date >= start_date)

            if end_date_str:
                end_date = datetime.fromisoformat(end_date_str).date()
                query = query.filter(DailyScore.date <= end_date)

            # 若指定了范围，先按事件重新计算该范围内每日积分，修复历史残留/不一致数据
            if start_date or end_date:
                if not start_date:
                    start_date = end_date
                if not end_date:
                    end_date = start_date

                cursor = start_date
                while cursor <= end_date:
                    recalculate_daily_score_for_date(session, cursor, current_user_id)
                    cursor += timedelta(days=1)
                session.flush()

            scores = query.order_by(DailyScore.date).all()
            return jsonify([daily_score_to_dict(s) for s in scores]), 200
        finally:
            session.close()

    @app.route("/daily-score-details", methods=["GET"])
    @jwt_required()
    def get_daily_score_details():
        date_str = request.args.get("date")
        if not date_str:
            return jsonify({"error": "缺少日期参数"}), 400
        current_user_id = int(get_jwt_identity())

        session = SessionLocal()
        try:
            target_date = datetime.fromisoformat(date_str).date()
            
            # 1. 获取所有事件类型
            event_types = session.query(EventType).filter(
                or_(EventType.user_id == current_user_id, EventType.user_id.is_(None))
            ).all()
            type_map = {t.id: t.name for t in event_types}
            
            # 2. 获取当日所有已完成事件
            from sqlalchemy import and_
            events = session.query(Event).filter(
                and_(
                    Event.user_id == current_user_id,
                    Event.is_completed == True,
                    Event.start >= datetime.combine(target_date, datetime.min.time()),
                    Event.start < datetime.combine(target_date + timedelta(days=1), datetime.min.time())
                )
            ).all()
            
            # 3. 聚合数据
            # 结构: { type_id: { 'high': {count, score}, 'medium': ..., 'low': ... } }
            stats = {}
            
            # 初始化所有类型的统计结构
            for t in event_types:
                stats[t.id] = {
                    'name': t.name,
                    'color': t.color,
                    'details': {
                        'high': {'count': 0, 'score': 0},
                        'medium': {'count': 0, 'score': 0},
                        'low': {'count': 0, 'score': 0}
                    }
                }
            
            # 填充数据
            for event in events:
                type_id = event.custom_type_id
                efficiency = event.efficiency
                
                # 如果事件类型已被删除或未设置，归类为"默认"或忽略
                # 这里简单处理：如果 type_id 不在 stats 中（可能是默认类型或已删除），
                # 我们可以创建一个临时的 entry 或者归类到 "默认"
                # 假设 "默认" 类型没有 ID 或者 ID 不在 event_types 表中
                
                target_entry = None
                if type_id and type_id in stats:
                    target_entry = stats[type_id]
                else:
                    # 处理默认类型或未知类型
                    default_key = 'default'
                    if default_key not in stats:
                        stats[default_key] = {
                            'name': event.category or '默认',
                            'color': '#667eea', # 默认颜色
                            'details': {
                                'high': {'count': 0, 'score': 0},
                                'medium': {'count': 0, 'score': 0},
                                'low': {'count': 0, 'score': 0}
                            }
                        }
                    target_entry = stats[default_key]
                
                if efficiency in ['high', 'medium', 'low']:
                    score = calculate_event_score(event)
                    units = calculate_event_units(event)
                    
                    target_entry['details'][efficiency]['count'] += units
                    target_entry['details'][efficiency]['score'] += score
            
            # 4. 转换为列表格式返回
            result = []
            for type_id, data in stats.items():
                result.append({
                    'typeId': type_id,
                    'typeName': data['name'],
                    'typeColor': data.get('color', '#667eea'),
                    'details': data['details']
                })
                
            return jsonify(result), 200
        except Exception as e:
            logging.error(f"获取积分详情失败: {e}")
            return jsonify({"error": str(e)}), 500
        finally:
            session.close()

    # 数据统计 API（支持年度/月度筛选）
    @app.route("/stats", methods=["GET"])
    @jwt_required()
    def get_stats():
        """
        获取系统统计数据，包括事件数量、积分统计、记录率等关键指标
        支持按年度和月度筛选
        查询参数:
        - year: 年份(可选)，如 2025
        - month: 月份(可选，1-12)，需配合 year 使用
        """
        current_user_id = int(get_jwt_identity())
        year = request.args.get('year', type=int)
        month = request.args.get('month', type=int)
        
        # 构建缓存键
        cache_key = f"{current_user_id}_{year or 'all'}_{month or 'all'}"
        
        # 检查缓存是否有效
        now = datetime.utcnow()
        cache_ttl = stats_cache.get('ttl', 60)
        if (cache_key in stats_cache and 
            stats_cache[cache_key].get('data') is not None and 
            stats_cache[cache_key].get('timestamp') is not None and 
            (now - stats_cache[cache_key]['timestamp']).total_seconds() < cache_ttl):
            logging.info(f"返回缓存的统计数据: {cache_key}")
            return jsonify(stats_cache[cache_key]['data']), 200
        
        session = SessionLocal()
        try:
            from sqlalchemy import func, extract
            from calendar import monthrange
            
            # 构建时间过滤条件
            event_query = session.query(Event).filter(Event.user_id == current_user_id)
            score_query = session.query(DailyScore).filter(DailyScore.user_id == current_user_id)
            
            start_date = None
            end_date = None
            days_in_period = 0
            
            if year and month:
                # 月度筛选
                start_date = datetime(year, month, 1).date()
                days_in_month = monthrange(year, month)[1]
                end_date = datetime(year, month, days_in_month).date()
                days_in_period = days_in_month
                
                event_query = event_query.filter(
                    extract('year', Event.start) == year,
                    extract('month', Event.start) == month
                )
                score_query = score_query.filter(
                    extract('year', DailyScore.date) == year,
                    extract('month', DailyScore.date) == month
                )
            elif year:
                # 年度筛选
                start_date = datetime(year, 1, 1).date()
                end_date = datetime(year, 12, 31).date()
                days_in_period = 366 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 365
                
                event_query = event_query.filter(extract('year', Event.start) == year)
                score_query = score_query.filter(extract('year', DailyScore.date) == year)
            
            # 统计事件数量
            total_events = event_query.count()
            completed_events = event_query.filter(Event.is_completed == True).count()
            
            # 统计各效率等级的事件数量
            high_efficiency = event_query.filter(Event.efficiency == 'high').count()
            medium_efficiency = event_query.filter(Event.efficiency == 'medium').count()
            low_efficiency = event_query.filter(Event.efficiency == 'low').count()
            
            # 统计总积分
            total_score = score_query.with_entities(func.sum(DailyScore.total_score)).scalar() or 0
            
            # 统计平均每日积分
            score_count = score_query.count()
            avg_daily_score = round(total_score / score_count, 2) if score_count > 0 else 0
            
            # 计算记录率（仅月度有效）
            record_rate = 0
            total_recorded_hours = 0
            if year and month and days_in_period > 0:
                # 计算当月所有事件的总时长（小时），排除全天事件
                duration_events = event_query.filter(Event.allDay == False).with_entities(Event.start, Event.end).all()
                for event_start, event_end in duration_events:
                    if event_start and event_end:
                        duration = (event_end - event_start).total_seconds() / 3600  # 转换为小时
                        total_recorded_hours += duration
                
                # 记录率 = 当月记录的时间总数 / (当月天数 * 17)
                total_available_hours = days_in_period * 17
                record_rate = round((total_recorded_hours / total_available_hours * 100), 2) if total_available_hours > 0 else 0
            
            # 统计事件类型分布
            type_distribution = []
            event_types = session.query(EventType).filter_by(user_id=current_user_id).all()
            for event_type in event_types:
                # Re-use event_query but with custom_type_id filter
                # Note: event_query already has user_id filter
                type_count = event_query.filter(Event.custom_type_id == event_type.id).count()
                if type_count > 0:
                    type_distribution.append({
                        'typeName': event_type.name,
                        'typeColor': event_type.color,
                        'count': type_count
                    })
            
            # 获取月度得分明细（仅月度有效）
            daily_scores = []
            if year and month and start_date and end_date:
                # 先按事件重算当月积分，避免残留/不一致
                cursor = start_date
                while cursor <= end_date:
                    recalculate_daily_score_for_date(session, cursor, current_user_id)
                    cursor += timedelta(days=1)
                session.flush()

                scores = score_query.order_by(DailyScore.date).all()
                for score in scores:
                    daily_scores.append({
                        'date': score.date.strftime('%Y-%m-%d'),
                        'day': score.date.day,
                        'score': score.total_score
                    })
            
            # 构建统计数据
            stats = {
                'year': year,
                'month': month,
                'totalEvents': total_events,
                'completedEvents': completed_events,
                'pendingEvents': total_events - completed_events,
                'completionRate': round((completed_events / total_events * 100), 2) if total_events > 0 else 0,
                'recordRate': record_rate,
                'recordedHours': round(total_recorded_hours, 2),
                'availableHours': days_in_period * 17 if days_in_period > 0 else 0,
                'efficiency': {
                    'high': high_efficiency,
                    'medium': medium_efficiency,
                    'low': low_efficiency
                },
                'score': {
                    'total': total_score,
                    'average': avg_daily_score
                },
                'typeDistribution': type_distribution,
                'dailyScores': daily_scores
            }
            
            # 更新缓存
            if cache_key not in stats_cache:
                stats_cache[cache_key] = {}
            stats_cache[cache_key]['data'] = stats
            stats_cache[cache_key]['timestamp'] = now
            stats_cache[cache_key]['ttl'] = stats_cache.get('ttl', 60)
            logging.info(f"统计数据已缓存: {cache_key}")
            
            return jsonify(stats), 200
        except Exception as e:
            logging.error(f"获取统计数据失败: {e}")
            return jsonify({"error": "获取统计数据失败"}), 500
        finally:
            session.close()

    # 清除统计缓存的辅助函数
    def clear_stats_cache():
        """事件发生变化时清除统计缓存"""
        stats_cache.clear()
        stats_cache['ttl'] = 60
        logging.info("统计缓存已清除")


def seed_demo_data() -> None:  # 定义示例数据填充函数
    if not EVENTS_STORE:  # 如果事件存储为空则填充示例数据
        EVENTS_STORE.append({  # 添加示例事件方便前端展示
            "id": uuid4().hex,  # 示例事件唯一标识
            "title": "团队晨会",  # 示例事件标题
            "start": datetime.utcnow().isoformat(),  # 示例事件开始时间
            "end": datetime.utcnow().isoformat(),  # 示例事件结束时间
            "allDay": False,  # 示例事件是否全天
            "category": "默认",  # 示例事件类型
            "time": "09:00 - 10:00",  # 示例事件时间描述
            "urgency": "普通"  # 示例事件紧急程度
        })  # 示例事件生成完成
    if not IDEAS_STORE:  # 如果灵感存储为空则填充示例灵感
        IDEAS_STORE.append({  # 添加示例灵感条目
            "id": uuid4().hex,  # 示例灵感唯一标识
            "text": "利用番茄钟规划任务。",  # 示例灵感内容
            "createdAt": datetime.utcnow().isoformat() + "Z"  # 示例灵感创建时间
        })  # 示例灵感生成完成

    # Seed Admin User in DB
    session = SessionLocal()
    try:
        # Check if User table exists and has users
        # Note: init_db() is called before this, so table should exist.
        admin = session.query(User).filter_by(username="admin").first()
        if not admin:
            # If no admin user, check if any user exists (to avoid overwriting if someone renamed admin)
            # But here we specifically want to ensure 'admin' exists for default data ownership
            if not session.query(User).first():
                admin = User(
                    username="admin",
                    password_hash=generate_password_hash("admin123"),
                    is_admin=True
                )
                session.add(admin)
                session.flush()
                ensure_global_event_types(session)
                session.commit()
                logging.info("Created default admin user: admin/admin123")
        
        # 确保默认全局事件类型已生成
        created_defaults = ensure_global_event_types(session)
        if created_defaults:
            session.commit()

        # 将管理员名下的事件类型迁移为全局类型，避免重复维护
        if admin:
            migrated = False
            admin_types = session.query(EventType).filter(EventType.user_id == admin.id).all()
            for item in admin_types:
                normalized = (item.name or "").strip().lower()
                if not normalized:
                    continue
                conflict = session.query(EventType).filter(
                    EventType.user_id.is_(None),
                    func.lower(EventType.name) == normalized
                ).first()
                if conflict:
                    continue
                item.user_id = None
                migrated = True
            if migrated:
                session.commit()

        # Migrate现有数据（user_id 为空）到管理员名下（事件类型除外，保持全局）
        if admin:
            from sqlalchemy import text
            tables = ['events', 'ideas', 'daily_scores']
            for table in tables:
                # Check if table has user_id column and update
                # We assume columns exist because init_db ran
                try:
                    session.execute(text(f"UPDATE {table} SET user_id = :uid WHERE user_id IS NULL"), {"uid": admin.id})
                except Exception as e:
                    logging.warning(f"Migration for table {table} failed (maybe column missing?): {e}")
            session.commit()

            # Optional annual planning demo data (requires new tables/migrations)
            seed_planning_demo = os.getenv("SEED_PLANNING_DEMO", "0").lower() in {"1", "true", "yes"}
            if seed_planning_demo:
                try:
                    session.execute(text("SELECT 1 FROM annual_plans LIMIT 1"))
                except Exception as exc:
                    logging.info("Skipping planning demo seed (tables missing yet): %s", exc)
                else:
                    existing = session.execute(
                        text("SELECT COUNT(*) FROM annual_plans WHERE user_id = :uid"), {"uid": admin.id}
                    ).scalar_one()
                    if existing == 0:
                        now = datetime.utcnow()
                        plan_id = uuid4().hex
                        session.execute(
                            text(
                                """
                                INSERT INTO annual_plans (id, user_id, title, description, score_allocation, status, created_at, updated_at)
                                VALUES (:id, :uid, :title, :description, :score, :status, :created_at, :updated_at)
                                """
                            ),
                            {
                                "id": plan_id,
                                "uid": admin.id,
                                "title": "年度成长规划",
                                "description": "围绕健康、学习、家庭三条主线分配 100 分",
                                "score": 60,
                                "status": "active",
                                "created_at": now,
                                "updated_at": now,
                            }
                        )

                        goal_rows = [
                            {
                                "id": uuid4().hex,
                                "plan_id": plan_id,
                                "name": "完成 6 本专业书",
                                "details": "每两个月安排一次输出总结",
                                "expected_timeframe": "Q1-Q3",
                                "status": "pending",
                            },
                            {
                                "id": uuid4().hex,
                                "plan_id": plan_id,
                                "name": "坚持周跑 20 公里",
                                "details": "拆分为 4 次 5 公里，记录配速",
                                "expected_timeframe": "全年",
                                "status": "pending",
                            },
                            {
                                "id": uuid4().hex,
                                "plan_id": plan_id,
                                "name": "每月一次家庭日",
                                "details": "固定在每月第三个周六，记录合照",
                                "expected_timeframe": "每月",
                                "status": "pending",
                            },
                        ]

                        for goal in goal_rows:
                            session.execute(
                                text(
                                    """
                                    INSERT INTO plan_goals (id, plan_id, name, details, expected_timeframe, status, created_at, updated_at)
                                    VALUES (:id, :plan_id, :name, :details, :expected_timeframe, :status, :created_at, :updated_at)
                                    """
                                ),
                                {
                                    **goal,
                                    "created_at": now,
                                    "updated_at": now,
                                }
                            )

                        session.commit()
                        logging.info("Seeded demo annual plan data for admin user")
                    else:
                        logging.info("Annual plan data already present, skipping demo seed")
            
    except Exception as e:
        logging.error(f"Seeding/Migration failed: {e}")
    finally:
        session.close()


app = create_app()  # 创建全局应用实例供 WSGI 使用


if __name__ == "__main__":  # 仅在直接运行文件时执行
    app.run(debug=True, use_reloader=True)  # 启动开发服务器
