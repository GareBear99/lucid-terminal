#!/usr/bin/env python3
"""
🔍 LuciferAI Consensus Browser - GUI for browsing and viewing fix snippets
Interactive browser for local and remote consensus dictionary fixes
"""
import sys
import os
import json
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, Menu
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))

from lucifer_colors import Colors

# Theme definitions
THEMES = {
    "lucifer": {
        "name": "Lucifer Dark (Default)",
        "bg": "#1a0a1f",
        "fg": "#e0d0ff",
        "select_bg": "#4a1a5f",
        "select_fg": "#ffffff",
        "tree_bg": "#251035",
        "text_bg": "#2a1540",
        "button_bg": "#5a2a7f",
        "button_fg": "#ffffff",
        "accent": "#9966ff",
        "border": "#6a3a8f"
    },
    "gatorrent": {
        "name": "Gatorrent Green",
        "bg": "#0f1419",
        "fg": "#e6e6e6",
        "select_bg": "#1a5f2a",
        "select_fg": "#ffffff",
        "tree_bg": "#1a1f24",
        "text_bg": "#141a1f",
        "button_bg": "#2a7f3a",
        "button_fg": "#ffffff",
        "accent": "#33cc55",
        "border": "#2a5f3a"
    },
    "midnight": {
        "name": "Midnight Blue",
        "bg": "#0a0f1a",
        "fg": "#d0e0ff",
        "select_bg": "#1a3a5f",
        "select_fg": "#ffffff",
        "tree_bg": "#10182a",
        "text_bg": "#0f1624",
        "button_bg": "#2a5a8f",
        "button_fg": "#ffffff",
        "accent": "#6699ff",
        "border": "#3a5a7f"
    }
}


