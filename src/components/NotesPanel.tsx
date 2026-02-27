// NotesPanel.tsx
// Main notes panel - works as sidebar per paper, global page, or inline

import { useState, useEffect, useRef } from "react";
import { useNotesStore, Note, NoteColor } from "../stores/notesStore";

interface NotesPanelProps {
    paperId?: string;
    citationId?: string;
    mode?: "sidebar" | "page" | "inline";
}

const COLOR_MAP: Record<NoteColor, { bg: string; border: string; dot: string }> = {
    yellow: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", dot: "bg-yellow-400" },
    blue: { bg: "bg-blue-500/10", border: "border-blue-500/30", dot: "bg-blue-400" },
    green: { bg: "bg-green-500/10", border: "border-green-500/30", dot: "bg-green-400" },
    pink: { bg: "bg-pink-500/10", border: "border-pink-500/30", dot: "bg-pink-400" },
    purple: { bg: "bg-purple-500/10", border: "border-purple-500/30", dot: "bg-purple-400" },
};

const COLORS: NoteColor[] = ["yellow", "blue", "green", "pink", "purple"];

export default function NotesPanel({ paperId, citationId, mode = "sidebar" }: NotesPanelProps) {
    const {
        notes, isLoading, searchQuery,
        fetchNotes, addNote, updateNote, deleteNote, searchNotes, setSearchQuery,
    } = useNotesStore();

    const [newContent, setNewContent] = useState("");
    const [newTags, setNewTags] = useState("");
    const [newColor, setNewColor] = useState<NoteColor>("yellow");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        fetchNotes(paperId, citationId);
    }, [paperId, citationId]);

    const handleAdd = async () => {
        if (!newContent.trim()) return;
        const tags = newTags.split(",").map((t) => t.trim()).filter(Boolean);
        await addNote(newContent.trim(), paperId, citationId, tags, newColor);
        setNewContent("");
        setNewTags("");
        setNewColor("yellow");
        setIsAdding(false);
    };

    const handleEdit = async (note: Note) => {
        await updateNote(note.id, { content: editContent });
        setEditingId(null);
    };

    const handlePin = async (note: Note) => {
        await updateNote(note.id, { is_pinned: !note.is_pinned });
    };

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const q = e.target.value;
        setSearchQuery(q);
        if (q.length > 1) searchNotes(q);
        else fetchNotes(paperId, citationId);
    };

    const displayNotes = [...notes].sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return 0;
    });

    return (
        <div className={`flex flex-col gap-3 ${mode === "page" ? "p-6 max-w-4xl mx-auto" : "p-4"}`}>

            {/* Header */}
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                    <span className="text-lg">📝</span>
                    <h2 className="text-white font-semibold text-sm">
                        {mode === "page" ? "All Notes" : paperId ? "Paper Notes" : "Notes"}
                    </h2>
                    <span className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">
                        {notes.length}
                    </span>
                </div>
                <button
                    onClick={() => { setIsAdding(true); setTimeout(() => textareaRef.current?.focus(), 50); }}
                    className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-lg transition-colors"
                >
                    + Add Note
                </button>
            </div>

            {/* Search */}
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={handleSearch}
                    placeholder="Search notes..."
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                />
            </div>

            {/* Add Note Form */}
            {isAdding && (
                <div className="bg-slate-800 border border-indigo-500/50 rounded-xl p-3 flex flex-col gap-2">
                    <textarea
                        ref={textareaRef}
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                        placeholder="Write your note..."
                        rows={3}
                        className="w-full bg-transparent text-white text-xs resize-none outline-none placeholder-slate-400"
                    />
                    <input
                        type="text"
                        value={newTags}
                        onChange={(e) => setNewTags(e.target.value)}
                        placeholder="Tags (comma separated: methodology, results...)"
                        className="w-full bg-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 placeholder-slate-500 outline-none"
                    />
                    {/* Color picker */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Color:</span>
                        {COLORS.map((c) => (
                            <button
                                key={c}
                                onClick={() => setNewColor(c)}
                                className={`w-5 h-5 rounded-full ${COLOR_MAP[c].dot} ${newColor === c ? "ring-2 ring-white ring-offset-1 ring-offset-slate-800" : ""}`}
                            />
                        ))}
                    </div>
                    <div className="flex gap-2 mt-1">
                        <button
                            onClick={handleAdd}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-1.5 rounded-lg transition-colors"
                        >
                            Save Note
                        </button>
                        <button
                            onClick={() => setIsAdding(false)}
                            className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Notes List */}
            {isLoading ? (
                <div className="text-center text-slate-400 text-xs py-6">Loading notes...</div>
            ) : displayNotes.length === 0 ? (
                <div className="text-center text-slate-500 text-xs py-8">
                    <p className="text-2xl mb-2">📋</p>
                    <p>No notes yet. Add your first note!</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2 overflow-y-auto max-h-[60vh] pr-1">
                    {displayNotes.map((note) => {
                        const colors = COLOR_MAP[note.color] || COLOR_MAP.yellow;
                        return (
                            <div
                                key={note.id}
                                className={`relative rounded-xl border p-3 ${colors.bg} ${colors.border} group`}
                            >
                                {/* Pin badge */}
                                {note.is_pinned && (
                                    <span className="absolute top-2 right-2 text-xs">📌</span>
                                )}

                                {/* Content */}
                                {editingId === note.id ? (
                                    <div className="flex flex-col gap-2">
                                        <textarea
                                            value={editContent}
                                            onChange={(e) => setEditContent(e.target.value)}
                                            rows={3}
                                            className="w-full bg-slate-700 text-white text-xs resize-none rounded-lg p-2 outline-none"
                                            autoFocus
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleEdit(note)}
                                                className="bg-indigo-600 text-white text-xs px-3 py-1 rounded-lg"
                                            >
                                                Save
                                            </button>
                                            <button
                                                onClick={() => setEditingId(null)}
                                                className="text-slate-400 text-xs px-3 py-1 rounded-lg"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-white text-xs leading-relaxed pr-4">{note.content}</p>
                                )}

                                {/* Tags */}
                                {note.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {note.tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="text-[10px] bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded-full"
                                            >
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Metadata & Actions */}
                                <div className="flex items-center justify-between mt-2">
                                    <span className="text-[10px] text-slate-500">
                                        {new Date(note.updated_at).toLocaleDateString()}
                                    </span>
                                    {/* Action buttons (show on hover) */}
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handlePin(note)}
                                            title={note.is_pinned ? "Unpin" : "Pin"}
                                            className="text-slate-400 hover:text-white text-xs p-1 rounded"
                                        >
                                            {note.is_pinned ? "📌" : "📍"}
                                        </button>
                                        <button
                                            onClick={() => { setEditingId(note.id); setEditContent(note.content); }}
                                            title="Edit"
                                            className="text-slate-400 hover:text-white text-xs p-1 rounded"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            onClick={() => deleteNote(note.id)}
                                            title="Delete"
                                            className="text-slate-400 hover:text-red-400 text-xs p-1 rounded"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}