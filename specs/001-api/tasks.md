---
description: "Task list for 日常管理系统 feature implementation"
---

# Tasks: 日常管理系统

**Input**: Design documents from `/specs/001-api/`
**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: 未强制要求测试任务，如需 TDD 可补充。

**Organization**: 按用户故事分组，便于独立开发和测试。


## Phase 1: Setup & MVP Skeleton

- [X] T001 创建后端项目结构（backend/src, backend/tests 等）
- [X] T002 创建前端项目结构（frontend/js, frontend/css, frontend/tests 等）
- [X] T003 [P] 配置 Python/Flask 依赖和基础环境
- [X] T004 [P] 配置前端依赖（如 FullCalendar, lunar-javascript）
- [X] T005 [P] 配置代码格式化和 lint 工具
- [X] T006 [P] 实现后端健康检查接口，并在前端首页展示后端连通性（MVP 验证）

---


## Phase 2: Foundational (Blocking Prerequisites)

- [X] T007 设计并初始化 MySQL 数据库结构（只建最小 Event 表，支持最基础数据流转）
- [X] T008 [P] 搭建 Flask API 路由和基础中间件（只暴露最小接口，前端可拉取/展示）
- [X] T009 [P] 配置基础错误处理和日志
- [X] T010 [P] 配置环境变量和配置管理
- [X] T011 创建 Event 基础数据模型（只实现最小字段，支持前端展示）
- [X] T012 MVP 数据流打通：前端可通过 API 拉取/展示最小数据

**Checkpoint**: Foundation ready - 前端可见最小数据流转效果

---


## Phase 3: User Story 1 - 日程管理 (Priority: P1) 🎯 MVP

**Goal**: 支持日程事件的完整功能，包括重复事件、完成状态、效率评分、自定义类型和积分系统
**Independent Test**: 前端日历能拉取并展示后端事件数据，支持重复事件生成、完成标记、积分计算

- [X] T013 [P] [US1] 扩展 Event 数据表结构（添加重复相关字段：is_repeat, repeat_type, repeat_end_date, is_completed, efficiency, custom_type_id）
- [X] T014 [P] [US1] 创建 EventType 数据表和模型（id, name, color）
- [X] T015 [P] [US1] 创建 DailyScore 数据表和模型（id, date, total_score）
- [X] T016 [US1] 实现事件类型管理 API（GET/POST/PUT/DELETE /event-types）
- [X] T017 [US1] 实现事件新增 API，支持重复事件生成逻辑（POST /events，根据重复规则自动创建多个事件实例）
- [X] T018 [US1] 实现事件编辑 API（PUT /events/:id，支持双击编辑）
- [X] T019 [US1] 实现事件完成标记 API（POST /events/:id/complete，接收效率评分，更新完成状态）
- [X] T020 [US1] 实现积分计算服务，根据事件时长和效率自动计算并更新 DailyScore
- [X] T021 [US1] 实现每日积分查询 API（GET /daily-scores?start_date=xxx&end_date=xxx）
- [X] T022 [US1] 前端对接事件新增弹窗，支持重复设置和自定义类型选择
- [X] T023 [US1] 前端对接事件编辑弹窗（双击事件触发）
- [X] T024 [US1] 前端对接事件完成功能（复选框+效率评分弹窗+视觉反馈）
- [X] T025 [US1] 前端对接自定义事件类型管理界面
- [X] T026 [US1] 前端在日历底部显示每日积分栏，动态展示积分数据
- [X] T027 [US1] 完善异常处理和数据校验

**Checkpoint**: 日程管理完整功能可在前端独立体验，包括重复事件、完成跟踪、积分统计

---


## Phase 4: User Story 2 - 数据统计 (Priority: P2)

**Goal**: 支持最小统计数据接口，前端可展示基础统计图表
**Independent Test**: 前端统计页面能拉取并展示后端统计数据

- [X] T028 [P] [US2] 设计最小统计数据接口（GET /stats，返回事件数量和积分统计）
- [X] T029 [US2] 对接前端统计页面与后端 API，实现基础统计展示
- [X] T030 [US2] 优化大数据量下的查询性能

**Checkpoint**: 统计最小功能可在前端独立体验

---

## Phase N: Polish & Cross-Cutting Concerns

- [ ] T031 [P] 文档完善与接口说明
- [ ] T032 代码重构与性能优化
- [ ] T033 [P] 安全加固与权限控制（如需多用户）
- [ ] T034 [P] 备份与数据恢复机制
- [ ] T035 运行 quickstart.md 验证

---

## Dependencies & Execution Order

- Setup → Foundational → User Stories（P1→P2，可并行）→ Polish
- 各用户故事可独立开发和测试，便于增量交付

## Parallel Example: User Story 1

- T011、T012 可并行开发
- T013、T014 可并行开发
- T015 需依赖前置 API 完成

## Implementation Strategy

- 先完成 Setup 和 Foundational，确保基础可用
- 优先实现 User Story 1，形成 MVP
- 后续按优先级增量交付
- 多人协作时可并行推进不同用户故事

