CREATE TABLE milestone_tasks (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id        UUID         NOT NULL REFERENCES contract_milestones(id) ON DELETE CASCADE,
    parent_id           UUID         REFERENCES milestone_tasks(id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,
    description         TEXT,
    assigned_to_user_id UUID         REFERENCES users(id),
    status              VARCHAR(30)  NOT NULL DEFAULT 'PENDING',
    created_at          TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE INDEX idx_milestone_tasks_milestone ON milestone_tasks(milestone_id);
CREATE INDEX idx_milestone_tasks_parent    ON milestone_tasks(parent_id);
