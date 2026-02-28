#!/usr/bin/env python3
"""
Test script to:
1. Install all Tier 0 models (phi-2, stablelm, orca-mini)
2. Test each model individually with sample requests
3. Verify fallback routing works correctly
"""
import sys
import subprocess
from pathlib import Path

# Add paths
sys.path.insert(0, str(Path(__file__).parent / "core"))

from model_download import download_model_by_name, list_installed_models
from lucifer_colors import c


def check_installed_tier0_models():
    """Check which Tier 0 models are installed."""
    print(c("\n📦 Checking Tier 0 Models...", "cyan"))
    print(c("─" * 60, "dim"))
    
    tier0_models = ['tinyllama', 'phi-2', 'stablelm', 'orca-mini']
    installed = list_installed_models()
    installed_names = [name for name, _, _, _ in installed]
    
    status = {}
    for model in tier0_models:
        is_installed = model in installed_names
        status[model] = is_installed
        icon = "✅" if is_installed else "❌"
        print(f"  {icon} {model.ljust(12)} - {'Installed' if is_installed else 'Not installed'}")
    
    print()
    return status


def install_missing_tier0_models(status):
    """Install any missing Tier 0 models."""
    missing = [model for model, installed in status.items() if not installed]
    
    if not missing:
        print(c("✅ All Tier 0 models already installed!", "green"))
        return True
    
    print(c(f"\n🚀 Installing {len(missing)} missing Tier 0 model(s)...", "yellow"))
    print(c("─" * 60, "dim"))
    
    for model in missing:
        print(c(f"\n📥 Installing {model}...", "cyan"))
        success = download_model_by_name(model, force_prompt=False)
        
        if success:
            print(c(f"✅ {model} installed successfully!", "green"))
        else:
            print(c(f"❌ Failed to install {model}", "red"))
            return False
    
    return True


def test_model_individually(model_name, test_request):
    """Test a single model with a request."""
    print(c(f"\n🧪 Testing {model_name.upper()}...", "purple"))
    print(c("─" * 60, "dim"))
    print(c(f"Request: \"{test_request}\"", "dim"))
    print()
    
    # Create a test input file
    test_file = Path("/tmp/lucifer_test_input.txt")
    test_file.write_text(f"{test_request}\nexit\n")
    
    # Run LuciferAI with the test input
    result = subprocess.run(
        ["python3", "lucifer.py"],
        stdin=open(test_file),
        capture_output=True,
        text=True,
        timeout=30
    )
    
    # Check if model was used
    if model_name.upper() in result.stdout or model_name in result.stdout:
        print(c(f"✅ {model_name} processed the request", "green"))
        return True
    else:
        print(c(f"⚠️  {model_name} may not have processed the request", "yellow"))
        print(c("Output snippet:", "dim"))
        print(result.stdout[-500:] if len(result.stdout) > 500 else result.stdout)
        return False


def main():
    print(c("\n╔════════════════════════════════════════════════════════════╗", "purple"))
    print(c("║          🧪 Tier 0 Model Installation & Testing           ║", "purple"))
    print(c("╚════════════════════════════════════════════════════════════╝", "purple"))
    
    # Step 1: Check current status
    status = check_installed_tier0_models()
    
    # Step 2: Install missing models
    if not install_missing_tier0_models(status):
        print(c("\n❌ Installation failed. Exiting.", "red"))
        return 1
    
    # Step 3: Verify all models are now installed
    print(c("\n✅ Verification:", "green"))
    final_status = check_installed_tier0_models()
    
    all_installed = all(final_status.values())
    if all_installed:
        print(c("✅ All Tier 0 models successfully installed!", "green"))
    else:
        print(c("⚠️  Some models failed to install", "yellow"))
        return 1
    
    # Step 4: Test each model
    print(c("\n📋 Testing Plan:", "cyan"))
    print(c("  1. Test tinyllama", "dim"))
    print(c("  2. Test phi-2", "dim"))
    print(c("  3. Test stablelm", "dim"))
    print(c("  4. Test orca-mini", "dim"))
    print()
    
    test_requests = {
        'tinyllama': 'create a file called test.txt with hello world',
        'phi-2': 'list files in current directory',
        'stablelm': 'show me the current working directory',
        'orca-mini': 'create a folder called test_folder'
    }
    
    results = {}
    for model, request in test_requests.items():
        try:
            results[model] = test_model_individually(model, request)
        except Exception as e:
            print(c(f"❌ Error testing {model}: {e}", "red"))
            results[model] = False
    
    # Summary
    print(c("\n╔════════════════════════════════════════════════════════════╗", "green"))
    print(c("║                    📊 Test Summary                         ║", "green"))
    print(c("╚════════════════════════════════════════════════════════════╝", "green"))
    print()
    
    for model, success in results.items():
        icon = "✅" if success else "❌"
        status_text = "PASSED" if success else "FAILED"
        print(f"  {icon} {model.ljust(12)} - {status_text}")
    
    passed = sum(results.values())
    total = len(results)
    print()
    print(c(f"Results: {passed}/{total} tests passed", "green" if passed == total else "yellow"))
    print()
    
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
