import { FolderOpen, GitBranch, X, Monitor, Sparkles } from 'lucide-react';
import { useFileStore } from '../../stores/fileStore';

interface WelcomeScreenProps {
    onShowTest: () => void;
}

function WelcomeScreen({ onShowTest }: WelcomeScreenProps) {
    const {
        recentWorkspaces,
        addRecentWorkspace,
        setCurrentDir,
        removeRecentWorkspace
    } = useFileStore();

    // const { settings } = useSettingsStore(); // Settings store might be used later for other things, but for now removing unused

    // const { fontSize } = settings;

    const handleOpenFolder = async () => {
        try {
            console.log('📁 Opening folder dialog...');
            const dir = await window.lucidAPI.fs.selectDirectory();
            console.log('📁 Selected directory:', dir);
            if (dir) {
                console.log('📁 Setting currentDir to:', dir);
                await setCurrentDir(dir);
                console.log('✅ currentDir set successfully');
                addRecentWorkspace(dir);
            } else {
                console.log('❌ No directory selected');
            }
        } catch (error) {
            console.error('❌ Failed to open folder:', error);
        }
    };

    const handleOpenRecent = async (path: string) => {
        const exists = await window.lucidAPI.fs.exists(path);
        if (exists) {
            await setCurrentDir(path);
            addRecentWorkspace(path); // Moves to top
        } else {
            if (confirm(`The folder "${path}" no longer exists. Remove from history?`)) {
                removeRecentWorkspace(path);
            }
        }
    };

    const handleNewWindow = () => {
        window.lucidAPI.window.create();
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--bg-primary)] text-[var(--text-primary)] relative overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="w-full max-w-4xl z-10 animate-in fade-in zoom-in-95 duration-500">

                {/* Header */}
                <div className="flex flex-col items-center mb-16">
                    <div className="w-24 h-24 mb-6 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-purple-500/30 ring-1 ring-white/10">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            className="w-14 h-14 text-white drop-shadow-md"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                    </div>
                    <h1 className="text-4xl font-bold mb-3 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                        Lucid Terminal
                    </h1>
                    <p className="text-[var(--text-secondary)] text-lg">AI-Powered Terminal & Workspace</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-8">
                    {/* Start Actions */}
                    <div className="space-y-4">
                        <h2 className="text-xs font-bold text-[var(--accent)] uppercase tracking-widest mb-6 pl-1">Start</h2>

                        <button
                            onClick={handleNewWindow}
                            className="w-full flex items-center gap-4 p-4 rounded-xl bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-secondary)] border border-white/5 hover:border-purple-500/30 transition-all group backdrop-blur-sm"
                        >
                            <div className="p-3 rounded-lg bg-gradient-to-br from-purple-500/10 to-purple-500/5 group-hover:from-purple-500/20 group-hover:to-purple-500/10 transition-colors">
                                <Monitor className="w-6 h-6 text-purple-400" />
                            </div>
                            <div className="text-left">
                                <div className="font-semibold text-[var(--text-primary)] group-hover:text-purple-300 transition-colors">New Window</div>
                                <div className="text-xs text-[var(--text-muted)]">Open a fresh instance</div>
                            </div>
                        </button>

                        <button
                            onClick={handleOpenFolder}
                            className="w-full flex items-center gap-4 p-4 rounded-xl bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-secondary)] border border-white/5 hover:border-blue-500/30 transition-all group backdrop-blur-sm"
                        >
                            <div className="p-3 rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-500/5 group-hover:from-blue-500/20 group-hover:to-blue-500/10 transition-colors">
                                <FolderOpen className="w-6 h-6 text-blue-400" />
                            </div>
                            <div className="text-left">
                                <div className="font-semibold text-[var(--text-primary)] group-hover:text-blue-300 transition-colors">Open Folder</div>
                                <div className="text-xs text-[var(--text-muted)]">Navigate your file system</div>
                            </div>
                        </button>

                        <button
                            onClick={() => alert('Clone Repository feature coming soon!')}
                            className="w-full flex items-center gap-4 p-4 rounded-xl bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-secondary)] border border-white/5 hover:border-green-500/30 transition-all group backdrop-blur-sm"
                        >
                            <div className="p-3 rounded-lg bg-gradient-to-br from-green-500/10 to-green-500/5 group-hover:from-green-500/20 group-hover:to-green-500/10 transition-colors">
                                <GitBranch className="w-6 h-6 text-green-400" />
                            </div>
                            <div className="text-left">
                                <div className="font-semibold text-[var(--text-primary)] group-hover:text-green-300 transition-colors">Clone Repository</div>
                                <div className="text-xs text-[var(--text-muted)]">Get code from Git</div>
                            </div>
                        </button>

                        <button
                            onClick={() => {
                                console.log('🚀 Test Workflow button clicked');
                                onShowTest();
                            }}
                            className="w-full flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 border border-purple-500/30 hover:border-purple-500/50 transition-all group backdrop-blur-sm ring-1 ring-purple-500/20"
                        >
                            <div className="p-3 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-500/10 group-hover:from-purple-500/30 group-hover:to-purple-500/20 transition-colors">
                                <Sparkles className="w-6 h-6 text-purple-300" />
                            </div>
                            <div className="text-left">
                                <div className="font-semibold text-[var(--text-primary)] group-hover:text-purple-200 transition-colors">🚀 Test Workflow System</div>
                                <div className="text-xs text-purple-200/70">AI Assistant + FixNet + Bypass Router</div>
                            </div>
                        </button>
                    </div>

                    {/* Recent List */}
                    <div className="flex flex-col h-full">
                        <h2 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-6 pl-1">Recent</h2>

                        <div className="flex-1 bg-[var(--bg-secondary)]/30 backdrop-blur-md rounded-2xl border border-white/5 p-2 overflow-hidden flex flex-col">
                            {recentWorkspaces.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)]/50 gap-2 p-8">
                                    <FolderOpen className="w-8 h-8 opacity-20" />
                                    <span className="text-sm">No recent workspaces</span>
                                </div>
                            ) : (
                                <div className="overflow-y-auto custom-scrollbar flex-1 space-y-1 p-2">
                                    {recentWorkspaces.map((path) => (
                                        <div
                                            key={path}
                                            className="group flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors cursor-pointer border border-transparent hover:border-white/5"
                                            onClick={() => handleOpenRecent(path)}
                                        >
                                            <div className="p-2 rounded-md bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                                                <FolderOpen size={16} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-[var(--text-primary)] truncate group-hover:text-blue-300 transition-colors">
                                                    {path.split(/[\\/]/).pop()}
                                                </div>
                                                <div className="text-xs text-[var(--text-muted)] truncate opacity-60">
                                                    {path}
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeRecentWorkspace(path);
                                                }}
                                                className="p-2 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all"
                                                title="Remove from history"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-16 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/5 backdrop-blur-md">
                        <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></span>
                        <span className="text-xs font-medium text-[var(--text-secondary)]">v1.0.0 • AI-Powered</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default WelcomeScreen;
