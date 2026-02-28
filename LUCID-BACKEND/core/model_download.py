#!/usr/bin/env python3
"""
📥 Model Download System - GGUF file downloader
Downloads GGUF model files from HuggingFace with progress tracking and resume capability
"""
import requests
import os
import sys
from pathlib import Path
from typing import Optional, Callable
from tqdm import tqdm


def download_gguf_model(
    url: str,
    output_path: Path,
    progress_callback: Optional[Callable[[int, int], None]] = None,
    chunk_size: int = 8192,
    max_retries: int = None
) -> bool:
    """
    Download a GGUF model file from HuggingFace with progress tracking and unlimited auto-retry.
    
    Args:
        url: HuggingFace download URL
        output_path: Path to save the downloaded file
        progress_callback: Optional callback(downloaded_bytes, total_bytes)
        chunk_size: Download chunk size in bytes (default 8KB)
        max_retries: Not used (kept for compatibility) - retries are unlimited
    
    Returns:
        True if successful, False otherwise
    """
    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    retry_count = 0
    start_time = __import__('time').time()
    
    # Show unlimited retry info
    print("💡 Unlimited retries enabled - Press Ctrl+C at any time to cancel")
    print()
    
    while True:  # Unlimited retries
        # Check if file already exists (resume support)
        resume_byte_pos = 0
        if output_path.exists():
            file_size = output_path.stat().st_size
            
            # Validate partial file before resuming
            if file_size >= 4:
                try:
                    with open(output_path, 'rb') as f:
                        magic = f.read(4)
                        if magic != b'GGUF':
                            print(f"⚠️  Partial file corrupted (invalid GGUF header)")
                            print(f"   Deleting and restarting download...")
                            output_path.unlink()
                            file_size = 0
                        else:
                            if retry_count == 0:
                                print(f"✅ Partial file validated (GGUF header OK)")
                except Exception as e:
                    print(f"⚠️  Error reading partial file: {e}")
                    print(f"   Deleting and restarting download...")
                    output_path.unlink()
                    file_size = 0
            
            if file_size > 0:
                resume_byte_pos = file_size
                if retry_count == 0:
                    print(f"📦 Found partial download: {resume_byte_pos / (1024*1024):.1f}MB")
                
                # Show retry info with elapsed time
                elapsed = __import__('time').time() - start_time
                mins, secs = divmod(int(elapsed), 60)
                elapsed_str = f"{mins}m {secs}s" if mins > 0 else f"{secs}s"
                print(f"🔄 Resuming download... (Attempt {retry_count + 1}, elapsed: {elapsed_str})")
        elif retry_count > 0:
            elapsed = __import__('time').time() - start_time
            mins, secs = divmod(int(elapsed), 60)
            elapsed_str = f"{mins}m {secs}s" if mins > 0 else f"{secs}s"
            print(f"🔄 Retrying download... (Attempt {retry_count + 1}, elapsed: {elapsed_str})")
        
        # Set up headers for resume
        headers = {}
        if resume_byte_pos > 0:
            headers['Range'] = f'bytes={resume_byte_pos}-'
        
        try:
            # Make request with stream=True for chunk downloading
            # Timeout: 60s connect, 120s read (per chunk)
            response = requests.get(
                url, 
                headers=headers, 
                stream=True, 
                timeout=(60, 120)
            )
            
            # Check if resume is supported
            if resume_byte_pos > 0 and response.status_code != 206:
                print("⚠️  Resume not supported by server, restarting download...")
                resume_byte_pos = 0
                response = requests.get(url, stream=True, timeout=(60, 120))
            
            response.raise_for_status()
            
            # Get total file size
            total_size = int(response.headers.get('content-length', 0))
            if resume_byte_pos > 0:
                total_size += resume_byte_pos
            
            # Open file in appropriate mode
            mode = 'ab' if resume_byte_pos > 0 else 'wb'
            
            # Download with progress bar
            with open(output_path, mode) as f:
                with tqdm(
                    total=total_size,
                    initial=resume_byte_pos,
                    unit='B',
                    unit_scale=True,
                    unit_divisor=1024,
                    desc=f"📥 {output_path.name}",
                    bar_format='{desc}: {percentage:3.0f}%|█{bar}█| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]',
                    ncols=100,
                    ascii=False,
                    dynamic_ncols=False
                ) as pbar:
                    downloaded = resume_byte_pos
                    
                    for chunk in response.iter_content(chunk_size=chunk_size):
                        if chunk:  # filter out keep-alive chunks
                            f.write(chunk)
                            downloaded += len(chunk)
                            pbar.update(len(chunk))
                            
                            # Call progress callback if provided
                            if progress_callback:
                                progress_callback(downloaded, total_size)
            
            print(f"✅ Download complete: {output_path.name}")
            print(f"📊 Size: {total_size / (1024*1024):.1f}MB")
            return True
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Download failed: {e}")
            retry_count += 1
            
            # Progressive backoff: 5s, 10s, 15s... max 30s
            import time
            wait_time = min(30, 5 * retry_count)
            print(f"⏳ Waiting {wait_time}s before retry...")
            time.sleep(wait_time)
            continue
        
        except KeyboardInterrupt:
            print("\n⚠️  Download interrupted by user")
            
            # Delete the partial file to avoid corruption
            if output_path.exists():
                try:
                    output_path.unlink()
                    print(f"🗑️  Deleted partial download: {output_path.name}")
                    print(f"   Run the install command again to restart")
                except Exception as e:
                    print(f"⚠️  Could not delete partial file: {e}")
                    print(f"📦 Partial file at: {output_path}")
            
            return False
        
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            return False


