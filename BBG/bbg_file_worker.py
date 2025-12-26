"""
Bloomberg File-Based Worker
============================
This script reads jobs from a CSV file, fetches cashflows from Bloomberg,
and writes results to another CSV file.

No SQL connection required on Bloomberg machine!

Usage:
    python bbg_file_worker.py

Files used:
    - jobs.csv: Job queue (status: PENDING → RUNNING → COMPLETED/ERROR)
    - cashflows.csv: Fetched cashflow data
    - logs/: Worker log files

API Calls:
    - Uses BATCHED Bloomberg API calls (4 calls per job, not per instrument)
    - Call 1: Get currencies for all instruments (blp.bdp)
    - Call 2: Get bond characteristics - CoCo, callable, sinkable, yas_yld_flag (blp.bdp)
    - Call 3: Get cashflows for all instruments (blp.bds)
    - Call 4: Get FX rates for all unique currencies (blp.bdp)
"""

import os
import sys
import json
import logging
from logging.handlers import RotatingFileHandler
import pandas as pd
from datetime import datetime, date
from typing import Optional, List, Dict, Tuple
import time

# File locking for concurrent access
try:
    from filelock import FileLock, Timeout
    FILELOCK_AVAILABLE = True
except ImportError:
    FILELOCK_AVAILABLE = False
    print("WARNING: filelock not installed. Run: pip install filelock")

# Bloomberg API
try:
    from xbbg import blp
    BLOOMBERG_AVAILABLE = True
except ImportError:
    BLOOMBERG_AVAILABLE = False
    print("WARNING: xbbg not available. Running in test mode.")

# =============================================================================
# CONFIGURATION - UPDATE THESE PATHS
# =============================================================================

# Shared folder path (accessible by both web server and Bloomberg machine)
SHARED_FOLDER = r"\\moneda03\Compartidos\Inteligencia de Negocios y Mercados\BBG_Job_requests"

JOBS_FILE = os.path.join(SHARED_FOLDER, "jobs.csv")
CASHFLOWS_FILE = os.path.join(SHARED_FOLDER, "cashflows.csv")
LOGS_FOLDER = os.path.join(SHARED_FOLDER, "logs")

# Lock files for concurrent access
JOBS_LOCK_FILE = os.path.join(SHARED_FOLDER, "jobs.csv.lock")
CASHFLOWS_LOCK_FILE = os.path.join(SHARED_FOLDER, "cashflows.csv.lock")
LOCK_TIMEOUT = 30  # seconds to wait for lock

# Ensure logs folder exists
os.makedirs(LOGS_FOLDER, exist_ok=True)

# Logging setup with rotation
log_filename = os.path.join(LOGS_FOLDER, "worker.log")

# Create logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# File handler with rotation (10MB max, keep 5 backup files)
file_handler = RotatingFileHandler(
    log_filename,
    maxBytes=10*1024*1024,  # 10MB
    backupCount=5,
    encoding='utf-8'
)
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))

# Console handler
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))

# Add handlers
logger.addHandler(file_handler)
logger.addHandler(console_handler)


# =============================================================================
# RETRY LOGIC FOR API CALLS
# =============================================================================

def fetch_with_retry(func, *args, max_retries=3, delay=5, **kwargs):
    """
    Retry Bloomberg API call on failure.

    Args:
        func: The Bloomberg API function to call (e.g., blp.bdp, blp.bds)
        *args: Arguments to pass to the function
        max_retries: Maximum number of retry attempts (default: 3)
        delay: Delay in seconds between retries (default: 5, with exponential backoff)
        **kwargs: Keyword arguments to pass to the function

    Returns:
        The result of the function call

    Raises:
        Exception: If all retry attempts fail
    """
    last_exception = None
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            last_exception = e
            logger.warning(f"API call attempt {attempt + 1}/{max_retries} failed: {e}")
            if attempt < max_retries - 1:
                wait_time = delay * (attempt + 1)  # Exponential backoff
                logger.info(f"Waiting {wait_time}s before retry...")
                time.sleep(wait_time)

    logger.error(f"All {max_retries} attempts failed")
    raise last_exception


# =============================================================================
# CSV FILE OPERATIONS
# =============================================================================

