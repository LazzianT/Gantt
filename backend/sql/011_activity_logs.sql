IF OBJECT_ID('pm.project_activity_logs', 'U') IS NULL
BEGIN
    CREATE TABLE pm.project_activity_logs (
        log_id      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_pm_project_activity_logs PRIMARY KEY,
        project_id  INT NOT NULL,
        entity_type NVARCHAR(50) NOT NULL,
        entity_id   INT NULL,
        action      NVARCHAR(50) NOT NULL,
        actor_nip   NVARCHAR(50) NULL,
        detail      NVARCHAR(MAX) NULL,
        created_at  DATETIME2 NOT NULL CONSTRAINT DF_pm_project_activity_logs_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_pm_project_activity_logs_project FOREIGN KEY (project_id)
            REFERENCES pm.projects (project_id) ON DELETE CASCADE
    );
END
GO