def verify_gguf_file(file_path: Path) -> bool:
    """
    Verify that a GGUF file is valid (basic check).
    
    Args:
        file_path: Path to GGUF file
    
    Returns:
        True if file appears valid, False otherwise
    """
    if not file_path.exists():
        return False
    
    # Check file size (GGUF files are typically > 100MB)
    file_size = file_path.stat().st_size
    if file_size < 100 * 1024 * 1024:  # Less than 100MB is suspicious
        print(f"⚠️  Warning: File size is unusually small ({file_size / (1024*1024):.1f}MB)")
        return False
    
    # Check GGUF magic header (first 4 bytes should be "GGUF")
    try:
        with open(file_path, 'rb') as f:
            magic = f.read(4)
            if magic != b'GGUF':
                print(f"❌ Invalid GGUF file: missing magic header")
                return False
    except Exception as e:
        print(f"❌ Error reading file: {e}")
        return False
    
    return True


def download_model_by_name(
    model_name: str,
    output_dir: Optional[Path] = None,
    force: bool = False,
    force_prompt: bool = False
) -> bool:
    """
    Download a model by name using the model files mapping.
    
    Args:
        model_name: Model name (e.g., 'llama3.2', 'mistral')
        output_dir: Optional output directory (defaults to .luciferai/models)
        force: Force re-download even if file exists
        force_prompt: Prompt user before overwriting existing files
    
    Returns:
        True if successful, False otherwise
    """
    from core.model_files_map import get_model_file, get_model_url, get_canonical_name, get_model_info
    
    # Get canonical model name
    canonical_name = get_canonical_name(model_name)
    
    # Get model info
    model_info = get_model_info(canonical_name)
    
    if not model_info['supported']:
        print(f"❌ Model '{model_name}' is not supported for llamafile installation")
        return False
    
    # Determine output directory
    if output_dir is None:
        project_root = Path(__file__).parent.parent
        output_dir = project_root / '.luciferai' / 'models'
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Get file path
    model_file = model_info['file']
    output_path = output_dir / model_file
    
    # Check if already exists
    if output_path.exists() and not force:
        actual_size_mb = output_path.stat().st_size / (1024 * 1024)
        expected_size_mb = model_info.get('expected_size_mb', 0)
        
        # Check file integrity
        is_valid = verify_gguf_file(output_path)
        
        # Check if size matches expected (allow 5% tolerance)
        size_ok = True
        if expected_size_mb > 0:
            size_diff_percent = abs(actual_size_mb - expected_size_mb) / expected_size_mb * 100
            size_ok = size_diff_percent < 5
        
        # If force_prompt is enabled, use the new prompt logic
        if force_prompt:
            if is_valid and size_ok:
                print(f"✅ {canonical_name.upper()} is already installed")
                print(f"   Size: {actual_size_mb:.1f}MB (matches expected {expected_size_mb:.0f}MB)")
                print()
                try:
                    from enhanced_agent import get_single_key_input
                    response = get_single_key_input("Reinstall this model? (y/n): ", valid_keys=['y', 'n'])
                    if response != 'y':
                        print("\n❌ Installation cancelled")
                        return True  # Already installed, so technically successful
                    print("\n🗑️  Removing existing file...")
                    output_path.unlink()
                except (EOFError, KeyboardInterrupt):
                    print("\n\n❌ Installation cancelled")
                    return True
            else:
                # File is corrupt or incomplete
                if not size_ok and expected_size_mb > 0:
                    print(f"⚠️  Existing file size mismatch:")
                    print(f"   Expected: {expected_size_mb:.1f}MB")
                    print(f"   Actual: {actual_size_mb:.1f}MB")
                else:
                    print(f"⚠️  Existing file failed integrity check")
                print("🔄 Re-downloading...")
                print()
                output_path.unlink()
        else:
            # Original logic for non-forced prompts
            if is_valid and size_ok:
                print(f"✅ Model already installed: {model_file}")
                print(f"   Location: {output_path}")
                print(f"   Size: {actual_size_mb:.1f}MB")
                print(f"\n⚠️  Model is already installed.")
                
                # Prompt to overwrite
                try:
                    response = input("Overwrite existing installation? (y/n): ").strip().lower()
                    if response not in ['y', 'yes']:
                        print("\n❌ Installation cancelled")
                        return False
                    print("\n🗑️  Removing existing file...")
                    output_path.unlink()
                except (EOFError, KeyboardInterrupt):
                    print("\n\n❌ Installation cancelled")
                    return False
            else:
                # File is corrupt or incomplete
                if not size_ok and expected_size_mb > 0:
                    print(f"⚠️  Existing file size mismatch:")
                    print(f"   Expected: {expected_size_mb:.1f}MB")
                    print(f"   Actual: {actual_size_mb:.1f}MB")
                else:
                    print(f"⚠️  Existing file failed integrity check")
                
                print(f"🔄 Re-downloading...")
                output_path.unlink()
    
    # Get download URL
    url = model_info['url']
    
    # Display model info
    print(f"\n📦 Installing {canonical_name.upper()}")
    print(f"   Tier: {model_info['tier']} ({model_info['tier_name']})")
    print(f"   Parameters: {model_info['tier_params']}")
    print(f"   File: {model_file}")
    print(f"   Source: HuggingFace")
    print()
    
    # Download
    success = download_gguf_model(url, output_path)
    
    if success:
        # Verify downloaded file
        if verify_gguf_file(output_path):
            print(f"\n✅ {canonical_name.upper()} installed successfully!")
            print(f"   Location: {output_path}")
            return True
        else:
            print(f"\n❌ Downloaded file failed verification")
            output_path.unlink()  # Delete corrupt file
            return False
    else:
        return False


