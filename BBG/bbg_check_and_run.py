"""
Bloomberg Queue Checker
=======================
This script runs every minute via Windows Scheduled Task.
It checks the jobs.csv file for PENDING jobs and runs the worker if found.

Usage:
    python bbg_check_and_run.py

This is a lightweight script that minimizes Bloomberg API usage by only
running the worker when there's actual work to do.
"""

import os
import sys
import subprocess
import pandas as pd
from datetime import datetime

# =============================================================================
# CONFIGURATION - UPDATE THESE PATHS
# =============================================================================

# Shared folder path (accessible by both web server and Bloomberg machine)
SHARED_FOLDER = r"\\moneda03\Compartidos\Inteligencia de Negocios y Mercados\BBG_Job_requests"

JOBS_FILE = os.path.join(SHARED_FOLDER, "jobs.csv")
LOCK_FILE = os.path.join(SHARED_FOLDER, "worker.lock")
LOG_FILE = os.path.join(SHARED_FOLDER, "checker.log")

# Worker script location (on Bloomberg machine)
WORKER_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bbg_file_worker.py")
PYTHON_EXE = sys.executable  # Use same Python that runs this script


def log(message: str):
    """Append message to log file."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"{timestamp} | {message}\n"
    print(log_line.strip())
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_line)
    except:
        pass


def is_worker_running() -> bool:
    """Check if worker is already running (lock file exists and is recent)."""
    if not os.path.exists(LOCK_FILE):
        return False

    # Check if lock file is stale (older than 30 minutes)
    try:
        mtime = os.path.getmtime(LOCK_FILE)
        age_minutes = (datetime.now().timestamp() - mtime) / 60
        if age_minutes > 30:
            log(f"Stale lock file found ({age_minutes:.1f} min old), removing")
            os.remove(LOCK_FILE)
            return False
        return True
    except:
        return False


def has_pending_jobs() -> bool:
    """Check if jobs.csv has any PENDING jobs."""
    if not os.path.exists(JOBS_FILE):
        return False

    try:
        df = pd.read_csv(JOBS_FILE)
        pending = df[df['status'] == 'PENDING']
        return len(pending) > 0
    except Exception as e:
        log(f"Error reading jobs file: {e}")
        return False


def run_worker():
    """Run the Bloomberg worker script."""
    log("Starting worker...")

    # Create lock file
    try:
        with open(LOCK_FILE, "w") as f:
            f.write(str(datetime.now()))
    except Exception as e:
        log(f"Could not create lock file: {e}")

    try:
        # Run worker script
        result = subprocess.run(
            [PYTHON_EXE, WORKER_SCRIPT],
            capture_output=True,
            text=True,
            timeout=1800  # 30 minute timeout
        )

        if result.returncode == 0:
            log("Worker completed successfully")
        else:
            log(f"Worker exited with code {result.returncode}")
            if result.stderr:
                log(f"Worker stderr: {result.stderr[:500]}")

    except subprocess.TimeoutExpired:
        log("Worker timed out after 30 minutes")
    except Exception as e:
        log(f"Error running worker: {e}")
    finally:
        # Remove lock file
        try:
            if os.path.exists(LOCK_FILE):
                os.remove(LOCK_FILE)
        except:
            pass


def main():
    """Main entry point."""
    # Check if shared folder exists
    if not os.path.exists(SHARED_FOLDER):
        log(f"Shared folder not found: {SHARED_FOLDER}")
        return

    # Check if worker is already running
    if is_worker_running():
        log("Worker already running, skipping")
        return

    # Check for pending jobs
    if not has_pending_jobs():
        # No pending jobs - exit silently (don't spam logs)
        return

    log("Found PENDING jobs, running worker")
    run_worker()


if __name__ == "__main__":
    main()
