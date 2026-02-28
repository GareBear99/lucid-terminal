#!/bin/bash

# Find and kill the python3 test_create_flow.py process
pkill -f "python3 test_create_flow.py"

if [ $? -eq 0 ]; then
    echo "Process stopped successfully"
else
    echo "No matching process found or failed to stop"
fi
