#!/usr/bin/env python3
"""
Warp AI Quality Test Suite - 100 comprehensive tests.
Validates that parser produces meaningful, accurate, actionable steps.
"""
import sys
sys.path.insert(0, 'core')
from enhanced_agent import EnhancedLuciferAgent

def validate_warp_quality(name, request, steps):
    """Validate steps like Warp AI would - meaningful, specific, actionable."""
    issues = []
    request_lower = request.lower()
    all_steps = ' '.join(steps).lower()
    
    # Quality Check 1: Steps must be specific, not vague
    vague_phrases = ['do something', 'handle things', 'process items', 'generic']
    for phrase in vague_phrases:
        if phrase in all_steps:
            issues.append(f"Vague language: '{phrase}'")
    
    # Quality Check 2: Steps must be actionable (start with verbs)
    action_verbs = ['create', 'write', 'implement', 'make', 'test', 'build', 'add', 'generate']
    for step in steps:
        first_word = step.split()[0].lower() if step.split() else ''
        if first_word not in action_verbs:
            issues.append(f"Non-actionable step: '{step[:40]}...'")
            break
    
    # Quality Check 3: Extract key entities from request and verify they're in steps
    # Folders
    if 'folder named' in request_lower or 'folder called' in request_lower:
        # Find folder name
        if 'folder named' in request_lower:
            idx = request_lower.find('folder named') + len('folder named ')
        else:
            idx = request_lower.find('folder called') + len('folder called ')
        
        words_after = request[idx:].split()
        folder_name = []
        for word in words_after:
            if word.lower() in ['on', 'in', 'and', 'with']:
                break
            folder_name.append(word)
        
        if folder_name:
            # Check with underscores (how it should appear)
            expected = '_'.join(folder_name).lower()
            if expected not in all_steps:
                issues.append(f"Missing folder: {' '.join(folder_name)}")
    
    # Files with extensions
    import re
    files = re.findall(r'([\w_-]+\.(?:py|sh|js|json|txt|html|css|rb|pl))', request_lower)
    for file in files:
        if file not in all_steps:
            issues.append(f"Missing file: {file}")
    
    # Named files (call it X, name it X)
    if 'call it' in request_lower:
        idx = request_lower.find('call it') + len('call it ')
        words = request[idx:].split()
        name_parts = []
        for word in words:
            if word.lower() in ['and', 'in', 'on', 'to']:
                break
            name_parts.append(word)
        if name_parts:
            # Should appear with underscores
            expected = '_'.join(name_parts).lower()
            if expected not in all_steps and ' '.join(name_parts).lower() not in all_steps:
                issues.append(f"Missing named file: {' '.join(name_parts)}")
    
    if 'name it' in request_lower:
        idx = request_lower.find('name it') + len('name it ')
        words = request[idx:].split()
        name_parts = []
        for word in words:
            if word.lower() in ['and', 'in', 'on', 'to']:
                break
            name_parts.append(word)
        if name_parts:
            expected = '_'.join(name_parts).lower()
            if expected not in all_steps and ' '.join(name_parts).lower() not in all_steps:
                issues.append(f"Missing named file: {' '.join(name_parts)}")
    
    # Locations
    locations = ['desktop', 'downloads', 'documents']
    for loc in locations:
        if loc in request_lower and loc not in all_steps:
            issues.append(f"Missing location: {loc}")
    
    # Actions/purposes
    action_keywords = ['opens', 'launches', 'fetches', 'parses', 'monitors', 'processes', 
                      'creates', 'generates', 'sends', 'builds']
    found_action = False
    for action in action_keywords:
        if action in request_lower:
            # Should be in steps too
            if action in all_steps or action.rstrip('s') in all_steps:
                found_action = True
                break
    
    if not found_action and any(a in request_lower for a in action_keywords):
        issues.append("Action/purpose not carried through to steps")
    
    # Quality Check 4: File creation requests must have write/implementation step
    if 'create' in request_lower or 'make' in request_lower or 'build' in request_lower:
        has_write = any(w in all_steps for w in ['write', 'implement', 'add content', 'add code'])
        if not has_write:
            issues.append("Missing write/implementation step")
    
    # Quality Check 5: Steps should include full paths for clarity
    if files and 'folder' in request_lower:
        # Should see folder/file in steps
        has_full_path = any('/' in step for step in steps)
        if not has_full_path:
            issues.append("Missing full file paths (folder/file)")
    
    return issues