def list_installed_models(models_dir: Optional[Path] = None) -> list:
    """
    List all installed GGUF models.
    
    Args:
        models_dir: Optional models directory (defaults to .luciferai/models)
    
    Returns:
        List of (model_name, file_path, size_mb) tuples
    """
    if models_dir is None:
        project_root = Path(__file__).parent.parent
        models_dir = project_root / '.luciferai' / 'models'
    
    if not models_dir.exists():
        return []
    
    from core.model_files_map import MODEL_FILES, get_canonical_name
    from core.model_tiers import get_model_tier
    
    installed = []
    
    # Check all .gguf files
    for gguf_file in models_dir.glob('*.gguf'):
        # Try to match to a known model
        model_name = None
        for name, filename in MODEL_FILES.items():
            if gguf_file.name == filename:
                model_name = get_canonical_name(name)
                break
        
        if model_name:
            size_mb = gguf_file.stat().st_size / (1024 * 1024)
            tier = get_model_tier(model_name)
            installed.append((model_name, gguf_file, size_mb, tier))
    
    # Sort by tier, then name
    return sorted(installed, key=lambda x: (x[3], x[0]))


def print_installed_models():
    """Print a formatted list of installed models."""
    installed = list_installed_models()
    
    if not installed:
        print("📦 No models installed yet")
        print("\n💡 Install a model:")
        print("   • luci install tinyllama  (Tier 0 - fast, basic)")
        print("   • luci install llama3.2   (Tier 1 - balanced)")
        print("   • luci install mistral    (Tier 2 - advanced)")
        return
    
    print(f"\n📦 Installed Models ({len(installed)}):")
    print("─" * 70)
    
    current_tier = -1
    for model_name, file_path, size_mb, tier in installed:
        # Print tier header
        if tier != current_tier:
            tier_names = {0: "Basic", 1: "General Purpose", 2: "Advanced", 3: "Expert"}
            print(f"\n  Tier {tier} - {tier_names.get(tier, 'Unknown')}:")
            current_tier = tier
        
        print(f"    • {model_name:20s} ({size_mb:6.1f}MB)")
    
    print()


