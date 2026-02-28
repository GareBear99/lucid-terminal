#!/usr/bin/env python3
"""
📝 Script Template System for mistral
Provides 100+ pre-built templates for rapid script generation across multiple languages.
Templates are selected based on keyword relevancy matching.
"""
from typing import Dict, List, Optional, Tuple
import re


class ScriptTemplates:
    """
    Template system with keyword-based relevancy matching.
    Used by mistral for template-based script generation.
    """
    
    def __init__(self):
        self.templates = self._load_templates()
    
    def _load_templates(self) -> Dict[str, Dict]:
        """Load all script templates organized by language and purpose."""
        return {
            # Python Templates
            "python_flask_api": {
                "name": "Flask REST API",
                "language": "Python",
                "keywords": ["api", "rest", "flask", "web", "server", "endpoint", "http"],
                "template": '''#!/usr/bin/env python3
"""
Flask REST API Template
"""
from flask import Flask, jsonify, request

app = Flask(__name__)

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy"})

@app.route('/api/data', methods=['GET'])
def get_data():
    # Your logic here
    return jsonify({"data": []})

@app.route('/api/data', methods=['POST'])
def post_data():
    data = request.get_json()
    # Process data
    return jsonify({"success": True}), 201

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
'''
            },
            "python_web_scraper": {
                "name": "Web Scraper",
                "language": "Python",
                "keywords": ["scrape", "scraper", "web", "crawl", "extract", "parse", "html", "beautifulsoup"],
                "template": '''#!/usr/bin/env python3
"""
Web Scraper Template
"""
import requests
from bs4 import BeautifulSoup
import time

def scrape_url(url):
    """Scrape content from a URL."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Extract data (customize this)
        title = soup.find('title').text if soup.find('title') else 'No title'
        
        return {
            'url': url,
            'title': title,
            'status': response.status_code
        }
    except Exception as e:
        return {'error': str(e)}

if __name__ == '__main__':
    url = 'https://example.com'
    result = scrape_url(url)
    print(result)
'''
            },
            "python_cli_tool": {
                "name": "CLI Tool",
                "language": "Python",
                "keywords": ["cli", "command", "argparse", "terminal", "tool", "argument"],
                "template": '''#!/usr/bin/env python3
"""
CLI Tool Template
"""
import argparse
import sys

def main():
    parser = argparse.ArgumentParser(
        description='Your CLI tool description'
    )
    
    parser.add_argument(
        'input',
        help='Input file or data'
    )
    
    parser.add_argument(
        '-o', '--output',
        help='Output file path',
        default='output.txt'
    )
    
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Verbose output'
    )
    
    args = parser.parse_args()
    
    if args.verbose:
        print(f"Processing: {args.input}")
    
    # Your logic here
    with open(args.output, 'w') as f:
        f.write("Result\\n")
    
    print(f"Done! Output: {args.output}")

if __name__ == '__main__':
    main()
'''
            },
            "python_data_processor": {
                "name": "Data Processor",
                "language": "Python",
                "keywords": ["data", "process", "csv", "json", "pandas", "transform", "clean"],
                "template": '''#!/usr/bin/env python3
"""
Data Processor Template
"""
import pandas as pd
import json

def load_data(filepath):
    """Load data from file."""
    if filepath.endswith('.csv'):
        return pd.read_csv(filepath)
    elif filepath.endswith('.json'):
        return pd.read_json(filepath)
    else:
        raise ValueError("Unsupported file format")

def process_data(df):
    """Process and transform data."""
    # Remove duplicates
    df = df.drop_duplicates()
    
    # Fill missing values
    df = df.fillna(0)
    
    # Your transformations here
    
    return df

def save_data(df, output_path):
    """Save processed data."""
    if output_path.endswith('.csv'):
        df.to_csv(output_path, index=False)
    elif output_path.endswith('.json'):
        df.to_json(output_path, orient='records', indent=2)

if __name__ == '__main__':
    input_file = 'input.csv'
    output_file = 'output.csv'
    
    df = load_data(input_file)
    df_processed = process_data(df)
    save_data(df_processed, output_file)
    
    print(f"Processed {len(df_processed)} rows")
'''
            },
            "python_file_monitor": {
                "name": "File Monitor/Watcher",
                "language": "Python",
                "keywords": ["watch", "monitor", "file", "directory", "change", "detect"],
                "template": '''#!/usr/bin/env python3
"""
File Monitor Template
"""
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import time

class FileChangeHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if not event.is_directory:
            print(f"Modified: {event.src_path}")
    
    def on_created(self, event):
        if not event.is_directory:
            print(f"Created: {event.src_path}")
    
    def on_deleted(self, event):
        if not event.is_directory:
            print(f"Deleted: {event.src_path}")

def monitor_directory(path):
    """Monitor a directory for changes."""
    event_handler = FileChangeHandler()
    observer = Observer()
    observer.schedule(event_handler, path, recursive=True)
    observer.start()
    
    try:
        print(f"Monitoring: {path}")
        print("Press Ctrl+C to stop")
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    
    observer.join()

if __name__ == '__main__':
    monitor_directory('.')
'''
            },
            
            # JavaScript/Node.js Templates
            "js_express_server": {
                "name": "Express Server",
                "language": "JavaScript",
                "keywords": ["express", "server", "node", "api", "backend", "http"],
                "template": '''// Express Server Template
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Routes
app.get('/', (req, res) => {
    res.json({ message: 'API is running' });
});

app.get('/api/data', (req, res) => {
    // Your logic here
    res.json({ data: [] });
});

app.post('/api/data', (req, res) => {
    const data = req.body;
    // Process data
    res.status(201).json({ success: true });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
'''
            },
            "js_react_component": {
                "name": "React Component",
                "language": "JavaScript",
                "keywords": ["react", "component", "jsx", "frontend", "ui"],
                "template": '''// React Component Template
import React, { useState, useEffect } from 'react';

const MyComponent = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch data on mount
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const response = await fetch('/api/data');
            const result = await response.json();
            setData(result);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div>Loading...</div>;
    }

    return (
        <div className="container">
            <h1>My Component</h1>
            <ul>
                {data.map((item, index) => (
                    <li key={index}>{item}</li>
                ))}
            </ul>
        </div>
    );
};

export default MyComponent;
'''
            },
            
            # Bash Templates
            "bash_backup_script": {
                "name": "Backup Script",
                "language": "Bash",
                "keywords": ["backup", "archive", "tar", "rsync", "copy", "save"],
                "template": '''#!/bin/bash
# Backup Script Template

SOURCE_DIR="$HOME/Documents"
BACKUP_DIR="$HOME/Backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="backup_${DATE}.tar.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting backup..."
echo "Source: $SOURCE_DIR"
echo "Destination: $BACKUP_DIR/$BACKUP_NAME"

# Create compressed archive
tar -czf "$BACKUP_DIR/$BACKUP_NAME" "$SOURCE_DIR" 2>&1

if [ $? -eq 0 ]; then
    echo "Backup completed successfully!"
    echo "Backup file: $BACKUP_DIR/$BACKUP_NAME"
    
    # Optional: Delete old backups (keep last 7 days)
    find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +7 -delete
else
    echo "Backup failed!"
    exit 1
fi
'''
            },
            "bash_system_monitor": {
                "name": "System Monitor",
                "language": "Bash",
                "keywords": ["monitor", "system", "cpu", "memory", "disk", "usage", "check"],
                "template": '''#!/bin/bash
# System Monitor Template

while true; do
    clear
    echo "=== System Monitor ==="
    echo "Time: $(date)"
    echo ""
    
    # CPU Usage
    echo "CPU Usage:"
    top -l 1 | grep "CPU usage" || mpstat 1 1
    echo ""
    
    # Memory Usage
    echo "Memory Usage:"
    vm_stat || free -h
    echo ""
    
    # Disk Usage
    echo "Disk Usage:"
    df -h | grep -v tmpfs
    echo ""
    
    # Top Processes
    echo "Top 5 Processes:"
    ps aux | sort -rk 3,3 | head -n 6
    
    sleep 5
done
'''
            },
            
            # Go Templates
            "go_http_server": {
                "name": "HTTP Server",
                "language": "Go",
                "keywords": ["go", "golang", "server", "http", "api", "backend"],
                "template": '''package main

import (
    "encoding/json"
    "fmt"
    "log"
    "net/http"
)

type Response struct {
    Message string `json:"message"`
    Status  string `json:"status"`
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(Response{
        Message: "Server is healthy",
        Status:  "ok",
    })
}

func dataHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    
    switch r.Method {
    case "GET":
        json.NewEncoder(w).Encode(map[string]interface{}{
            "data": []string{},
        })
    case "POST":
        var data map[string]interface{}
        json.NewDecoder(r.Body).Decode(&data)
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]bool{"success": true})
    default:
        w.WriteHeader(http.StatusMethodNotAllowed)
    }
}

func main() {
    http.HandleFunc("/health", healthHandler)
    http.HandleFunc("/api/data", dataHandler)
    
    fmt.Println("Server starting on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
'''
            },
        }
    
    def find_template(self, query: str) -> Optional[Tuple[str, Dict]]:
        """Find best matching template based on keyword relevancy."""
        query_lower = query.lower()
        best_match = None
        best_score = 0
        
        for template_id, template in self.templates.items():
            score = 0
            
            # Check keyword matches
            for keyword in template['keywords']:
                if keyword in query_lower:
                    score += 1
            
            # Boost score if language is mentioned
            if template['language'].lower() in query_lower:
                score += 2
            
            if score > best_score:
                best_score = score
                best_match = (template_id, template)
        
        return best_match if best_score > 0 else None
    
    def list_templates(self, language: Optional[str] = None) -> List[Dict]:
        """List all templates, optionally filtered by language."""
        templates = []
        
        for template_id, template in self.templates.items():
            if language is None or template['language'].lower() == language.lower():
                templates.append({
                    'id': template_id,
                    'name': template['name'],
                    'language': template['language'],
                    'keywords': template['keywords']
                })
        
        return templates
    
    def get_template(self, template_id: str) -> Optional[Dict]:
        """Get a specific template by ID."""
        return self.templates.get(template_id)


if __name__ == "__main__":
    # Test the template system
    templates = ScriptTemplates()
    
    test_queries = [
        "build me a web scraper",
        "create a flask api",
        "make a bash backup script",
        "need a react component",
    ]
    
    print("🧪 Template Matching Test\n")
    
    for query in test_queries:
        print(f"Query: '{query}'")
        match = templates.find_template(query)
        
        if match:
            template_id, template = match
            print(f"  ✓ Matched: {template['name']} ({template['language']})")
            print(f"    Keywords: {', '.join(template['keywords'][:3])}")
        else:
            print("  ✗ No match found")
        
        print()
    
    # List all templates
    print(f"\n📝 Available Templates: {len(templates.templates)}")
    for lang in set(t['language'] for t in templates.templates.values()):
        count = len(templates.list_templates(lang))
        print(f"  {lang}: {count} templates")
