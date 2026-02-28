#!/usr/bin/env python3
"""
Test script to verify Ctrl+C interrupt cleanup for model downloads.
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.model_download import download_model_by_name

def test_interrupt_cleanup():
    """
    Test that partial downloads are cleaned up on Ctrl+C.
    
    To test:
    1. Run this script
    2. Press Ctrl+C during download
    3. Verify partial file is deleted
    4. Run install command again - should start fresh
    """
    print("\n🧪 Testing Interrupt Cleanup")
    print("═" * 60)
    print()
    print("This test will start downloading a model.")
    print("Press Ctrl+C to interrupt the download.")
    print("The partial file should be automatically deleted.")
    print()
    print("═" * 60)
    print()
    
    # Test with a small model
    model_name = "tinyllama"
    
    try:
        success = download_model_by_name(model_name)
        
        if success:
            print("\n✅ Download completed successfully")
        else:
            print("\n❌ Download failed")
    
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted - this is expected behavior")
        print("The partial file should have been deleted.")
        
        # Verify cleanup
        models_dir = Path.home() / '.luciferai' / 'models'
        from core.model_files_map import get_model_file
        
        model_file = get_model_file(model_name)
        if model_file:
            file_path = models_dir / model_file
            
            if file_path.exists():
                print(f"\n❌ CLEANUP FAILED: Partial file still exists at {file_path}")
            else:
                print(f"\n✅ CLEANUP SUCCESS: Partial file was deleted")
        
        print("\nYou can now run 'luci install tinyllama' again to restart the download.")

if __name__ == "__main__":
    test_interrupt_cleanup()
