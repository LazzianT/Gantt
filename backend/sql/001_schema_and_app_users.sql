-- Dedicated schema for the PM app. Users come from HRIS (dbo.hris_worker); HRIS is never modified or FK-referenced.
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'pm')
BEGIN
    EXEC('CREATE SCHEMA pm');
END
GO