def uninstall_model(model_name: str, models_dir: Optional[Path] = None) -> bool:
    """Uninstall a model by removing its GGUF file.
    
    Args:
        model_name: Model name (e.g., 'llama3.2', 'mistral')
        models_dir: Optional models directory (defaults to .luciferai/models)
    
    Returns:
        True if successful, False otherwise
    """
    from core.model_files_map import get_model_file, get_canonical_name, get_model_info
    
    # Get canonical model name
    canonical_name = get_canonical_name(model_name)
    
    # Get model info
    model_info = get_model_info(canonical_name)
    
    if not model_info['supported']:
        print(f"❌ Model '{model_name}' is not a supported model")
        return False
    
    # Determine models directory
    if models_dir is None:
        project_root = Path(__file__).parent.parent
        models_dir = project_root / '.luciferai' / 'models'
    
    # Get file path
    model_file = model_info['file']
    file_path = models_dir / model_file
    
    # Check if file exists
    if not file_path.exists():
        print(f"❌ Model not installed: {canonical_name}")
        print(f"   File not found: {model_file}")
        return False
    
    # Get file size for display
    file_size_mb = file_path.stat().st_size / (1024 * 1024)
    
    print(f"\n🗑️  Uninstalling {canonical_name.upper()}")
    print(f"   Tier: {model_info['tier']} ({model_info['tier_name']})")
    print(f"   File: {model_file}")
    print(f"   Size: {file_size_mb:.1f}MB")
    print(f"   Location: {file_path}")
    print()
    
    try:
        # Confirm deletion
        response = input("Are you sure you want to uninstall this model? (y/n): ").strip().lower()
        
        if response not in ['y']:
            print("\n❌ Uninstall cancelled")
            return False
        
        # Delete the file
        file_path.unlink()
        
        print(f"\n✅ {canonical_name.upper()} uninstalled successfully!")
        print(f"   Freed {file_size_mb:.1f}MB of disk space")
        print()
        
        return True
        
    except Exception as e:
        print(f"\n❌ Failed to uninstall: {e}")
        return False


if __name__ == "__main__":
    # Test download system
    if len(sys.argv) > 1:
        model_name = sys.argv[1]
        download_model_by_name(model_name)
    else:
        print("Usage: python3 model_download.py <model_name>")
        print("Example: python3 model_download.py llama3.2")
