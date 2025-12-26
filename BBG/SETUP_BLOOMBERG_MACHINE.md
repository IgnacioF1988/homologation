# Bloomberg Machine Setup Guide

This guide explains how to set up the Bloomberg cashflow worker on the Bloomberg Terminal machine.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              SHARED FOLDER                               │
│    \\moneda03\Compartidos\Inteligencia de Negocios y Mercados\BBG_Job_requests
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │
│  │  jobs.csv   │  │cashflows.csv│  │   logs/     │                      │
│  │  (queue)    │  │  (results)  │  │ (worker     │                      │
│  │             │  │             │  │  logs)      │                      │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘                      │
│         │                │                                               │
└─────────┼────────────────┼───────────────────────────────────────────────┘
          │                │
    ┌─────┴─────┐    ┌─────┴─────┐
    │  Web App  │    │ Bloomberg │
    │  writes   │    │  Machine  │
    │  PENDING  │    │  reads &  │
    │  jobs     │    │  writes   │
    └───────────┘    └───────────┘
```

## Prerequisites

1. **Python 3.8+** installed on Bloomberg machine
2. **xbbg** library installed (`pip install xbbg`)
3. **Bloomberg Terminal** running and logged in
4. **Network access** to the shared folder

## Step 1: Install Python Dependencies

```powershell
pip install xbbg pandas filelock
```

## Step 2: Copy Scripts to Bloomberg Machine

Copy these files to a folder on the Bloomberg machine (e.g., `C:\BBG_Worker\`):

- `bbg_check_and_run.py` - Lightweight checker (runs every minute)
- `bbg_file_worker.py` - Actual worker that calls Bloomberg

## Step 3: Update Configuration

Edit both scripts and update the `SHARED_FOLDER` path:

```python
# In bbg_check_and_run.py and bbg_file_worker.py
SHARED_FOLDER = r"\\moneda03\Compartidos\Inteligencia de Negocios y Mercados\BBG_Job_requests"
```

## Step 4: Create Shared Folder Structure

On the shared folder, create the `logs` subfolder:

```
\\moneda03\Compartidos\Inteligencia de Negocios y Mercados\BBG_Job_requests\
├── jobs.csv        (will be created automatically)
├── cashflows.csv   (will be created automatically)
└── logs\           (create this folder)
```

## Step 5: Test the Scripts

First, test that the scripts can run:

```powershell
# Test the checker (should exit quietly if no pending jobs)
python C:\BBG_Worker\bbg_check_and_run.py

# Create a test job manually in jobs.csv:
# job_id,instruments_json,report_date,status,created_at,...
# 999,"[{""pk2"":""TEST"",""isin"":""US0378331005""}]",2024-12-19,PENDING,2024-12-19T12:00:00,...

# Then run the checker again - it should start the worker
python C:\BBG_Worker\bbg_check_and_run.py
```

## Step 6: Create Windows Scheduled Task

### Option A: Using Task Scheduler GUI

1. Open **Task Scheduler** (taskschd.msc)
2. Click **Create Task** (not Basic Task)
3. **General** tab:
   - Name: `BBG Cashflow Checker`
   - Run whether user is logged on or not
   - Run with highest privileges
4. **Triggers** tab:
   - New trigger: Daily, repeat every **1 minute** for a duration of **1 day**
5. **Actions** tab:
   - New action: Start a program
   - Program: `C:\Python39\python.exe` (or your Python path)
   - Arguments: `C:\BBG_Worker\bbg_check_and_run.py`
   - Start in: `C:\BBG_Worker`
6. **Conditions** tab:
   - Uncheck "Start only if on AC power"
7. **Settings** tab:
   - Allow task to be run on demand
   - If running longer than 1 hour, stop it
   - If task fails, restart every 5 minutes

### Option B: Using PowerShell

```powershell
# Run this as Administrator

$action = New-ScheduledTaskAction `
    -Execute "C:\Python39\python.exe" `
    -Argument "C:\BBG_Worker\bbg_check_and_run.py" `
    -WorkingDirectory "C:\BBG_Worker"

$trigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration (New-TimeSpan -Days 365)

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -RestartCount 3

Register-ScheduledTask `
    -TaskName "BBG Cashflow Checker" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -RunLevel Highest `
    -Description "Checks for Bloomberg cashflow requests every minute"
```

## Step 7: Web Server Sync Task

On the web server, set up a scheduled task to sync results from CSV to SQL:

```powershell
# Every 5 minutes, call the sync endpoint
curl -X POST http://localhost:3001/api/bloomberg/sync
```

Or add to cron/scheduled task:

```bash
*/5 * * * * curl -X POST http://localhost:3001/api/bloomberg/sync
```

## File Formats

### jobs.csv

```csv
job_id,instruments_json,report_date,status,created_at,started_at,completed_at,error_message,instruments_total,instruments_fetched,instruments_skipped,progress,created_by
1,"[{""pk2"":""ABC123"",""isin"":""US0378331005""}]",2024-12-19,PENDING,2024-12-19T10:00:00,,,,1,,,
```

### cashflows.csv

```csv
pk2,isin,fecha,flujo_moneda_local,flujo_usd,balance_sheet,moneda_local,source,job_id,fetched_at
ABC123,US0378331005,2025-01-15,1000.0,1000.0,100000.0,USD,BBG,1,2024-12-19T10:05:00
```

## Monitoring

### Check Logs

Worker logs are saved to:
```
\\moneda03\Compartidos\Inteligencia de Negocios y Mercados\BBG_Job_requests\logs\worker_YYYY-MM-DD_HH.MM.SS.log
```

Checker logs:
```
\\moneda03\Compartidos\Inteligencia de Negocios y Mercados\BBG_Job_requests\checker.log
```

### API Endpoints for Monitoring

```bash
# Check CSV file status
curl http://localhost:3001/api/bloomberg/csv-status

# Manually trigger sync
curl -X POST http://localhost:3001/api/bloomberg/sync

# Check SQL queue status
curl http://localhost:3001/api/bloomberg/summary
```

## Troubleshooting

### "xbbg not available"
- Make sure Bloomberg Terminal is running
- Make sure `xbbg` is installed: `pip install xbbg`

### "Cannot access shared folder"
- Check network connectivity
- Verify folder permissions
- Make sure the UNC path is correct

### "Worker already running"
- Check for stale lock file: `\\moneda03\Compartidos\Inteligencia de Negocios y Mercados\BBG_Job_requests\worker.lock`
- Delete it if the worker crashed

### Jobs stuck in PENDING
- Check `checker.log` for errors
- Verify the scheduled task is running
- Check if Bloomberg Terminal is logged in

### Cashflows not appearing in SQL
- Call the sync endpoint: `POST /api/bloomberg/sync`
- Check `cashflows.csv` exists and has data
- Check sync endpoint response for errors
