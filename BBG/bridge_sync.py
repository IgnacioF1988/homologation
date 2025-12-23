"""
Bridge Sync Script
==================
Runs on INTERMEDIARY machine that has access to both:
- Local folder (accessible by web server)
- Shared folder (accessible by Bloomberg machine)

Syncs files bidirectionally:
- jobs.csv: local ↔ shared (bidirectional - new jobs AND status updates)
- cashflows.csv: shared → local (when Bloomberg finishes processing)
- bond_characteristics.csv: shared → local (bond characteristics for analysis)

Install: pip install watchdog filelock
Run: python bridge_sync.py
Deploy: Use NSSM to run as Windows service
"""

import time
import os
import sys
import shutil
import hashlib
from datetime import datetime

# File locking for concurrent access
try:
    from filelock import FileLock, Timeout
    FILELOCK_AVAILABLE = True
except ImportError:
    FILELOCK_AVAILABLE = False
    print("WARNING: filelock not installed. Run: pip install filelock")

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

LOCAL_FOLDER = r"C:\Users\dwielandt.PATRIA\Homologation-master\BBG"
SHARED_FOLDER = r"\\moneda03\Compartidos\Inteligencia de Negocios y Mercados\BBG_Job_requests"

MIN_INTERVAL_SECONDS = 2
LOCK_TIMEOUT = 30
POLL_INTERVAL_SECONDS = 5

# Lock files
LOCAL_JOBS_LOCK = os.path.join(LOCAL_FOLDER, 'jobs.csv.lock')
LOCAL_CASHFLOWS_LOCK = os.path.join(LOCAL_FOLDER, 'cashflows.csv.lock')
LOCAL_CHARS_LOCK = os.path.join(LOCAL_FOLDER, 'bond_characteristics.csv.lock')
SHARED_JOBS_LOCK = os.path.join(SHARED_FOLDER, 'jobs.csv.lock')
SHARED_CASHFLOWS_LOCK = os.path.join(SHARED_FOLDER, 'cashflows.csv.lock')
SHARED_CHARS_LOCK = os.path.join(SHARED_FOLDER, 'bond_characteristics.csv.lock')

# Track last written content hash to detect external changes
_last_written_hash = None
_syncing = False


def log(message):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"{timestamp} | {message}")


def get_hash(content):
    """Get MD5 hash of content."""
    if content is None:
        return None
    return hashlib.md5(content.encode('utf-8')).hexdigest()


def read_file_safe(filepath, lock_file=None):
    """Read file content with optional locking."""
    try:
        if not os.path.exists(filepath):
            return None
        if FILELOCK_AVAILABLE and lock_file:
            lock = FileLock(lock_file, timeout=LOCK_TIMEOUT)
            with lock:
                with open(filepath, 'r', encoding='utf-8') as f:
                    return f.read()
        else:
            with open(filepath, 'r', encoding='utf-8') as f:
                return f.read()
    except Exception as e:
        log(f"Error reading {filepath}: {e}")
        return None


def write_file_safe(filepath, content, lock_file=None):
    """Write file content with optional locking."""
    try:
        if FILELOCK_AVAILABLE and lock_file:
            lock = FileLock(lock_file, timeout=LOCK_TIMEOUT)
            with lock:
                with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
                    f.write(content)
        else:
            with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
                f.write(content)
        return True
    except Exception as e:
        log(f"Error writing {filepath}: {e}")
        return False


def normalize(content):
    """Normalize content for comparison."""
    if content is None:
        return None
    # Normalize line endings and strip
    return content.replace('\r\n', '\n').replace('\r', '\n').strip()


def parse_jobs_csv(content):
    """Parse jobs.csv content into a dict keyed by job_id."""
    if not content:
        return {}, None
    lines = normalize(content).split('\n')
    if not lines:
        return {}, None
    header = lines[0]
    jobs = {}
    for line in lines[1:]:
        if not line.strip():
            continue
        parts = line.split(',', 1)
        if parts:
            job_id = parts[0].strip()
            jobs[job_id] = line
    return jobs, header


def get_status(job_line):
    """Extract status from a job CSV line."""
    # Status is the 4th field (index 3): job_id, instruments_json, report_date, status, ...
    # But instruments_json might contain commas, so we need to be careful
    # The status field should be one of: PENDING, RUNNING, COMPLETED, ERROR
    for status in ['COMPLETED', 'RUNNING', 'ERROR', 'PENDING']:
        if f',{status},' in job_line or job_line.endswith(f',{status}'):
            return status
    return 'UNKNOWN'


