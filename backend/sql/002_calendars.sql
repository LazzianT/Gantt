IF OBJECT_ID('pm.work_calendars', 'U') IS NULL
BEGIN
    CREATE TABLE pm.work_calendars (
        calendar_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_pm_work_calendars PRIMARY KEY,
        name        NVARCHAR(100) NOT NULL,
        is_default  BIT NOT NULL CONSTRAINT DF_pm_work_calendars_is_default DEFAULT 0,
        created_at  DATETIME2 NOT NULL CONSTRAINT DF_pm_work_calendars_created_at DEFAULT SYSUTCDATETIME(),
        updated_at  DATETIME2 NOT NULL CONSTRAINT DF_pm_work_calendars_updated_at DEFAULT SYSUTCDATETIME()
    );
END
GO
IF OBJECT_ID('pm.calendar_working_days', 'U') IS NULL
BEGIN
    CREATE TABLE pm.calendar_working_days (
        working_day_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_pm_calendar_working_days PRIMARY KEY,
        calendar_id    INT NOT NULL,
        day_of_week    TINYINT NOT NULL,
        is_working     BIT NOT NULL CONSTRAINT DF_pm_calendar_working_days_is_working DEFAULT 1,
        hours_per_day  DECIMAL(4,2) NOT NULL CONSTRAINT DF_pm_calendar_working_days_hours DEFAULT 8.00,
        CONSTRAINT FK_pm_calendar_working_days_calendar FOREIGN KEY (calendar_id)
            REFERENCES pm.work_calendars (calendar_id) ON DELETE CASCADE,
        CONSTRAINT CK_pm_calendar_working_days_dow CHECK (day_of_week BETWEEN 0 AND 6),
        CONSTRAINT UQ_pm_calendar_working_days UNIQUE (calendar_id, day_of_week)
    );
END
GO
IF OBJECT_ID('pm.calendar_exceptions', 'U') IS NULL
BEGIN
    CREATE TABLE pm.calendar_exceptions (
        exception_id   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_pm_calendar_exceptions PRIMARY KEY,
        calendar_id    INT NOT NULL,
        exception_date DATE NOT NULL,
        is_working     BIT NOT NULL,
        note           NVARCHAR(200) NULL,
        CONSTRAINT FK_pm_calendar_exceptions_calendar FOREIGN KEY (calendar_id)
            REFERENCES pm.work_calendars (calendar_id) ON DELETE CASCADE,
        CONSTRAINT UQ_pm_calendar_exceptions UNIQUE (calendar_id, exception_date)
    );
END
GO
