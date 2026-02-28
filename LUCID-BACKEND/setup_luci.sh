#!/usr/bin/env bash
# Setup script for Luci! Package Manager
# This adds a shell function to make 'luci!' available in terminal

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHELL_RC="$HOME/.bashrc"

# Detect shell and use appropriate config file
if [ -n "$ZSH_VERSION" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ]; then
    if [ -f "$HOME/.bash_profile" ]; then
        SHELL_RC="$HOME/.bash_profile"
    else
        SHELL_RC="$HOME/.bashrc"
    fi
fi

echo "📦 Setting up Luci! Package Manager..."
echo ""

# Create shell function
FUNCTION_DEF="# Luci! Package Manager
luci() {
    python3 \"$SCRIPT_DIR/luci/package_manager.py\" \"\$@\"
}
export -f luci 2>/dev/null || true"

# Check if already installed
if grep -q "# Luci! Package Manager" "$SHELL_RC" 2>/dev/null; then
    echo "✓ Luci! is already set up in $SHELL_RC"
    echo ""
    echo "Usage:"
    echo "  luci install <package>"
    echo "  luci list"
    echo "  luci uninstall <package>"
    echo "  luci update"
    echo ""
    echo "Note: Since the function uses 'luci' (no exclamation), use:"
    echo "  luci install ollama"
    echo ""
    echo "Or run directly:"
    echo "  python3 $SCRIPT_DIR/luci/package_manager.py install ollama"
else
    # Add to shell config
    echo "" >> "$SHELL_RC"
    echo "$FUNCTION_DEF" >> "$SHELL_RC"
    
    echo "✅ Added Luci! function to $SHELL_RC"
    echo ""
    echo "To use it now, run:"
    echo "  source $SHELL_RC"
    echo ""
    echo "Then you can use:"
    echo "  luci install <package>"
    echo "  luci list"
    echo ""
fi
