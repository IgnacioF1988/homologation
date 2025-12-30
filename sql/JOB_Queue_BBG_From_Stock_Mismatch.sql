USE [msdb]
GO

-- ============================================================================
-- SQL Server Agent Job: Queue BBG From Stock Mismatch
-- Runs sp_Queue_BBG_From_Stock_Mismatch every 2 minutes
-- ============================================================================

-- Delete job if it already exists
IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'Queue_BBG_From_Stock_Mismatch')
BEGIN
    EXEC msdb.dbo.sp_delete_job @job_name = N'Queue_BBG_From_Stock_Mismatch', @delete_unused_schedule = 1;
    PRINT 'Deleted existing job Queue_BBG_From_Stock_Mismatch';
END
GO

-- Create the job
EXEC msdb.dbo.sp_add_job
    @job_name = N'Queue_BBG_From_Stock_Mismatch',
    @enabled = 1,
    @description = N'Scans stock.instrumentos for BBG instruments with mismatched cashflows and creates BBG jobs. Runs every 2 minutes.',
    @category_name = N'[Uncategorized (Local)]',
    @owner_login_name = N'sa';
GO

-- Add step to execute the stored procedure
EXEC msdb.dbo.sp_add_jobstep
    @job_name = N'Queue_BBG_From_Stock_Mismatch',
    @step_name = N'Execute sp_Queue_BBG_From_Stock_Mismatch',
    @step_id = 1,
    @subsystem = N'TSQL',
    @command = N'EXEC sandbox.sp_Queue_BBG_From_Stock_Mismatch;',
    @database_name = N'MonedaHomologacion',
    @on_success_action = 1,  -- Quit with success
    @on_fail_action = 2;     -- Quit with failure
GO

-- Create schedule: every 2 minutes
EXEC msdb.dbo.sp_add_schedule
    @schedule_name = N'Every_2_Minutes',
    @enabled = 1,
    @freq_type = 4,              -- Daily
    @freq_interval = 1,          -- Every 1 day
    @freq_subday_type = 4,       -- Minutes
    @freq_subday_interval = 2,   -- Every 2 minutes
    @active_start_time = 0;      -- Start at midnight (00:00:00)
GO

-- Attach schedule to job
EXEC msdb.dbo.sp_attach_schedule
    @job_name = N'Queue_BBG_From_Stock_Mismatch',
    @schedule_name = N'Every_2_Minutes';
GO

-- Add job to local server
EXEC msdb.dbo.sp_add_jobserver
    @job_name = N'Queue_BBG_From_Stock_Mismatch',
    @server_name = N'(local)';
GO

PRINT 'Job Queue_BBG_From_Stock_Mismatch created and scheduled to run every 2 minutes.';
PRINT 'To start immediately: EXEC msdb.dbo.sp_start_job @job_name = N''Queue_BBG_From_Stock_Mismatch'';';
GO