def merge_jobs(local_content, shared_content):
    """
    Merge jobs.csv from both locations.

    Rules:
    - If both have job: use SHARED version (Bloomberg is authority)
    - If only LOCAL has job: include (new job from backend)
    - If only SHARED has job:
      - COMPLETED: don't include (was removed by backend after SQL update)
      - Other status: include (sync to LOCAL)
    """
    local_jobs, local_header = parse_jobs_csv(local_content)
    shared_jobs, shared_header = parse_jobs_csv(shared_content)

    header = local_header or shared_header
    if not header:
        return None

    merged = {}
    all_job_ids = set(local_jobs.keys()) | set(shared_jobs.keys())

    for job_id in all_job_ids:
        local_job = local_jobs.get(job_id)
        shared_job = shared_jobs.get(job_id)

        if shared_job:
            status = get_status(shared_job)
            if status == 'COMPLETED' and not local_job:
                # COMPLETED and removed from LOCAL, don't include
                # This propagates the removal to SHARED
                continue
            else:
                # SHARED has job, use SHARED version (Bloomberg is authority)
                merged[job_id] = shared_job
        else:
            # Only LOCAL has it (new job from backend)
            merged[job_id] = local_job

    lines = [header]
    for job_id in sorted(merged.keys(), key=lambda x: int(x) if x.isdigit() else 0):
        lines.append(merged[job_id])

    return '\n'.join(lines) + '\n'


def sync_jobs_csv():
    """
    Sync jobs.csv between LOCAL and SHARED.
    - Reads both files
    - If content is identical (normalized), do nothing
    - If different, merge and write SAME content to BOTH
    """
    global _last_written_hash, _syncing

    if _syncing:
        return

    _syncing = True
    try:
        local_path = os.path.join(LOCAL_FOLDER, 'jobs.csv')
        shared_path = os.path.join(SHARED_FOLDER, 'jobs.csv')

        # Read both files
        local_content = read_file_safe(local_path, LOCAL_JOBS_LOCK)
        shared_content = read_file_safe(shared_path, SHARED_JOBS_LOCK)

        if not local_content and not shared_content:
            return

        # Normalize for comparison
        local_norm = normalize(local_content)
        shared_norm = normalize(shared_content)

        # If both are identical, nothing to do
        if local_norm == shared_norm:
            # Update hash so we know this is our content
            if local_content:
                _last_written_hash = get_hash(normalize(local_content))
            return

        # Check if change is from us or external
        current_local_hash = get_hash(local_norm) if local_norm else None
        current_shared_hash = get_hash(shared_norm) if shared_norm else None

        # If both match what we last wrote, skip (shouldn't happen if they're equal)
        if _last_written_hash and current_local_hash == _last_written_hash and current_shared_hash == _last_written_hash:
            return

        # Content differs - merge and write to BOTH
        log("Content differs between LOCAL and SHARED, merging...")
        merged = merge_jobs(local_content, shared_content)
        if not merged:
            return

        merged_norm = normalize(merged)
        merged_hash = get_hash(merged_norm)

        # Write to both locations with identical content
        wrote_local = False
        wrote_shared = False

        if local_norm != merged_norm:
            if write_file_safe(local_path, merged, LOCAL_JOBS_LOCK):
                log("[SYNC] Updated LOCAL jobs.csv")
                wrote_local = True

        if shared_norm != merged_norm:
            if write_file_safe(shared_path, merged, SHARED_JOBS_LOCK):
                log("[SYNC] Updated SHARED jobs.csv")
                wrote_shared = True

        if wrote_local or wrote_shared:
            _last_written_hash = merged_hash

    finally:
        _syncing = False


