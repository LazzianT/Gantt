IF OBJECT_ID('pm.projects', 'U') IS NULL
BEGIN
    CREATE TABLE pm.projects (
        project_id       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_pm_projects PRIMARY KEY,
        code             NVARCHAR(50) NOT NULL,
        name             NVARCHAR(200) NOT NULL,
        description      NVARCHAR(MAX) NULL,
        manager_nip      NVARCHAR(50) NULL,
        manager_name     NVARCHAR(200) NULL,
        start_date       DATE NULL,
        target_end_date  DATE NULL,
        priority         NVARCHAR(20) NOT NULL CONSTRAINT DF_pm_projects_priority DEFAULT 'Medium',
        status           NVARCHAR(20) NOT NULL CONSTRAINT DF_pm_projects_status DEFAULT 'Planning',
        health           NVARCHAR(20) NOT NULL CONSTRAINT DF_pm_projects_health DEFAULT 'On Track',
        calendar_id      INT NULL,
        schedule_version INT NOT NULL CONSTRAINT DF_pm_projects_schedule_version DEFAULT 0,
        is_deleted       BIT NOT NULL CONSTRAINT DF_pm_projects_is_deleted DEFAULT 0,
        created_at       DATETIME2 NOT NULL CONSTRAINT DF_pm_projects_created_at DEFAULT SYSUTCDATETIME(),
        updated_at       DATETIME2 NOT NULL CONSTRAINT DF_pm_projects_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_pm_projects_code UNIQUE (code),
        CONSTRAINT CK_pm_projects_priority CHECK (priority IN ('Low','Medium','High','Critical')),
        CONSTRAINT CK_pm_projects_status CHECK (status IN ('Planning','Active','On Hold','Completed','Cancelled')),
        CONSTRAINT CK_pm_projects_health CHECK (health IN ('On Track','At Risk','Delayed','Critical')),
        CONSTRAINT FK_pm_projects_calendar FOREIGN KEY (calendar_id)
            REFERENCES pm.work_calendars (calendar_id)
    );
END
GO
IF OBJECT_ID('pm.project_members', 'U') IS NULL
BEGIN
    CREATE TABLE pm.project_members (
        member_id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_pm_project_members PRIMARY KEY,
        project_id         INT NOT NULL,
        employee_nip       NVARCHAR(50) NOT NULL,
        employee_name      NVARCHAR(200) NOT NULL,
        role               NVARCHAR(100) NULL,
        allocation_percent DECIMAL(5,2) NOT NULL CONSTRAINT DF_pm_project_members_allocation DEFAULT 100,
        joined_at          DATETIME2 NOT NULL CONSTRAINT DF_pm_project_members_joined_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_pm_project_members_project FOREIGN KEY (project_id)
            REFERENCES pm.projects (project_id) ON DELETE CASCADE,
        CONSTRAINT UQ_pm_project_members UNIQUE (project_id, employee_nip)
    );
END
GO
