#!/usr/bin/env python3
"""
🚀 LuciferAI API Server
Wraps the EnhancedLuciferAgent in a FastAPI server for the Electron frontend.
"""
import sys
import os
import asyncio
from pathlib import Path
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn

# Add core to path
sys.path.insert(0, str(Path(__file__).parent / "core"))

# Import the agent
from enhanced_agent import EnhancedLuciferAgent

app = FastAPI(title="LuciferAI Local API", version="1.0.0")

# Enable CORS for Electron
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global agent instance
agent = None

class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None
    cwd: Optional[str] = None

class CommandRequest(BaseModel):
    command: str
    cwd: Optional[str] = None

@app.on_event("startup")
async def startup_event():
    global agent
    print("Initializing LuciferAI agent...")
    # Set non-interactive mode to avoid blocking input prompts in agent
    os.environ["LUCIFER_NON_INTERACTIVE"] = "true"
    
    # Initialize agent without interactive mode components if possible
    # We might need to adjust EnhancedLuciferAgent to be more API-friendly
    # For now, we instantiate it as is.
    try:
        agent = EnhancedLuciferAgent()
        print("LuciferAI agent initialized successfully.")
    except Exception as e:
        print(f"Failed to initialize agent: {e}")
        # We don't exit here so the server can still start and report the error
        
@app.get("/health")
async def health_check():
    global agent
    status = "healthy" if agent else "initializing"
    return {"status": status, "version": "1.0.0"}

@app.post("/chat")
async def chat(request: ChatRequest):
    global agent
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized")
    
    try:
        # Update agent's concept of CWD if provided
        if request.cwd:
            agent.env['cwd'] = request.cwd
            
        # Capture stdout
        import io
        from contextlib import redirect_stdout
        
        f = io.StringIO()
        with redirect_stdout(f):
            response_text = agent.process_request(request.message)
            
        captured_output = f.getvalue()
        
        # Combine returned response and captured output
        # If response_text is empty/None but we have output, use output
        final_response = response_text if response_text else ""
        
        if captured_output:
            if final_response:
                final_response = f"{captured_output}\n{final_response}"
            else:
                final_response = captured_output
                
        # Clean ANSI codes if needed (frontend handles them, but good to be safe)
        # For now, we pass them through as the frontend terminal likely supports them
        
        return {"response": final_response}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Streaming endpoint (if we want to support streaming later)
# @app.post("/chat/stream")
# async def chat_stream(request: ChatRequest):
#    ...

if __name__ == "__main__":
    # Run with uvicorn
    # Port 8000 is default, but Electron might need to configure this
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="127.0.0.1", port=port)
