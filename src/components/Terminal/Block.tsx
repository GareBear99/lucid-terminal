import { useState } from 'react';
import { TerminalBlock } from '../../types';
import { Copy, Check, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { ansiToHtml } from '../../utils/ansiToHtml';
import { ValidationSteps } from './ValidationIndicator';
import { TokenDisplay } from './TokenDisplay';

interface BlockProps {
    block: TerminalBlock;
    isActive: boolean;
    onToggle: () => void;
}

export function Block({ block, isActive, onToggle }: BlockProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(block.output);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={`terminal-block mb-4 rounded-lg overflow-hidden border transition-all duration-200 ${isActive ? 'border-[var(--accent)] shadow-md ring-1 ring-[var(--accent)]/30' : 'border-[var(--border)] opacity-90 hover:opacity-100'
            } bg-[var(--bg-secondary)]`}
            style={{ isolation: 'isolate', contain: 'paint' }}>

            {/* Block Header */}
            <div
                className="flex items-center justify-between px-3 py-2 bg-[var(--bg-tertiary)] border-b border-[var(--border)] cursor-pointer select-none group"
                onClick={onToggle}
            >
                <div className="flex items-center gap-3 overflow-hidden">
                    {/* Status Icon/Button */}
                    <div className={`p-1 rounded-md transition-colors ${block.isCollapsed ? 'bg-transparent text-[var(--text-muted)]' : 'bg-[var(--bg-primary)] text-[var(--text-primary)]'}`}>
                        {block.isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </div>

                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <span className={`font-mono text-xs font-bold ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                                {isActive ? 'RUNNING' : 'CMD'}
                            </span>
                            <span className="font-mono text-sm text-[var(--text-primary)] truncate font-semibold rendering-pixelated">
                                {block.command}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-[var(--text-muted)] text-xs font-mono">
                        <Clock size={12} />
                        <span>{new Date(block.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                    <button
                        onClick={handleCopy}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1.5 rounded-md hover:bg-[var(--bg-primary)] active:scale-95"
                        title="Copy Output"
                    >
                        {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                </div>
            </div>

            {/* Block Content - Native HTML for AAAA premium selection */}
            <div className={`transition-all duration-200 ${block.isCollapsed ? 'h-0 overflow-hidden' : 'h-auto'}`}>
                {/* Validation Steps (Warp-style) */}
                {block.validation && (
                    <div className="px-3 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
                        <ValidationSteps 
                            steps={block.validation.steps}
                            collapsed={block.isComplete && !block.validation.steps.some(s => s.status === 'error')}
                        />
                    </div>
                )}
                
                {/* Output */}
                <div className="bg-[var(--bg-primary)]">
                    <pre
                        className="ansi-output font-mono text-[13px] whitespace-pre-wrap select-text m-0 p-2"
                        style={{
                            userSelect: 'text',
                            WebkitUserSelect: 'text',
                            color: 'var(--text-primary)',
                            lineHeight: '1.5',
                        }}
                        dangerouslySetInnerHTML={{ __html: ansiToHtml(block.output) }}
                    />
                </div>
                
                {/* Token Stats */}
                {block.tokens && (
                    <div className="px-3 py-2 bg-[var(--bg-secondary)] border-t border-[var(--border)]">
                        <TokenDisplay tokens={block.tokens} />
                    </div>
                )}
            </div>
        </div>
    );
}