def read_jobs() -> pd.DataFrame:
    """Read jobs from CSV file with file locking."""
    empty_df = pd.DataFrame(columns=[
        'job_id', 'instruments_json', 'report_date', 'status',
        'created_at', 'started_at', 'completed_at', 'error_message',
        'instruments_total', 'instruments_fetched', 'instruments_skipped', 'progress'
    ])
    if not os.path.exists(JOBS_FILE):
        return empty_df
    if os.path.getsize(JOBS_FILE) == 0:
        logger.debug("jobs.csv exists but is empty")
        return empty_df

    try:
        if FILELOCK_AVAILABLE:
            lock = FileLock(JOBS_LOCK_FILE, timeout=LOCK_TIMEOUT)
            with lock:
                df = pd.read_csv(JOBS_FILE)
        else:
            df = pd.read_csv(JOBS_FILE)
        logger.debug(f"Read {len(df)} jobs from CSV")
        return df
    except Timeout:
        logger.error(f"Timeout waiting for jobs.csv lock")
        return empty_df
    except Exception as e:
        logger.error(f"Error reading jobs.csv: {e}")
        return empty_df


def write_jobs(df: pd.DataFrame):
    """Write jobs to CSV file with file locking."""
    # Ensure job_id is written as integer, not float (e.g., 1 not 1.0)
    if 'job_id' in df.columns:
        df['job_id'] = df['job_id'].astype('Int64')  # Nullable integer type

    try:
        if FILELOCK_AVAILABLE:
            lock = FileLock(JOBS_LOCK_FILE, timeout=LOCK_TIMEOUT)
            with lock:
                df.to_csv(JOBS_FILE, index=False)
        else:
            df.to_csv(JOBS_FILE, index=False)
    except Timeout:
        logger.error(f"Timeout waiting for jobs.csv lock during write")
        raise
    except Exception as e:
        logger.error(f"Error writing jobs.csv: {e}")
        raise


def update_job(job_id: int, **kwargs):
    """Update a job in the CSV file."""
    df = read_jobs()
    for key, value in kwargs.items():
        if key in df.columns:
            df.loc[df['job_id'] == job_id, key] = value
    write_jobs(df)


def get_next_pending_job() -> Optional[Dict]:
    """Get the next PENDING job and mark it as RUNNING."""
    df = read_jobs()
    pending = df[df['status'] == 'PENDING']

    if len(pending) == 0:
        return None

    # Get first pending job
    job = pending.iloc[0].to_dict()
    job_id = job['job_id']

    # Mark as RUNNING
    df.loc[df['job_id'] == job_id, 'status'] = 'RUNNING'
    df.loc[df['job_id'] == job_id, 'started_at'] = datetime.now().isoformat()
    write_jobs(df)

    return job


def read_cashflows() -> pd.DataFrame:
    """Read existing cashflows from CSV file with file locking."""
    empty_df = pd.DataFrame(columns=[
        'pk2', 'isin', 'fecha', 'flujo_moneda_local', 'flujo_usd',
        'balance_sheet', 'moneda_local', 'yas_yld_flag', 'override',
        'source', 'job_id', 'fetched_at'
    ])
    if not os.path.exists(CASHFLOWS_FILE):
        return empty_df
    # Check if file is empty
    if os.path.getsize(CASHFLOWS_FILE) == 0:
        logger.debug("cashflows.csv exists but is empty")
        return empty_df
    try:
        if FILELOCK_AVAILABLE:
            lock = FileLock(CASHFLOWS_LOCK_FILE, timeout=LOCK_TIMEOUT)
            with lock:
                return pd.read_csv(CASHFLOWS_FILE)
        else:
            return pd.read_csv(CASHFLOWS_FILE)
    except Timeout:
        logger.error(f"Timeout waiting for cashflows.csv lock")
        return empty_df
    except pd.errors.EmptyDataError:
        logger.debug("cashflows.csv has no data")
        return empty_df
    except Exception as e:
        logger.warning(f"Error reading cashflows.csv: {e}")
        return empty_df


def append_cashflows(new_cashflows: List[Dict]):
    """Append new cashflows to CSV file, avoiding duplicates."""
    logger.info(f"append_cashflows called with {len(new_cashflows)} cashflows")
    logger.debug(f"CASHFLOWS_FILE path: {CASHFLOWS_FILE}")

    if not new_cashflows:
        return 0, 0

    existing = read_cashflows()
    logger.debug(f"Existing cashflows: {len(existing)}")
    new_df = pd.DataFrame(new_cashflows)
    logger.debug(f"New cashflows DataFrame shape: {new_df.shape}")

    # Check for duplicates (same pk2 + fecha)
    if len(existing) > 0:
        existing['key'] = existing['pk2'].astype(str) + '_' + existing['fecha'].astype(str)
        new_df['key'] = new_df['pk2'].astype(str) + '_' + new_df['fecha'].astype(str)

        duplicates = new_df['key'].isin(existing['key'])
        skipped = duplicates.sum()
        new_df = new_df[~duplicates]

        new_df = new_df.drop(columns=['key'])
        if 'key' in existing.columns:
            existing = existing.drop(columns=['key'])
    else:
        skipped = 0

    inserted = len(new_df)

    if inserted > 0:
        combined = pd.concat([existing, new_df], ignore_index=True)
        # Ensure job_id is written as integer, not float
        if 'job_id' in combined.columns:
            combined['job_id'] = combined['job_id'].astype('Int64')
        logger.info(f"Writing {len(combined)} total cashflows to {CASHFLOWS_FILE}")

        try:
            if FILELOCK_AVAILABLE:
                lock = FileLock(CASHFLOWS_LOCK_FILE, timeout=LOCK_TIMEOUT)
                with lock:
                    combined.to_csv(CASHFLOWS_FILE, index=False)
            else:
                combined.to_csv(CASHFLOWS_FILE, index=False)
            logger.info(f"Successfully wrote cashflows to file")
        except Timeout:
            logger.error(f"Timeout waiting for cashflows.csv lock during write")
            raise

    return inserted, skipped


