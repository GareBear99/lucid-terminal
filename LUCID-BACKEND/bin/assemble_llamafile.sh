#!/bin/bash
# Reassemble llamafile from split parts
# Run this after cloning the repo
# Assembles into the canonical location <project>/.luciferai/bin/llamafile
# (see core/lucifer_paths.py) — the old script assembled into bin/, a
# directory no component ever looked in.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST_DIR="$PROJECT_ROOT/.luciferai/bin"
cd "$SCRIPT_DIR"

if [ -f "$DEST_DIR/llamafile" ]; then
    echo "✅ llamafile already assembled"
    exit 0
fi

echo "🔧 Assembling llamafile from parts..."

if [ ! -f "llamafile.part.aa" ]; then
    echo "❌ llamafile parts not found"
    exit 1
fi

mkdir -p "$DEST_DIR"
cat llamafile.part.* > "$DEST_DIR/llamafile"
chmod +x "$DEST_DIR/llamafile"

echo "✅ llamafile assembled ($(du -h "$DEST_DIR/llamafile" | cut -f1))"
echo "   Location: $DEST_DIR/llamafile"
