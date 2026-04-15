ALTER TABLE ideas
ADD COLUMN completed_at DATETIME NULL AFTER is_completed;
