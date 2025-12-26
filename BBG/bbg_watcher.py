"""
Bloomberg Watcher
=================
Watches jobs.csv in shared folder - runs worker instantly when file changes.

Install: pip install watchdog
Run: python bbg_watcher.py
Deploy: Use NSSM to run as Windows service

Usage:
    nssm install BBGWatcher "C:\Python39\python.exe" "C:\BBG_Worker\bbg_watcher.py"
    nssm start BBGWatcher
"""

import time
import os
import sys
import subprocess
import signal
from datetime import datetime

# Graceful shutdown flag
shutdown_requested = False

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully."""
    global shutdown_requested
    signal_name = signal.Signals(signum).name if hasattr(signal, 'Signals') else str(signum)
    print(f"\n{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Received {signal_name}, shutting down gracefully...")
    shutdown_requested = True

# Register signal handlers
signal.signal(signal.SIGINT, signal_handler)   # Ctrl+C
signal.signal(signal.SIGTERM, signal_handler)  # Termination request

# Try to import watchdog
try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
except ImportError:
    print("ERROR: watchdog not installed. Run: pip install watchdog")
    sys.exit(1)

# =============================================================================
# CONFIGURATION
# =============================================================================

SHARED_FOLDER = r"\\moneda03\Compartidos\Inteligencia de Negocios y Mercados\BBG_Job_requests"
# Worker script is in the same shared folder
WORKER_SCRIPT = os.path.join(SHARED_FOLDER, "bbg_file_worker.py")
PYTHON_EXE = sys.executable

# Debounce settings
MIN_INTERVAL_SECONDS = 5  # Don't run more than once per 5 seconds


def log(message):
    """Print timestamped log message."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"{timestamp} | {message}")


def has_pending_jobs():
    """Check if jobs.csv has any PENDING jobs."""
    jobs_file = os.path.join(SHARED_FOLDER, "jobs.csv")
    jobs_lock = os.path.join(SHARED_FOLDER, "jobs.csv.lock")

    if not os.path.exists(jobs_file):
        return False

    try:
        # Use file locking if available
        if 'FileLock' in dir():
            from filelock import FileLock, Timeout
            lock = FileLock(jobs_lock, timeout=10)
            with lock:
                with open(jobs_file, 'r') as f:
                    content = f.read()
        else:
            with open(jobs_file, 'r') as f:
                content = f.read()

        # Simple check: look for PENDING in the status column
        lines = content.strip().split('\n')
        if len(lines) <= 1:
            return False
        for line in lines[1:]:  # Skip header
            if ',PENDING,' in line or line.endswith(',PENDING'):
                return True
        return False
    except Exception as e:
        # Silently return False on errors (file might be locked briefly)
        return False


class JobsFileHandler(FileSystemEventHandler):
    """Handles jobs.csv file changes."""

    def __init__(self):
        self.last_run = 0
        self.worker_running = False

    def check_and_run(self):
        """Check for pending jobs and run worker if needed."""
        if self.worker_running:
            return False

        if has_pending_jobs():
            log("Found pending jobs - starting worker...")
            self.run_worker()
            return True
        return False

    def on_modified(self, event):
        # Only react to jobs.csv
        if not event.src_path.endswith('jobs.csv'):
            return

        # Debounce - prevent multiple rapid triggers
        now = time.time()
        if now - self.last_run < MIN_INTERVAL_SECONDS:
            return

        # Don't start if worker is already running (silently skip to reduce log noise)
        if self.worker_running:
            return

        self.last_run = now

        # Actually check for pending jobs before running worker
        self.check_and_run()

    def run_worker(self):
        """Run the Bloomberg worker script."""
        if not os.path.exists(WORKER_SCRIPT):
            log(f"ERROR: Worker script not found: {WORKER_SCRIPT}")
            return

        self.worker_running = True
        try:
            log("Starting worker...")
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
                    # Log first 500 chars of stderr
                    log(f"Worker stderr: {result.stderr[:500]}")

        except subprocess.TimeoutExpired:
            log("Worker timed out after 30 minutes")
        except Exception as e:
            log(f"Error running worker: {e}")
        finally:
            self.worker_running = False


def main():
    """Main entry point."""
    log("=" * 60)
    log("Bloomberg Watcher Started")
    log(f"Watching: {SHARED_FOLDER}")
    log(f"Worker: {WORKER_SCRIPT}")
    log("=" * 60)

    # Verify paths exist
    if not os.path.exists(SHARED_FOLDER):
        log(f"ERROR: Shared folder not found: {SHARED_FOLDER}")
        log("Make sure the network path is accessible")
        sys.exit(1)

    if not os.path.exists(WORKER_SCRIPT):
        log(f"WARNING: Worker script not found: {WORKER_SCRIPT}")
        log("Worker will fail when triggered")

    # Set up file watcher
    event_handler = JobsFileHandler()
    observer = Observer()
    observer.schedule(event_handler, SHARED_FOLDER, recursive=False)
    observer.start()

    log("Watcher active - waiting for jobs.csv changes...")

    # Check for existing pending jobs on startup
    log("Checking for existing pending jobs...")
    if event_handler.check_and_run():
        log("Processed existing pending jobs on startup")
    else:
        log("No pending jobs found on startup")

    try:
        while not shutdown_requested:
            time.sleep(1)

        # Graceful shutdown - wait for any running worker to finish
        if event_handler.worker_running:
            log("Waiting for worker to finish current job...")
            # Wait up to 5 minutes for worker to finish
            timeout = 300
            waited = 0
            while event_handler.worker_running and waited < timeout:
                time.sleep(1)
                waited += 1
            if event_handler.worker_running:
                log("WARNING: Worker still running after timeout, forcing shutdown")

        log("Shutting down...")
        observer.stop()

    except KeyboardInterrupt:
        # Fallback for immediate Ctrl+C (shouldn't reach here normally)
        log("Shutting down...")
        observer.stop()

    observer.join()
    log("Watcher stopped")


if __name__ == "__main__":
    main()
