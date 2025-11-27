# MySQL 初始化脚本
# 请确保已创建数据库 daily_management，或根据需要修改数据库名
# 仅包含最小 Event/Idea 表结构

CREATE DATABASE IF NOT EXISTS daily_management DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE daily_management;

CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(32) PRIMARY KEY,
    title VARCHAR(128) NOT NULL,
    start DATETIME NOT NULL,
    end DATETIME NOT NULL,
    allDay BOOLEAN DEFAULT FALSE,
    category VARCHAR(32) DEFAULT '默认',
    time VARCHAR(32) DEFAULT '',
    urgency VARCHAR(16) DEFAULT '普通',
    remark VARCHAR(512) NULL,
    is_repeat BOOLEAN DEFAULT FALSE,
    repeat_type VARCHAR(32) DEFAULT NULL,
    repeat_end_date DATE DEFAULT NULL,
    repeat_group_id VARCHAR(32) DEFAULT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    efficiency VARCHAR(16) DEFAULT NULL,
    custom_type_id VARCHAR(32) DEFAULT NULL,
    KEY idx_start_completed (start, is_completed),
    KEY idx_type_completed (custom_type_id, is_completed),
    KEY idx_repeat_group (repeat_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ideas (
    id VARCHAR(32) PRIMARY KEY,
    text VARCHAR(256) NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