def save_bond_characteristics(characteristics: List[Dict], job_id: int):
    """
    Save bond characteristics to bond_characteristics.csv in SHARED folder.

    Args:
        characteristics: List of dicts with pk2, isin, coco, callable, sinkable, yas_yld_flag
        job_id: Job ID for tracking
    """
    if not characteristics:
        logger.debug("No characteristics to save")
        return

    chars_file = os.path.join(SHARED_FOLDER, 'bond_characteristics.csv')
    chars_lock = os.path.join(SHARED_FOLDER, 'bond_characteristics.csv.lock')

    try:
        # Read existing data
        existing = pd.DataFrame()
        if os.path.exists(chars_file) and os.path.getsize(chars_file) > 0:
            try:
                if FILELOCK_AVAILABLE:
                    lock = FileLock(chars_lock, timeout=LOCK_TIMEOUT)
                    with lock:
                        existing = pd.read_csv(chars_file)
                else:
                    existing = pd.read_csv(chars_file)
            except Exception as e:
                logger.warning(f"Could not read existing characteristics: {e}")
                existing = pd.DataFrame()

        # Create new dataframe
        new_df = pd.DataFrame(characteristics)

        # Remove duplicates (keep newest by pk2)
        if len(existing) > 0 and 'pk2' in existing.columns:
            existing['key'] = existing['pk2'].astype(str)
            new_df['key'] = new_df['pk2'].astype(str)

            # Remove old entries for same pk2
            existing = existing[~existing['key'].isin(new_df['key'])]
            existing = existing.drop(columns=['key'])
            new_df = new_df.drop(columns=['key'])

        # Combine
        combined = pd.concat([existing, new_df], ignore_index=True)

        # Ensure job_id is written as integer
        if 'job_id' in combined.columns:
            combined['job_id'] = combined['job_id'].astype('Int64')

        # Write with file locking
        if FILELOCK_AVAILABLE:
            lock = FileLock(chars_lock, timeout=LOCK_TIMEOUT)
            with lock:
                combined.to_csv(chars_file, index=False)
        else:
            combined.to_csv(chars_file, index=False)

        logger.info(f"Saved {len(new_df)} bond characteristics to {chars_file}")

    except Timeout:
        logger.error("Timeout waiting for bond_characteristics.csv lock")
    except Exception as e:
        logger.error(f"Error saving bond characteristics: {e}")


# =============================================================================
# BLOOMBERG BATCH FUNCTIONS
# =============================================================================

def get_settlement_date_int(report_date) -> int:
    """Convert date to Bloomberg SETTLE_DT format (YYYYMMDD as integer)."""
    if isinstance(report_date, str):
        report_date = pd.to_datetime(report_date).date()
    return int(report_date.strftime('%Y%m%d'))


def fetch_currencies_batch(isins: List[str]) -> Dict[str, str]:
    """
    Fetch currencies for all instruments in ONE Bloomberg API call.

    Args:
        isins: List of ISINs

    Returns:
        Dict mapping ISIN -> currency code (e.g., 'USD', 'EUR')
    """
    result = {isin: 'USD' for isin in isins}  # Default to USD

    if not BLOOMBERG_AVAILABLE:
        logger.warning("Bloomberg not available, returning USD for all")
        return result

    if not isins:
        return result

    try:
        # Build list of Bloomberg tickers
        tickers = [f"{isin} Corp" for isin in isins]

        logger.info(f"Fetching currencies for {len(tickers)} instruments (1 API call)")
        df = fetch_with_retry(blp.bdp, tickers, "CRNCY")

        if df is not None and not df.empty:
            for ticker in df.index:
                # Extract ISIN from ticker (remove " Corp" suffix)
                isin = ticker.replace(" Corp", "")
                currency = df.loc[ticker, 'crncy'] if 'crncy' in df.columns else None
                if pd.notna(currency):
                    result[isin] = str(currency).strip()

        logger.info(f"Got currencies: {len([c for c in result.values() if c != 'USD'])} non-USD")

    except Exception as e:
        logger.error(f"Error fetching currencies batch: {e}")

    return result


