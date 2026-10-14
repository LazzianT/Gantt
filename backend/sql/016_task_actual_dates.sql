-- Actual (as-built) dates on the task itself. progress.repository.ts has always read and
-- written these columns, but no migration created them; My Tasks now also stamps actual_finish.
IF COL_LENGTH('pm.project_tasks', 'actual_start') IS NULL
BEGIN
    ALTER TABLE pm.project_tasks ADD actual_start DATE NULL;
END
GO

IF COL_LENGTH('pm.project_tasks', 'actual_finish') IS NULL
BEGIN
    ALTER TABLE pm.project_tasks ADD actual_finish DATE NULL;
END
GO