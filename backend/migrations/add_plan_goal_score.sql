ALTER TABLE plan_goals
    ADD COLUMN score_allocation TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER expected_timeframe;