def fetch_bond_characteristics_batch(isins: List[str]) -> Dict[str, Dict]:
    """
    Fetch bond characteristics in ONE Bloomberg API call (all instruments at once).

    Fields fetched:
    - CONTINGENT_CAPITAL_EVENT (CoCo)
    - CALLABLE
    - SINKABLE
    - YAS_YLD_FLAG (yield calculation type: YTM, YTC, YTS, etc.)

    The YAS_YLD_FLAG determines which cashflows to consider:
    - YTM (Yield to Maturity): All cashflows until final maturity
    - YTC (Yield to Call): Cashflows only until first call date
    - YTS (Yield to Sink): Cashflows considering sinking fund schedule
    - YTW (Yield to Worst): Minimum yield considering all scenarios

    Args:
        isins: List of ISINs

    Returns:
        Dict mapping ISIN -> {coco, callable, sinkable, yas_yld_flag}
    """
    # Default values for all instruments
    result = {isin: {
        'coco': False,
        'callable': False,
        'sinkable': False,
        'yas_yld_flag': 'Y'  # Default to standard yield calculation
    } for isin in isins}

    if not BLOOMBERG_AVAILABLE:
        logger.warning("Bloomberg not available, returning default characteristics")
        return result

    if not isins:
        return result

    try:
        # Build list of Bloomberg tickers
        tickers = [f"{isin} Corp" for isin in isins]

        logger.info(f"Fetching bond characteristics for {len(tickers)} instruments (1 API call)")

        # Fetch all 4 fields in one API call
        df = fetch_with_retry(blp.bdp, tickers, ["CONTINGENT_CAPITAL_EVENT", "CALLABLE", "SINKABLE", "YAS_YLD_FLAG"])

        if df is not None and not df.empty:
            for ticker in df.index:
                isin = ticker.replace(" Corp", "")

                # Parse each field safely
                chars = {}

                # CoCo - Contingent Convertible
                if 'contingent_capital_event' in df.columns:
                    val = df.loc[ticker, 'contingent_capital_event']
                    chars['coco'] = bool(val) if pd.notna(val) else False
                else:
                    chars['coco'] = False

                # Callable
                if 'callable' in df.columns:
                    val = df.loc[ticker, 'callable']
                    chars['callable'] = bool(val) if pd.notna(val) else False
                else:
                    chars['callable'] = False

                # Sinkable
                if 'sinkable' in df.columns:
                    val = df.loc[ticker, 'sinkable']
                    chars['sinkable'] = bool(val) if pd.notna(val) else False
                else:
                    chars['sinkable'] = False

                # YAS_YLD_FLAG - yield calculation type (YTM, YTC, YTS, YTW, etc.)
                # This determines which cashflows Bloomberg considers in DES_CASH_FLOW
                if 'yas_yld_flag' in df.columns:
                    val = df.loc[ticker, 'yas_yld_flag']
                    if pd.notna(val):
                        # Store the actual value (YTM, YTC, YTS, Y, N, etc.)
                        chars['yas_yld_flag'] = str(val).strip()
                    else:
                        chars['yas_yld_flag'] = 'Y'  # Default
                else:
                    chars['yas_yld_flag'] = 'Y'

                result[isin] = chars

        # Log summary of what we found
        callable_count = sum(1 for v in result.values() if v.get('callable'))
        sinkable_count = sum(1 for v in result.values() if v.get('sinkable'))
        coco_count = sum(1 for v in result.values() if v.get('coco'))
        yld_flags = set(v.get('yas_yld_flag', 'Y') for v in result.values())

        logger.info(f"Retrieved characteristics for {len(result)} instruments: "
                   f"{callable_count} callable, {sinkable_count} sinkable, {coco_count} CoCo, "
                   f"yield flags: {yld_flags}")

    except Exception as e:
        logger.error(f"Error fetching bond characteristics: {e}")

    return result


