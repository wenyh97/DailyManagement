-- Annual planning tables for score budgeting workflow
CREATE TABLE IF NOT EXISTS annual_plans (
    id CHAR(32) PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(120) NOT NULL,
    description TEXT NULL,
    score_allocation TINYINT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('draft','active','archived') NOT NULL DEFAULT 'draft',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_annual_plans_user FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_annual_plans_user ON annual_plans(user_id);
CREATE INDEX idx_annual_plans_status ON annual_plans(status);

CREATE TABLE IF NOT EXISTS plan_goals (
    id CHAR(32) PRIMARY KEY,
    plan_id CHAR(32) NOT NULL,
    name VARCHAR(120) NOT NULL,
    details TEXT NULL,
    expected_timeframe VARCHAR(64) NULL,
    status ENUM('pending','executing','done') NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_plan_goals_plan FOREIGN KEY (plan_id)
        REFERENCES annual_plans(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_plan_goals_plan ON plan_goals(plan_id);
CREATE INDEX idx_plan_goals_status ON plan_goals(status);
