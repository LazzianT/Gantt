IF OBJECT_ID('pm.project_resources', 'U') IS NULL
BEGIN
    CREATE TABLE pm.project_resources (
        resource_id     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_pm_project_resources PRIMARY KEY,
        project_id      INT NOT NULL,
        employee_nip    NVARCHAR(50) NULL,
        employee_name   NVARCHAR(200) NULL,
        department_name NVARCHAR(200) NULL,
        position_name   NVARCHAR(200) NULL,
        email           NVARCHAR(200) NULL,
        snapshot_at     DATETIME2 NULL,
        resource_name   NVARCHAR(200) NOT NULL,
        resource_type   NVARCHAR(20) NOT NULL,
        unit            NVARCHAR(50) NULL,
        max_units       DECIMAL(9,2) NOT NULL CONSTRAINT DF_pm_project_resources_max_units DEFAULT 1,
        is_deleted      BIT NOT NULL CONSTRAINT DF_pm_project_resources_is_deleted DEFAULT 0,
        CONSTRAINT FK_pm_project_resources_project FOREIGN KEY (project_id)
            REFERENCES pm.projects (project_id) ON DELETE CASCADE,
        CONSTRAINT CK_pm_project_resources_type CHECK (resource_type IN ('Employee','Equipment'))
    );
END
GO
