IF OBJECT_ID('pm.project_tasks', 'U') IS NULL
BEGIN
    CREATE TABLE pm.project_tasks (
        task_id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_pm_project_tasks PRIMARY KEY,
        project_id       INT NOT NULL,
        parent_task_id   INT NULL,
        calendar_id      INT NULL,
        code             NVARCHAR(50) NULL,
        name             NVARCHAR(200) NOT NULL,
        description      NVARCHAR(MAX) NULL,
        task_type        NVARCHAR(20) NOT NULL CONSTRAINT DF_pm_project_tasks_type DEFAULT 'Normal',
        start_date       DATE NULL,
        finish_date      DATE NULL,
        duration_days    DECIMAL(9,2) NULL,
        progress_percent DECIMAL(5,2) NOT NULL CONSTRAINT DF_pm_project_tasks_progress DEFAULT 0,
        status           NVARCHAR(20) NOT NULL CONSTRAINT DF_pm_project_tasks_status DEFAULT 'Not Started',
        priority         NVARCHAR(20) NOT NULL CONSTRAINT DF_pm_project_tasks_priority DEFAULT 'Medium',
        is_milestone     BIT NOT NULL CONSTRAINT DF_pm_project_tasks_is_milestone DEFAULT 0,
        es_date          DATE NULL,
        ef_date          DATE NULL,
        ls_date          DATE NULL,
        lf_date          DATE NULL,
        total_float_days DECIMAL(9,2) NULL,
        free_float_days  DECIMAL(9,2) NULL,
        is_critical      BIT NOT NULL CONSTRAINT DF_pm_project_tasks_is_critical DEFAULT 0,
        schedule_version INT NOT NULL CONSTRAINT DF_pm_project_tasks_schedule_version DEFAULT 0,
        notes            NVARCHAR(MAX) NULL,
        sort_order       INT NOT NULL CONSTRAINT DF_pm_project_tasks_sort_order DEFAULT 0,
        is_deleted       BIT NOT NULL CONSTRAINT DF_pm_project_tasks_is_deleted DEFAULT 0,
        created_at       DATETIME2 NOT NULL CONSTRAINT DF_pm_project_tasks_created_at DEFAULT SYSUTCDATETIME(),
        updated_at       DATETIME2 NOT NULL CONSTRAINT DF_pm_project_tasks_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_pm_project_tasks_project FOREIGN KEY (project_id)
            REFERENCES pm.projects (project_id) ON DELETE CASCADE,
        CONSTRAINT FK_pm_project_tasks_parent FOREIGN KEY (parent_task_id)
            REFERENCES pm.project_tasks (task_id),
        CONSTRAINT FK_pm_project_tasks_calendar FOREIGN KEY (calendar_id)
            REFERENCES pm.work_calendars (calendar_id),
        CONSTRAINT CK_pm_project_tasks_type CHECK (task_type IN ('Summary','Normal','Milestone')),
        CONSTRAINT CK_pm_project_tasks_progress CHECK (progress_percent BETWEEN 0 AND 100),
        CONSTRAINT CK_pm_project_tasks_status CHECK (status IN ('Not Started','In Progress','Completed','Blocked','Cancelled')),
        CONSTRAINT CK_pm_project_tasks_priority CHECK (priority IN ('Low','Medium','High','Critical')),
        CONSTRAINT CK_pm_project_tasks_no_self_parent CHECK (parent_task_id IS NULL OR parent_task_id <> task_id)
    );
END
GO
