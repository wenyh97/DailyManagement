-- 为 ideas 表添加 priority 字段
ALTER TABLE ideas ADD COLUMN priority VARCHAR(16) DEFAULT 'medium';

-- 更新现有数据的优先级为默认值
UPDATE ideas SET priority = 'medium' WHERE priority IS NULL;
