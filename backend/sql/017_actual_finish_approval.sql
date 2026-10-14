-- Manager approval for the as-built finish date a PIC submits from My Tasks.
-- A PIC check-off sets status Completed immediately (see requirement), but the date stays
-- provisional until a manager records a decision.
IF COL_LENGTH('pm.project_tasks', 'actual_finish_status') IS NULL
BEGIN
    ALTER TABLE pm.project_tasks ADD actual_finish_status NVARCHAR(20) NULL;
    ALTER TABLE pm.project_tasks ADD actual_finish_submitted_by NVARCHAR(50) NULL;
    ALTER TABLE pm.project_tasks ADD actual_finish_submitted_at DATETIME2 NULL;
    ALTER TABLE pm.project_tasks ADD actual_finish_reviewed_by NVARCHAR(50) NULL;
    ALTER TABLE pm.project_tasks ADD actual_finish_reviewed_at DATETIME2 NULL;
    ALTER TABLE pm.project_tasks ADD actual_finish_comment NVARCHAR(500) NULL;
END
GO

IF OBJECT_ID('pm.project_tasks', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_project_tasks_actual_finish_status')
BEGIN
    ALTER TABLE pm.project_tasks ADD CONSTRAINT CK_pm_project_tasks_actual_finish_status
        CHECK (actual_finish_status IS NULL OR actual_finish_status IN ('Pending','Approved','Rejected'));
END
GO

IF OBJECT_ID('pm.project_tasks', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pm_project_tasks_finish_review')
BEGIN
    CREATE INDEX IX_pm_project_tasks_finish_review ON pm.project_tasks (project_id, actual_finish_status)
        INCLUDE (name, pic_nip, pic_name, finish_date, actual_finish, actual_finish_submitted_by, actual_finish_submitted_at)
        WHERE actual_finish_status IS NOT NULL AND is_deleted = 0;
END
GO