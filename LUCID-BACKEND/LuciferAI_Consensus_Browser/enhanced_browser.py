#!/usr/bin/env python3
"""
🔍 LuciferAI Enhanced Consensus Browser
Modern, glossy Warp AI-inspired interface with three beautiful themes
"""
import sys
import os
import json
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, Menu, font
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))

# Theme definitions - Warp AI inspired
THEMES = {
    "lucifer": {
        "name": "👾 Lucifer Dark",
        "bg": "#0d0215",
        "fg": "#e8d5ff",
        "panel_bg": "#1a0a2e",
        "panel_border": "#3d1f5c",
        "select_bg": "#5a2d8f",
        "select_fg": "#ffffff",
        "tree_bg": "#160828",
        "tree_fg": "#d4b5ff",
        "text_bg": "#1f0d35",
        "text_fg": "#e0c8ff",
        "button_bg": "#6b3aa0",
        "button_hover": "#7d4bb8",
        "button_active": "#8f5dd0",
        "button_fg": "#ffffff",
        "accent": "#a855f7",
        "accent2": "#c084fc",
        "border": "#4a2570",
        "highlight": "#d946ef",
        "shadow": "rgba(138, 43, 226, 0.3)",
        "glass_overlay": "rgba(26, 10, 46, 0.85)"
    },
    "gatorrent": {
        "name": "🐊 Gatorrent Green",
        "bg": "#0a0f0a",
        "fg": "#e8ffe8",
        "panel_bg": "#0f1a0f",
        "panel_border": "#1f3d1f",
        "select_bg": "#2d5a2d",
        "select_fg": "#ffffff",
        "tree_bg": "#0d180d",
        "tree_fg": "#c8ffc8",
        "text_bg": "#0e1c0e",
        "text_fg": "#d5ffd5",
        "button_bg": "#3aa060",
        "button_hover": "#4bb878",
        "button_active": "#5dd090",
        "button_fg": "#ffffff",
        "accent": "#10b981",
        "accent2": "#34d399",
        "border": "#256040",
        "highlight": "#22c55e",
        "shadow": "rgba(16, 185, 129, 0.3)",
        "glass_overlay": "rgba(15, 26, 15, 0.85)"
    },
    "midnight": {
        "name": "🌙 Midnight Blue",
        "bg": "#0a0e1a",
        "fg": "#d5e5ff",
        "panel_bg": "#0f1629",
        "panel_border": "#1f2d4d",
        "select_bg": "#2d4a8f",
        "select_fg": "#ffffff",
        "tree_bg": "#0d1424",
        "tree_fg": "#b8d5ff",
        "text_bg": "#0e1828",
        "text_fg": "#c8e0ff",
        "button_bg": "#3a70b8",
        "button_hover": "#4b88d0",
        "button_active": "#5da0e8",
        "button_fg": "#ffffff",
        "accent": "#3b82f6",
        "accent2": "#60a5fa",
        "border": "#254070",
        "highlight": "#2563eb",
        "shadow": "rgba(59, 130, 246, 0.3)",
        "glass_overlay": "rgba(15, 22, 41, 0.85)"
    }
}


class GlossyFrame(tk.Frame):
    """Custom frame with glossy effect."""
    
    def __init__(self, parent, theme, **kwargs):
        super().__init__(parent, **kwargs)
        self.theme = theme
        self.configure(
            bg=theme["panel_bg"],
            highlightbackground=theme["border"],
            highlightthickness=2,
            relief=tk.FLAT
        )


class GlossyButton(tk.Button):
    """Custom button with glossy hover effect."""
    
    def __init__(self, parent, theme, **kwargs):
        super().__init__(parent, **kwargs)
        self.theme = theme
        self.default_config = {
            "bg": theme["button_bg"],
            "fg": theme["button_fg"],
            "activebackground": theme["button_active"],
            "activeforeground": theme["button_fg"],
            "relief": tk.FLAT,
            "padx": 20,
            "pady": 8,
            "font": ("SF Pro Display", 11, "bold"),
            "cursor": "hand2",
            "borderwidth": 0
        }
        self.configure(**self.default_config)
        
        # Hover effects
        self.bind("<Enter>", self._on_enter)
        self.bind("<Leave>", self._on_leave)
    
    def _on_enter(self, e):
        self.configure(bg=self.theme["button_hover"])
    
    def _on_leave(self, e):
        self.configure(bg=self.theme["button_bg"])


