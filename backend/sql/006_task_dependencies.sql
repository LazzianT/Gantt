IF OBJECT_ID('pm.task_dependencies', 'U') IS NULL
BEGIN
    CREATE TABLE pm.task_dependencies (
        dependency_id       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_pm_task_dependencies PRIMARY KEY,
        project_id          INT NOT NULL,
        predecessor_task_id INT NOT NULL,
        successor_task_id   INT NOT NULL,
        dependency_type     NVARCHAR(2) NOT NULL CONSTRAINT DF_pm_task_dependencies_type DEFAULT 'FS',
        lag_days            INT NOT NULL CONSTRAINT DF_pm_task_dependencies_lag DEFAULT 0,
        is_active           BIT NOT NULL CONSTRAINT DF_pm_task_dependencies_is_active DEFAULT 1,
        created_at          DATETIME2 NOT NULL CONSTRAINT DF_pm_task_dependencies_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_pm_task_dependencies_project FOREIGN KEY (project_id)
            REFERENCES pm.projects (project_id) ON DELETE CASCADE,
        CONSTRAINT FK_pm_task_dependencies_predecessor FOREIGN KEY (predecessor_task_id)
            REFERENCES pm.project_tasks (task_id),
        CONSTRAINT FK_pm_task_dependencies_successor FOREIGN KEY (successor_task_id)
            REFERENCES pm.project_tasks (task_id),
        CONSTRAINT CK_pm_task_dependencies_type CHECK (dependency_type IN ('FS','SS','FF','SF')),
        CONSTRAINT CK_pm_task_dependencies_not_self CHECK (predecessor_task_id <> successor_task_id),
        CONSTRAINT UQ_pm_task_dependencies UNIQUE (predecessor_task_id, successor_task_id)
    );
END
GO
