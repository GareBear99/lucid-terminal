import { useState } from 'react';
import {
  FolderOpen,
  Terminal,
  Settings,
  FileCode,
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  RefreshCw,
  FolderPlus,
  FilePlus,
} from 'lucide-react';
import { useFileStore } from '../../stores/fileStore';
import { View, FileEntry } from '../../types';

interface SidebarProps {
  width: number;
  onWidthChange: (width: number) => void;
  currentView: View;
  onViewChange: (view: View) => void;
}

function Sidebar({ width, onWidthChange, currentView, onViewChange }: SidebarProps) {
  const {
    currentDir,
    entries,
    expandedDirs,
    selectedPath,
    setCurrentDir,
    toggleDir,
    selectPath,
    openFile,
    refreshDir,
    createFile,
    createFolder,
  } = useFileStore();

  const [newItemName, setNewItemName] = useState('');
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const handleOpenDirectory = async () => {
    const dir = await window.lucidAPI.fs.selectDirectory();
    if (dir) {
      await setCurrentDir(dir);
    }
  };

  const handleCreateFile = async () => {
    if (!newItemName || !currentDir) return;
    const path = `${currentDir}\\${newItemName}`;
    await createFile(path);
    setNewItemName('');
    setIsCreatingFile(false);
  };

  const handleCreateFolder = async () => {
    if (!newItemName || !currentDir) return;
    const path = `${currentDir}\\${newItemName}`;
    await createFolder(path);
    setNewItemName('');
    setIsCreatingFolder(false);
  };



  const renderFileTree = (items: FileEntry[], level = 0) => {
    return items.map((item) => (
      <div key={item.path}>
        <div
          className={`flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-[var(--bg-tertiary)] rounded text-sm ${selectedPath === item.path ? 'bg-[var(--bg-tertiary)]' : ''
            }`}
          style={{ paddingLeft: `${8 + level * 16}px` }}
          onClick={() => {
            selectPath(item.path);
            if (item.isDirectory) {
              toggleDir(item.path);
            } else {
              openFile(item.path);
              onViewChange('editor');
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            selectPath(item.path);
          }}
        >
          {item.isDirectory ? (
            <>
              {expandedDirs.has(item.path) ? (
                <ChevronDown size={14} className="text-[var(--text-muted)] flex-shrink-0" />
              ) : (
                <ChevronRight size={14} className="text-[var(--text-muted)] flex-shrink-0" />
              )}
              <Folder size={14} className="text-[var(--accent)] flex-shrink-0" />
            </>
          ) : (
            <>
              <span className="w-3.5" />
              <File size={14} className="text-[var(--text-muted)] flex-shrink-0" />
            </>
          )}
          <span className="truncate text-[var(--text-primary)]">{item.name}</span>
        </div>
        {item.isDirectory && expandedDirs.has(item.path) && item.children && (
          <div>
            {renderFileTree(item.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  return (
    <div className="flex h-full">
      {/* Icon Bar */}
      <div className="w-12 h-full bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col items-center py-2 gap-1">
        <button
          onClick={() => onViewChange('terminal')}
          className={`p-2 rounded-md transition-colors ${currentView === 'terminal'
            ? 'bg-[var(--bg-tertiary)] text-[var(--accent)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          title="Terminal"
        >
          <Terminal size={20} />
        </button>

        <button
          onClick={() => onViewChange('editor')}
          className={`p-2 rounded-md transition-colors ${currentView === 'editor'
            ? 'bg-[var(--bg-tertiary)] text-[var(--accent)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          title="Editor"
        >
          <FileCode size={20} />
        </button>

        <div className="flex-1" />

        <button
          onClick={() => onViewChange('settings')}
          className={`p-2 rounded-md transition-colors ${currentView === 'settings'
            ? 'bg-[var(--bg-tertiary)] text-[var(--accent)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          title="Settings"
        >
          <Settings size={20} />
        </button>
      </div>

      {/* File Explorer Panel */}
      <div
        className="h-full bg-[var(--bg-primary)] border-r border-[var(--border)] flex flex-col"
        style={{ width: width - 48 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
            Explorer
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsCreatingFile(true)}
              className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              title="New File"
            >
              <FilePlus size={14} />
            </button>
            <button
              onClick={() => setIsCreatingFolder(true)}
              className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              title="New Folder"
            >
              <FolderPlus size={14} />
            </button>
            <button
              onClick={refreshDir}
              className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* New Item Input */}
        {(isCreatingFile || isCreatingFolder) && (
          <div className="px-2 py-1 border-b border-[var(--border)]">
            <input
              type="text"
              className="input text-xs h-7"
              placeholder={isCreatingFile ? 'New file name...' : 'New folder name...'}
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  isCreatingFile ? handleCreateFile() : handleCreateFolder();
                } else if (e.key === 'Escape') {
                  setNewItemName('');
                  setIsCreatingFile(false);
                  setIsCreatingFolder(false);
                }
              }}
              autoFocus
            />
          </div>
        )}

        {/* File Tree */}
        <div className="flex-1 overflow-y-auto py-1">
          {currentDir ? (
            <>
              {/* Current Directory */}
              <div className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--text-muted)] truncate">
                <FolderOpen size={12} />
                <span className="truncate">{currentDir}</span>
              </div>
              {renderFileTree(entries)}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <FolderOpen size={32} className="text-[var(--text-muted)] mb-2" />
              <p className="text-sm text-[var(--text-muted)] mb-3">No folder open</p>
              <button
                onClick={handleOpenDirectory}
                className="btn btn-primary text-sm py-1.5 px-3"
              >
                Open Folder
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Resize Handle */}
      <div
        className="w-1 resize-handle"
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = width;

          const onMouseMove = (e: MouseEvent) => {
            const delta = e.clientX - startX;
            const newWidth = Math.max(200, Math.min(400, startWidth + delta));
            onWidthChange(newWidth);
          };

          const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
          };

          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        }}
      />
    </div>
  );
}

export default Sidebar;
