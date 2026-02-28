import { create } from 'zustand';
import { ChatMessage, ChatSession } from '../types';

interface AIState {
    sessions: ChatSession[];
    currentSessionId: string | null;
    messages: ChatMessage[];
    contextDirectory: string | null;
    isLoading: boolean;
    isSessionsLoaded: boolean;
    streamingMessage: string;

    // Actions
    loadSessions: () => Promise<void>;
    createSession: () => void;
    selectSession: (id: string) => void;
    deleteSession: (id: string) => Promise<void>;
    clearSessions: () => Promise<void>;
    addMessage: (message: ChatMessage) => void;
    updateStreamingMessage: (content: string) => void;
    completeStream: () => void;
    setContextDirectory: (dir: string | null) => void;
    setLoading: (loading: boolean) => void;
}

export const useAIStore = create<AIState>((set, get) => ({
    sessions: [],
    currentSessionId: null,
    messages: [],
    contextDirectory: null,
    isLoading: false,
    isSessionsLoaded: false,
    streamingMessage: '',

    loadSessions: async () => {
        try {
            const sessions = await window.lucidAPI.ai.getSessions();
            set({ sessions, isSessionsLoaded: true });
        } catch (error) {
            console.error('Failed to load sessions:', error);
            set({ isSessionsLoaded: true });
        }
    },

    createSession: () => {
        const newSession: ChatSession = {
            id: Date.now().toString(),
            title: 'New Chat',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        set((state) => ({
            sessions: [newSession, ...state.sessions],
            currentSessionId: newSession.id,
            messages: [],
            streamingMessage: '',
        }));

        // Save the new session immediately
        window.lucidAPI.ai.saveSession(newSession);
    },

    selectSession: (id: string) => {
        const { sessions } = get();
        const session = sessions.find((s) => s.id === id);
        if (session) {
            set({
                currentSessionId: id,
                messages: session.messages,
                streamingMessage: '',
                isLoading: false,
            });
        }
    },

    deleteSession: async (id: string) => {
        try {
            await window.lucidAPI.ai.deleteSession(id);
            set((state) => {
                const newSessions = state.sessions.filter((s) => s.id !== id);
                let newCurrentId = state.currentSessionId;
                let newMessages = state.messages;

                if (state.currentSessionId === id) {
                    if (newSessions.length > 0) {
                        newCurrentId = newSessions[0].id;
                        newMessages = newSessions[0].messages;
                    } else {
                        newCurrentId = null;
                        newMessages = [];
                    }
                }

                return {
                    sessions: newSessions,
                    currentSessionId: newCurrentId,
                    messages: newMessages,
                };
            });
        } catch (error) {
            console.error('Failed to delete session:', error);
        }
    },

    clearSessions: async () => {
        try {
            await window.lucidAPI.ai.clearSessions();
            set({
                sessions: [],
                currentSessionId: null,
                messages: [],
            });
        } catch (error) {
            console.error('Failed to clear sessions:', error);
        }
    },

    addMessage: (message: ChatMessage) => {
        set((state) => {
            const newMessages = [...state.messages, message];
            const { sessions, currentSessionId } = state;

            // Update the current session in the list
            if (currentSessionId) {
                const sessionIndex = sessions.findIndex(s => s.id === currentSessionId);
                if (sessionIndex !== -1) {
                    const updatedSession = {
                        ...sessions[sessionIndex],
                        messages: newMessages,
                        // Update title based on first user message if it's "New Chat"
                        title: sessions[sessionIndex].title === 'New Chat' && message.role === 'user'
                            ? message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '')
                            : sessions[sessionIndex].title,
                        updatedAt: Date.now(),
                    };

                    const newSessions = [...sessions];
                    newSessions[sessionIndex] = updatedSession;

                    // Persist the update
                    window.lucidAPI.ai.saveSession(updatedSession);

                    return {
                        messages: newMessages,
                        sessions: newSessions.sort((a, b) => b.updatedAt - a.updatedAt),
                    };
                }
            }

            return { messages: newMessages };
        });
    },

    updateStreamingMessage: (content: string) => {
        set({ streamingMessage: content });
    },

    completeStream: () => {
        const { streamingMessage, addMessage } = get();
        if (streamingMessage) {
            const message: ChatMessage = {
                role: 'assistant',
                content: streamingMessage,
            };
            addMessage(message);
            set({ streamingMessage: '', isLoading: false });
        }
    },

    setContextDirectory: (dir: string | null) => {
        set({ contextDirectory: dir });
    },

    setLoading: (loading: boolean) => {
        set({ isLoading: loading });
    },
}));
