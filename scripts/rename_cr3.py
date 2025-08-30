#!/usr/bin/env python3
"""
Script to rename .cr3/.CR3 files using datetime from EXIF data.
Usage: rename_cr3.py [directory] [--dry-run]
"""

import os
import sys
import argparse
from datetime import datetime
from pathlib import Path
import subprocess
import re
import hashlib
from tqdm import tqdm

def get_file_hash(file_path, chunk_size=8192):
    """
    Get a hash of the first few chunks of the file for deterministic ordering.
    This is faster than hashing the entire file and still provides good uniqueness.
    """
    hash_md5 = hashlib.md5()
    file_path = Path(file_path)
    try:
        with file_path.open('rb') as f:
            for _ in range(3):  # Read first 3 chunks (24KB)
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    except (IOError, OSError):
        # Fallback to file size and modification time if we can't read or stat the file
        try:
            stat = file_path.stat()
            return f"{stat.st_size}_{stat.st_mtime}"
        except OSError:
            # If the file can't be stat-ed (e.g., it was deleted), return a stable fallback
            return file_path.name

def get_exif_datetime(file_path):
    """
    Extract datetime from CR3 file using exiftool.
    Returns a string in the format YYYYmmdd_HHMMSS.
    """
    try:
        # Try DateTimeOriginal first
        result = subprocess.run([
            'exiftool', '-DateTimeOriginal', '-d', '%Y%m%d_%H%M%S', '-s3', str(file_path)
        ], capture_output=True, text=True, check=True)
        datetime_str = result.stdout.strip()
        if not datetime_str or datetime_str == '0000:00:00 00:00:00':
            # Fallback to CreateDate
            result = subprocess.run([
                'exiftool', '-CreateDate', '-d', '%Y%m%d_%H%M%S', '-s3', str(file_path)
            ], capture_output=True, text=True, check=True)
            datetime_str = result.stdout.strip()
            if not datetime_str or datetime_str == '0000:00:00 00:00:00':
                return None

        return datetime_str
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None

def rename_cr3_files(directory, dry_run=False):
    """Rename .cr3/.CR3 files in the specified directory."""
    directory = Path(directory)
    
    if not directory.exists():
        print(f"Error: Directory '{directory}' does not exist.")
        return
    
    # Find all .cr3 and .CR3 files
    cr3_files = list(directory.glob('*.cr3')) + list(directory.glob('*.CR3'))
    
    if not cr3_files:
        print(f"No .cr3/.CR3 files found in '{directory}'")
        return
    
    print(f"Found {len(cr3_files)} .cr3/.CR3 files")
    
    renamed_count = 0
    skipped_count = 0
    
    # Create progress bar
    with tqdm(total=len(cr3_files), desc="Processing files", unit="file") as pbar:
        for file_path in cr3_files:
            pbar.set_description(f"Processing {file_path.name}")
            
            # Get datetime from EXIF
            datetime_str = get_exif_datetime(file_path)
            
            if not datetime_str:
                pbar.write(f"⚠️  Could not extract datetime from {file_path.name}")
                skipped_count += 1
                pbar.update(1)
                continue
            
            # Get file hash for disambiguation
            file_hash = get_file_hash(file_path)
            hash_suffix = file_hash[:6]  # Use first 6 characters of hash
            
            # Create new filename with hash suffix
            new_filename = f"junr_{datetime_str}_{hash_suffix}.cr3"
            new_path = file_path.parent / new_filename
            
            # Check if target file already exists
            if new_path.exists():
                pbar.write(f"⚠️  Target file {new_filename} already exists, skipping")
                skipped_count += 1
                pbar.update(1)
                continue
            
            if dry_run:
                pbar.write(f"Would rename: {file_path.name} → {new_filename}")
            else:
                try:
                    file_path.rename(new_path)
                    pbar.write(f"✅ Renamed: {file_path.name} → {new_filename}")
                    renamed_count += 1
                except OSError as e:
                    pbar.write(f"❌ Error renaming {file_path.name}: {e}")
                    skipped_count += 1
            
            pbar.update(1)
    
    print(f"\nSummary:")
    print(f"  Renamed: {renamed_count}")
    print(f"  Skipped: {skipped_count}")
    if dry_run:
        print(f"  (Dry run - no files were actually renamed)")

def main():
    parser = argparse.ArgumentParser(
        description="Rename .cr3/.CR3 files using datetime from EXIF data",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  rename_cr3.py /path/to/photos
  rename_cr3.py . --dry-run
  rename_cr3.py /Volumes/photos-raw/raw/
        """
    )
    
    parser.add_argument(
        'directory',
        nargs='?',
        default='.',
        help='Directory containing .cr3/.CR3 files (default: current directory)'
    )
    
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be renamed without actually renaming files'
    )
    
    args = parser.parse_args()
    
    # Check if exiftool is available
    try:
        subprocess.run(['exiftool', '-ver'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("Error: exiftool is required but not found.")
        print("Install it with: brew install exiftool")
        sys.exit(1)
    
    rename_cr3_files(args.directory, args.dry_run)

if __name__ == '__main__':
    main()