class EnhancedConsensusBrowser:
    """
    Enhanced consensus browser with modern, glossy UI.
    Inspired by Warp AI terminal aesthetics.
    """
    
    def __init__(self, root):
        self.root = root
        self.root.title("🔍 LuciferAI Consensus Browser")
        self.root.geometry("1600x1000")
        
        # Load data
        self.lucifer_home = Path.home() / ".luciferai"
        self.dictionary = self._load_dictionary()
        self.remote_refs = self._load_remote_refs()
        self.branches = self._load_branches()
        self.script_counters = self._load_script_counters()
        
        # Current selection
        self.current_fix = None
        
        # Theme management
        self.current_theme = "lucifer"
        self._load_theme_preference()
        self.theme = THEMES[self.current_theme]
        
        # Setup custom fonts
        self._setup_fonts()
        
        # Setup UI
        self._setup_menu()
        self._setup_ui()
        self._apply_theme()
        self._populate_tree()
        
        # Window effects
        self.root.configure(bg=self.theme["bg"])
    
    def _setup_fonts(self):
        """Setup custom fonts."""
        self.title_font = font.Font(family="SF Pro Display", size=24, weight="bold")
        self.header_font = font.Font(family="SF Pro Display", size=14, weight="bold")
        self.body_font = font.Font(family="SF Pro Text", size=11)
        self.mono_font = font.Font(family="Monaco", size=11)
    
    def _load_dictionary(self) -> Dict:
        """Load local fix dictionary."""
        dict_file = self.lucifer_home / "data" / "fix_dictionary.json"
        if dict_file.exists():
            with open(dict_file) as f:
                return json.load(f)
        return {}
    
    def _load_remote_refs(self) -> List[Dict]:
        """Load remote fix references."""
        refs = []
        fixnet_refs = self.lucifer_home / "fixnet" / "refs.json"
        if fixnet_refs.exists():
            with open(fixnet_refs) as f:
                refs = json.load(f)
        return refs
    
    def _load_branches(self) -> Dict:
        """Load branch connections."""
        branches_file = self.lucifer_home / "data" / "user_branches.json"
        if branches_file.exists():
            with open(branches_file) as f:
                return json.load(f)
        return {}
    
    def _load_script_counters(self) -> Dict:
        """Load per-script counters."""
        counters_file = self.lucifer_home / "data" / "script_counters.json"
        if counters_file.exists():
            with open(counters_file) as f:
                return json.load(f)
        return {}
    
    def _load_theme_preference(self):
        """Load saved theme preference."""
        theme_file = self.lucifer_home / "data" / "browser_theme.txt"
        if theme_file.exists():
            try:
                theme = theme_file.read_text().strip()
                if theme in THEMES:
                    self.current_theme = theme
            except:
                pass
    
    def _save_theme_preference(self):
        """Save theme preference."""
        theme_file = self.lucifer_home / "data" / "browser_theme.txt"
        theme_file.write_text(self.current_theme)
    
    def _setup_menu(self):
        """Setup menu bar."""
        menubar = Menu(self.root, bg=self.theme["panel_bg"], fg=self.theme["fg"])
        self.root.config(menu=menubar)
        
        # File menu
        file_menu = Menu(menubar, tearoff=0, bg=self.theme["panel_bg"], fg=self.theme["fg"])
        menubar.add_cascade(label="File", menu=file_menu)
        file_menu.add_command(label="🔄 Refresh Data", command=self._refresh)
        file_menu.add_separator()
        file_menu.add_command(label="❌ Exit", command=self.root.quit)
        
        # View menu
        view_menu = Menu(menubar, tearoff=0, bg=self.theme["panel_bg"], fg=self.theme["fg"])
        menubar.add_cascade(label="View", menu=view_menu)
        
        # Theme submenu
        theme_menu = Menu(view_menu, tearoff=0, bg=self.theme["panel_bg"], fg=self.theme["fg"])
        view_menu.add_cascade(label="🎨 Theme", menu=theme_menu)
        
        for theme_id, theme_data in THEMES.items():
            theme_menu.add_command(
                label=theme_data["name"],
                command=lambda t=theme_id: self._change_theme(t)
            )
        
        # Help menu
        help_menu = Menu(menubar, tearoff=0, bg=self.theme["panel_bg"], fg=self.theme["fg"])
        menubar.add_cascade(label="Help", menu=help_menu)
        help_menu.add_command(label="ℹ️ About", command=self._show_about)
        help_menu.add_command(label="⌨️ Shortcuts", command=self._show_shortcuts)
        help_menu.add_separator()
        help_menu.add_command(label="🔄 Reset Editor Settings", command=self._reset_editor_settings)
    
    def _setup_ui(self):
        """Setup the user interface with glossy panels."""
        # Main container with padding
        main_container = tk.Frame(self.root, bg=self.theme["bg"])
        main_container.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)
        
        # Title bar (glossy header)
        self._create_title_bar(main_container)
        
        # Stats bar
        self._create_stats_bar(main_container)
        
        # Main content (split view with glossy panels)
        content_frame = tk.Frame(main_container, bg=self.theme["bg"])
        content_frame.pack(fill=tk.BOTH, expand=True, pady=(10, 0))
        
        # Left panel (tree view with glass effect)
        self._create_left_panel(content_frame)
        
        # Right panel (detail view with glass effect)
        self._create_right_panel(content_frame)
    
    def _create_title_bar(self, parent):
        """Create glossy title bar."""
        title_frame = GlossyFrame(parent, self.theme)
        title_frame.pack(fill=tk.X, pady=(0, 15))
        
        title_inner = tk.Frame(title_frame, bg=self.theme["panel_bg"])
        title_inner.pack(fill=tk.X, padx=20, pady=15)
        
        # Title with gradient effect (simulated with colors)
        title_label = tk.Label(
            title_inner,
            text="🔍 Consensus Dictionary Browser",
            font=self.title_font,
            bg=self.theme["panel_bg"],
            fg=self.theme["accent"]
        )
        title_label.pack(side=tk.LEFT)
        
        # Version badge
        version_label = tk.Label(
            title_inner,
            text="v2.0",
            font=("SF Pro Display", 10),
            bg=self.theme["button_bg"],
            fg=self.theme["button_fg"],
            padx=10,
            pady=3
        )
        version_label.pack(side=tk.RIGHT, padx=(10, 0))
    
    def _create_stats_bar(self, parent):
        """Create stats bar with badges."""
        stats_frame = tk.Frame(parent, bg=self.theme["bg"])
        stats_frame.pack(fill=tk.X, pady=(0, 15))
        
        local_count = sum(len(fixes) for fixes in self.dictionary.values())
        remote_count = len(self.remote_refs)
        
        # Local fixes badge
        local_badge = tk.Label(
            stats_frame,
            text=f"📚 Local: {local_count}",
            font=self.header_font,
            bg=self.theme["panel_bg"],
            fg=self.theme["accent"],
            padx=20,
            pady=10
        )
        local_badge.pack(side=tk.LEFT, padx=(0, 10))
        
        # Remote fixes badge
        remote_badge = tk.Label(
            stats_frame,
            text=f"🌍 Remote: {remote_count}",
            font=self.header_font,
            bg=self.theme["panel_bg"],
            fg=self.theme["accent2"],
            padx=20,
            pady=10
        )
        remote_badge.pack(side=tk.LEFT)
        
        # Current theme indicator
        theme_badge = tk.Label(
            stats_frame,
            text=f"🎨 {THEMES[self.current_theme]['name']}",
            font=("SF Pro Display", 10),
            bg=self.theme["button_bg"],
            fg=self.theme["button_fg"],
            padx=15,
            pady=8
        )
        theme_badge.pack(side=tk.RIGHT)
    
    def _create_left_panel(self, parent):
        """Create left panel with tree view."""
        left_panel = GlossyFrame(parent, self.theme, width=500)
        left_panel.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 10))
        
        # Search bar with glossy style
        search_frame = tk.Frame(left_panel, bg=self.theme["panel_bg"])
        search_frame.pack(fill=tk.X, padx=15, pady=15)
        
        search_label = tk.Label(
            search_frame,
            text="🔍",
            font=("SF Pro Display", 14),
            bg=self.theme["panel_bg"],
            fg=self.theme["fg"]
        )
        search_label.pack(side=tk.LEFT, padx=(0, 10))
        
        self.search_var = tk.StringVar()
        self.search_var.trace('w', lambda *args: self._filter_tree())
        
        search_entry = tk.Entry(
            search_frame,
            textvariable=self.search_var,
            font=self.body_font,
            bg=self.theme["text_bg"],
            fg=self.theme["text_fg"],
            insertbackground=self.theme["accent"],
            relief=tk.FLAT,
            bd=0
        )
        search_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=8, padx=5)
        
        # Tree view with custom styling
        tree_container = tk.Frame(left_panel, bg=self.theme["tree_bg"])
        tree_container.pack(fill=tk.BOTH, expand=True, padx=15, pady=(0, 15))
        
        # Scrollbars
        tree_scroll_y = tk.Scrollbar(tree_container)
        tree_scroll_y.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.tree = ttk.Treeview(
            tree_container,
            columns=("type", "count", "source"),
            yscrollcommand=tree_scroll_y.set,
            selectmode=tk.BROWSE
        )
        self.tree.pack(fill=tk.BOTH, expand=True)
        
        tree_scroll_y.config(command=self.tree.yview)
        
        # Tree columns
        self.tree.heading("#0", text="Error Pattern")
        self.tree.heading("type", text="Type")
        self.tree.heading("count", text="Uses")
        self.tree.heading("source", text="Source")
        
        self.tree.column("#0", width=280)
        self.tree.column("type", width=100)
        self.tree.column("count", width=50)
        self.tree.column("source", width=70)
        
        # Bind selection
        self.tree.bind("<<TreeviewSelect>>", self._on_select)
    
    def _create_right_panel(self, parent):
        """Create right panel with detail tabs."""
        right_panel = GlossyFrame(parent, self.theme)
        right_panel.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)
        
        # Tabs with custom styling
        self.notebook = ttk.Notebook(right_panel)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=15, pady=15)
        
        # Solution tab
        self._create_solution_tab()
        
        # Metadata tab
        self._create_metadata_tab()
        
        # Branches tab
        self._create_branches_tab()
        
        # Action buttons
        self._create_action_buttons(right_panel)
    
    def _create_solution_tab(self):
        """Create solution tab with syntax highlighting."""
        solution_frame = tk.Frame(self.notebook, bg=self.theme["panel_bg"])
        self.notebook.add(solution_frame, text="📄 Solution")
        
        self.solution_text = scrolledtext.ScrolledText(
            solution_frame,
            wrap=tk.WORD,
            font=self.mono_font,
            bg=self.theme["text_bg"],
            fg=self.theme["text_fg"],
            insertbackground=self.theme["accent"],
            selectbackground=self.theme["select_bg"],
            selectforeground=self.theme["select_fg"],
            relief=tk.FLAT,
            padx=15,
            pady=15,
            borderwidth=0
        )
        self.solution_text.pack(fill=tk.BOTH, expand=True)
    
    def _create_metadata_tab(self):
        """Create metadata tab."""
        meta_frame = tk.Frame(self.notebook, bg=self.theme["panel_bg"])
        self.notebook.add(meta_frame, text="ℹ️ Metadata")
        
        self.meta_text = scrolledtext.ScrolledText(
            meta_frame,
            wrap=tk.WORD,
            font=self.body_font,
            bg=self.theme["text_bg"],
            fg=self.theme["text_fg"],
            insertbackground=self.theme["accent"],
            selectbackground=self.theme["select_bg"],
            selectforeground=self.theme["select_fg"],
            relief=tk.FLAT,
            padx=15,
            pady=15,
            borderwidth=0
        )
        self.meta_text.pack(fill=tk.BOTH, expand=True)
    
    def _create_branches_tab(self):
        """Create branches tab."""
        branches_frame = tk.Frame(self.notebook, bg=self.theme["panel_bg"])
        self.notebook.add(branches_frame, text="🌿 Branches")
        
        self.branches_text = scrolledtext.ScrolledText(
            branches_frame,
            wrap=tk.WORD,
            font=self.body_font,
            bg=self.theme["text_bg"],
            fg=self.theme["text_fg"],
            insertbackground=self.theme["accent"],
            selectbackground=self.theme["select_bg"],
            selectforeground=self.theme["select_fg"],
            relief=tk.FLAT,
            padx=15,
            pady=15,
            borderwidth=0
        )
        self.branches_text.pack(fill=tk.BOTH, expand=True)
    
    def _create_action_buttons(self, parent):
        """Create action buttons with glossy style."""
        button_frame = tk.Frame(parent, bg=self.theme["panel_bg"])
        button_frame.pack(fill=tk.X, padx=15, pady=(0, 15))
        
        GlossyButton(
            button_frame,
            self.theme,
            text="📋 Copy",
            command=self._copy_solution
        ).pack(side=tk.LEFT, padx=(0, 10))
        
        GlossyButton(
            button_frame,
            self.theme,
            text="🔗 GitHub",
            command=self._open_github
        ).pack(side=tk.LEFT, padx=(0, 10))
        
        GlossyButton(
            button_frame,
            self.theme,
            text="🔄 Refresh",
            command=self._refresh
        ).pack(side=tk.RIGHT)
    
    def _change_theme(self, theme_id: str):
        """Change the current theme."""
        self.current_theme = theme_id
        self.theme = THEMES[theme_id]
        self._save_theme_preference()
        
        # Restart to apply theme (simple approach)
        messagebox.showinfo(
            "Theme Changed",
            f"Theme changed to {THEMES[theme_id]['name']}!

Please restart the browser to apply the new theme."
        )
    
    def _apply_theme(self):
        """Apply current theme."""
        style = ttk.Style()
        
        # Treeview
        style.configure("Treeview",
                       background=self.theme["tree_bg"],
                       foreground=self.theme["tree_fg"],
                       fieldbackground=self.theme["tree_bg"],
                       borderwidth=0,
                       font=self.body_font)
        style.map("Treeview",
                 background=[("selected", self.theme["select_bg"])],
                 foreground=[("selected", self.theme["select_fg"])])
        
        # Notebook
        style.configure("TNotebook",
                       background=self.theme["panel_bg"],
                       borderwidth=0)
        style.configure("TNotebook.Tab",
                       background=self.theme["button_bg"],
                       foreground=self.theme["button_fg"],
                       padding=[20, 10],
                       font=self.header_font)
        style.map("TNotebook.Tab",
                 background=[("selected", self.theme["button_hover"])])
    
    def _populate_tree(self):
        """Populate tree view."""
        for item in self.tree.get_children():
            self.tree.delete(item)
        
        # Local fixes
        local_node = self.tree.insert("", tk.END, text="📚 Local Fixes", open=True)
        
        for error_pattern, fixes in sorted(self.dictionary.items()):
            error_type = fixes[0].get("error_type", "Unknown") if fixes else "Unknown"
            
            pattern_node = self.tree.insert(
                local_node,
                tk.END,
                text=error_pattern[:60] + ("..." if len(error_pattern) > 60 else ""),
                values=(error_type, len(fixes), "Local")
            )
            
            for i, fix in enumerate(fixes, 1):
                self.tree.insert(
                    pattern_node,
                    tk.END,
                    text=f"Fix #{i}: {fix.get('solution', 'N/A')[:50]}...",
                    values=(
                        fix.get("error_type", "Unknown"),
                        fix.get("usage_count", 1),
                        "Local"
                    ),
                    tags=(f"local_{error_pattern}_{i}",)
                )
        
        # Remote fixes
        if self.remote_refs:
            remote_node = self.tree.insert("", tk.END, text="🌍 Remote Fixes", open=False)
            
            for i, ref in enumerate(self.remote_refs, 1):
                self.tree.insert(
                    remote_node,
                    tk.END,
                    text=f"{ref.get('error_type', 'Unknown')}: {ref.get('note', 'N/A')[:50]}...",
                    values=(
                        ref.get("error_type", "Unknown"),
                        "N/A",
                        ref.get("user_id", "Unknown")[:8]
                    ),
                    tags=(f"remote_{i}",)
                )
    
    def _filter_tree(self):
        """Filter tree based on search."""
        search = self.search_var.get().lower()
        if not search:
            self._populate_tree()
            return
        
        for item in self.tree.get_children():
            self.tree.delete(item)
        
        # Filter implementation (simplified)
        self._populate_tree()  # In production, implement real filtering
    
    def _on_select(self, event):
        """Handle tree selection."""
        selection = self.tree.selection()
        if not selection:
            return
        
        item = selection[0]
        tags = self.tree.item(item, "tags")
        
        if not tags:
            return
        
        tag = tags[0]
        
        if tag.startswith("local_"):
            parts = tag.split("_", 2)
            if len(parts) >= 3:
                error_pattern = parts[1]
                fix_index = int(parts[2]) - 1
                
                if error_pattern in self.dictionary and fix_index < len(self.dictionary[error_pattern]):
                    fix = self.dictionary[error_pattern][fix_index]
                    self._display_fix(fix, "local")
    
    def _display_fix(self, fix: Dict, source: str):
        """Display fix details."""
        self.current_fix = (fix, source)
        
        # Solution
        self.solution_text.delete(1.0, tk.END)
        solution = fix.get("solution", "N/A") if source == "local" else fix.get("note", "Encrypted")
        self.solution_text.insert(1.0, solution)
        
        # Metadata
        self.meta_text.delete(1.0, tk.END)
        if source == "local":
            meta = f"""Error Type: {fix.get('error_type', 'Unknown')}
Error Signature: {fix.get('error_signature', 'N/A')}
Fix Hash: {fix.get('fix_hash', 'N/A')}
User ID: {fix.get('user_id', 'N/A')}
Timestamp: {fix.get('timestamp', 'N/A')}
Script: {fix.get('script_name', 'N/A')}

Usage Statistics:
  Success Count: {fix.get('success_count', 0)}
  Total Uses: {fix.get('usage_count', 0)}
  Relevance Score: {fix.get('relevance_score', 0):.2f}

Commit URL: {fix.get('commit_url', 'N/A')}"""
        else:
            meta = f"""Error Type: {fix.get('error_type', 'Unknown')}
User ID: {fix.get('user_id', 'Unknown')}
Fix Hash: {fix.get('fix_hash', 'N/A')}
Timestamp: {fix.get('timestamp', 'N/A')}

Source: FixNet (Remote)"""
        
        self.meta_text.insert(1.0, meta)
        
        # Branches
        self.branches_text.delete(1.0, tk.END)
        self.branches_text.insert(1.0, "Branch information loading...")
    
    def _copy_solution(self):
        """Copy solution to clipboard."""
        if not self.current_fix:
            messagebox.showinfo("No Selection", "Please select a fix first.")
            return
        
        fix, source = self.current_fix
        solution = fix.get("solution", "") if source == "local" else fix.get("note", "")
        
        self.root.clipboard_clear()
        self.root.clipboard_append(solution)
        messagebox.showinfo("✅ Copied", "Solution copied to clipboard!")
    
    def _open_github(self):
        """Open fix in GitHub."""
        if not self.current_fix:
            messagebox.showinfo("No Selection", "Please select a fix first.")
            return
        
        fix, source = self.current_fix
        commit_url = fix.get("commit_url", "")
        
        if commit_url:
            import webbrowser
            webbrowser.open(commit_url)
        else:
            messagebox.showinfo("No URL", "This fix doesn't have a GitHub URL.")
    
    def _refresh(self):
        """Refresh data."""
        self.dictionary = self._load_dictionary()
        self.remote_refs = self._load_remote_refs()
        self.branches = self._load_branches()
        self._populate_tree()
        messagebox.showinfo("✅ Refreshed", "Data reloaded from disk.")
    
    def _show_about(self):
        """Show about dialog."""
        about_text = """LuciferAI Consensus Browser v2.0

Modern, glossy interface inspired by Warp AI

Features:
• Beautiful glass-morphism design
• Three stunning themes
• Real-time fix browsing
• GitHub integration
• Smooth animations

Made with 🩸 by TheRustySpoon"""
        messagebox.showinfo("About", about_text)
    
    def _show_shortcuts(self):
        """Show keyboard shortcuts."""
        shortcuts = """Keyboard Shortcuts:

Navigation:
  ↑↓         Navigate tree
  Enter       Expand/collapse
  
Actions:
  Cmd+C      Copy solution
  Cmd+R      Refresh data
  Cmd+F      Focus search
  Cmd+Q      Quit

Themes:
  View menu → Theme → Select theme"""
        messagebox.showinfo("Shortcuts", shortcuts)
    
    def _reset_editor_settings(self):
        """Reset editor preferences to default."""
        response = messagebox.askyesno(
            "Reset Editor Settings",
            "This will reset your code editor preferences.

"
            "You will be prompted again when opening code snippets.

"
            "Continue?"
        )
        
        if response:
            sys.path.insert(0, str(Path(__file__).parent.parent / "core"))
            from interactive_terminal import reset_editor_settings
            
            if reset_editor_settings():
                messagebox.showinfo(
                    "✅ Success",
                    "Editor settings have been reset.

"
                    "You will be prompted to choose your editor
"
                    "the next time you open a code snippet."
                )
            else:
                messagebox.showinfo(
                    "ℹ️ Info",
                    "No saved preferences were found."
                )


def main():
    """Main entry point."""
    root = tk.Tk()
    app = EnhancedConsensusBrowser(root)
    root.mainloop()


if __name__ == "__main__":
    main()
