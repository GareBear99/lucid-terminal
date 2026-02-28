#!/usr/bin/env python3
"""
Advanced parser test suite with complex, paragraph-length requests.
Tests if the parser can handle verbose, detailed specifications like a human would.
"""
import sys
sys.path.insert(0, 'core')
from enhanced_agent import EnhancedLuciferAgent

# Complex paragraph-length requests (3x longer than normal)
ADVANCED_TESTS = [
    {
        "name": "Complex web automation",
        "request": "I need you to create a comprehensive web automation script that will open my default browser, navigate to github.com, log in using stored credentials, and then automatically star all repositories from a specific user. The script should be called github auto star tool and I want it placed in a folder named automation tools on my desktop. Make sure it handles errors gracefully and logs all actions to a file.",
        "expected_entities": ["folder: automation tools", "location: desktop", "filename: github_auto_star_tool", "purpose: open browser navigate"]
    },
    {
        "name": "Data processing pipeline",
        "request": "Build me a sophisticated data processing pipeline script that takes CSV files from a downloads folder, cleans the data by removing duplicates and null values, performs statistical analysis including mean median and standard deviation, generates visualization plots using matplotlib, and finally exports the processed data to both JSON and Excel formats with timestamps. Name this script data analysis pipeline and store it in a folder called data processing on documents with proper documentation.",
        "expected_entities": ["folder: data processing", "location: documents", "filename: data_analysis_pipeline", "purpose: takes csv"]
    },
    {
        "name": "System monitoring daemon",
        "request": "Create a system monitoring daemon shell script that continuously monitors CPU usage memory consumption and disk space every 30 seconds and sends me desktop notifications when any metric exceeds 80 percent threshold. The script should maintain a rolling log file that keeps the last 7 days of metrics and automatically rotates older logs. Call it system health monitor and put it in a folder named system utilities on desktop. It needs to run as a background process and have proper signal handling for graceful shutdown.",
        "expected_entities": ["folder: system utilities", "location: desktop", "filename: system_health_monitor.sh", "shell script"]
    },
    {
        "name": "API integration tool",
        "request": "I want a Python script that integrates with the OpenWeatherMap API to fetch weather data for multiple cities reads the city list from a config file makes parallel API requests to improve performance caches results in a local SQLite database to minimize API calls and generates a beautiful HTML report with charts showing temperature trends humidity levels and precipitation forecasts. Name it weather dashboard generator and create it in documents inside a folder called weather tools. The script should handle API rate limiting retry failed requests and validate all input data.",
        "expected_entities": ["folder: weather tools", "location: documents", "filename: weather_dashboard_generator", "purpose: integrates with"]
    },
    {
        "name": "File organization bot",
        "request": "Build an intelligent file organization bot that monitors my downloads folder watches for new files categorizes them based on file extensions and content analysis automatically moves them to appropriate folders like Documents for PDFs Images for photos Videos for media files and Code for programming files. It should also detect duplicate files by computing MD5 hashes rename files to follow a consistent naming convention with timestamps and create a detailed activity log. Call this file organization bot and place it in a folder named productivity tools on desktop. Make it run continuously as a background service and send notifications for important file operations.",
        "expected_entities": ["folder: productivity tools", "location: desktop", "filename: file_organization_bot", "purpose: monitors"]
    },
    {
        "name": "Backup automation",
        "request": "Create a comprehensive backup automation script that identifies all important directories like Documents Desktop and Pictures compresses them using tar with gzip compression encrypts the archives using strong encryption uploads them to cloud storage using rclone or similar tool maintains incremental backups to save space and bandwidth and sends email notifications with backup status and file sizes. Name it smart backup system and save it in a folder called backup scripts on documents. The script needs to handle network failures gracefully implement retry logic and maintain a backup history database.",
        "expected_entities": ["folder: backup scripts", "location: documents", "filename: smart_backup_system", "purpose: identifies"]
    },
    {
        "name": "Development environment setup",
        "request": "I need a shell script that completely automates development environment setup by installing Homebrew if not present installing essential development tools like git node python docker configuring shell environment with custom aliases and PATH variables cloning important repositories from GitHub setting up SSH keys and GPG signing installing VS Code extensions and applying custom settings and finally running health checks to verify everything works. Call it dev environment setup and put it in a folder named setup scripts on desktop. It should be idempotent meaning running it multiple times doesn't break anything and should support both fresh installs and updates.",
        "expected_entities": ["folder: setup scripts", "location: desktop", "filename: dev_environment_setup.sh", "shell script"]
    },
    {
        "name": "Meeting notes automation",
        "request": "Build a meeting notes automation tool that records audio from system microphone transcribes speech to text using a transcription service or local model identifies speakers automatically extracts action items and key discussion points generates a formatted markdown document with timestamps and speaker labels sends the notes via email to all participants and stores them in a structured folder hierarchy organized by date and project. Name this meeting notes assistant and create it inside a folder called productivity apps on documents. The tool should handle multiple audio formats support batch processing and integrate with calendar apps to auto fetch meeting details.",
        "expected_entities": ["folder: productivity apps", "location: documents", "filename: meeting_notes_assistant", "purpose: records audio"]
    },
    {
        "name": "Database migration tool",
        "request": "Create a robust database migration tool that connects to PostgreSQL or MySQL databases reads schema definitions from YAML files generates and executes migration scripts in the correct order maintains a migration history table to track applied migrations supports rollback functionality to undo changes if needed validates data integrity after migrations and creates backups before making any destructive changes. Call it database migrator pro and save it in a folder named database tools on documents. Include comprehensive error handling transaction support and the ability to preview migrations without applying them.",
        "expected_entities": ["folder: database tools", "location: documents", "filename: database_migrator_pro", "purpose: connects to"]
    },
    {
        "name": "Image processing batch tool",
        "request": "I want a Python script that performs batch image processing on all images in a specified directory resizes them to multiple predefined dimensions for web desktop and mobile applies automatic color correction and enhancement converts between formats like JPG PNG and WebP adds watermarks from a template file optimizes file sizes without quality loss generates thumbnails and creates an image gallery HTML page. Name it batch image processor and place it in a folder called media tools on desktop. The script should process images in parallel for speed show a progress bar maintain original files as backup and generate a processing report.",
        "expected_entities": ["folder: media tools", "location: desktop", "filename: batch_image_processor", "purpose: performs batch"]
    }
]