def fetch_cashflows_batch(isins: List[str], settle_date_int: int,
                          bond_chars: Optional[Dict[str, Dict]] = None) -> Dict[str, pd.DataFrame]:
    """
    Fetch cashflows for instruments, grouped by their YLD_FLAG type.

    The bond characteristics determine which cashflows Bloomberg returns:
    - YTM (Y): All cashflows until final maturity date
    - YTC: Cashflows only until first call date (for callable bonds)
    - YTS: Cashflows considering sinking fund schedule (for sinkable bonds)
    - YTW: Yield to worst - minimum yield scenario

    For CoCo bonds, we fetch all cashflows (they're reviewed manually).

    Args:
        isins: List of ISINs
        settle_date_int: Settlement date as YYYYMMDD integer
        bond_chars: Optional dict mapping ISIN -> {coco, callable, sinkable, yas_yld_flag}

    Returns:
        Dict mapping ISIN -> DataFrame of cashflows
    """
    result = {}

    if not BLOOMBERG_AVAILABLE:
        logger.warning("Bloomberg not available, returning mock data")
        # Return mock data for testing
        for isin in isins:
            result[isin] = pd.DataFrame({
                'payment_date': [datetime.now().date()],
                'coupon_amount': [50.0],
                'principal_amount': [0.0]
            })
        return result

    if not isins:
        return result

    try:
        # Group instruments by their YLD_FLAG value
        # This allows us to fetch appropriate cashflows for each bond type
        # YLD_FLAG values from Bloomberg YAS_YLD_FLAG field:
        #   - Y or YTM: Yield to Maturity (all cashflows until final maturity)
        #   - YTC: Yield to Call (cashflows until first call date)
        #   - YTS: Yield to Sink (cashflows considering sinking fund schedule)
        #   - YTW: Yield to Worst (minimum yield scenario)
        #   - N: No yield calculation
        flag_groups = {}
        for isin in isins:
            if bond_chars:
                yld_flag = bond_chars.get(isin, {}).get('yas_yld_flag', 'Y')
                # Normalize only obvious equivalents, pass through actual Bloomberg values
                if yld_flag in [None, '', True, False, 1, 0]:
                    yld_flag = 'Y'  # Default to YTM
                elif isinstance(yld_flag, str):
                    yld_flag = yld_flag.strip().upper()
                    # Map common variations
                    if yld_flag in ['YTM', 'YES', 'TRUE', '1']:
                        yld_flag = 'Y'
                    # Keep YTC, YTS, YTW, N as-is
                    elif yld_flag not in ['Y', 'N', 'YTC', 'YTS', 'YTW']:
                        logger.warning(f"Unknown YLD_FLAG '{yld_flag}' for {isin}, defaulting to 'Y'")
                        yld_flag = 'Y'
            else:
                yld_flag = 'Y'

            if yld_flag not in flag_groups:
                flag_groups[yld_flag] = []
            flag_groups[yld_flag].append(isin)

        # Log grouping
        for flag, group_isins in flag_groups.items():
            logger.info(f"YLD_FLAG '{flag}': {len(group_isins)} instruments")

        # Fetch cashflows for each group with appropriate YLD_FLAG
        # This may result in multiple API calls if there are different flag types
        for yld_flag, group_isins in flag_groups.items():
            tickers = [f"{isin} Corp" for isin in group_isins]

            logger.info(f"Fetching cashflows for {len(tickers)} instruments with YLD_FLAG='{yld_flag}'")
            df = fetch_with_retry(
                blp.bds,
                tickers,
                "DES_CASH_FLOW",
                SETTLE_DT=settle_date_int,
                YLD_FLAG=yld_flag,
                BQ_FACE_AMT=1000
            )

            if df is not None and not df.empty:
                # Process results - same logic as before
                if isinstance(df.index, pd.MultiIndex):
                    for ticker in df.index.get_level_values(0).unique():
                        isin = ticker.replace(" Corp", "")
                        result[isin] = df.loc[ticker].reset_index(drop=True)
                elif 'ticker' in df.columns:
                    for ticker in df['ticker'].unique():
                        isin = ticker.replace(" Corp", "")
                        result[isin] = df[df['ticker'] == ticker].reset_index(drop=True)
                else:
                    unique_tickers = df.index.unique()
                    for ticker in unique_tickers:
                        isin = str(ticker).replace(" Corp", "")
                        ticker_df = df.loc[df.index == ticker].reset_index(drop=True)
                        result[isin] = ticker_df

        logger.info(f"Got cashflows for {len(result)} instruments across {len(flag_groups)} YLD_FLAG groups")

        # Note: This approach may use more than 1 API call if instruments have different YLD_FLAGS
        # Typically most bonds use 'Y' so this stays within reasonable limits

    except Exception as e:
        logger.error(f"Error fetching cashflows batch: {e}")

    return result


