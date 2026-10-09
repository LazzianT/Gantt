IF OBJECT_ID('pm.task_progress', 'U') IS NULL
BEGIN
    CREATE TABLE pm.task_progress (
        progress_id      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_pm_task_progress PRIMARY KEY,
        task_id          INT NOT NULL,
        report_date      DATE NOT NULL,
        progress_percent DECIMAL(5,2) NOT NULL,
        actual_start     DATE NULL,
        actual_finish    DATE NULL,
        note             NVARCHAR(500) NULL,
        reported_by_nip  NVARCHAR(50) NULL,
        created_at       DATETIME2 NOT NULL CONSTRAINT DF_pm_task_progress_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_pm_task_progress_task FOREIGN KEY (task_id)
            REFERENCES pm.project_tasks (task_id) ON DELETE CASCADE,
        CONSTRAINT CK_pm_task_progress_percent CHECK (progress_percent BETWEEN 0 AND 100)
    );
END
GO
