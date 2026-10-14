IF OBJECT_ID('pm.task_evidence', 'U') IS NULL
BEGIN
    CREATE TABLE pm.task_evidence (
        evidence_id    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_pm_task_evidence PRIMARY KEY,
        task_id        INT NOT NULL,
        note           NVARCHAR(2000) NULL,
        file_name      NVARCHAR(255) NULL,
        stored_name    NVARCHAR(255) NULL,
        mime_type      NVARCHAR(150) NULL,
        size_bytes     BIGINT NULL,
        uploaded_by_nip NVARCHAR(50) NULL,
        created_at     DATETIME2 NOT NULL CONSTRAINT DF_pm_task_evidence_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_pm_task_evidence_task FOREIGN KEY (task_id)
            REFERENCES pm.project_tasks (task_id) ON DELETE CASCADE,
        CONSTRAINT CK_pm_task_evidence_has_content CHECK (note IS NOT NULL OR stored_name IS NOT NULL)
    );
END
GO

IF OBJECT_ID('pm.task_evidence', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pm_task_evidence_task')
BEGIN
    CREATE INDEX IX_pm_task_evidence_task ON pm.task_evidence (task_id, created_at DESC);
END
GO