IF OBJECT_ID('pm.task_resources', 'U') IS NULL
BEGIN
    CREATE TABLE pm.task_resources (
        task_resource_id   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_pm_task_resources PRIMARY KEY,
        task_id            INT NOT NULL,
        resource_id        INT NOT NULL,
        allocation_percent DECIMAL(5,2) NOT NULL CONSTRAINT DF_pm_task_resources_allocation DEFAULT 100,
        planned_hours      DECIMAL(9,2) NULL,
        CONSTRAINT FK_pm_task_resources_task FOREIGN KEY (task_id)
            REFERENCES pm.project_tasks (task_id) ON DELETE CASCADE,
        CONSTRAINT FK_pm_task_resources_resource FOREIGN KEY (resource_id)
            REFERENCES pm.project_resources (resource_id),
        CONSTRAINT CK_pm_task_resources_allocation CHECK (allocation_percent BETWEEN 0 AND 100),
        CONSTRAINT UQ_pm_task_resources UNIQUE (task_id, resource_id)
    );
END
GO
