import { useState, useEffect } from 'react';
import { 
  Eye, 
  X, 
  Filter, 
  Download, 
  Trash2, 
  RefreshCw, 
  FileText, 
  GitCommit,
  Check,
  XCircle,
  AlertCircle,
  Clock
} from 'lucide-react';

interface DaemonLog {
  id: string;
  timestamp: number;
  type: 'file_change' | 'auto_fix' | 'error' | 'success';
  file: string;
  directory: string;
  action: string;
  diff?: DiffChange[];
  fixAttempt?: FixAttempt;
  status: 'success' | 'failed' | 'pending';
}

interface DiffChange {
  type: 'add' | 'remove' | 'context';
  lineNumber: number;
  content: string;
}

interface FixAttempt {
  error: string;
  solution: string;
  success: boolean;
  fromFixNet: boolean;
}

interface DaemonLogViewerProps {
  onClose: () => void;
}

export function DaemonLogViewer({ onClose }: DaemonLogViewerProps) {
  const [logs, setLogs] = useState<DaemonLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<DaemonLog[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'file_change' | 'auto_fix' | 'error'>('all');
  const [filterFile, setFilterFile] = useState('');
  const [selectedLog, setSelectedLog] = useState<DaemonLog | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadLogs();
  }, []);

  useEffect(() => {
    // Apply filters
    let filtered = logs;

    if (filterType !== 'all') {
      filtered = filtered.filter(log => log.type === filterType);
    }

    if (filterFile) {
      filtered = filtered.filter(log => 
        log.file.toLowerCase().includes(filterFile.toLowerCase()) ||
        log.directory.toLowerCase().includes(filterFile.toLowerCase())
      );
    }

    setFilteredLogs(filtered);
  }, [logs, filterType, filterFile]);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const result = await window.lucidAPI.lucid.daemonLogs();
      if (result.success && result.logs) {
        setLogs(result.logs);
      }
    } catch (error) {
      console.error('Failed to load daemon logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearLogs = async () => {
    if (confirm('Clear all daemon logs? This cannot be undone.')) {
      try {
        await window.lucidAPI.lucid.daemonClearLogs();
        setLogs([]);
        setSelectedLog(null);
      } catch (error) {
        console.error('Failed to clear logs:', error);
      }
    }
  };

  const handleExportLogs = () => {
    const data = JSON.stringify(filteredLogs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daemon-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString([], { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getTypeColor = (type: DaemonLog['type']) => {
    switch (type) {
      case 'file_change': return '#79c0ff';
      case 'auto_fix': return '#7ee787';
      case 'error': return '#ff7b72';
      case 'success': return '#7ee787';
      default: return 'var(--text-muted)';
    }
  };

  const getTypeIcon = (type: DaemonLog['type']) => {
    switch (type) {
      case 'file_change': return <FileText size={16} />;
      case 'auto_fix': return <GitCommit size={16} />;
      case 'error': return <XCircle size={16} />;
      case 'success': return <Check size={16} />;
      default: return <AlertCircle size={16} />;
    }
  };

  const getStatusBadge = (status: DaemonLog['status']) => {
    const colors = {
      success: 'bg-green-500/10 text-green-500',
      failed: 'bg-red-500/10 text-red-500',
      pending: 'bg-yellow-500/10 text-yellow-500'
    };

    const labels = {
      success: 'Success',
      failed: 'Failed',
      pending: 'Pending'
    };

    return (
      <span className={`text-xs px-2 py-0.5 rounded ${colors[status]}`}>
        {labels[status]}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[90vw] h-[90vh] bg-[var(--bg-primary)] rounded-lg border border-[var(--border)] shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="flex items-center gap-3">
            <Eye size={20} className="text-[var(--accent)]" />
            <h2 className="text-lg font-semibold">Daemon Logs</h2>
            <span className="text-xs text-[var(--text-muted)]">
              {filteredLogs.length} of {logs.length} logs
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadLogs}
              disabled={isLoading}
              className="btn-ghost p-2 rounded-lg"
              title="Refresh logs"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleExportLogs}
              className="btn-ghost p-2 rounded-lg"
              title="Export logs"
            >
              <Download size={16} />
            </button>
            <button
              onClick={handleClearLogs}
              className="btn-ghost p-2 rounded-lg text-red-500 hover:bg-red-500/10"
              title="Clear all logs"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={onClose}
              className="btn-ghost p-2 rounded-lg"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-[var(--border)] bg-[var(--bg-tertiary)]">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-[var(--text-muted)]" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="input py-1 px-2 text-sm"
            >
              <option value="all">All Types</option>
              <option value="file_change">File Changes</option>
              <option value="auto_fix">Auto-Fix</option>
              <option value="error">Errors</option>
            </select>
          </div>

          <input
            type="text"
            placeholder="Filter by file or directory..."
            value={filterFile}
            onChange={(e) => setFilterFile(e.target.value)}
            className="input py-1 px-3 text-sm flex-1"
          />
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Log List */}
          <div className="w-1/3 border-r border-[var(--border)] overflow-y-auto custom-scrollbar">
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <Eye size={48} className="text-[var(--text-muted)] opacity-50 mb-3" />
                <p className="text-sm text-[var(--text-muted)] mb-1">No logs found</p>
                <p className="text-xs text-[var(--text-muted)] opacity-70">
                  {filterType !== 'all' || filterFile ? 'Try adjusting filters' : 'Daemon is not running or no activity yet'}
                </p>
              </div>
            ) : (
              filteredLogs.map(log => (
                <button
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className={`w-full text-left px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--bg-tertiary)] transition-colors ${
                    selectedLog?.id === log.id ? 'bg-[var(--bg-tertiary)] border-l-2 border-l-[var(--accent)]' : 'border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center mt-0.5"
                      style={{
                        backgroundColor: `${getTypeColor(log.type)}20`,
                        color: getTypeColor(log.type)
                      }}
                    >
                      {getTypeIcon(log.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {log.file}
                        </span>
                        {getStatusBadge(log.status)}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mb-1 truncate">
                        {log.action}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] opacity-70">
                        <Clock size={10} />
                        <span>{formatTime(log.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Log Detail */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            {selectedLog ? (
              <div className="space-y-6">
                {/* Header */}
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{
                        backgroundColor: `${getTypeColor(selectedLog.type)}20`,
                        color: getTypeColor(selectedLog.type)
                      }}
                    >
                      {getTypeIcon(selectedLog.type)}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{selectedLog.file}</h3>
                      <p className="text-sm text-[var(--text-muted)]">{selectedLog.directory}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    {getStatusBadge(selectedLog.status)}
                    <span className="text-xs text-[var(--text-muted)]">
                      {formatTime(selectedLog.timestamp)}
                    </span>
                  </div>
                </div>

                {/* Action */}
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-[var(--text-secondary)]">Action</h4>
                  <p className="text-sm">{selectedLog.action}</p>
                </div>

                {/* Diff */}
                {selectedLog.diff && selectedLog.diff.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-[var(--text-secondary)]">Changes</h4>
                    <div className="bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)] overflow-hidden">
                      <div className="bg-[var(--bg-secondary)] px-3 py-2 border-b border-[var(--border)] text-xs text-[var(--text-muted)] font-mono">
                        {selectedLog.file}
                      </div>
                      <div className="font-mono text-xs">
                        {selectedLog.diff.map((change, index) => (
                          <div
                            key={index}
                            className={`px-3 py-1 ${
                              change.type === 'add'
                                ? 'bg-green-500/10 text-green-500'
                                : change.type === 'remove'
                                ? 'bg-red-500/10 text-red-500'
                                : 'text-[var(--text-muted)]'
                            }`}
                          >
                            <span className="inline-block w-8 text-right mr-4 opacity-50">
                              {change.lineNumber}
                            </span>
                            <span className="mr-2">
                              {change.type === 'add' ? '+' : change.type === 'remove' ? '-' : ' '}
                            </span>
                            <span>{change.content}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Fix Attempt */}
                {selectedLog.fixAttempt && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-[var(--text-secondary)]">Auto-Fix Attempt</h4>
                    <div className="space-y-3">
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                        <p className="text-xs font-semibold text-red-500 mb-1">Error Detected</p>
                        <p className="text-sm font-mono">{selectedLog.fixAttempt.error}</p>
                      </div>
                      <div className={`border rounded-lg p-3 ${
                        selectedLog.fixAttempt.success
                          ? 'bg-green-500/10 border-green-500/30'
                          : 'bg-yellow-500/10 border-yellow-500/30'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <p className={`text-xs font-semibold ${
                            selectedLog.fixAttempt.success ? 'text-green-500' : 'text-yellow-500'
                          }`}>
                            {selectedLog.fixAttempt.success ? 'Fix Applied Successfully' : 'Fix Applied (Needs Verification)'}
                          </p>
                          {selectedLog.fixAttempt.fromFixNet && (
                            <span className="text-xs px-2 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)]">
                              From FixNet
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-mono">{selectedLog.fixAttempt.solution}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <FileText size={48} className="text-[var(--text-muted)] opacity-50 mb-3" />
                <p className="text-sm text-[var(--text-muted)]">Select a log to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
