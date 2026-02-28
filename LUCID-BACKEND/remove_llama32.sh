#!/bin/bash
# Script to remove all llama3.2 references from LuciferAI codebase

cd /Users/TheRustySpoon/Desktop/Projects/LuciferAI_Local

echo "Removing llama3.2 references from codebase..."

# Backup first
echo "Creating backups in /tmp/luciferai_backup_$(date +%s)..."
backup_dir="/tmp/luciferai_backup_$(date +%s)"
mkdir -p "$backup_dir"

# List of files to modify
files=(
    "core/model_files_map.py"
    "core/lucifer_colors.py"
    "core/llamafile_agent.py"
    "core/memory_system.py"
    "core/nlp_parser.py"
    "core/command_keywords.py"
    "core/llm_backend.py"
    "core/model_collaboration.py"
    "core/model_download.py"
    "core/model_lock_manager.py"
    "core/ollama_agent.py"
    "core/system_test.py"
)

# Backup files
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" "$backup_dir/$(basename $file)"
    fi
done

echo "Backups created in $backup_dir"

# Remove llama3.2 lines from model_files_map.py
echo "Cleaning model_files_map.py..."
sed -i.bak "/llama3\.2/d" core/model_files_map.py
sed -i.bak "/llama-3\.2/d" core/model_files_map.py

echo "✅ Complete! Backups saved to $backup_dir"
echo "Original files backed up with .bak extension"
echo ""
echo "Run 'grep -r \"llama3\\.2\" core/ | wc -l' to verify remaining references"
