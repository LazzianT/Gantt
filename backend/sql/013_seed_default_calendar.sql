IF NOT EXISTS (SELECT 1 FROM pm.work_calendars WHERE is_default = 1)
BEGIN
    INSERT INTO pm.work_calendars (name, is_default)
    VALUES (N'Default', 1);
END
GO
IF NOT EXISTS (
    SELECT 1 FROM pm.calendar_working_days wd
    JOIN pm.work_calendars c ON c.calendar_id = wd.calendar_id
    WHERE c.is_default = 1
)
BEGIN
    INSERT INTO pm.calendar_working_days (calendar_id, day_of_week, is_working, hours_per_day)
    SELECT c.calendar_id, d.day_of_week,
           CASE WHEN d.day_of_week BETWEEN 1 AND 5 THEN 1 ELSE 0 END,
           8.00
    FROM pm.work_calendars c
    CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6)) AS d(day_of_week)
    WHERE c.is_default = 1;
END
GO
