-- Add plan_year column so annual plans can track year metadata
ALTER TABLE annual_plans
    ADD COLUMN plan_year SMALLINT UNSIGNED NULL AFTER score_allocation;

CREATE INDEX idx_annual_plans_year ON annual_plans(plan_year);
