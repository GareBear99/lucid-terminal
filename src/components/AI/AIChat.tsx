import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, X, Sparkles, Copy, StopCircle, Key, Plus, Minus, MessageSquare, Trash2, Menu, Folder, FolderOpen, Loader, Volume2, VolumeX } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAIStore } from '../../stores/aiStore';
import { useFileStore } from '../../stores/fileStore';
import { usePromptPaceStore } from '../../stores/promptPaceStore';
import { useToastStore } from '../../stores/toastStore';
import { useLoadingStore } from '../../stores/loadingStore';
import { ChatMessage, PingQuota } from '../../types';
import { getChatModelOptions, AUTO_CHAT_MODEL_VALUE } from '../../lib/chatModels';
import { formatTimeSinceRestock, isPingUnreachableError } from '../../lib/pingQuota';
import { bubbleLayoutForRole, formatMessageTime } from './chatBubbles';
import { MessageContextMenu } from './MessageContextMenu';
import { shouldShowSpeakOption, getActivePersonaVoiceSettings, resolveDefaultSpeakVoice, speakActorOptions } from '../../lib/personaPlex';
import { useForgeStore } from '../../stores/forgeStore';
import { speakText, getAvailableSpeakVoices } from '../../lib/speak';
import { InputDragHandle } from '../InputDragHandle';
import {
  INPUT_DRAG_MAX_HEIGHT_VH,
  INPUT_MIN_HEIGHT_PX,
  resolveInputHeightPx,
  useDraggableInputHeight,
} from '../../lib/inputHeight';

interface AIChatProps {
  onClose: () => void;
}

