IF OBJECT_ID('pm.project_milestones', 'U') IS NULL
BEGIN
    CREATE TABLE pm.project_milestones (
        milestone_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_pm_project_milestones PRIMARY KEY,
        project_id   INT NOT NULL,
        task_id      INT NULL,
        name         NVARCHAR(200) NOT NULL,
        due_date     DATE NULL,
        status       NVARCHAR(20) NOT NULL CONSTRAINT DF_pm_project_milestones_status DEFAULT 'Not Started',
        created_at   DATETIME2 NOT NULL CONSTRAINT DF_pm_project_milestones_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_pm_project_milestones_project FOREIGN KEY (project_id)
            REFERENCES pm.projects (project_id) ON DELETE CASCADE,
        CONSTRAINT FK_pm_project_milestones_task FOREIGN KEY (task_id)
            REFERENCES pm.project_tasks (task_id),
        CONSTRAINT CK_pm_project_milestones_status CHECK (status IN ('Not Started','In Progress','Completed','Missed'))
    );
END
GO
