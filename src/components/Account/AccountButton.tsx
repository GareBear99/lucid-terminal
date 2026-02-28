import { useState, useEffect, useRef } from 'react';
import { User, Copy, Check, Link, AlertCircle } from 'lucide-react';

interface UserIdInfo {
  userId: string;
  isPermanent: boolean;
  githubUsername?: string;
  storagePath?: string;
}

export function AccountButton() {
  const [idInfo, setIdInfo] = useState<UserIdInfo | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load user ID on mount
  useEffect(() => {
    loadUserId();
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isMenuOpen]);

  const loadUserId = async () => {
    try {
      const response = await window.lucidAPI.lucid.getUserId();
      if (response.success && response.userId) {
        setIdInfo({
          userId: response.userId,
          isPermanent: response.isPermanent || false,
          githubUsername: response.githubUsername,
          storagePath: response.storagePath
        });
      }
    } catch (error) {
      console.error('Failed to load user ID:', error);
    }
  };

  const handleCopy = async () => {
    if (idInfo) {
      await navigator.clipboard.writeText(idInfo.userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!idInfo) return null;

  // Show first 8-12 characters for display (like Warp)
  const displayId = idInfo.userId.length > 12 
    ? idInfo.userId.substring(0, 12) + '...'
    : idInfo.userId;

  return (
    <div className="relative" ref={menuRef}>
      {/* Account Button */}
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200
                   bg-[var(--bg-tertiary)]/60 backdrop-blur-md border border-[var(--border)]/50
                   hover:bg-[var(--bg-tertiary)] hover:border-[var(--border)]
                   active:scale-95"
        title={idInfo.userId}
      >
        <User size={14} className={idInfo.isPermanent ? 'text-[var(--success)]' : 'text-[var(--warning)]'} />
        <span className="font-mono text-xs text-[var(--text-secondary)]">{displayId}</span>
      </button>

      {/* Dropdown Menu */}
      {isMenuOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 z-50
                       bg-[var(--bg-tertiary)]/95 backdrop-blur-xl border border-[var(--border)]
                       rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          
          {/* Header */}
          <div className="px-4 py-3 border-b border-[var(--border)]/50">
            <div className="flex items-center gap-2 mb-1">
              <User size={16} className={idInfo.isPermanent ? 'text-[var(--success)]' : 'text-[var(--warning)]'} />
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {idInfo.isPermanent ? 'LuciferAI Account' : 'Temporary ID'}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {idInfo.isPermanent 
                ? 'Synced with FixNet' 
                : 'Link GitHub for permanent ID'}
            </p>
          </div>

          {/* User ID Section */}
          <div className="px-4 py-3 space-y-2">
            {/* ID Display */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-[var(--text-muted)] mb-1">User ID</div>
                <div className="font-mono text-xs text-[var(--text-primary)] break-all">
                  {idInfo.userId}
                </div>
              </div>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 p-1.5 rounded hover:bg-[var(--bg-primary)] transition-colors"
                title="Copy ID"
              >
                {copied ? (
                  <Check size={14} className="text-[var(--success)]" />
                ) : (
                  <Copy size={14} className="text-[var(--text-muted)]" />
                )}
              </button>
            </div>

            {/* GitHub Username */}
            {idInfo.githubUsername && (
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-1">GitHub</div>
                <div className="flex items-center gap-1.5">
                  <Link size={12} className="text-[var(--success)]" />
                  <span className="text-xs text-[var(--text-primary)]">@{idInfo.githubUsername}</span>
                </div>
              </div>
            )}

            {/* Status Badge */}
            <div className="flex items-center gap-2 pt-2">
              {idInfo.isPermanent ? (
                <>
                  <div className="flex-1 px-2 py-1 rounded-md bg-[var(--success)]/10 border border-[var(--success)]/30">
                    <div className="text-xs text-[var(--success)] font-medium">✓ Permanent ID</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex-1 px-2 py-1 rounded-md bg-[var(--warning)]/10 border border-[var(--warning)]/30">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle size={12} className="text-[var(--warning)]" />
                      <span className="text-xs text-[var(--warning)] font-medium">Temporary</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Link GitHub CTA */}
            {!idInfo.isPermanent && (
              <div className="pt-2 mt-2 border-t border-[var(--border)]/50">
                <div className="text-xs text-[var(--text-muted)] mb-2">
                  To get a permanent ID, link your GitHub account in the Python terminal:
                </div>
                <code className="block px-2 py-1.5 rounded bg-[var(--bg-primary)]/50 text-xs font-mono text-[var(--accent)]">
                  github link
                </code>
              </div>
            )}
          </div>

          {/* Storage Path (collapsed) */}
          {idInfo.storagePath && (
            <div className="px-4 py-2 bg-[var(--bg-primary)]/30 border-t border-[var(--border)]/50">
              <details className="group">
                <summary className="text-xs text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)] transition-colors">
                  Storage Location
                </summary>
                <div className="mt-1 pl-2 text-xs font-mono text-[var(--text-muted)] break-all">
                  {idInfo.storagePath}
                </div>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