def sync_cashflows():
    """Sync cashflows.csv from SHARED to LOCAL."""
    src = os.path.join(SHARED_FOLDER, 'cashflows.csv')
    dst = os.path.join(LOCAL_FOLDER, 'cashflows.csv')

    if not os.path.exists(src):
        return

    src_content = read_file_safe(src, SHARED_CASHFLOWS_LOCK)
    dst_content = read_file_safe(dst, LOCAL_CASHFLOWS_LOCK)

    if normalize(src_content) != normalize(dst_content):
        log("[SYNC] Copying cashflows.csv SHARED → LOCAL...")
        if FILELOCK_AVAILABLE:
            src_lock = FileLock(SHARED_CASHFLOWS_LOCK, timeout=LOCK_TIMEOUT)
            dst_lock = FileLock(LOCAL_CASHFLOWS_LOCK, timeout=LOCK_TIMEOUT)
            with src_lock:
                with dst_lock:
                    shutil.copy2(src, dst)
        else:
            shutil.copy2(src, dst)
        log("[SYNC] cashflows.csv copied")


def sync_bond_characteristics():
    """Sync bond_characteristics.csv from SHARED to LOCAL."""
    src = os.path.join(SHARED_FOLDER, 'bond_characteristics.csv')
    dst = os.path.join(LOCAL_FOLDER, 'bond_characteristics.csv')

    if not os.path.exists(src):
        return

    src_content = read_file_safe(src, SHARED_CHARS_LOCK)
    dst_content = read_file_safe(dst, LOCAL_CHARS_LOCK)

    if normalize(src_content) != normalize(dst_content):
        log("[SYNC] Copying bond_characteristics.csv SHARED → LOCAL...")
        if FILELOCK_AVAILABLE:
            src_lock = FileLock(SHARED_CHARS_LOCK, timeout=LOCK_TIMEOUT)
            dst_lock = FileLock(LOCAL_CHARS_LOCK, timeout=LOCK_TIMEOUT)
            with src_lock:
                with dst_lock:
                    shutil.copy2(src, dst)
        else:
            shutil.copy2(src, dst)
        log("[SYNC] bond_characteristics.csv copied")


class FileChangeHandler(FileSystemEventHandler):
    """Handles file changes in both folders."""

    def __init__(self):
        self.last_jobs_sync = 0
        self.last_cashflows_sync = 0
        self.last_chars_sync = 0

    def on_modified(self, event):
        global _syncing
        if _syncing:
            return

        filename = os.path.basename(event.src_path)
        now = time.time()

        if filename == 'jobs.csv':
            if now - self.last_jobs_sync < MIN_INTERVAL_SECONDS:
                return
            self.last_jobs_sync = now
            log(f"[WATCH] jobs.csv changed, syncing...")
            sync_jobs_csv()

        elif filename == 'cashflows.csv' and SHARED_FOLDER in event.src_path:
            if now - self.last_cashflows_sync < MIN_INTERVAL_SECONDS:
                return
            self.last_cashflows_sync = now
            log(f"[WATCH] cashflows.csv changed, syncing...")
            sync_cashflows()

        elif filename == 'bond_characteristics.csv' and SHARED_FOLDER in event.src_path:
            if now - self.last_chars_sync < MIN_INTERVAL_SECONDS:
                return
            self.last_chars_sync = now
            log(f"[WATCH] bond_characteristics.csv changed, syncing...")
            sync_bond_characteristics()

    def on_created(self, event):
        self.on_modified(event)


def periodic_sync():
    """Periodic sync for reliability."""
    sync_jobs_csv()
    sync_cashflows()
    sync_bond_characteristics()


def main():
    log("=" * 60)
    log("Bridge Sync Started")
    log(f"Local: {LOCAL_FOLDER}")
    log(f"Shared: {SHARED_FOLDER}")
    log(f"Poll interval: {POLL_INTERVAL_SECONDS}s")
    log("=" * 60)

    os.makedirs(LOCAL_FOLDER, exist_ok=True)

    if not os.path.exists(SHARED_FOLDER):
        log(f"ERROR: Shared folder not found: {SHARED_FOLDER}")
        sys.exit(1)

    handler = FileChangeHandler()
    observer = Observer()
    observer.schedule(handler, LOCAL_FOLDER, recursive=False)
    observer.schedule(handler, SHARED_FOLDER, recursive=False)
    observer.start()

    log("Running initial sync...")
    periodic_sync()
    log("Watching for changes...")

    try:
        poll_counter = 0
        while True:
            time.sleep(1)
            poll_counter += 1
            if poll_counter >= POLL_INTERVAL_SECONDS:
                poll_counter = 0
                periodic_sync()
    except KeyboardInterrupt:
        log("Shutting down...")
        observer.stop()

    observer.join()
    log("Stopped")


if __name__ == "__main__":
    main()