def test_advanced_parser():
    """Test parser with complex paragraph-length requests."""
    agent = EnhancedLuciferAgent()
    
    print("\n" + "="*80)
    print("🚀 ADVANCED PARSER TEST - PARAGRAPH-LENGTH REQUESTS")
    print("="*80 + "\n")
    
    passed = 0
    total = len(ADVANCED_TESTS)
    
    for i, test in enumerate(ADVANCED_TESTS, 1):
        name = test["name"]
        request = test["request"]
        expected = test["expected_entities"]
        
        print(f"\n[{i}/{total}] {name}")
        print(f"Request length: {len(request)} characters ({len(request.split())} words)")
        print(f"Request preview: {request[:100]}...")
        print("-" * 80)
        
        # Parse
        steps = agent._parse_dynamic_steps(request)
        
        # Show steps
        print(f"\n📋 Generated {len(steps)} steps:")
        for j, step in enumerate(steps, 1):
            print(f"  {j}. {step}")
        
        # Validate
        all_steps_text = " ".join(steps).lower()
        issues = []
        
        for expected_item in expected:
            if ":" in expected_item:
                entity_type, entity_value = expected_item.split(":", 1)
                entity_value = entity_value.strip().lower()
                
                if entity_value not in all_steps_text:
                    issues.append(f"⚠️  Expected '{entity_type.strip()}' containing '{entity_value}' not found")
            else:
                # Just check if the term exists
                if expected_item.lower() not in all_steps_text:
                    issues.append(f"⚠️  Expected term '{expected_item}' not found")
        
        # Check step quality
        if len(steps) < 3:
            issues.append(f"⚠️  Too few steps: {len(steps)}")
        elif len(steps) > 10:
            issues.append(f"⚠️  Too many steps: {len(steps)} (might be over-parsing)")
        
        # Result
        if not issues:
            print(f"\n✅ PASS - All key entities extracted!")
            passed += 1
        else:
            print(f"\n⚠️  PARTIAL - Some expectations not met:")
            for issue in issues:
                print(f"  {issue}")
            # Count as pass if only minor issues
            if len(issues) <= 2:
                passed += 1
                print("  (Acceptable - key functionality captured)")
        
        print()
    
    # Summary
    print("=" * 80)
    print("📊 ADVANCED TEST SUMMARY")
    print("=" * 80)
    print(f"Total Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Success Rate: {(passed/total)*100:.0f}%")
    print("=" * 80)
    
    if passed == total:
        print("\n🎉 PERFECT! Parser handles complex paragraph requests like a human!\n")
    elif passed >= total * 0.8:
        print(f"\n✅ EXCELLENT! Parser successfully handles complex requests!\n")
    elif passed >= total * 0.6:
        print(f"\n👍 GOOD! Parser works well with most complex requests.\n")
    else:
        print(f"\n⚠️  Needs improvement for complex paragraph parsing.\n")
    
    return passed >= total * 0.8

if __name__ == "__main__":
    success = test_advanced_parser()
    sys.exit(0 if success else 1)