function AIChat({ onClose }: AIChatProps) {

  const { hasApiKey, setApiKey, isLocalBackendAvailable, isLocalModelAvailable, checkBackendStatus, settings, updateSetting } = useSettingsStore();
  const {
    sessions,
    currentSessionId,
    messages,
    streamingMessage,
    streamStartedAt,
    generatingSessionId,
    isLoading,
    contextDirectory,
    loadSessions,
    createSession,
    selectSession,
    setSessionModel,
    deleteSession,
    addMessage,
    updateStreamingMessage,
    completeStream,
    setLoading,
    setContextDirectory,
    isSessionsLoaded,
    pendingAiPrompt,
    clearPendingAiPrompt,
    pingQuota,
    pingQuotaSource,
    lastRestockAt,
    setPingQuota
  } = useAIStore();

  const [input, setInput] = useState('');
  const [keyInput, setKeyInput] = useState('');
  // The Chats panel starts CLOSED (Gary, 2026-11-06): open, it overlays
  // most of the conversation and hides the assistant replies, and the
  // only way to close it was clicking off in the chat. Open it with the
  // Menu toggle in the chat header; close it with the minus in the
  // panel header, or by clicking off in the chat.
  const [showSidebar, setShowSidebar] = useState(false);

  // Right-click context menu on a message (Speak). Set on right-click
  // when the Speak gate passes; null = no menu. `actors` is the voice
  // list for the Speak dropdown, captured at right-click time.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string; showSpeak: boolean; actors: string[] } | null>(null);

  // Persona Plex Speak gate (Gary, 2026-11-06): Speak shows only
  // when Persona Plex is installed AND the Speak toggle is on AND
  // the active persona's own Speak is on. The voice is the active
  // persona's EFFECTIVE voice (its stored voice when that matches
  // a voice on this machine, otherwise its assigned distinct voice
  // — a stored 'Lily' never spoke as Lily), at that persona's
  // volume and rate — the voice follows the chat bubble message.
  // Resolved fresh at speak time (see speakSettingsNow below),
  // so a right-click Speak always uses the voices loaded now.
  const personaPlexInstalled = (settings.installedAddons ?? []).includes('persona-plex');
  const speakEnabled = settings.personaPlexSpeakEnabled ?? false;
  const activePersonaVoiceSettings = getActivePersonaVoiceSettings({
    activeId: settings.personaPlexActiveId ?? null,
    config: settings.personaPlexConfig ?? {},
    customPersonas: settings.personaPlexCustomPersonas ?? [],
    availableVoices: getAvailableSpeakVoices(),
  });

  // Speak actor dropdown (Gary, 2026-11-07): the picked actor is
  // the persisted `speakActorVoice` setting (null = none picked).
  // The DEFAULT is the active Homunculus's voice — resolved from
  // the Forge roster (selected Homunculus, else the first in the
  // roster) and the persona paired to it, through the same
  // deterministic cast path as personas (see
  // resolveDefaultSpeakVoice). The roster is loaded on mount (the
  // same loadRoster ForgeView makes) so the default is known
  // without visiting Forge first; with an empty roster the default
  // falls back to the active persona's voice (the old Speak
  // behaviour). The picked actor applies to right-click Speak
  // only — auto-speak keeps the active persona's voice.
  const forgeRoster = useForgeStore((s) => s.roster);
  const forgeSelectedId = useForgeStore((s) => s.selectedId);
  const selectedActor = settings.speakActorVoice ?? null;
  const defaultSpeak = resolveDefaultSpeakVoice({
    roster: forgeRoster,
    selectedId: forgeSelectedId,
    config: settings.personaPlexConfig ?? {},
    customPersonas: settings.personaPlexCustomPersonas ?? [],
    availableVoices: getAvailableSpeakVoices(),
    activePersonaId: settings.personaPlexActiveId ?? null,
  });
  // The voice the Speak row will use right now (shown as its hint).
  const currentSpeakVoice =
    selectedActor ?? defaultSpeak.voice ?? activePersonaVoiceSettings.voice;

  // The active persona's voice settings, resolved fresh at speak
  // time against the voices loaded NOW (not the render-time list,
  // which can predate the voices loading). Used by right-click
  // Speak and auto-speak.
  const speakSettingsNow = () =>
    getActivePersonaVoiceSettings({
      activeId: useSettingsStore.getState().settings.personaPlexActiveId ?? null,
      config: useSettingsStore.getState().settings.personaPlexConfig ?? {},
      customPersonas: useSettingsStore.getState().settings.personaPlexCustomPersonas ?? [],
      availableVoices: getAvailableSpeakVoices(),
    });

  // The default Speak voice (the active Homunculus's voice),
  // resolved fresh at speak time — same inputs as the render-time
  // `defaultSpeak`, read live from the stores so a Homunculus
  // activated after this render still resolves correctly.
  const resolveDefaultSpeakNow = () => {
    const live = useSettingsStore.getState().settings;
    const forge = useForgeStore.getState();
    return resolveDefaultSpeakVoice({
      roster: forge.roster,
      selectedId: forge.selectedId,
      config: live.personaPlexConfig ?? {},
      customPersonas: live.personaPlexCustomPersonas ?? [],
      availableVoices: getAvailableSpeakVoices(),
      activePersonaId: live.personaPlexActiveId ?? null,
    });
  };

  // Speak a message in a given actor's voice (null = the default,
  // the active Homunculus's voice), at the active persona's volume
  // and rate. The voice is resolved fresh, so a pick made a moment
  // ago speaks in that voice even if the render-time list predates
  // the voices loading.
  const speakWithActor = (text: string, actorVoice: string | null) => {
    const fresh = speakSettingsNow();
    const voice =
      actorVoice ?? resolveDefaultSpeakNow().voice ?? fresh.voice;
    speakText(text, voice, { volume: fresh.volume, rate: fresh.rate });
  };

  // The per-chat model dropdown options (chatModels.ts is the
  // single list source): Auto first, then the ping server models
  // (when ping is enabled). No locals, no GPTs — the dropdown is
  // ping models only, and every one runs on SP. Rebuilt when ping
  // availability changes.
  const modelOptions = useMemo(
    () => getChatModelOptions({ pingEnabled: settings.pingServerEnabled }),
    [settings.pingServerEnabled],
  );

  // The chat on screen - its model is what the dropdown shows and
  // what handleSend passes for the next reply.
  const currentSession = sessions.find((s) => s.id === currentSessionId);

  // Gate actions: install the bundled model from inside the panel, and
  // re-check the backend. The backend/model status is only probed once
  // at launch (settingsStore.loadSettings), so a backend that came up
  // after launch still reads as down until something re-checks it.
  const [installing, setInstalling] = useState(false);
  const [progressLine, setProgressLine] = useState('');
  const [installError, setInstallError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const { success: toastSuccess, error: toastError } = useToastStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { draggedHeightPx, isDragging, onDragHandlePointerDown, noteHeight } =
    useDraggableInputHeight();

  // Size the chat input: default cap 33.33vh; the dragged height is a
  // cap — the bubble regresses to fit the content. The height is reset to 'auto'
  // first so scrollHeight shrinks when content is deleted.
  const syncChatInputHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const heightPx = resolveInputHeightPx(
      el.scrollHeight,
      draggedHeightPx,
      window.innerHeight,
      isDragging,
    );
    el.style.height = `${heightPx}px`;
    noteHeight(heightPx);
  }, [draggedHeightPx, isDragging, noteHeight]);

  // Re-sync when the text, the dragged cap, or the drag state changes
  // (typing, deleting, dragging, and sending all flow through here).
  useEffect(() => {
    syncChatInputHeight();
  }, [input, syncChatInputHeight]);

  useEffect(() => {
    loadSessions();
    // The panel mounts when it opens — re-probe the backend/model status
    // now, so the gate below shows the live state instead of the
    // launch-time snapshot.
    checkBackendStatus();
    // Load the Forge roster so the Speak default (the active
    // Homunculus's voice) is known without visiting Forge first —
    // the same loadRoster ForgeView makes on mount.
    void useForgeStore.getState().loadRoster();
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
    const handleStreamEnd = (quota?: PingQuota) => {
      if (quota) setPingQuota(quota);
      const replyText = useAIStore.getState().streamingMessage;
      completeStream();
      // Auto-speak: the active persona's messages speak as soon as
      // they arrive, in that persona's voice, when the persona has
      // auto-speak on (and the global Speak toggle is on and Persona
      // Plex is installed). Off by default — messages otherwise only
      // speak on right-click Speak.
      const live = useSettingsStore.getState().settings;
      const voiceSettings = getActivePersonaVoiceSettings({
        activeId: live.personaPlexActiveId ?? null,
        config: live.personaPlexConfig ?? {},
        customPersonas: live.personaPlexCustomPersonas ?? [],
        availableVoices: getAvailableSpeakVoices(),
      });
      if (
        (live.installedAddons ?? []).includes('persona-plex') &&
        (live.personaPlexSpeakEnabled ?? false) &&
        voiceSettings.speakEnabled &&
        voiceSettings.autoSpeak &&
        replyText.trim()
      ) {
        speakText(replyText, voiceSettings.voice, {
          volume: voiceSettings.volume,
          rate: voiceSettings.rate,
        });
      }
    };

    const handleStreamError = (error: string) => {
      addMessage({
        role: 'assistant',
        content: `Error: ${error}`,
        id: Date.now().toString(),
        timestamp: Date.now()
      });
      setLoading(false);
      // A network failure on the ping route means the ping server is
      // unreachable — the SP balance is then the KNOWN base 100, not a
      // stale one. Only when the route could have been ping: ping is
      // enabled and this chat's model is ping or Auto (the cascade
      // tries ping first). A local or OpenAI chat never touches the
      // server, so its errors leave the balance alone.
      if (isPingUnreachableError(error)) {
        const ai = useAIStore.getState();
        const session = ai.sessions.find((s) => s.id === ai.currentSessionId);
        if (
          useSettingsStore.getState().settings.pingServerEnabled &&
          session?.modelSource !== 'local' &&
          session?.modelSource !== 'openai'
        ) {
          ai.setPingQuotaBase();
        }
      }
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

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    // Allow if has key OR a loaded local model. A wrapper with no model
    // must not receive the message — it answers with a raw Python error.
    if (!text || isLoading || (!hasApiKey && !isLocalModelAvailable && !settings.pingServerEnabled)) return;

    // A submitted prompt feeds the Sentinel face's horns.
    usePromptPaceStore.getState().recordPrompt();

    const userMessage: ChatMessage = {
      role: 'user',
      content: text,
      id: Date.now().toString(),
      timestamp: Date.now()
    };

    addMessage(userMessage);
    if (!overrideText) setInput('');
    setLoading(true);

    try {
      // Prepare history for API
      const history = messages.map(m => ({
        role: m.role,
        content: m.content
      }));
      history.push({ role: userMessage.role, content: userMessage.content });

      // Start chat stream with context directory
      // The current chat's model, read at send time: this choice is
      // for the NEXT prompted reply. Absent (Auto) = no model is
      // passed and the reply takes today's cascade. The chat id
      // always rides along - the local backend scopes its memory
      // per chat id, so a new chat never sees the old chat's context.
      await window.lucidAPI.ai.chat(history as any, contextDirectory || undefined, true, {
        ...(currentSession?.model
          ? { model: currentSession.model, modelSource: currentSession.modelSource }
          : {}),
        chatId: currentSessionId ?? undefined,
      });
    } catch (error) {
      console.error('Chat error:', error);
      setLoading(false);
    }
  };

  // A prompt queued from outside the chat (the browser's "ask the AI
  // about this page") is sent as the next user message. The queue is
  // cleared first so a re-render cannot send it twice; while a
  // generation is running the prompt stays queued and this effect
  // re-fires when the load ends.
  useEffect(() => {
    if (!pendingAiPrompt || isLoading) return;
    clearPendingAiPrompt();
    void handleSend(pendingAiPrompt);
    // Deliberately only on the queued prompt / load state: listing
    // handleSend would re-fire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAiPrompt, isLoading]);

  const handleCancel = () => {
    window.lucidAPI.ai.cancelStream();
    setLoading(false);
    updateStreamingMessage('');
  };

  const handleSaveKey = async () => {
    if (!keyInput.trim()) return;
    await setApiKey(keyInput.trim());
    setKeyInput('');
  };

  const installTinyLlama = async () => {
    if (installing) return;
    setInstalling(true);
    useLoadingStore.getState().start('model-install');
    setInstallError(null);
    setProgressLine('Starting installer…');
    const unsubscribe = window.lucidAPI.lucid.onInstallTinyLlamaProgress((line) => {
      setProgressLine(line);
    });
    try {
      const result = await window.lucidAPI.lucid.installTinyLlama();
      if (result.success) {
        toastSuccess('TinyLlama installed — command passes and AI chat can now use the local model.');
        // Re-probe so the gate flips to the chat now the model exists.
        await checkBackendStatus();
      } else {
        const reason = result.error ?? 'Install failed for an unknown reason.';
        setInstallError(reason);
        toastError(`TinyLlama install failed: ${reason}`);
      }
    } catch (error: any) {
      const reason = error?.message ?? String(error);
      setInstallError(reason);
      toastError(`TinyLlama install failed: ${reason}`);
    } finally {
      unsubscribe();
      setInstalling(false);
      useLoadingStore.getState().finish('model-install');
      setProgressLine('');
    }
  };

  const recheckBackend = async () => {
    if (checking) return;
    setChecking(true);
    try {
      await checkBackendStatus();
    } finally {
      setChecking(false);
    }
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

  // Right-click on a message: ALWAYS show the custom menu — Copy
  // is a basic function and must never be gated (Gary: Copy works
  // with or without Persona Plex, Speak toggle on or off). Speak
  // shows in the menu only when the Speak gate passes (Persona
  // Plex installed AND the Speak toggle on AND the active persona's
  // own Speak on). The browser's default menu never shows on a
  // message right-click, so Copy is never lost to it in Electron.
  const handleMessageContextMenu = (e: React.MouseEvent, text: string) => {
    e.preventDefault();
    const showSpeak = shouldShowSpeakOption({ personaPlexInstalled, speakEnabled, personaSpeakEnabled: activePersonaVoiceSettings.speakEnabled });
    setContextMenu({ x: e.clientX, y: e.clientY, text, showSpeak, actors: speakActorOptions(getAvailableSpeakVoices()) });
  };

  // ChatGPT-style bubbles: user messages are a bubble hugging the right
  // edge (the "backwall"); assistant / system messages are a flat
  // full-width row on the left with the Lucid avatar. Content, code blocks,
  // copy buttons and timestamps are unchanged — this is layout only.
  const renderMessage = (message: ChatMessage, isStreaming = false) => {
    const content = isStreaming ? streamingMessage : message.content;
    const layout = bubbleLayoutForRole(message.role);
    const time = formatMessageTime(message.timestamp);

    const parts = content.split(/(```[\s\S]*?```)/g);

    const body = (
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
    );

    if (layout.isBubble) {
      return (
        <div className={layout.rowClass}>
          <div className="flex flex-col items-end max-w-[75%]">
            <div className={layout.bubbleClass}>{body}</div>
            {time && (
              <span className={`text-[10px] text-[var(--text-muted)] mt-1 pr-1 ${layout.timeAlignClass}`}>
                {time}
              </span>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className={layout.rowClass}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-purple-500 to-pink-500">
          <Sparkles size={14} className="text-white" />
        </div>
        <div className="flex-1 overflow-hidden">
          {body}
          {time && (
            <div className={`text-[10px] text-[var(--text-muted)] mt-1 ${layout.timeAlignClass}`}>
              {time}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Left-side typing bubble while the assistant is working but has not
  // streamed anything yet (first-token wait). Matches the assistant row.
  const renderTypingIndicator = () => (
    <div className="flex gap-3 px-4 py-3">
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-purple-500 to-pink-500">
        <Sparkles size={14} className="text-white" />
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-[var(--bg-secondary)] px-4 py-3">
        <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] animate-bounce" />
        <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );

  // API Key / No Model Screen — shown when there is no key and no
  // loaded local model. The message must say so plainly when the wrapper
  // is up but no model is loaded.
  if (!hasApiKey && !isLocalModelAvailable && !settings.pingServerEnabled) {
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
            <h3 className="text-lg font-semibold mb-2">{isLocalBackendAvailable ? 'No model loaded' : 'Activate Lucid Terminal'}</h3>
            <p className="text-[var(--text-secondary)] mb-6 text-sm">
              {isLocalBackendAvailable ? (
                <>
                  No model loaded — AI chat is unavailable.
                  <br />
                  <span className="text-xs text-[var(--text-muted)] mt-2 block">
                    Install a model, or enter an API key to use AI chat instead.
                  </span>
                </>
              ) : (
                <>
                  Please enter your API key to access AI features.
                  <br />
                  <span className="text-xs text-[var(--text-muted)] mt-2 block">
                    (Or verify local LuciferAI backend is running)
                  </span>
                </>
              )}
            </p>

            <div className="space-y-3">
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="sk-..."
                className="input w-full"
                onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
              />
              <button
                onClick={handleSaveKey}
                className="btn btn-primary w-full justify-center"
                disabled={!keyInput.trim()}
              >
                Save API Key
              </button>
              <div className="pt-1 border-t border-[var(--border)]">
                <p className="text-xs text-[var(--text-muted)] mt-3 mb-2">
                  No API key? Install the bundled local model instead — free, about 700 MB, a few minutes. No key needed.
                </p>
                <button
                  onClick={installTinyLlama}
                  disabled={installing}
                  className="btn btn-primary w-full justify-center disabled:opacity-60"
                >
                  {installing ? (
                    <>
                      <Loader size={14} className="animate-spin" />
                      Installing…
                    </>
                  ) : installError ? (
                    'Retry install'
                  ) : (
                    'Install TinyLlama'
                  )}
                </button>
                {installing && (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Installing TinyLlama… (downloads about 700 MB — this can take a few minutes)
                    {progressLine && (
                      <span className="block font-mono truncate" title={progressLine}>
                        {progressLine}
                      </span>
                    )}
                  </p>
                )}
                {installError && (
                  <p className="mt-2 text-xs text-red-300">
                    Install failed: {installError}
                  </p>
                )}
                <button
                  onClick={recheckBackend}
                  disabled={checking || installing}
                  className="btn-ghost w-full justify-center mt-2 text-xs disabled:opacity-60"
                >
                  {checking ? 'Checking…' : 'Check again — is the local backend running?'}
                </button>
              </div>
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
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSidebar(false)}
                className="p-1 hover:bg-[var(--bg-tertiary)] rounded"
                title="Minimize chats"
                aria-label="Minimize chats"
              >
                <Minus size={16} />
              </button>
              <button
                onClick={createSession}
                className="p-1 hover:bg-[var(--bg-tertiary)] rounded"
                title="New Chat"
              >
                <Plus size={16} />
              </button>
            </div>
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
              title="Toggle chats panel"
              aria-label="Toggle chats panel"
            >
              <Menu size={18} />
            </button>
            <Sparkles size={18} className="text-[var(--accent)]" />
            <span className="font-semibold">Lucid AI</span>
            {settings.pingServerEnabled && pingQuota && (
              <span
                className="text-xs text-[var(--text-muted)]"
                title={
                  pingQuotaSource === 'base'
                    ? 'Ping server not connected — SP is base 100 (known)'
                    : 'Ping server SP balance — 1 SP per reply'
                }
              >
                Ping server: {pingQuota.remaining}/{pingQuota.limit} left
                {pingQuotaSource === 'base' ? ' (base)' : ''}
                {lastRestockAt != null &&
                  formatTimeSinceRestock(lastRestockAt) != null &&
                  ` · restocked ${formatTimeSinceRestock(lastRestockAt)}`}
              </span>
            )}
            <select
              value={currentSession?.model ?? AUTO_CHAT_MODEL_VALUE}
              onChange={(e) => {
                if (!currentSessionId) return;
                const chosen = modelOptions.find((o) => o.value === e.target.value);
                setSessionModel(currentSessionId, chosen?.value || undefined, chosen?.source);
              }}
              className="text-xs bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded px-1 py-0.5 max-w-[160px]"
              title="Model for the next reply - this chat remembers its model"
              aria-label="Chat model"
            >
              {modelOptions.map((option) => (
                <option key={option.value || 'auto'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
            {personaPlexInstalled && (
              <button
                onClick={() => void updateSetting('personaPlexSpeakEnabled', !speakEnabled)}
                className="p-1 hover:bg-[var(--bg-secondary)] rounded"
                title={speakEnabled ? 'Speak on right-click: on — right-click a message to hear it' : 'Speak on right-click: off'}
                aria-label="Toggle Speak on right-click"
                aria-pressed={speakEnabled}
              >
                {speakEnabled ? <Volume2 size={18} className="text-[var(--accent)]" /> : <VolumeX size={18} className="text-[var(--text-muted)]" />}
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
              {messages.map((message, index) => (
                // Every message carries its own id (the store stamps any
                // that arrive without one), so the key is stable across
                // re-renders and re-orders — never Math.random(), which
                // would remount bubbles and break timestamp continuity.
                <div
                  key={message.id ?? `msg-${index}`}
                  onContextMenu={(e) => handleMessageContextMenu(e, message.content)}
                >
                  {renderMessage(message)}
                </div>
              ))}
              {isLoading && streamingMessage && generatingSessionId === currentSessionId && (
                <div>
                  {renderMessage({
                    role: 'assistant',
                    content: streamingMessage,
                    id: 'streaming',
                    // The stream's own start time, captured on the first
                    // chunk — stable across renders, not the render time
                    // (Date.now() here would tick on every re-render).
                    timestamp: streamStartedAt ?? Date.now(),
                  }, true)}
                </div>
              )}
              {isLoading && !streamingMessage && generatingSessionId === currentSessionId && renderTypingIndicator()}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {contextMenu && (
          <MessageContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            showSpeak={contextMenu.showSpeak}
            speakActors={contextMenu.actors}
            selectedActor={selectedActor}
            defaultActorLabel={defaultSpeak.label}
            currentSpeakVoice={currentSpeakVoice}
            onSpeak={() => {
              speakWithActor(contextMenu.text, selectedActor);
            }}
            onPickActor={(voice) => {
              // Picking an actor remembers it (persisted, so later
              // Speaks use it) AND speaks this message in it now.
              // Picking Default clears the pick — Speak goes back
              // to the active Homunculus's voice.
              void updateSetting('speakActorVoice', voice);
              speakWithActor(contextMenu.text, voice);
            }}
            onCopy={() => copyToClipboard(contextMenu.text)}
            onClose={() => setContextMenu(null)}
          />
        )}

        <div className="relative p-3 border-t border-[var(--border)]">
          {/* Drag handle on the input's top edge: drag up to grow,
              down to shrink, up to half the page. */}
          <InputDragHandle
            isDragging={isDragging}
            onDragHandlePointerDown={onDragHandlePointerDown}
          />
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              className="input resize-none flex-1 overflow-y-auto"
              placeholder="Ask Lucid..."
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              style={{ minHeight: `${INPUT_MIN_HEIGHT_PX}px`, maxHeight: `${INPUT_DRAG_MAX_HEIGHT_VH}vh` }}
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
