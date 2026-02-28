#!/bin/bash
# Switch llamafile server to a different model

MODEL=$1
PORT=11434

if [ -z "$MODEL" ]; then
    echo "Usage: $0 <tinyllama|llama3.2|mistral>"
    exit 1
fi

# Stop any running llamafile
pkill -f llamafile
sleep 2

# Start the requested model
case "$MODEL" in
    tinyllama)
        nohup ./.luciferai/bin/llamafile --server --nobrowser --model ./.luciferai/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf --port $PORT --host 127.0.0.1 > /tmp/llamafile.log 2>&1 &
        echo "✅ Started TinyLlama on port $PORT"
        ;;
    llama3.2)
        nohup ./.luciferai/bin/llamafile --server --nobrowser --model ./.luciferai/models/llama-3.2-3b-instruct-Q4_K_M.gguf --port $PORT --host 127.0.0.1 > /tmp/llamafile.log 2>&1 &
        echo "✅ Started Llama3.2 on port $PORT"
        ;;
    mistral)
        nohup ./.luciferai/bin/llamafile --server --nobrowser --model ./.luciferai/models/mistral-7b-instruct-v0.2.Q4_K_M.gguf --port $PORT --host 127.0.0.1 > /tmp/llamafile.log 2>&1 &
        echo "✅ Started Mistral on port $PORT"
        ;;
    *)
        echo "❌ Unknown model: $MODEL"
        exit 1
        ;;
esac

# Wait for server to start (longer for larger models)
sleep 20