def fetch_cashflows_batch_single(isins: List[str], settle_date_int: int,
                                  yld_flag: str = "Y") -> Dict[str, pd.DataFrame]:
    """
    Original single-batch cashflow fetch (for backwards compatibility).
    Uses a single YLD_FLAG for all instruments.
    """
    result = {}

    if not BLOOMBERG_AVAILABLE or not isins:
        return result

    try:
        tickers = [f"{isin} Corp" for isin in isins]

        logger.info(f"Fetching cashflows for {len(tickers)} instruments (1 API call)")
        df = fetch_with_retry(
            blp.bds,
            tickers,
            "DES_CASH_FLOW",
            SETTLE_DT=settle_date_int,
            YLD_FLAG=yld_flag,
            BQ_FACE_AMT=1000
        )

        if df is not None and not df.empty:
            # blp.bds returns a DataFrame with ticker as part of MultiIndex, column, or regular index
            # Group by ticker
            if isinstance(df.index, pd.MultiIndex):
                # MultiIndex case: first level is ticker
                for ticker in df.index.get_level_values(0).unique():
                    isin = ticker.replace(" Corp", "")
                    result[isin] = df.loc[ticker].reset_index(drop=True)
            elif 'ticker' in df.columns:
                # Column case
                for ticker in df['ticker'].unique():
                    isin = ticker.replace(" Corp", "")
                    result[isin] = df[df['ticker'] == ticker].reset_index(drop=True)
            else:
                # Ticker is in the regular index - group by index values
                logger.debug(f"DataFrame columns: {df.columns.tolist()}")
                logger.debug(f"DataFrame index type: {type(df.index)}")

                # Get unique tickers from index
                unique_tickers = df.index.unique()
                for ticker in unique_tickers:
                    isin = str(ticker).replace(" Corp", "")
                    # Select rows for this ticker and reset index
                    ticker_df = df.loc[df.index == ticker].reset_index(drop=True)
                    result[isin] = ticker_df

        logger.info(f"Got cashflows for {len(result)} instruments")

    except Exception as e:
        logger.error(f"Error fetching cashflows batch: {e}")

    return result


def fetch_fx_rates_batch(currencies: List[str], report_date) -> Dict[str, float]:
    """
    Fetch FX rates for all currencies in ONE Bloomberg API call.

    Args:
        currencies: List of currency codes (e.g., ['EUR', 'GBP'])
        report_date: The date for FX rates

    Returns:
        Dict mapping currency -> FX rate to USD
    """
    result = {curr: 1.0 for curr in currencies}  # Default to 1.0
    result['USD'] = 1.0  # USD is always 1.0

    if not BLOOMBERG_AVAILABLE:
        return result

    # Filter out USD and empty currencies
    non_usd = [c for c in currencies if c and c != 'USD']

    if not non_usd:
        return result

    try:
        if isinstance(report_date, str):
            report_date = pd.to_datetime(report_date).date()

        # Build list of Bloomberg tickers
        tickers = [f"{curr}USD Curncy" for curr in non_usd]

        logger.info(f"Fetching FX rates for {len(tickers)} currencies (1 API call)")
        df = fetch_with_retry(blp.bdp, tickers, "PX_LAST")

        if df is not None and not df.empty:
            for ticker in df.index:
                # Extract currency from ticker (e.g., "EURUSD Curncy" -> "EUR")
                curr = ticker.replace("USD Curncy", "").strip()
                rate = df.loc[ticker, 'px_last'] if 'px_last' in df.columns else None
                if pd.notna(rate) and rate > 0:
                    result[curr] = float(rate)

        logger.info(f"Got FX rates: {result}")

    except Exception as e:
        logger.error(f"Error fetching FX rates batch: {e}")

    return result


# =============================================================================
# MAIN WORKER LOGIC
# =============================================================================