# 100 comprehensive test cases
WARP_TESTS = [
    # Basic operations (1-10)
    ("Simple file creation", "create a file called notes.txt"),
    ("File with location", "make a file named config.json in documents"),
    ("Script with purpose", "create a script that opens chrome"),
    ("Named script", "make a script and name it launcher"),
    ("Python script", "build a python script named data_processor"),
    ("Shell script", "create a shell script called startup"),
    ("File on desktop", "make notes.txt on desktop"),
    ("Multi-word name", "create a script called quick launcher"),
    ("Folder creation", "create a folder named projects on desktop"),
    ("Script in folder", "make helper.py in a folder named tools"),
    
    # Complex single operations (11-20)
    ("Browser opener with location", "make a script that opens the default native browser and name it gary browser and put it in a folder named browserstart on desktop"),
    ("Data fetcher", "create a script that fetches api data and call it data fetcher in downloads"),
    ("File organizer", "build a python script that organizes files by extension and name it file organizer in documents"),
    ("System monitor", "make a shell script that monitors cpu and memory and call it system monitor on desktop"),
    ("Web scraper", "create a script that scrapes reddit data and saves to json file in downloads"),
    ("Backup tool", "build a backup script that compresses files and call it smart backup"),
    ("Log parser", "make a script that parses log files and name it log analyzer in a folder named tools"),
    ("Image resizer", "create a script that resizes images and call it image processor on desktop"),
    ("Email notifier", "build a script that sends email notifications and name it notifier in downloads"),
    ("Database query tool", "make a script that queries sqlite databases and call it db tool"),
    
    # Multi-file applications (21-30)
    ("TODO app", "Create a todo list application with main.py for the interface tasks.py for logic and config.json for settings in a folder called todo_app on desktop"),
    ("Blog system", "Build a blog system with blog.py posts.py and templates folder in a folder named blog_system on documents"),
    ("API server", "Make an API server with server.py routes.py and database.py in folder called api_server on desktop"),
    ("Chat app", "Create a chat application with client.py server.py and utils.py in a folder named chat_app in documents"),
    ("Game project", "Build a game with game.py sprites.py and config.json in folder called game_project on desktop"),
    ("Web scraper app", "Create a web scraper with scraper.py parser.py and database.py in folder web_scraper on downloads"),
    ("Dashboard", "Make a dashboard with dashboard.py data.py and templates folder in folder dashboard_app on documents"),
    ("Automation suite", "Build automation suite with runner.py tasks.py and config.yaml in folder automation_suite on desktop"),
    ("Testing framework", "Create testing framework with test_runner.py test_cases.py in folder test_framework on documents"),
    ("CLI tool", "Make CLI tool with cli.py commands.py and setup.py in folder cli_tool on desktop"),
    
    # Paragraph-length requests (31-40)
    ("Web automation", "I need a comprehensive web automation script that opens my browser navigates to github logs in and stars repositories. Call it github auto star and put it in a folder named automation tools on desktop."),
    ("Data pipeline", "Build a data processing pipeline that takes CSV files cleans them performs analysis and exports to JSON. Name it data analysis pipeline and store in folder called data processing on documents."),
    ("System daemon", "Create a shell script that continuously monitors CPU memory and disk space every 30 seconds and sends notifications. Call it system health monitor and put in folder named system utilities on desktop."),
    ("Weather dashboard", "I want a Python script that fetches weather data from OpenWeatherMap API for multiple cities and generates HTML reports. Name it weather dashboard generator in documents inside folder called weather tools."),
    ("File bot", "Build an intelligent file organization bot that monitors downloads categorizes files by extension and moves them to appropriate folders. Call it file organization bot in folder productivity tools on desktop."),
    ("Backup system", "Create a backup automation script that compresses important directories encrypts them uploads to cloud and sends email notifications. Name it smart backup system in folder backup scripts on documents."),
    ("Dev setup", "I need a shell script that automates development environment setup by installing Homebrew essential tools and configuring shell environment. Call it dev environment setup in folder setup scripts on desktop."),
    ("Meeting notes", "Build a meeting notes tool that records audio transcribes speech extracts action items and generates markdown documents. Name it meeting notes assistant in folder productivity apps on documents."),
    ("Database migrator", "Create a database migration tool that reads schema definitions generates migration scripts and maintains version history. Call it database migrator pro in folder database tools on documents."),
    ("Image processor", "I want a Python script that batch processes images resizes them applies filters converts formats and generates thumbnails. Name it batch image processor in folder media tools on desktop."),
    
    # Purpose-driven requests (41-50)
    ("Opens browser", "script that opens default browser"),
    ("Fetches API data", "create script that fetches weather data from api"),
    ("Parses JSON", "make a script that parses json files and extracts data"),
    ("Launches Spotify", "script that launches spotify application"),
    ("Creates backups", "make a script that creates backups of important folders"),
    ("Monitors CPU", "script that monitors cpu usage and logs it"),
    ("Processes images", "create script that processes and optimizes images"),
    ("Sends emails", "make script that sends automated email reports"),
    ("Logs activity", "script that logs user activity to file"),
    ("Generates reports", "create script that generates pdf reports from data"),
    
    # Location variations (51-60)
    ("Put in downloads", "make a script and put it in downloads"),
    ("Save to documents", "create a file and save it to documents"),
    ("Place on desktop", "build a script and place it on desktop"),
    ("Store in folder", "make a script and store it in a folder named scripts"),
    ("In downloads folder", "create backup.py in downloads"),
    ("On desktop location", "make launcher.sh on desktop"),
    ("Documents target", "save config.json in documents"),
    ("Folder with location", "create script in folder named tools on desktop"),
    ("Multiple locations", "make data.json in a folder called data in documents"),
    ("Nested structure", "create app.py in folder named apps inside projects on desktop"),
    
    # Name variations (61-70)
    ("Call it variant", "make a script and call it helper tool"),
    ("Name it variant", "create a script and name it data processor"),
    ("Called pattern", "build a script called web scraper"),
    ("Named pattern", "make a tool named file organizer"),
    ("Name with spaces", "script called my awesome launcher"),
    ("Call with purpose", "create script that opens browser and call it browser launcher"),
    ("Name with location", "make script named backup tool in downloads"),
    ("Multiple naming", "build github tool and name it repo manager"),
    ("Name at end", "create automation script and name it auto bot"),
    ("Call with folder", "make helper and call it quick help in tools folder"),
    
    # Extension handling (71-80)
    ("Explicit .py", "create helper.py script"),
    ("Explicit .sh", "make startup.sh script"),
    ("Explicit .json", "create config.json file"),
    ("Explicit .js", "make app.js for node"),
    ("Python inference", "create python script named analyzer"),
    ("Shell inference", "make shell script called monitor"),
    ("Multiple files", "create main.py utils.py and config.json"),
    ("Mixed extensions", "make app.py styles.css and index.html"),
    ("Ruby script", "create script.rb for automation"),
    ("YAML config", "make config.yaml with settings"),
    
    # Complex applications (81-90)
    ("E-commerce platform", "Build a complete e-commerce platform with frontend backend database schemas API endpoints payment integration user authentication product catalog shopping cart checkout process admin dashboard analytics reporting and email notifications. Create main_app.py frontend folder backend folder database folder api folder with all necessary files in a folder called ecommerce_platform on desktop. Include requirements.txt README.md and config files."),
    
    ("Social media app", "Create a full social media application with user profiles posts feed comments likes messaging real-time notifications friend system photo uploads video sharing hashtags trending topics and content moderation. Build it with app.py models folder views folder templates folder static folder database schemas and API routes. Put everything in folder social_media_app on documents with proper documentation."),
    
    ("Project manager", "Develop a comprehensive project management system with projects tasks teams sprint planning kanban boards gantt charts time tracking resource allocation reporting dashboards file attachments comments notifications and integrations. Create main.py backend folder frontend folder database folder utils folder in folder project_manager on desktop with all configuration files."),
    
    ("Learning platform", "Build an LMS with courses lessons quizzes assignments grades student portal instructor dashboard video player progress tracking certificates discussions forums calendar events and analytics. Create lms_app.py courses folder students folder content folder templates folder database schemas in folder learning_platform on documents with setup instructions."),
    
    ("Healthcare portal", "Create a healthcare patient portal with appointments medical records prescriptions lab results doctor messaging telehealth video calls billing insurance claims health tracking and notifications. Build portal.py patient folder doctor folder admin folder database folder API folder in folder healthcare_portal on desktop with security configurations."),
    
    ("Financial dashboard", "Develop a financial tracking dashboard with account management transactions budgeting expense tracking investment portfolio stock market data reporting charts alerts and export features. Create finance_app.py accounts folder transactions folder reports folder charts folder database schemas in folder financial_dashboard on documents with API keys config."),
    
    ("Inventory system", "Build an inventory management system with products warehouses stock tracking orders suppliers barcode scanning reporting alerts reordering and multi-location support. Create inventory.py products folder orders folder suppliers folder reports folder database folder in folder inventory_system on desktop with deployment configs."),
    
    ("CRM application", "Create a CRM with contacts leads deals pipeline sales automation email campaigns analytics reporting task management calendar integration and team collaboration. Build crm_app.py contacts folder deals folder campaigns folder reports folder database schemas in folder crm_system on documents with integration configs."),
    
    ("Booking platform", "Develop a booking and reservation platform with availability calendar booking management payment processing customer accounts service providers scheduling notifications reminders and reviews. Create booking.py services folder customers folder payments folder calendar folder database folder in folder booking_platform on desktop with payment gateway configs."),
    
    ("CMS platform", "Build a full CMS with content editor media library user roles workflow publishing SEO tools analytics plugins themes templates and API. Create cms.py content folder media folder users folder themes folder plugins folder database schemas in folder cms_platform on documents with extensive documentation and setup scripts."),
    
    # Edge cases and special patterns (91-100)
    ("Minimal request", "create script"),
    ("Just folder", "make folder named projects"),
    ("File only", "create data.json"),
    ("Very long name", "make a script called my super awesome ultimate file processor tool"),
    ("Multiple actions", "create script that opens browser fetches data and saves to file"),
    ("Nested folders", "make app.py in src folder inside project folder on desktop"),
    ("No location", "create backup script named auto backup"),
    ("Multiple purposes", "build tool that monitors system processes files and generates reports"),
    ("Abbreviated request", "make py script that gets api data"),
    ("Natural language", "I want you to create a simple script that just opens my browser please"),
]

