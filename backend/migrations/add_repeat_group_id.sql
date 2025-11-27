-- 添加 repeat_group_id 字段到 events 表
ALTER TABLE events ADD COLUMN repeat_group_id VARCHAR(32) DEFAULT NULL AFTER repeat_end_date;

-- 为现有的重复事件生成 repeat_group_id
-- 注意：这个脚本会为所有现有的重复事件分配唯一的 group_id
-- 如果需要将现有的相同重复事件归为一组，需要根据实际情况手动调整

UPDATE events 
SET repeat_group_id = UUID()
WHERE is_repeat = 1 AND repeat_group_id IS NULL;
