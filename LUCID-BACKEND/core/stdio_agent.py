#!/usr/bin/env python3
import sys
import json
import os
import io
import asyncio
from pathlib import Path
from typing import Dict, Any, Optional

# Add project root to path
current_dir = Path(__file__).parent.absolute()
project_root = current_dir.parent
sys.path.append(str(project_root))

from core.enhanced_agent import EnhancedLuciferAgent
from core.lucifer_colors import c

class StdioAgent:
    def __init__(self):
        self.agent = EnhancedLuciferAgent()
        self.setup_environment()
        
    def setup_environment(self):
        """Configure environment for non-interactive mode."""
        os.environ['LUCIFER_NON_INTERACTIVE'] = 'true'
        # Ensure stdout is using utf-8
        if sys.platform == 'win32':
             import msvcrt
             msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
             # We will encode manually to avoid windows newline translation issues if needed,
             # but Python 3's sys.stdout should handle text mode fine usually.
             # forcing utf8 encoding for stdout/stdin:
        sys.stdin.reconfigure(encoding='utf-8')
        sys.stdout.reconfigure(encoding='utf-8')

    def process_command(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Process a JSON command."""
        command = data.get('command')
        
        if command == 'chat':
            message = data.get('message', '')
            cwd = data.get('cwd')
            
            if cwd:
                self.agent.env['cwd'] = cwd
                try:
                    os.chdir(cwd)
                except:
                    pass

            # Capture stdout from agent execution
            f = io.StringIO()
            from contextlib import redirect_stdout
            
            with redirect_stdout(f):
                response_text = self.agent.process_request(message)
                
            captured_output = f.getvalue()
            
            # Combine response
            final_response = response_text if response_text else ""
            if captured_output:
                if final_response:
                    final_response = f"{captured_output}\n{final_response}"
                else:
                    final_response = captured_output
            
            return {
                'status': 'success',
                'response': final_response,
                'cwd': self.agent.env['cwd']
            }
            
        elif command == 'health':
            return {'status': 'ok', 'backend': 'stdio'}
            
        else:
            return {'status': 'error', 'error': f'Unknown command: {command}'}

    def run(self):
        """Main loop reading from stdin."""
        # Print ready signal
        print(json.dumps({'type': 'ready', 'status': 'ok'}), flush=True)
        
        while True:
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                
                if not line.strip():
                    continue
                    
                try:
                    data = json.loads(line)
                    response = self.process_command(data)
                    # Wrap in standard response format
                    print(json.dumps(response), flush=True)
                except json.JSONDecodeError:
                    print(json.dumps({'status': 'error', 'error': 'Invalid JSON'}), flush=True)
                except Exception as e:
                    print(json.dumps({'status': 'error', 'error': str(e)}), flush=True)
                    
            except KeyboardInterrupt:
                break
            except Exception as e:
                # Fatal error
                print(json.dumps({'status': 'fatal', 'error': str(e)}), flush=True)
                break

if __name__ == "__main__":
    agent = StdioAgent()
    agent.run()
