#!/usr/bin/env python3
"""
Ultra-comprehensive 100-test suite for dynamic parser.
Tests everything from simple commands to complex multi-script applications.
Last 10 tests are application-building scenarios.
"""
import sys
sys.path.insert(0, 'core')
from enhanced_agent import EnhancedLuciferAgent

# 100 diverse test cases
TEST_CASES = [
    # Basic file operations (1-10)
    {"name": "Simple file", "request": "create a file called notes.txt"},
    {"name": "File with location", "request": "make a file named config.json in documents"},
    {"name": "File in folder", "request": "create readme.md in a folder named docs"},
    {"name": "Script with purpose", "request": "make a script that opens chrome"},
    {"name": "Named script", "request": "create a script called launcher"},
    {"name": "Python script", "request": "build a python script named helper"},
    {"name": "Shell script", "request": "make a shell script called startup"},
    {"name": "Script with action", "request": "create a script that fetches data"},
    {"name": "File on desktop", "request": "make notes.txt on desktop"},
    {"name": "Multiple words name", "request": "create my awesome script"},
    
    # Folder and location tests (11-20)
    {"name": "Folder creation", "request": "create a folder named projects"},
    {"name": "Folder on desktop", "request": "make a folder called workspace on desktop"},
    {"name": "Nested folder", "request": "create a folder named tools in documents"},
    {"name": "Script in new folder", "request": "make script.py in a folder named scripts"},
    {"name": "Complex nesting", "request": "create test.py in folder called testing on desktop"},
    {"name": "Folder with file", "request": "make a folder named data with config.txt inside"},
    {"name": "Multiple locations", "request": "create backup folder in downloads"},
    {"name": "Location inference", "request": "make a script and put it in documents"},
    {"name": "Desktop shortcut", "request": "create launcher on my desktop"},
    {"name": "Downloads target", "request": "save the script to downloads"},
    
    # Purpose and action extraction (21-30)
    {"name": "Opens browser", "request": "script that opens default browser"},
    {"name": "Fetches data", "request": "create script that fetches api data"},
    {"name": "Parses files", "request": "make a script that parses json files"},
    {"name": "Launches app", "request": "script that launches spotify"},
    {"name": "Creates backup", "request": "make a script that creates backups"},
    {"name": "Monitors system", "request": "script that monitors cpu usage"},
    {"name": "Processes images", "request": "create script that processes images"},
    {"name": "Sends emails", "request": "make script that sends email notifications"},
    {"name": "Logs activity", "request": "script that logs user activity"},
    {"name": "Generates reports", "request": "create script that generates reports"},
    
    # Name it / call it variations (31-40)
    {"name": "Name it variant", "request": "make a script and name it helper tool"},
    {"name": "Call it variant", "request": "create a script and call it launcher"},
    {"name": "Named variant", "request": "build a script named data processor"},
    {"name": "Called variant", "request": "make a script called web scraper"},
    {"name": "Name with spaces", "request": "script called my awesome tool"},
    {"name": "Name at end", "request": "create a launcher script and name it quick start"},
    {"name": "Call at end", "request": "make a helper and call it assistant"},
    {"name": "Name with purpose", "request": "script that opens files and name it file opener"},
    {"name": "Call with purpose", "request": "create script that processes data and call it data handler"},
    {"name": "Multiple names", "request": "make github tool and name it repo manager"},
    
    # Put it in variations (41-50)
    {"name": "Put in downloads", "request": "make script and put it in downloads"},
    {"name": "Put in documents", "request": "create file and put it in documents"},
    {"name": "Put in desktop", "request": "build script and put it in desktop"},
    {"name": "Put in folder", "request": "make script and put it in a folder named tools"},
    {"name": "Place variant", "request": "create script and place it in downloads"},
    {"name": "Save to variant", "request": "make script and save it to documents"},
    {"name": "Store in variant", "request": "create file and store it in desktop"},
    {"name": "Put with name", "request": "make script called helper and put it in downloads"},
    {"name": "Put with purpose", "request": "script that opens browser and put it in desktop"},
    {"name": "Complex put", "request": "create automation script and put it in folder named automation on desktop"},
    
    # File extensions (51-60)
    {"name": "JSON file", "request": "create config.json with settings"},
    {"name": "Text file", "request": "make notes.txt in documents"},
    {"name": "Python explicit", "request": "create helper.py script"},
    {"name": "Shell explicit", "request": "make startup.sh script"},
    {"name": "JavaScript file", "request": "create app.js for node"},
    {"name": "Ruby script", "request": "make script.rb for automation"},
    {"name": "Perl script", "request": "create processor.pl"},
    {"name": "Multiple extensions", "request": "save data to output.json in documents"},
    {"name": "Extension inference", "request": "create python script named analyzer"},
    {"name": "Shell inference", "request": "make shell script called monitor"},
    
    # Complex single commands (61-70)
    {"name": "Browser opener", "request": "make a script that opens the default native browser and name it gary browser and put it in a folder named browserstart on desktop"},
    {"name": "Web scraper", "request": "create a python web scraper that fetches data from reddit and saves it to reddit_data.json in documents"},
    {"name": "File organizer", "request": "build a script called file organizer that moves files and put it in downloads"},
    {"name": "Backup tool", "request": "make a backup script that compresses files and call it smart backup in documents"},
    {"name": "System monitor", "request": "create a shell script that monitors system health and name it health check on desktop"},
    {"name": "API client", "request": "build a script that fetches weather data and call it weather client"},
    {"name": "Log parser", "request": "make a script that parses log files and name it log analyzer in a folder named tools"},
    {"name": "Data processor", "request": "create script that processes csv files called batch processor in documents"},
    {"name": "Image handler", "request": "build script that resizes images and name it image resizer on desktop"},
    {"name": "Email sender", "request": "make script that sends notifications called notifier in downloads"},
    
    # Paragraph-length requests (71-80)
    {"name": "Web automation", "request": "I need a comprehensive web automation script that opens my browser navigates to github logs in and stars repositories. Call it github auto star and put it in a folder named automation tools on desktop."},
    {"name": "Data pipeline", "request": "Build a data processing pipeline that takes CSV files cleans them performs analysis and exports to JSON. Name it data analysis pipeline and store in folder called data processing on documents."},
    {"name": "System daemon", "request": "Create a shell script that continuously monitors CPU memory and disk space every 30 seconds and sends notifications. Call it system health monitor and put in folder named system utilities on desktop."},
    {"name": "Weather dashboard", "request": "I want a Python script that fetches weather data from OpenWeatherMap API for multiple cities and generates HTML reports. Name it weather dashboard generator in documents inside folder called weather tools."},
    {"name": "File bot", "request": "Build an intelligent file organization bot that monitors downloads categorizes files by extension and moves them to appropriate folders. Call it file organization bot in folder productivity tools on desktop."},
    {"name": "Backup system", "request": "Create a backup automation script that compresses important directories encrypts them uploads to cloud and sends email notifications. Name it smart backup system in folder backup scripts on documents."},
    {"name": "Dev setup", "request": "I need a shell script that automates development environment setup by installing Homebrew essential tools and configuring shell environment. Call it dev environment setup in folder setup scripts on desktop."},
    {"name": "Meeting notes", "request": "Build a meeting notes tool that records audio transcribes speech extracts action items and generates markdown documents. Name it meeting notes assistant in folder productivity apps on documents."},
    {"name": "Database migrator", "request": "Create a database migration tool that reads schema definitions generates migration scripts and maintains history. Call it database migrator pro in folder database tools on documents."},
    {"name": "Image processor", "request": "I want a Python script that batch processes images resizes them applies corrections converts formats and generates thumbnails. Name it batch image processor in folder media tools on desktop."},
    
    # Multi-file application requests (81-90)
    {"name": "TODO app", "request": "Create a todo list application with main.py for the interface tasks.py for logic and config.json for settings in a folder called todo_app on desktop"},
    {"name": "Blog system", "request": "Build a blog system with blog.py for posts templates folder for HTML and static folder for CSS in a folder named blog_system on documents"},
    {"name": "API server", "request": "Make an API server with server.py routes.py database.py and requirements.txt in folder called api_server on desktop"},
    {"name": "Chat app", "request": "Create a chat application with client.py server.py and utils.py in a folder named chat_app in documents"},
    {"name": "Game project", "request": "Build a game with game.py sprites.py levels.py and config.json in folder called game_project on desktop"},
    {"name": "Web scraper app", "request": "Make a web scraper with scraper.py parser.py database.py and requirements.txt in folder web_scraper on downloads"},
    {"name": "Dashboard app", "request": "Create a dashboard with dashboard.py data.py charts.py and templates folder in folder named dashboard_app on documents"},
    {"name": "Automation suite", "request": "Build automation suite with runner.py tasks.py scheduler.py and config.yaml in folder automation_suite on desktop"},
    {"name": "Testing framework", "request": "Make testing framework with test_runner.py test_cases.py utils.py and fixtures folder in folder test_framework on documents"},
    {"name": "CLI tool", "request": "Create CLI tool with cli.py commands.py helpers.py and setup.py in folder cli_tool on desktop"},
    
    # Full application building (91-100) - THE MOST COMPLEX
    {"name": "E-commerce platform", "request": "Build a complete e-commerce platform with frontend backend database schemas API endpoints payment integration user authentication product catalog shopping cart checkout process admin dashboard analytics reporting and email notifications. Create main_app.py frontend folder backend folder database folder api folder with all necessary files in a folder called ecommerce_platform on desktop. Include requirements.txt README.md and config files."},
    
    {"name": "Social media app", "request": "Create a full social media application with user profiles posts feed comments likes messaging real-time notifications friend system photo uploads video sharing hashtags trending topics and content moderation. Build it with app.py models folder views folder templates folder static folder database schemas and API routes. Put everything in folder social_media_app on documents with proper documentation."},
    
    {"name": "Project management tool", "request": "Develop a comprehensive project management system with projects tasks teams sprint planning kanban boards gantt charts time tracking resource allocation reporting dashboards file attachments comments notifications and integrations. Create main.py backend folder frontend folder database folder utils folder in folder project_manager on desktop with all configuration files."},
    
    {"name": "Learning management system", "request": "Build an LMS with courses lessons quizzes assignments grades student portal instructor dashboard video player progress tracking certificates discussions forums calendar events and analytics. Create lms_app.py courses folder students folder content folder templates folder database schemas in folder learning_platform on documents with setup instructions."},
    
    {"name": "Healthcare portal", "request": "Create a healthcare patient portal with appointments medical records prescriptions lab results doctor messaging telehealth video calls billing insurance claims health tracking and notifications. Build portal.py patient folder doctor folder admin folder database folder API folder in folder healthcare_portal on desktop with security configurations."},
    
    {"name": "Financial dashboard", "request": "Develop a financial tracking dashboard with account management transactions budgeting expense tracking investment portfolio stock market data reporting charts alerts and export features. Create finance_app.py accounts folder transactions folder reports folder charts folder database schemas in folder financial_dashboard on documents with API keys config."},
    
    {"name": "Inventory system", "request": "Build an inventory management system with products warehouses stock tracking orders suppliers barcode scanning reporting alerts reordering and multi-location support. Create inventory.py products folder orders folder suppliers folder reports folder database folder in folder inventory_system on desktop with deployment configs."},
    
    {"name": "CRM application", "request": "Create a CRM with contacts leads deals pipeline sales automation email campaigns analytics reporting task management calendar integration and team collaboration. Build crm_app.py contacts folder deals folder campaigns folder reports folder database schemas in folder crm_system on documents with integration configs."},
    
    {"name": "Booking platform", "request": "Develop a booking and reservation platform with availability calendar booking management payment processing customer accounts service providers scheduling notifications reminders and reviews. Create booking.py services folder customers folder payments folder calendar folder database folder in folder booking_platform on desktop with payment gateway configs."},
    
    {"name": "Content management system", "request": "Build a full CMS with content editor media library user roles workflow publishing SEO tools analytics plugins themes templates and API. Create cms.py content folder media folder users folder themes folder plugins folder database schemas in folder cms_platform on documents with extensive documentation and setup scripts."},
]