def process_job(job: Dict) -> bool:
    """
    Process a single job using BATCHED Bloomberg API calls.

    Total API calls: 4 (regardless of number of instruments)
    1. Get currencies for all instruments
    2. Get bond characteristics (CoCo, callable, sinkable, yas_yld_flag)
    3. Get cashflows for all instruments (using characteristics)
    4. Get FX rates for all unique currencies
    """
    job_id = None
    try:
        # Handle numpy types from pandas
        job_id_raw = job['job_id']
        if hasattr(job_id_raw, 'item'):  # numpy type
            job_id = int(job_id_raw.item())
        else:
            job_id = int(float(str(job_id_raw)))  # Handle "1.0" string case
    except Exception as e:
        logger.error(f"Failed to parse job_id from {job}: {e}")
        return False

    report_date = job['report_date']
    instruments_json = job['instruments_json']

    logger.info(f"Processing job {job_id} for date {report_date}")
    logger.debug(f"Job data: {job}")

    # Parse instruments
    try:
        logger.debug(f"Raw instruments_json type: {type(instruments_json)}")
        logger.debug(f"Raw instruments_json value: {instruments_json[:200] if instruments_json else 'None'}...")
        instruments = json.loads(instruments_json)
        logger.info(f"Parsed {len(instruments)} instruments from JSON")
    except json.JSONDecodeError as e:
        error_msg = f"Invalid instruments JSON: {e}"
        logger.error(error_msg)
        update_job(job_id, status='ERROR', error_message=error_msg,
                   completed_at=datetime.now().isoformat())
        return False
    except Exception as e:
        error_msg = f"Error parsing instruments: {type(e).__name__}: {e}"
        logger.error(error_msg)
        update_job(job_id, status='ERROR', error_message=error_msg,
                   completed_at=datetime.now().isoformat())
        return False

    total_instruments = len(instruments)
    logger.info(f"Job has {total_instruments} instruments to process")

    # Build list of valid instruments
    valid_instruments = []
    isin_to_pk2 = {}
    isin_to_override = {}  # Track override flag per instrument
    for inst in instruments:
        pk2 = inst.get('pk2')
        isin = inst.get('isin')
        if pk2 and isin:
            valid_instruments.append(inst)
            isin_to_pk2[isin] = pk2
            # Extract override info: when override='True', use yas_yld_flag from form
            override_flag = str(inst.get('override', 'False')).lower() == 'true'
            yas_yld_flag = inst.get('yas_yld_flag')
            if override_flag and yas_yld_flag:
                isin_to_override[isin] = yas_yld_flag
                logger.info(f"Override enabled for {isin}: using yas_yld_flag='{yas_yld_flag}' from form")
        else:
            logger.warning(f"Skipping instrument with missing pk2/isin: {inst}")

    if not valid_instruments:
        error_msg = "No valid instruments found"
        logger.error(error_msg)
        update_job(job_id, status='ERROR', error_message=error_msg,
                   completed_at=datetime.now().isoformat())
        return False

    isins = list(isin_to_pk2.keys())
    settle_date_int = get_settlement_date_int(report_date)

    # =========================================================================
    # BATCH API CALL 1: Get currencies for all instruments
    # =========================================================================
    update_job(job_id, progress=f"Fetching currencies for {len(isins)} instruments...")
    currencies = fetch_currencies_batch(isins)

    # =========================================================================
    # BATCH API CALL 2: Get bond characteristics (CoCo, callable, sinkable, yas_yld_flag)
    # =========================================================================
    update_job(job_id, progress=f"Fetching bond characteristics for {len(isins)} instruments...")
    bond_chars = fetch_bond_characteristics_batch(isins)

    # Apply yas_yld_flag overrides from form
    # When override='True', use the user-provided yas_yld_flag instead of Bloomberg's
    for isin, override_yld_flag in isin_to_override.items():
        if isin in bond_chars:
            original = bond_chars[isin].get('yas_yld_flag', 'Y')
            bond_chars[isin]['yas_yld_flag'] = override_yld_flag
            bond_chars[isin]['override'] = True
            logger.info(f"Applied override for {isin}: yas_yld_flag '{original}' -> '{override_yld_flag}'")
        else:
            # Create entry if not exists
            bond_chars[isin] = {
                'coco': False,
                'callable': False,
                'sinkable': False,
                'yas_yld_flag': override_yld_flag,
                'override': True
            }

    # Save bond characteristics to CSV for comparison/analysis
    chars_to_save = []
    for isin, pk2 in isin_to_pk2.items():
        chars = bond_chars.get(isin, {})
        is_override = isin in isin_to_override
        chars_to_save.append({
            'pk2': pk2,
            'isin': isin,
            'coco': chars.get('coco', False),
            'callable': chars.get('callable', False),
            'sinkable': chars.get('sinkable', False),
            'yas_yld_flag': chars.get('yas_yld_flag', 'Y'),
            'override': 'True' if is_override else 'False',
            'job_id': job_id,
            'fetched_at': datetime.now().isoformat()
        })
    save_bond_characteristics(chars_to_save, job_id)

    # =========================================================================
    # BATCH API CALL 3: Get cashflows for all instruments
    # =========================================================================
    update_job(job_id, progress=f"Fetching cashflows for {len(isins)} instruments...")
    cashflows_by_isin = fetch_cashflows_batch(isins, settle_date_int, bond_chars)

    # =========================================================================
    # BATCH API CALL 4: Get FX rates for all unique currencies
    # =========================================================================
    unique_currencies = list(set(currencies.values()))
    update_job(job_id, progress=f"Fetching FX rates for {len(unique_currencies)} currencies...")
    fx_rates = fetch_fx_rates_batch(unique_currencies, report_date)

    # =========================================================================
    # Process results
    # =========================================================================
    update_job(job_id, progress="Processing cashflow data...")

    all_cashflows = []
    instruments_fetched = 0
    errors = []

    for isin, pk2 in isin_to_pk2.items():
        currency = currencies.get(isin, 'USD')
        fx_rate = fx_rates.get(currency, 1.0)

        # Get bond characteristics for this instrument (includes yas_yld_flag, override)
        chars = bond_chars.get(isin, {})
        yld_flag = chars.get('yas_yld_flag', 'Y')
        is_override = isin in isin_to_override

        cf_df = cashflows_by_isin.get(isin)
        logger.debug(f"Processing {isin}: cf_df type={type(cf_df)}, empty={cf_df is None or (hasattr(cf_df, 'empty') and cf_df.empty)}")

        if cf_df is None or cf_df.empty:
            errors.append(f"{pk2}: No cashflows returned")
            continue

        instruments_fetched += 1
        logger.debug(f"Cashflow DataFrame columns: {cf_df.columns.tolist()}")
        logger.debug(f"Cashflow DataFrame shape: {cf_df.shape}")

        for idx, row in cf_df.iterrows():
            try:
                logger.debug(f"Row {idx}: {dict(row)}")
                payment_date = pd.to_datetime(row['payment_date']).date()
                coupon = float(row.get('coupon_amount', 0) or 0)
                principal = float(row.get('principal_amount', 0) or 0)
                flujo_local = coupon + principal
                flujo_usd = flujo_local * fx_rate if currency != 'USD' else flujo_local

                all_cashflows.append({
                    'pk2': pk2,
                    'isin': isin,
                    'fecha': payment_date.isoformat(),
                    'flujo_moneda_local': flujo_local,
                    'flujo_usd': flujo_usd,
                    'balance_sheet': 'Asset',
                    'moneda_local': currency or 'USD',
                    'yas_yld_flag': yld_flag,
                    'override': 'True' if is_override else 'False',
                    'source': 'BBG',
                    'job_id': job_id,
                    'fetched_at': datetime.now().isoformat()
                })
            except Exception as e:
                logger.warning(f"Error processing cashflow row for {pk2}: {e}")

    # Write all cashflows at once
    logger.info(f"Total cashflows to write: {len(all_cashflows)}")
    if all_cashflows:
        try:
            inserted, skipped = append_cashflows(all_cashflows)
            logger.info(f"Wrote {inserted} cashflows to file, {skipped} duplicates skipped")
        except Exception as e:
            logger.error(f"Failed to write cashflows: {e}", exc_info=True)
            update_job(job_id, status='ERROR', error_message=f"Failed to write cashflows: {e}",
                       completed_at=datetime.now().isoformat())
            return False
    else:
        logger.warning("No cashflows to write!")

    # Final status
    if errors and instruments_fetched == 0:
        error_summary = "; ".join(errors[:5])
        if len(errors) > 5:
            error_summary += f" ... and {len(errors) - 5} more errors"
        update_job(job_id,
                   status='ERROR',
                   progress='Failed',
                   instruments_fetched=instruments_fetched,
                   instruments_skipped=0,
                   error_message=error_summary,
                   completed_at=datetime.now().isoformat())
        return False
    else:
        update_job(job_id,
                   status='COMPLETED',
                   progress=f'Completed: {len(all_cashflows)} cashflows from {instruments_fetched} instruments',
                   instruments_fetched=instruments_fetched,
                   instruments_skipped=0,
                   completed_at=datetime.now().isoformat())
        return True