class ConsensusBrowser:
    """GUI browser for consensus dictionary fixes."""
    
    def __init__(self, root):
        self.root = root
        self.root.title("👾 LuciferAI Consensus Browser")
        self.root.geometry("1400x900")
        
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
        
        # Setup UI
        self._setup_menu()
        self._setup_ui()
        self._apply_theme()
        self._populate_tree()
    
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
        menubar = Menu(self.root)
        self.root.config(menu=menubar)
        
        # File menu
        file_menu = Menu(menubar, tearoff=0)
        menubar.add_cascade(label="File", menu=file_menu)
        file_menu.add_command(label="Refresh Data", command=self._refresh, accelerator="Cmd+R")
        file_menu.add_separator()
        file_menu.add_command(label="Exit", command=self.root.quit, accelerator="Cmd+Q")
        
        # View menu
        view_menu = Menu(menubar, tearoff=0)
        menubar.add_cascade(label="View", menu=view_menu)
        
        # Theme submenu
        theme_menu = Menu(view_menu, tearoff=0)
        view_menu.add_cascade(label="Theme", menu=theme_menu)
        
        theme_var = tk.StringVar(value=self.current_theme)
        for theme_id, theme_data in THEMES.items():
            theme_menu.add_radiobutton(
                label=theme_data["name"],
                variable=theme_var,
                value=theme_id,
                command=lambda t=theme_id: self._change_theme(t)
            )
        
        # Help menu
        help_menu = Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Help", menu=help_menu)
        help_menu.add_command(label="About", command=self._show_about)
        help_menu.add_command(label="Keyboard Shortcuts", command=self._show_shortcuts)
    
    def _change_theme(self, theme_id: str):
        """Change the current theme."""
        self.current_theme = theme_id
        self._save_theme_preference()
        self._apply_theme()
    
    def _apply_theme(self):
        """Apply current theme to all widgets."""
        theme = THEMES[self.current_theme]
        
        # Root window
        self.root.configure(bg=theme["bg"])
        
        # Create ttk style
        style = ttk.Style()
        
        # Configure Treeview
        style.configure("Treeview",
                       background=theme["tree_bg"],
                       foreground=theme["fg"],
                       fieldbackground=theme["tree_bg"],
                       borderwidth=0)
        style.map("Treeview",
                 background=[("selected", theme["select_bg"])],
                 foreground=[("selected", theme["select_fg"])])
        
        # Configure frames
        style.configure("TFrame", background=theme["bg"])
        style.configure("TLabel", background=theme["bg"], foreground=theme["fg"])
        style.configure("TButton",
                       background=theme["button_bg"],
                       foreground=theme["button_fg"])
        
        # Apply to text widgets if they exist
        if hasattr(self, 'solution_text'):
            self.solution_text.config(
                bg=theme["text_bg"],
                fg=theme["fg"],
                insertbackground=theme["fg"]
            )
            self.meta_text.config(
                bg=theme["text_bg"],
                fg=theme["fg"],
                insertbackground=theme["fg"]
            )
            self.branches_text.config(
                bg=theme["text_bg"],
                fg=theme["fg"],
                insertbackground=theme["fg"]
            )
    
    def _show_about(self):
        """Show about dialog."""
        about_text = """LuciferAI Consensus Browser v1.0

Browse and explore collaborative fix dictionary.

Features:
• Local & Remote fix browsing
• Real-time search & filter
• Code snippet previews
• GitHub integration
• Multiple themes

Made with 🩸 by TheRustySpoon"""
        messagebox.showinfo("About", about_text)
    
    def _show_shortcuts(self):
        """Show keyboard shortcuts."""
        shortcuts = """Keyboard Shortcuts:

Navigation:
  ↑↓ Arrow Keys    - Navigate tree
  Enter            - Expand/collapse
  
Actions:
  Cmd+C            - Copy solution
  Cmd+R            - Refresh data
  Cmd+F            - Focus search
  Cmd+Q            - Quit

View:
  Cmd+1/2/3        - Switch themes"""
        messagebox.showinfo("Keyboard Shortcuts", shortcuts)
    
    def _setup_ui(self):
        """Setup the user interface."""
        # Main container
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Configure grid weights
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(0, weight=1)
        main_frame.rowconfigure(1, weight=1)
        
        # Header
        header = ttk.Label(
            main_frame,
            text="👾 LuciferAI Consensus Dictionary Browser",
            font=("Helvetica", 16, "bold")
        )
        header.grid(row=0, column=0, pady=(0, 10), sticky=tk.W)
        
        # Stats
        stats_frame = ttk.Frame(main_frame)
        stats_frame.grid(row=0, column=1, pady=(0, 10), sticky=tk.E)
        
        local_count = sum(len(fixes) for fixes in self.dictionary.values())
        remote_count = len(self.remote_refs)
        
        ttk.Label(
            stats_frame,
            text=f"📚 Local: {local_count} | 🌍 Remote: {remote_count}",
            font=("Helvetica", 10)
        ).pack()
        
        # Paned window for split view
        paned = ttk.PanedWindow(main_frame, orient=tk.HORIZONTAL)
        paned.grid(row=1, column=0, columnspan=2, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Left panel: Tree view
        left_frame = ttk.Frame(paned, padding="5")
        paned.add(left_frame, weight=1)
        
        # Search frame
        search_frame = ttk.Frame(left_frame)
        search_frame.pack(fill=tk.X, pady=(0, 5))
        
        ttk.Label(search_frame, text="🔍 Search:").pack(side=tk.LEFT, padx=(0, 5))
        self.search_var = tk.StringVar()
        self.search_var.trace('w', lambda *args: self._filter_tree())
        search_entry = ttk.Entry(search_frame, textvariable=self.search_var)
        search_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        # Tree view
        tree_frame = ttk.Frame(left_frame)
        tree_frame.pack(fill=tk.BOTH, expand=True)
        
        # Scrollbars
        tree_scroll_y = ttk.Scrollbar(tree_frame, orient=tk.VERTICAL)
        tree_scroll_y.pack(side=tk.RIGHT, fill=tk.Y)
        
        tree_scroll_x = ttk.Scrollbar(tree_frame, orient=tk.HORIZONTAL)
        tree_scroll_x.pack(side=tk.BOTTOM, fill=tk.X)
        
        self.tree = ttk.Treeview(
            tree_frame,
            columns=("type", "count", "source"),
            yscrollcommand=tree_scroll_y.set,
            xscrollcommand=tree_scroll_x.set
        )
        self.tree.pack(fill=tk.BOTH, expand=True)
        
        tree_scroll_y.config(command=self.tree.yview)
        tree_scroll_x.config(command=self.tree.xview)
        
        # Tree columns
        self.tree.heading("#0", text="Error Pattern")
        self.tree.heading("type", text="Type")
        self.tree.heading("count", text="Uses")
        self.tree.heading("source", text="Source")
        
        self.tree.column("#0", width=300)
        self.tree.column("type", width=100)
        self.tree.column("count", width=60)
        self.tree.column("source", width=80)
        
        # Bind selection
        self.tree.bind("<<TreeviewSelect>>", self._on_select)
        
        # Right panel: Detail view
        right_frame = ttk.Frame(paned, padding="5")
        paned.add(right_frame, weight=2)
        
        # Detail tabs
        self.notebook = ttk.Notebook(right_frame)
        self.notebook.pack(fill=tk.BOTH, expand=True)
        
        # Solution tab
        solution_frame = ttk.Frame(self.notebook)
        self.notebook.add(solution_frame, text="📄 Solution")
        
        self.solution_text = scrolledtext.ScrolledText(
            solution_frame,
            wrap=tk.WORD,
            font=("Courier", 11),
            padx=10,
            pady=10
        )
        self.solution_text.pack(fill=tk.BOTH, expand=True)
        
        # Metadata tab
        meta_frame = ttk.Frame(self.notebook)
        self.notebook.add(meta_frame, text="ℹ️ Metadata")
        
        self.meta_text = scrolledtext.ScrolledText(
            meta_frame,
            wrap=tk.WORD,
            font=("Courier", 10),
            padx=10,
            pady=10
        )
        self.meta_text.pack(fill=tk.BOTH, expand=True)
        
        # Branches tab
        branches_frame = ttk.Frame(self.notebook)
        self.notebook.add(branches_frame, text="🌿 Branches")
        
        self.branches_text = scrolledtext.ScrolledText(
            branches_frame,
            wrap=tk.WORD,
            font=("Courier", 10),
            padx=10,
            pady=10
        )
        self.branches_text.pack(fill=tk.BOTH, expand=True)
        
        # Button frame
        button_frame = ttk.Frame(right_frame)
        button_frame.pack(fill=tk.X, pady=(5, 0))
        
        ttk.Button(
            button_frame,
            text="📋 Copy Solution",
            command=self._copy_solution
        ).pack(side=tk.LEFT, padx=5)
        
        ttk.Button(
            button_frame,
            text="🔗 Open in GitHub",
            command=self._open_github
        ).pack(side=tk.LEFT, padx=5)
        
        ttk.Button(
            button_frame,
            text="🔄 Refresh",
            command=self._refresh
        ).pack(side=tk.RIGHT, padx=5)
    
    def _populate_tree(self):
        """Populate tree view with fixes."""
        # Clear existing
        for item in self.tree.get_children():
            self.tree.delete(item)
        
        # Add local fixes
        local_node = self.tree.insert("", tk.END, text="📚 Local Fixes", open=True)
        
        for error_pattern, fixes in sorted(self.dictionary.items()):
            total_uses = sum(fix.get("usage_count", 1) for fix in fixes)
            error_type = fixes[0].get("error_type", "Unknown") if fixes else "Unknown"
            
            pattern_node = self.tree.insert(
                local_node,
                tk.END,
                text=error_pattern[:50] + ("..." if len(error_pattern) > 50 else ""),
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
        
        # Add remote fixes
        if self.remote_refs:
            remote_node = self.tree.insert("", tk.END, text="🌍 Remote Fixes (FixNet)", open=False)
            
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
        
        # Clear existing
        for item in self.tree.get_children():
            self.tree.delete(item)
        
        # Filter local fixes
        local_node = self.tree.insert("", tk.END, text="📚 Local Fixes (Filtered)", open=True)
        found_local = False
        
        for error_pattern, fixes in self.dictionary.items():
            if search in error_pattern.lower() or any(search in fix.get("solution", "").lower() for fix in fixes):
                found_local = True
                error_type = fixes[0].get("error_type", "Unknown") if fixes else "Unknown"
                
                pattern_node = self.tree.insert(
                    local_node,
                    tk.END,
                    text=error_pattern[:50] + ("..." if len(error_pattern) > 50 else ""),
                    values=(error_type, len(fixes), "Local")
                )
                
                for i, fix in enumerate(fixes, 1):
                    if search in fix.get("solution", "").lower() or search in error_pattern.lower():
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
        
        if not found_local:
            self.tree.delete(local_node)
        
        # Filter remote fixes
        remote_matches = [ref for ref in self.remote_refs if search in ref.get("note", "").lower() or search in ref.get("error_type", "").lower()]
        
        if remote_matches:
            remote_node = self.tree.insert("", tk.END, text="🌍 Remote Fixes (Filtered)", open=True)
            
            for i, ref in enumerate(remote_matches, 1):
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
            # Parse tag: local_<error_pattern>_<index>
            parts = tag.split("_", 2)
            if len(parts) >= 3:
                error_pattern = parts[1]
                fix_index = int(parts[2]) - 1
                
                if error_pattern in self.dictionary and fix_index < len(self.dictionary[error_pattern]):
                    fix = self.dictionary[error_pattern][fix_index]
                    self._display_fix(fix, "local")
        
        elif tag.startswith("remote_"):
            # Parse tag: remote_<index>
            index = int(tag.split("_")[1]) - 1
            if index < len(self.remote_refs):
                ref = self.remote_refs[index]
                self._display_fix(ref, "remote")
    
    def _display_fix(self, fix: Dict, source: str):
        """Display fix details."""
        self.current_fix = (fix, source)
        
        # Solution tab
        self.solution_text.delete(1.0, tk.END)
        solution = fix.get("solution", "N/A") if source == "local" else fix.get("note", "Encrypted")
        self.solution_text.insert(1.0, solution)
        
        # Metadata tab
        self.meta_text.delete(1.0, tk.END)
        
        if source == "local":
            meta = f"""Error Type: {fix.get('error_type', 'Unknown')}
Error Signature: {fix.get('error_signature', 'N/A')}
Fix Hash: {fix.get('fix_hash', 'N/A')}
User ID: {fix.get('user_id', 'N/A')}
Timestamp: {fix.get('timestamp', 'N/A')}
Script: {fix.get('script_name', 'N/A')}
Script Path: {fix.get('script_path', 'N/A')}

Usage Statistics:
  Success Count: {fix.get('success_count', 0)}
  Total Uses: {fix.get('usage_count', 0)}
  Relevance Score: {fix.get('relevance_score', 0):.2f}

Commit URL: {fix.get('commit_url', 'N/A')}

Context:
{json.dumps(fix.get('context', {}), indent=2)}
"""
        else:
            meta = f"""Error Type: {fix.get('error_type', 'Unknown')}
User ID: {fix.get('user_id', 'Unknown')}
Fix Hash: {fix.get('fix_hash', 'N/A')}
Timestamp: {fix.get('timestamp', 'N/A')}
Commit SHA: {fix.get('commit_sha', 'N/A')}

Note: {fix.get('note', 'Encrypted - sync to decrypt')}

Source: FixNet (Remote)
"""
        
        self.meta_text.insert(1.0, meta)
        
        # Branches tab
        self.branches_text.delete(1.0, tk.END)
        
        if source == "local":
            fix_hash = fix.get('fix_hash', '')
            
            # Find branches
            branches_info = []
            
            # Check if this fix inspired others
            for pattern, fixes in self.dictionary.items():
                for other_fix in fixes:
                    if other_fix.get('inspired_by') == fix_hash:
                        branches_info.append(f"🌿 Inspired: {other_fix.get('solution', 'N/A')[:60]}...")
                        branches_info.append(f"   Reason: {other_fix.get('variation_reason', 'N/A')}")
                        branches_info.append(f"   Script: {other_fix.get('script_name', 'N/A')}")
                        branches_info.append("")
            
            # Check if this was inspired by another
            if fix.get('inspired_by'):
                branches_info.append(f"🌱 Inspired By: {fix.get('inspired_by')[:16]}...")
                if fix.get('variation_reason'):
                    branches_info.append(f"   Reason: {fix.get('variation_reason')}")
                branches_info.append("")
            
            if branches_info:
                self.branches_text.insert(1.0, "\n".join(branches_info))
            else:
                self.branches_text.insert(1.0, "No branches found for this fix.")
        else:
            self.branches_text.insert(1.0, "Branch information not available for remote fixes.")
    
    def _copy_solution(self):
        """Copy solution to clipboard."""
        if not self.current_fix:
            messagebox.showinfo("No Selection", "Please select a fix first.")
            return
        
        fix, source = self.current_fix
        solution = fix.get("solution", "") if source == "local" else fix.get("note", "")
        
        self.root.clipboard_clear()
        self.root.clipboard_append(solution)
        messagebox.showinfo("Copied", "Solution copied to clipboard!")
    
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
        """Refresh data from disk."""
        self.dictionary = self._load_dictionary()
        self.remote_refs = self._load_remote_refs()
        self.branches = self._load_branches()
        self._populate_tree()
        messagebox.showinfo("Refreshed", "Data reloaded from disk.")


def main():
    """Main entry point."""
    root = tk.Tk()
    app = ConsensusBrowser(root)
    root.mainloop()


if __name__ == "__main__":
    main()
