IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_projects_status' AND object_id = OBJECT_ID('pm.projects'))
BEGIN
    CREATE INDEX IX_projects_status ON pm.projects (status);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_projects_manager_nip' AND object_id = OBJECT_ID('pm.projects'))
BEGIN
    CREATE INDEX IX_projects_manager_nip ON pm.projects (manager_nip);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_members_nip' AND object_id = OBJECT_ID('pm.project_members'))
BEGIN
    CREATE INDEX IX_project_members_nip ON pm.project_members (employee_nip);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_tasks_project' AND object_id = OBJECT_ID('pm.project_tasks'))
BEGIN
    CREATE INDEX IX_project_tasks_project ON pm.project_tasks (project_id);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_tasks_parent' AND object_id = OBJECT_ID('pm.project_tasks'))
BEGIN
    CREATE INDEX IX_project_tasks_parent ON pm.project_tasks (parent_task_id);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_tasks_status' AND object_id = OBJECT_ID('pm.project_tasks'))
BEGIN
    CREATE INDEX IX_project_tasks_status ON pm.project_tasks (status);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_task_dependencies_project' AND object_id = OBJECT_ID('pm.task_dependencies'))
BEGIN
    CREATE INDEX IX_task_dependencies_project ON pm.task_dependencies (project_id);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_task_resources_task' AND object_id = OBJECT_ID('pm.task_resources'))
BEGIN
    CREATE INDEX IX_task_resources_task ON pm.task_resources (task_id);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_task_progress_task_date' AND object_id = OBJECT_ID('pm.task_progress'))
BEGIN
    CREATE INDEX IX_task_progress_task_date ON pm.task_progress (task_id, report_date);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_activity_logs_project_created' AND object_id = OBJECT_ID('pm.project_activity_logs'))
BEGIN
    CREATE INDEX IX_activity_logs_project_created ON pm.project_activity_logs (project_id, created_at);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_resources_project' AND object_id = OBJECT_ID('pm.project_resources'))
BEGIN
    CREATE INDEX IX_project_resources_project ON pm.project_resources (project_id);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_milestones_project' AND object_id = OBJECT_ID('pm.project_milestones'))
BEGIN
    CREATE INDEX IX_milestones_project ON pm.project_milestones (project_id);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_baselines_project' AND object_id = OBJECT_ID('pm.project_baselines'))
BEGIN
    CREATE INDEX IX_baselines_project ON pm.project_baselines (project_id);
END
GO
