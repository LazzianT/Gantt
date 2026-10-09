IF OBJECT_ID('pm.project_baselines', 'U') IS NULL
BEGIN
    CREATE TABLE pm.project_baselines (
        baseline_id     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_pm_project_baselines PRIMARY KEY,
        project_id      INT NOT NULL,
        name            NVARCHAR(200) NOT NULL,
        captured_at     DATETIME2 NOT NULL CONSTRAINT DF_pm_project_baselines_captured_at DEFAULT SYSUTCDATETIME(),
        captured_by_nip NVARCHAR(50) NULL,
        CONSTRAINT FK_pm_project_baselines_project FOREIGN KEY (project_id)
            REFERENCES pm.projects (project_id) ON DELETE CASCADE
    );
END
GO
IF OBJECT_ID('pm.project_baseline_tasks', 'U') IS NULL
BEGIN
    CREATE TABLE pm.project_baseline_tasks (
        baseline_task_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_pm_project_baseline_tasks PRIMARY KEY,
        baseline_id      INT NOT NULL,
        task_id          INT NOT NULL,
        start_date       DATE NULL,
        finish_date      DATE NULL,
        duration_days    DECIMAL(9,2) NULL,
        CONSTRAINT FK_pm_project_baseline_tasks_baseline FOREIGN KEY (baseline_id)
            REFERENCES pm.project_baselines (baseline_id) ON DELETE CASCADE,
        CONSTRAINT FK_pm_project_baseline_tasks_task FOREIGN KEY (task_id)
            REFERENCES pm.project_tasks (task_id),
        CONSTRAINT UQ_pm_project_baseline_tasks UNIQUE (baseline_id, task_id)
    );
END
GO
