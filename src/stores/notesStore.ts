// notesStore.ts
import { create } from 'zustand';

export type NoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple';

export interface Note {
    id: string;
    content: string;
    paper_id?: string;
    citation_id?: string;
    tags: string[];
    color: NoteColor;
    created_at: string;
    updated_at: string;
    is_pinned: boolean;
}

interface NotesState {
    notes: Note[];
    isLoading: boolean;
    searchQuery: string;
    activeFilter: 'all' | 'paper' | 'citation' | 'pinned';

    fetchNotes: (paperId?: string, citationId?: string) => Promise<void>;
    addNote: (content: string, paperId?: string, citationId?: string, tags?: string[], color?: NoteColor) => Promise<void>;
    updateNote: (id: string, updates: Partial<Note>) => Promise<void>;
    deleteNote: (id: string) => Promise<void>;
    searchNotes: (query: string) => Promise<void>;
    setSearchQuery: (query: string) => void;
    setActiveFilter: (filter: NotesState['activeFilter']) => void;
    getNotesForPaper: (paperId: string) => Note[];
    getNotesForCitation: (citationId: string) => Note[];
    getPinnedNotes: () => Note[];
}

const API_BASE = 'http://localhost:5000/api/notes';

export const useNotesStore = create<NotesState>((set, get) => ({
    notes: [],           // ← always starts as empty array, never undefined
    isLoading: false,
    searchQuery: '',
    activeFilter: 'all',

    fetchNotes: async (paperId?, citationId?) => {
        set({ isLoading: true });
        try {
            let url = `${API_BASE}/`;
            if (paperId) url += `?paper_id=${paperId}`;
            else if (citationId) url += `?citation_id=${citationId}`;

            const res = await fetch(url);
            if (!res.ok) {
                // API not ready yet — silently set empty, don't crash
                set({ notes: [] });
                return;
            }
            const data = await res.json();
            set({ notes: Array.isArray(data.notes) ? data.notes : [] });
        } catch (err) {
            // Network error / backend down — silently set empty, don't crash
            console.warn('Notes API unavailable, continuing with empty notes.');
            set({ notes: [] });
        } finally {
            set({ isLoading: false });
        }
    },

    addNote: async (content, paperId?, citationId?, tags = [], color = 'yellow') => {
        try {
            const res = await fetch(`${API_BASE}/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, paper_id: paperId, citation_id: citationId, tags, color }),
            });
            if (!res.ok) return;
            const newNote = await res.json();
            set((state) => ({ notes: [newNote, ...state.notes] }));
        } catch (err) {
            console.error('Failed to add note:', err);
        }
    },

    updateNote: async (id, updates) => {
        try {
            const res = await fetch(`${API_BASE}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            if (!res.ok) return;
            const updatedNote = await res.json();
            set((state) => ({
                notes: state.notes.map((n) => (n.id === id ? updatedNote : n)),
            }));
        } catch (err) {
            console.error('Failed to update note:', err);
        }
    },

    deleteNote: async (id) => {
        try {
            await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
            set((state) => ({ notes: state.notes.filter((n) => n.id !== id) }));
        } catch (err) {
            console.error('Failed to delete note:', err);
        }
    },

    searchNotes: async (query) => {
        set({ isLoading: true, searchQuery: query });
        try {
            const res = await fetch(`${API_BASE}/?q=${encodeURIComponent(query)}`);
            if (!res.ok) return;
            const data = await res.json();
            set({ notes: Array.isArray(data.notes) ? data.notes : [] });
        } catch (err) {
            console.error('Search failed:', err);
        } finally {
            set({ isLoading: false });
        }
    },

    setSearchQuery: (query) => set({ searchQuery: query }),
    setActiveFilter: (filter) => set({ activeFilter: filter }),
    getNotesForPaper: (paperId) => get().notes.filter((n) => n.paper_id === paperId),
    getNotesForCitation: (citationId) => get().notes.filter((n) => n.citation_id === citationId),
    getPinnedNotes: () => get().notes.filter((n) => n.is_pinned),
}));