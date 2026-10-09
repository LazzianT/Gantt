IF COL_LENGTH('pm.project_tasks', 'pic_nip') IS NULL
BEGIN
    ALTER TABLE pm.project_tasks ADD pic_nip NVARCHAR(50) NULL;
END
GO
IF COL_LENGTH('pm.project_tasks', 'pic_name') IS NULL
BEGIN
    ALTER TABLE pm.project_tasks ADD pic_name NVARCHAR(200) NULL;
END
GO