def run_warp_quality_tests():
    """Run 100 tests with Warp AI quality validation."""
    agent = EnhancedLuciferAgent()
    
    print("\n" + "="*80)
    print("🎯 WARP AI QUALITY TEST SUITE - 100 TESTS")
    print("="*80 + "\n")
    
    passed = 0
    failed = 0
    failed_tests = []
    
    for i, (name, request) in enumerate(WARP_TESTS, 1):
        try:
            steps = agent._parse_dynamic_steps(request)
            
            # Validate Warp AI quality
            issues = validate_warp_quality(name, request, steps)
            
            if not issues and len(steps) >= 2:
                passed += 1
                status = "✅"
            else:
                failed += 1
                status = "❌"
                failed_tests.append((i, name, request, steps, issues))
            
            # Show progress every 10 tests
            if i % 10 == 0:
                print(f"[{i}/100] {status} {name} ({len(steps)} steps)")
        
        except Exception as e:
            failed += 1
            print(f"[{i}/100] ❌ {name} - ERROR: {str(e)[:50]}")
            failed_tests.append((i, name, request, [], [f"Exception: {e}"]))
    
    # Summary
    print("\n" + "="*80)
    print("📊 WARP AI QUALITY SUMMARY")
    print("="*80)
    print(f"Total Tests: 100")
    print(f"✅ High Quality: {passed}")
    print(f"❌ Issues Found: {failed}")
    print(f"Quality Score: {passed}%")
    print("="*80 + "\n")
    
    # Show failed tests in detail
    if failed_tests:
        print("\n" + "="*80)
        print(f"🔍 DETAILED FAILURES ({len(failed_tests)} tests)")
        print("="*80)
        for test_num, name, request, steps, issues in failed_tests[:10]:  # Show up to 10 failures
            print(f"\n[Test #{test_num}] {name}")
            print(f"Request: {request[:80]}...")
            print(f"\nGenerated {len(steps)} steps:")
            for j, step in enumerate(steps, 1):
                print(f"  {j}. {step}")
            print(f"\n❌ Issues:")
            for issue in issues:
                print(f"   - {issue}")
            print("-" * 80)
    
    if passed == 100:
        print("🎉 PERFECT! Warp AI quality achieved on all 100 tests!\n")
    elif passed >= 95:
        print("✅ EXCELLENT! Near-perfect Warp AI quality!\n")
    elif passed >= 90:
        print("👍 GREAT! Strong Warp AI quality across most tests!\n")
    elif passed >= 80:
        print("✔️  GOOD! Solid quality with some room for improvement!\n")
    else:
        print("⚠️  Needs attention - quality issues detected.\n")
    
    return passed >= 90

if __name__ == "__main__":
    run_warp_quality_tests()
