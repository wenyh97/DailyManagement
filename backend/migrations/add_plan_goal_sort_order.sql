-- 为 plan_goals 表添加排序字段，兼容 MySQL 版本不支持 ADD COLUMN IF NOT EXISTS 的情况
SET @has_sort_order_column := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'plan_goals'
      AND COLUMN_NAME = 'sort_order'
);

SET @add_column_sql := IF(
    @has_sort_order_column = 0,
    'ALTER TABLE plan_goals ADD COLUMN sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER score_allocation;',
    'SELECT "sort_order column already exists";'
);

PREPARE add_stmt FROM @add_column_sql;
EXECUTE add_stmt;
DEALLOCATE PREPARE add_stmt;

-- 按现有创建时间为每个规划内的目标补齐初始排序值
UPDATE plan_goals pg
JOIN (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY plan_id ORDER BY created_at, id) - 1 AS new_order
    FROM plan_goals
) ranked ON ranked.id = pg.id
SET pg.sort_order = ranked.new_order;