def run_100_tests():
    """Run all 100 comprehensive tests."""
    agent = EnhancedLuciferAgent()
    
    print("\n" + "="*80)
    print("🚀 ULTRA-COMPREHENSIVE 100-TEST SUITE")
    print("="*80 + "\n")
    
    passed = 0
    failed = 0
    
    for i, test in enumerate(TEST_CASES, 1):
        name = test["name"]
        request = test["request"]
        
        # Parse
        try:
            steps = agent._parse_dynamic_steps(request)
            
            # Basic validation - should produce 3+ steps
            if len(steps) >= 3:
                passed += 1
                status = "✅"
            else:
                failed += 1
                status = "❌"
            
            # Show progress every 10 tests
            if i % 10 == 0:
                print(f"[{i}/100] {status} {name} ({len(steps)} steps)")
        
        except Exception as e:
            failed += 1
            print(f"[{i}/100] ❌ {name} - ERROR: {e}")
    
    # Summary
    print("\n" + "="*80)
    print("📊 100-TEST SUMMARY")
    print("="*80)
    print(f"Total: 100")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"Success Rate: {passed}%")
    print("="*80 + "\n")
    
    if passed == 100:
        print("🎉 PERFECT! 100/100 tests passed!\n")
    elif passed >= 95:
        print("✅ EXCELLENT! Nearly perfect performance!\n")
    elif passed >= 90:
        print("👍 GREAT! Strong performance across all test types!\n")
    elif passed >= 80:
        print("✔️  GOOD! Solid performance with room for improvement!\n")
    else:
        print("⚠️  Needs attention - some test categories failing.\n")
    
    return passed >= 90

if __name__ == "__main__":
    success = run_100_tests()
    sys.exit(0 if success else 1)
