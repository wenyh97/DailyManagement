-- Goal execution queue + task status persistence
CREATE TABLE IF NOT EXISTS goal_execution_queue (
    id CHAR(32) PRIMARY KEY,
    user_id INT NOT NULL,
    plan_id CHAR(32) NOT NULL,
    goal_id CHAR(32) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_goal_execution_queue_user FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_goal_execution_queue_plan FOREIGN KEY (plan_id)
        REFERENCES annual_plans(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_goal_execution_queue_goal FOREIGN KEY (goal_id)
        REFERENCES plan_goals(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    UNIQUE KEY uq_goal_execution_queue (user_id, plan_id, goal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_goal_execution_queue_user ON goal_execution_queue(user_id);

CREATE TABLE IF NOT EXISTS goal_task_statuses (
    id CHAR(32) PRIMARY KEY,
    user_id INT NOT NULL,
    plan_id CHAR(32) NOT NULL,
    goal_id CHAR(32) NOT NULL,
    task_id VARCHAR(64) NOT NULL,
    status ENUM('backlog','todo','doing','done') NOT NULL DEFAULT 'backlog',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_goal_task_status_user FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_goal_task_status_plan FOREIGN KEY (plan_id)
        REFERENCES annual_plans(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_goal_task_status_goal FOREIGN KEY (goal_id)
        REFERENCES plan_goals(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    UNIQUE KEY uq_goal_task_status (user_id, plan_id, goal_id, task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_goal_task_status_user ON goal_task_statuses(user_id);
CREATE INDEX idx_goal_task_status_status ON goal_task_statuses(status);