def run_worker():
    """Main worker - processes all pending jobs."""
    logger.info("=" * 60)
    logger.info("Bloomberg File Worker Started (BATCH MODE)")
    logger.info(f"Bloomberg available: {BLOOMBERG_AVAILABLE}")
    logger.info(f"Shared folder: {SHARED_FOLDER}")
    logger.info("=" * 60)

    if not os.path.exists(SHARED_FOLDER):
        logger.error(f"Shared folder not found: {SHARED_FOLDER}")
        return False

    jobs_processed = 0
    jobs_failed = 0

    while True:
        job = get_next_pending_job()

        if job is None:
            logger.info("No more pending jobs")
            break

        # Get job_id for error handling
        try:
            job_id_raw = job['job_id']
            if hasattr(job_id_raw, 'item'):
                job_id = int(job_id_raw.item())
            else:
                job_id = int(float(str(job_id_raw)))
        except:
            job_id = None

        logger.info(f"Found job {job_id}")

        try:
            success = process_job(job)
            if success:
                jobs_processed += 1
            else:
                jobs_failed += 1
        except Exception as e:
            logger.error(f"Unhandled error processing job: {e}", exc_info=True)
            jobs_failed += 1
            # Mark job as ERROR so it doesn't stay RUNNING forever
            if job_id is not None:
                try:
                    update_job(job_id,
                               status='ERROR',
                               error_message=f"Unhandled error: {str(e)[:500]}",
                               completed_at=datetime.now().isoformat())
                    logger.info(f"Marked job {job_id} as ERROR")
                except Exception as e2:
                    logger.error(f"Failed to mark job as ERROR: {e2}")

    logger.info(f"Worker finished: {jobs_processed} processed, {jobs_failed} failed")
    return jobs_failed == 0


if __name__ == "__main__":
    success = run_worker()
    sys.exit(0 if success else 1)
