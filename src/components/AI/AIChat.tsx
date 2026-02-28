import { useState, useRef, useEffect } from 'react';
import { Send, X, Sparkles, Copy, StopCircle, Key, Plus, MessageSquare, Trash2, Menu, Folder, FolderOpen } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAIStore } from '../../stores/aiStore';
import { useFileStore } from '../../stores/fileStore';
import { ChatMessage } from '../../types';

interface AIChatProps {
  onClose: () => void;
}

function AIChat({ onClose }: AIChatProps) {

  const { hasLicenseKey, setLicenseKey, isLocalBackendAvailable } = useSettingsStore();
  const {
    sessions,
    currentSessionId,
    messages,
    streamingMessage,
    isLoading,
    contextDirectory,
    loadSessions,
    createSession,
    selectSession,
    deleteSession,
    addMessage,
    updateStreamingMessage,
    completeStream,
    setLoading,
    setContextDirectory,
    isSessionsLoaded
  } = useAIStore();

  const [input, setInput] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  // Sync context directory with file store current directory
  const currentDir = useFileStore((state) => state.currentDir);
  useEffect(() => {
    if (currentDir) {
      setContextDirectory(currentDir);
    }
  }, [currentDir, setContextDirectory]);

  useEffect(() => {
    // If sessions have loaded and none exist, create one
    if (isSessionsLoaded && sessions.length === 0 && !isLoading) {
      createSession();
    } else if (sessions.length > 0 && !currentSessionId) {
      // Select most recent session
      selectSession(sessions[0].id);
    }
  }, [sessions, currentSessionId, isSessionsLoaded]);

  useEffect(() => {
    // Setup streaming listeners
    const handleStreamEnd = () => {
      completeStream();
    };

    const handleStreamError = (error: string) => {
      addMessage({
        role: 'assistant',
        content: `Error: ${error}`,
        id: Date.now().toString(),
        timestamp: Date.now()
      });
      setLoading(false);
    };

    const cleanupStream = window.lucidAPI.ai.onStream((chunk) => {
      updateStreamingMessage(useAIStore.getState().streamingMessage + chunk);
    });

    const cleanupEnd = window.lucidAPI.ai.onStreamEnd(handleStreamEnd);
    const cleanupError = window.lucidAPI.ai.onStreamError(handleStreamError);

    return () => {
      cleanupStream();
      cleanupEnd();
      cleanupError();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  const handleSend = async () => {
    // Allow if has key OR local backend
    if (!input.trim() || isLoading || (!hasLicenseKey && !isLocalBackendAvailable)) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
      id: Date.now().toString(),
      timestamp: Date.now()
    };

    addMessage(userMessage);
    setInput('');
    setLoading(true);

    try {
      // Prepare history for API
      const history = messages.map(m => ({
        role: m.role,
        content: m.content
      }));
      history.push({ role: userMessage.role, content: userMessage.content });

      // Start chat stream with context directory
      await window.lucidAPI.ai.chat(history as any, contextDirectory || undefined, true);
    } catch (error) {
      console.error('Chat error:', error);
      setLoading(false);
    }
  };

  const handleCancel = () => {
    window.lucidAPI.ai.cancelStream();
    setLoading(false);
    updateStreamingMessage('');
  };

  const handleSaveKey = async () => {
    if (!keyInput.trim()) return;
    await setLicenseKey(keyInput.trim());
    setKeyInput('');
  };

  const handleSelectContext = async () => {
    try {
      const dir = await window.lucidAPI.fs.selectDirectory();
      if (dir) {
        setContextDirectory(dir);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handleClearContext = () => {
    setContextDirectory(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const renderMessage = (message: ChatMessage, isStreaming = false) => {
    const content = isStreaming ? streamingMessage : message.content;

    const parts = content.split(/(```[\s\S]*?```)/g);

    return (
      <div
        className={`flex gap-3 p-3 ${message.role === 'user' ? 'bg-[var(--bg-tertiary)]' : ''
          }`}
      >
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${message.role === 'user'
            ? 'bg-[var(--accent)]'
            : 'bg-gradient-to-br from-purple-500 to-pink-500'
            }`}
        >
          {message.role === 'user' ? (
            <span className="text-xs font-bold text-[var(--bg-primary)]">U</span>
          ) : (
            <Sparkles size={14} className="text-white" />
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="ai-markdown text-sm text-[var(--text-primary)]">
            {parts.map((part, i) => {
              if (part.startsWith('```')) {
                const match = part.match(/```(\w+)?\n?([\s\S]*?)```/);
                if (match) {
                  const [, , code] = match;
                  return (
                    <div key={i} className="ai-code-block relative group my-2">
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyToClipboard(code.trim())}
                          className="p-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)]"
                          title="Copy"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                      <pre className="p-3 bg-[var(--bg-secondary)] rounded-md overflow-x-auto">
                        <code>{code.trim()}</code>
                      </pre>
                    </div>
                  );
                }
              }
              return (
                <span key={i} className="whitespace-pre-wrap">
                  {part.split(/(\*\*.*?\*\*)/g).map((subPart, j) => {
                    if (subPart.startsWith('**') && subPart.endsWith('**')) {
                      return <strong key={j} className="font-bold text-[var(--accent)]">{subPart.slice(2, -2)}</strong>;
                    }
                    return subPart;
                  })}
                </span>
              );
            })}
            {isStreaming && <span className="animate-pulse inline-block w-2 h-4 bg-[var(--accent)] ml-1 align-middle"></span>}
          </div>
        </div>
      </div>
    );
  };

  // License Key Screen
  if (!hasLicenseKey && !isLocalBackendAvailable) {
    return (
      <div className="h-full flex flex-col bg-[var(--bg-primary)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-[var(--accent)]" />
            <span className="font-semibold">Lucid AI</span>
          </div>
          <button onClick={onClose} className="btn-ghost p-1 rounded">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <Key size={48} className="mx-auto mb-4 text-[var(--accent)]" />
            <h3 className="text-lg font-semibold mb-2">Activate Lucid Terminal</h3>
            <p className="text-[var(--text-secondary)] mb-6 text-sm">
              Please enter your License Key to access AI features.
              <br />
              <span className="text-xs text-[var(--text-muted)] mt-2 block">
                (Or verify local LuciferAI backend is running)
              </span>
            </p>

            <div className="space-y-3">
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="LUCID-..."
                className="input w-full"
                onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
              />
              <button
                onClick={handleSaveKey}
                className="btn btn-primary w-full justify-center"
                disabled={!keyInput.trim()}
              >
                Activate License
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-[var(--bg-primary)] relative">
      {/* Sidebar (Overlay) */}
      {showSidebar && (
        <div className="absolute inset-y-0 left-0 w-64 bg-[var(--bg-secondary)] border-r border-[var(--border)] z-10 shadow-xl flex flex-col">
          <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
            <h3 className="font-semibold text-sm">Chats</h3>
            <button
              onClick={createSession}
              className="p-1 hover:bg-[var(--bg-tertiary)] rounded"
              title="New Chat"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => {
                  selectSession(session.id);
                  // Optional: Close sidebar on selection on mobile, but here usually fine to keep open if user wants
                }}
                className={`p-3 cursor-pointer hover:bg-[var(--bg-tertiary)] flex items-center justify-between group ${currentSessionId === session.id ? 'bg-[var(--bg-tertiary)] border-r-2 border-[var(--accent)]' : ''
                  }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <MessageSquare size={14} className="text-[var(--text-muted)] flex-shrink-0" />
                  <span className="text-sm truncate">{session.title}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(session.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backdrop for sidebar */}
      {showSidebar && (
        <div
          className="absolute inset-0 bg-black/20 z-0"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-1 hover:bg-[var(--bg-secondary)] rounded"
            >
              <Menu size={18} />
            </button>
            <Sparkles size={18} className="text-[var(--accent)]" />
            <span className="font-semibold">Lucid AI</span>
          </div>

          <div className="flex items-center gap-2">
            {contextDirectory && (
              <div
                className="flex items-center gap-1 text-xs bg-[var(--bg-secondary)] px-2 py-1 rounded border border-[var(--border)] max-w-[200px] cursor-pointer hover:bg-[var(--bg-tertiary)]"
                onClick={handleSelectContext}
                title={contextDirectory}
              >
                <FolderOpen size={12} className="text-[var(--accent)] shrink-0" />
                <span className="truncate">{contextDirectory.split('\\').pop()?.split('/').pop()}</span>
                <button onClick={(e) => { e.stopPropagation(); handleClearContext(); }} className="hover:text-red-500">
                  <X size={12} />
                </button>
              </div>
            )}
            {!contextDirectory && (
              <button
                onClick={handleSelectContext}
                className="p-1 hover:bg-[var(--bg-secondary)] rounded text-[var(--text-muted)] hover:text-[var(--accent)]"
                title="Set Context Directory"
              >
                <Folder size={18} />
              </button>
            )}
            <button onClick={onClose} className="btn-ghost p-1 rounded">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center p-6 text-center text-[var(--text-muted)]">
              <div>
                <Sparkles size={48} className="mx-auto mb-4 opacity-50" />
                <p>Start a new conversation...</p>
                {contextDirectory && (
                  <div className="mt-4 text-xs bg-[var(--bg-secondary)] p-2 rounded inline-block">
                    <span className="font-semibold">Context:</span> {contextDirectory}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div key={message.id || Math.random()}>
                  {renderMessage(message)}
                </div>
              ))}
              {isLoading && streamingMessage && (
                <div>
                  {renderMessage({
                    role: 'assistant',
                    content: streamingMessage,
                    id: 'streaming',
                    timestamp: Date.now()
                  }, true)}
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <div className="p-3 border-t border-[var(--border)]">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              className="input resize-none flex-1 overflow-hidden"
              placeholder="Ask Lucid..."
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                  // Reset height
                  if (inputRef.current) inputRef.current.style.height = 'auto';
                }
              }}
              rows={1}
              style={{ minHeight: '40px' }}
              disabled={isLoading}
            />
            {isLoading ? (
              <button onClick={handleCancel} className="btn btn-danger px-3 self-end h-[40px]">
                <StopCircle size={18} />
              </button>
            ) : (
              <button
                onClick={() => {
                  handleSend();
                  if (inputRef.current) inputRef.current.style.height = 'auto';
                }}
                disabled={!input.trim()}
                className="btn btn-primary px-3 disabled:opacity-50 self-end h-[40px]"
              >
                <Send size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AIChat;
