USE [msdb]
GO

-- ============================================================================
-- SQL Server Agent Job: Queue BBG Equity From Stock
-- Runs sp_Queue_BBG_Equity_From_Stock every 2 minutes
-- ============================================================================

-- Delete job if it already exists
IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'Queue_BBG_Equity_From_Stock')
BEGIN
    EXEC msdb.dbo.sp_delete_job @job_name = N'Queue_BBG_Equity_From_Stock', @delete_unused_schedule = 1;
    PRINT 'Deleted existing job Queue_BBG_Equity_From_Stock';
END
GO

-- Create the job
EXEC msdb.dbo.sp_add_job
    @job_name = N'Queue_BBG_Equity_From_Stock',
    @enabled = 1,
    @description = N'Scans stock.instrumentos for Equity instruments with publicDataSource=BBG that need market cap data. Runs every 2 minutes.',
    @category_name = N'[Uncategorized (Local)]',
    @owner_login_name = N'sa';
GO

-- Add step to execute the stored procedure
EXEC msdb.dbo.sp_add_jobstep
    @job_name = N'Queue_BBG_Equity_From_Stock',
    @step_name = N'Execute sp_Queue_BBG_Equity_From_Stock',
    @step_id = 1,
    @subsystem = N'TSQL',
    @command = N'EXEC sandbox.sp_Queue_BBG_Equity_From_Stock;',
    @database_name = N'MonedaHomologacion',
    @on_success_action = 1,  -- Quit with success
    @on_fail_action = 2;     -- Quit with failure
GO

-- Create schedule: every 2 minutes
EXEC msdb.dbo.sp_add_schedule
    @schedule_name = N'Every_2_Minutes_Equity',
    @enabled = 1,
    @freq_type = 4,              -- Daily
    @freq_interval = 1,          -- Every 1 day
    @freq_subday_type = 4,       -- Minutes
    @freq_subday_interval = 2,   -- Every 2 minutes
    @active_start_time = 0;      -- Start at midnight (00:00:00)
GO

-- Attach schedule to job
EXEC msdb.dbo.sp_attach_schedule
    @job_name = N'Queue_BBG_Equity_From_Stock',
    @schedule_name = N'Every_2_Minutes_Equity';
GO

-- Add job to local server
EXEC msdb.dbo.sp_add_jobserver
    @job_name = N'Queue_BBG_Equity_From_Stock',
    @server_name = N'(local)';
GO

PRINT 'Job Queue_BBG_Equity_From_Stock created and scheduled to run every 2 minutes.';
PRINT 'To start immediately: EXEC msdb.dbo.sp_start_job @job_name = N''Queue_BBG_Equity_From_Stock'';';
GO
