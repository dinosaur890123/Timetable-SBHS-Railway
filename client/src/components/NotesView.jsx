import React, { useState, useEffect, useRef } from 'react';
import { 
    FileText, Plus, Search, Trash2, Eye, Edit3, Save, 
    Loader2, BookOpen, ArrowUpDown, Check, AlertCircle 
} from 'lucide-react';
import { fetchNotes, saveNote, deleteNote } from '../services/notesApi';

// Helper to escape HTML to prevent XSS
const escapeHtml = (text) => {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

// Simple Markdown Parser for Preview
const parseMarkdown = (rawText) => {
    if (!rawText) return '';
    const escaped = escapeHtml(rawText);
    const lines = escaped.split('\n');
    let html = [];
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // List item parsing
        const listMatch = line.match(/^(\s*)[-*+]\s+(.*)/);
        if (listMatch) {
            if (!inList) {
                html.push('<ul class="list-disc pl-6 mb-4 space-y-1">');
                inList = true;
            }
            // Parse bold/italic inside list items
            let content = listMatch[2];
            content = parseInlineMarkdown(content);
            html.push(`<li>${content}</li>`);
            continue;
        } else {
            if (inList) {
                html.push('</ul>');
                inList = false;
            }
        }

        // Heading 1 (# title)
        if (line.startsWith('# ')) {
            html.push(`<h1 class="text-2xl font-black mt-6 mb-3 border-b-2 border-zinc-200 dark:border-zinc-800 pb-1 uppercase tracking-tight">${parseInlineMarkdown(line.substring(2))}</h1>`);
        } 
        // Heading 2 (## title)
        else if (line.startsWith('## ')) {
            html.push(`<h2 class="text-xl font-bold mt-5 mb-2 uppercase tracking-tight">${parseInlineMarkdown(line.substring(3))}</h2>`);
        }
        // Heading 3 (### title)
        else if (line.startsWith('### ')) {
            html.push(`<h3 class="text-lg font-bold mt-4 mb-2 text-zinc-700 dark:text-zinc-300">${parseInlineMarkdown(line.substring(4))}</h3>`);
        }
        // Blockquote (> text)
        else if (line.startsWith('&gt; ')) {
            html.push(`<blockquote class="border-l-4 border-black dark:border-white bg-zinc-100 dark:bg-zinc-900 px-4 py-2 my-4 italic text-zinc-650 dark:text-zinc-400">${parseInlineMarkdown(line.substring(5))}</blockquote>`);
        }
        // Empty lines
        else if (line.trim() === '') {
            html.push('<div class="h-3"></div>');
        }
        // Standard paragraph
        else {
            html.push(`<p class="mb-3 leading-relaxed text-zinc-800 dark:text-zinc-200">${parseInlineMarkdown(line)}</p>`);
        }
    }

    if (inList) {
        html.push('</ul>');
    }

    return html.join('\n');
};

// Parse inline Markdown styles: **bold**, *italic*, `code`
const parseInlineMarkdown = (text) => {
    let result = text;
    // Bold **text**
    result = result.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    result = result.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Inline code `code`
    result = result.replace(/`(.*?)`/g, '<code class="bg-zinc-100 dark:bg-zinc-900 px-1 py-0.5 font-mono text-xs border border-zinc-200 dark:border-zinc-800">$1</code>');
    return result;
};

// Generate deterministic background color based on subject name
const getSubjectBgColor = (subject) => {
    if (!subject) return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200';
    const sub = subject.toLowerCase().trim();
    
    // Default matching for school subjects
    if (sub.includes('math') || sub.includes('algebra') || sub.includes('calc')) {
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-900/50';
    }
    if (sub.includes('science') || sub.includes('chem') || sub.includes('phys') || sub.includes('bio')) {
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50';
    }
    if (sub.includes('english') || sub.includes('lit') || sub.includes('writing')) {
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900/50';
    }
    if (sub.includes('history') || sub.includes('social') || sub.includes('geo')) {
        return 'bg-orange-100 text-orange-855 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 dark:border-orange-900/50';
    }
    if (sub.includes('art') || sub.includes('design') || sub.includes('music')) {
        return 'bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300 border-pink-200 dark:border-pink-900/50';
    }
    if (sub.includes('comp') || sub.includes('software') || sub.includes('code') || sub.includes('tech')) {
        return 'bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300 border-violet-200 dark:border-violet-900/50';
    }
    
    // Hash function for random but deterministic coloring
    let hash = 0;
    for (let i = 0; i < sub.length; i++) {
        hash = sub.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const index = Math.abs(hash) % 5;
    const colors = [
        'bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-900/50',
        'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900/50',
        'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900/50',
        'bg-sky-100 text-sky-850 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-900/50',
        'bg-lime-100 text-lime-850 dark:bg-lime-950/40 dark:text-lime-300 border-lime-200 dark:border-lime-900/50'
    ];
    
    return colors[index];
};

const NotesView = ({ user, timetableData, setView }) => {
    const isProUser = user?.role === 'Admin' || user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'pro';

    const [notes, setNotes] = useState([]);
    const [activeNoteId, setActiveNoteId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('All');
    const [sortBy, setSortBy] = useState('updatedAt-desc');
    const [previewMode, setPreviewMode] = useState(false);
    const [loading, setLoading] = useState(true);

    if (!isProUser) {
        return (
            <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-white dark:bg-zinc-950 p-12 border-2 border-black dark:border-zinc-800 text-center relative overflow-hidden select-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
                    
                    <div className="w-20 h-20 bg-purple-100 dark:bg-purple-950/40 rounded-2xl flex items-center justify-center mx-auto mb-6 text-purple-600 dark:text-purple-400 border border-purple-200/20">
                        <BookOpen size={36} className="animate-pulse" />
                    </div>

                    <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 bg-purple-600 text-white border border-purple-700">PRO FEATURE</span>
                    </div>

                    <h2 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tight mb-2">Unlock Study Notes Platform</h2>
                    
                    <p className="text-zinc-550 dark:text-zinc-450 text-sm max-w-md mx-auto mb-8 leading-relaxed">
                        Organise your school life. Take detailed notes, view instant Markdown previews, auto-save to the cloud, and categorize subjects automatically using your actual timetable.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto mb-8 text-left text-xs font-mono">
                        <div className="border border-zinc-200 dark:border-zinc-850 p-4 bg-zinc-50/50 dark:bg-zinc-900/10">
                            <span className="font-bold text-zinc-950 dark:text-white block mb-1">📝 Markdown Editor</span>
                            Write notes in clean markdown with headings, bold, lists, and a live toggle preview.
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-850 p-4 bg-zinc-50/50 dark:bg-zinc-900/10">
                            <span className="font-bold text-zinc-950 dark:text-white block mb-1">📅 Class Suggestions</span>
                            Subject tags are automatically populated using your custom class timetable.
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-850 p-4 bg-zinc-50/50 dark:bg-zinc-900/10">
                            <span className="font-bold text-zinc-950 dark:text-white block mb-1">💾 Offline Auto-Save</span>
                            Changes are saved instantly with full LocalStorage offline caching.
                        </div>
                    </div>

                    <button
                        onClick={() => setView && setView('profile')}
                        className="px-6 py-3 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold uppercase tracking-wider text-sm border-2 border-black dark:border-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.15)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    >
                        Upgrade to Pro ($6.99 Lifetime)
                    </button>
                </div>
            </div>
        );
    }
    
    // Save State: 'idle' | 'saving' | 'saved' | 'offline-saved' | 'error'
    const [saveStatus, setSaveStatus] = useState('idle');

    const autoSaveTimerRef = useRef(null);
    const activeNoteRef = useRef(null);

    // 1. Fetch notes on mount
    useEffect(() => {
        const loadNotes = async () => {
            try {
                setLoading(true);
                const fetchedNotes = await fetchNotes();
                setNotes(fetchedNotes);
                if (fetchedNotes.length > 0) {
                    setActiveNoteId(fetchedNotes[0].id);
                }
            } catch (err) {
                console.warn("Failed to load notes from DB, loading fallback...", err);
                const localNotesRaw = localStorage.getItem('notes_fallback');
                if (localNotesRaw) {
                    try {
                        const localNotes = JSON.parse(localNotesRaw);
                        setNotes(localNotes);
                        if (localNotes.length > 0) {
                            setActiveNoteId(localNotes[0].id);
                        }
                    } catch (e) {
                        console.error("Failed to parse LocalStorage notes fallback", e);
                    }
                }
            } finally {
                setLoading(false);
            }
        };

        loadNotes();
    }, []);

    // Extract subjects from student timetable to offer as quick suggestions
    const suggestedSubjects = React.useMemo(() => {
        const subjects = new Set(['Math', 'Science', 'English', 'History', 'Geography', 'Art', 'Computing']);
        
        if (timetableData && timetableData.timetable) {
            const periods = timetableData.timetable.periods || {};
            Object.values(periods).forEach(p => {
                if (p.title && p.title.trim()) {
                    const cleanTitle = p.title.replace(/\d+/g, '').trim(); // Remove course numbers (e.g. Mathematics 10 -> Mathematics)
                    if (
                        cleanTitle.length > 2 && 
                        !cleanTitle.toLowerCase().includes('lunch') && 
                        !cleanTitle.toLowerCase().includes('recess') && 
                        !cleanTitle.toLowerCase().includes('roll call') &&
                        !cleanTitle.toLowerCase().includes('assembly') &&
                        !cleanTitle.toLowerCase().includes('free period')
                    ) {
                        subjects.add(cleanTitle);
                    }
                }
            });
        }
        return Array.from(subjects);
    }, [timetableData]);

    const activeNote = notes.find(n => n.id === activeNoteId);
    activeNoteRef.current = activeNote;

    // 2. Perform Save API call
    const triggerSave = async (noteToSave) => {
        if (!noteToSave) return;
        setSaveStatus('saving');
        
        try {
            const saved = await saveNote(noteToSave);
            setSaveStatus('saved');
            
            // Update local state with official timestamp from server
            setNotes(prev => prev.map(n => n.id === saved.id ? saved : n));
        } catch (err) {
            console.error("Save note error, fallback to local:", err);
            setSaveStatus('offline-saved');
            
            // Offline update local timestamps in state
            const nowIso = new Date().toISOString();
            setNotes(prev => prev.map(n => n.id === noteToSave.id ? { ...n, updatedAt: nowIso } : n));
        }
    };

    // 3. Save to localStorage backup whenever state 'notes' changes
    useEffect(() => {
        if (!loading) {
            localStorage.setItem('notes_fallback', JSON.stringify(notes));
        }
    }, [notes, loading]);

    // 4. Auto-save triggers
    const onNoteChange = (field, value) => {
        if (!activeNote) return;
        
        // Immediate State Update
        const updatedNote = {
            ...activeNote,
            [field]: value,
            updatedAt: new Date().toISOString()
        };

        setNotes(prev => prev.map(n => n.id === activeNote.id ? updatedNote : n));
        setSaveStatus('saving');

        // Cancel previous timer
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        // Set 1.2s debounce for server saving
        autoSaveTimerRef.current = setTimeout(() => {
            triggerSave(updatedNote);
        }, 1200);
    };

    // Clean up timers on unmount
    useEffect(() => {
        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, []);

    // 5. Actions
    const handleNewNote = () => {
        const newId = 'note_' + Math.random().toString(36).substring(2, 15);
        const newNoteItem = {
            id: newId,
            studentId: user?.studentId || 'STUDENT',
            subject: 'General',
            title: 'Untitled Study Note',
            content: '# New Study Note\n\nStart typing notes for your subject...',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        setNotes(prev => [newNoteItem, ...prev]);
        setActiveNoteId(newId);
        setPreviewMode(false);
        triggerSave(newNoteItem);
    };

    const handleDeleteNote = async (id) => {
        if (!window.confirm("Are you sure you want to delete this study note?")) return;
        
        // Cancel timer if deleting active note
        if (id === activeNoteId && autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        const remainingNotes = notes.filter(n => n.id !== id);
        setNotes(remainingNotes);
        
        if (activeNoteId === id) {
            setActiveNoteId(remainingNotes.length > 0 ? remainingNotes[0].id : null);
        }

        try {
            await deleteNote(id);
        } catch (err) {
            console.error("Failed to delete note from database", err);
        }
    };

    // Filtered and Sorted list
    const filteredAndSortedNotes = React.useMemo(() => {
        let result = [...notes];

        // Apply Search
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(n => 
                (n.title || '').toLowerCase().includes(query) || 
                (n.content || '').toLowerCase().includes(query) ||
                (n.subject || '').toLowerCase().includes(query)
            );
        }

        // Apply Subject Filter
        if (selectedSubjectFilter !== 'All') {
            result = result.filter(n => n.subject === selectedSubjectFilter);
        }

        // Apply Sorting
        result.sort((a, b) => {
            if (sortBy === 'updatedAt-desc') {
                return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
            }
            if (sortBy === 'createdAt-desc') {
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            }
            if (sortBy === 'title-asc') {
                return (a.title || '').localeCompare(b.title || '');
            }
            return 0;
        });

        return result;
    }, [notes, searchQuery, selectedSubjectFilter, sortBy]);

    // Unique subjects of notes currently in state for filtering
    const noteSubjects = React.useMemo(() => {
        const subjects = new Set();
        notes.forEach(n => {
            if (n.subject && n.subject.trim()) {
                subjects.add(n.subject.trim());
            }
        });
        return Array.from(subjects);
    }, [notes]);

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-zinc-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
                        <span className="p-2 bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white">
                            <BookOpen className="w-7 h-7" />
                        </span>
                        Study Notes
                    </h1>
                    <p className="text-zinc-550 dark:text-zinc-450 mt-2 text-xs">
                        Keep track of your classes, study briefs, and summaries. All changes sync automatically.
                    </p>
                </div>
                
                <button
                    onClick={handleNewNote}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 text-sm font-black uppercase tracking-wider transition-all duration-150 border-2 border-black dark:border-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.15)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                    <Plus size={16} /> New Study Note
                </button>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-24 text-zinc-400">
                    <Loader2 size={36} className="animate-spin mb-4 text-black dark:text-white" />
                    <span className="font-mono text-xs uppercase tracking-widest">Initialising Notes Sandbox...</span>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 border-2 border-black dark:border-zinc-800 min-h-[60vh] bg-white dark:bg-zinc-950">
                    
                    {/* Left Sidebar (Lg cols 4) */}
                    <div className="lg:col-span-4 border-b-2 lg:border-b-0 lg:border-r-2 border-black dark:border-zinc-800 flex flex-col bg-zinc-50 dark:bg-zinc-950">
                        {/* Search & Sort Panel */}
                        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 space-y-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                                <input
                                    type="text"
                                    placeholder="Search study briefs..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-850 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                                />
                            </div>

                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-zinc-400">
                                    <ArrowUpDown size={12} />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Sort By</span>
                                </div>
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-850 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none"
                                >
                                    <option value="updatedAt-desc">Recently Edited</option>
                                    <option value="createdAt-desc">Recently Created</option>
                                    <option value="title-asc">Title (A-Z)</option>
                                </select>
                            </div>
                        </div>

                        {/* Subject Filters Pills */}
                        {noteSubjects.length > 0 && (
                            <div className="px-4 py-2 bg-zinc-100 dark:bg-zinc-900/30 border-b border-zinc-200 dark:border-zinc-800 flex gap-1.5 overflow-x-auto custom-scrollbar whitespace-nowrap">
                                <button
                                    onClick={() => setSelectedSubjectFilter('All')}
                                    className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border transition-all ${
                                        selectedSubjectFilter === 'All'
                                            ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white'
                                            : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-550'
                                    }`}
                                >
                                    All
                                </button>
                                {noteSubjects.map(sub => (
                                    <button
                                        key={sub}
                                        onClick={() => setSelectedSubjectFilter(sub)}
                                        className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border transition-all ${
                                            selectedSubjectFilter === sub
                                                ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white'
                                                : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-550'
                                        }`}
                                    >
                                        {sub}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Notes List */}
                        <div className="flex-1 overflow-y-auto max-h-[50vh] lg:max-h-[60vh] custom-scrollbar divide-y divide-zinc-200 dark:divide-zinc-850">
                            {filteredAndSortedNotes.length === 0 ? (
                                <div className="p-8 text-center text-zinc-500 font-mono text-xs italic">
                                    [NO STUDY NOTES FOUND]
                                </div>
                            ) : (
                                filteredAndSortedNotes.map((note) => {
                                    const isActive = note.id === activeNoteId;
                                    const cleanSnippet = (note.content || '')
                                        .replace(/[#*`>_\-]/g, '') // Strip basic markdown tags for snippet
                                        .substring(0, 80);
                                    
                                    return (
                                        <div
                                            key={note.id}
                                            onClick={() => {
                                                setActiveNoteId(note.id);
                                                setPreviewMode(false);
                                            }}
                                            className={`p-4 cursor-pointer text-left transition-all ${
                                                isActive 
                                                    ? 'bg-zinc-200 dark:bg-zinc-900 border-l-4 border-black dark:border-white' 
                                                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-900/50'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2 mb-1.5">
                                                <span className={`px-2 py-0.5 border text-[9px] font-black uppercase tracking-wider ${getSubjectBgColor(note.subject)}`}>
                                                    {note.subject || 'General'}
                                                </span>
                                                <span className="text-[10px] font-mono text-zinc-400">
                                                    {new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                </span>
                                            </div>

                                            <h3 className="font-bold text-sm text-zinc-900 dark:text-white truncate">
                                                {note.title || 'Untitled Note'}
                                            </h3>

                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-1 font-medium leading-normal">
                                                {cleanSnippet || 'No additional content...'}
                                            </p>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Right Panel - Active Editor (Lg cols 8) */}
                    <div className="lg:col-span-8 flex flex-col bg-white dark:bg-zinc-950">
                        {activeNote ? (
                            <div className="flex flex-col h-full">
                                {/* Editor Header Bar */}
                                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-zinc-50 dark:bg-zinc-900/10">
                                    {/* Autosave Status */}
                                    <div className="flex items-center gap-2">
                                        {saveStatus === 'saving' && (
                                            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                                <Loader2 size={11} className="animate-spin" /> Saving sync...
                                            </span>
                                        )}
                                        {saveStatus === 'saved' && (
                                            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-600 dark:text-green-400">
                                                <Check size={11} /> Saved Cloud
                                            </span>
                                        )}
                                        {saveStatus === 'offline-saved' && (
                                            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-500" title="Changes stored locally, waiting for internet to sync">
                                                <AlertCircle size={11} /> Stored Offline
                                            </span>
                                        )}
                                        {saveStatus === 'idle' && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-450">
                                                Active Brief Sandbox
                                            </span>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2">
                                        {/* Edit/Preview Toggle */}
                                        <button
                                            onClick={() => setPreviewMode(!previewMode)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-850 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-800 text-xs font-bold uppercase tracking-wide active:scale-[0.98] transition-transform"
                                        >
                                            {previewMode ? (
                                                <>
                                                    <Edit3 size={13} /> Edit Note
                                                </>
                                            ) : (
                                                <>
                                                    <Eye size={13} /> Markdown Preview
                                                </>
                                            )}
                                        </button>

                                        {/* Delete Button */}
                                        <button
                                            onClick={() => handleDeleteNote(activeNote.id)}
                                            className="p-1.5 text-zinc-455 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 border border-transparent hover:border-red-200 dark:hover:border-red-900/30 transition-all active:scale-95"
                                            title="Delete Brief"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>

                                {/* Main Editor Inputs */}
                                <div className="p-6 space-y-4 flex-1 flex flex-col">
                                    {/* Title Input */}
                                    <input
                                        type="text"
                                        value={activeNote.title || ''}
                                        onChange={(e) => onNoteChange('title', e.target.value)}
                                        placeholder="Untitled Study Note"
                                        className="w-full text-2xl font-black bg-transparent border-0 border-b-2 border-transparent focus:border-black dark:focus:border-white text-zinc-900 dark:text-white placeholder-zinc-350 focus:outline-none pb-1 uppercase tracking-tight"
                                    />

                                    {/* Subject Input / Combo suggestions */}
                                    <div className="space-y-2 text-left">
                                        <label className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 block">
                                            Subject / Class Category
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            <input
                                                type="text"
                                                value={activeNote.subject || ''}
                                                onChange={(e) => onNoteChange('subject', e.target.value)}
                                                placeholder="e.g. Mathematics, Chem, Geography"
                                                className="w-full max-w-sm px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                                            />
                                        </div>

                                        {/* Clicking suggested classes from timetable */}
                                        <div className="flex items-center gap-1.5 overflow-x-auto py-1 custom-scrollbar max-w-full">
                                            <span className="text-[9px] font-black uppercase text-zinc-400 select-none tracking-wider whitespace-nowrap">Suggested:</span>
                                            {suggestedSubjects.map(sub => (
                                                <button
                                                    key={sub}
                                                    onClick={() => onNoteChange('subject', sub)}
                                                    className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide border transition-all ${
                                                        activeNote.subject === sub
                                                            ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white'
                                                            : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 hover:text-zinc-700'
                                                    }`}
                                                >
                                                    {sub}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Note Body Area */}
                                    <div className="flex-1 flex flex-col min-h-[30vh]">
                                        {previewMode ? (
                                            /* Markdown Render Area */
                                            <div 
                                                className="flex-1 text-left p-4 bg-zinc-50 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-850 overflow-y-auto max-h-[50vh] lg:max-h-[60vh] select-text prose dark:prose-invert max-w-none custom-scrollbar"
                                                dangerouslySetInnerHTML={{ __html: parseMarkdown(activeNote.content) }}
                                            />
                                        ) : (
                                            /* Edit Text Area */
                                            <textarea
                                                value={activeNote.content || ''}
                                                onChange={(e) => onNoteChange('content', e.target.value)}
                                                placeholder="# Write markdown notes here...&#10;&#10;Use ## for headings&#10;Use **bold** and *italic*&#10;Use - for list items"
                                                className="flex-1 w-full p-4 bg-zinc-50 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-850 text-sm text-zinc-900 dark:text-white font-mono placeholder-zinc-400 focus:outline-none focus:border-black dark:focus:border-white transition-colors resize-none custom-scrollbar"
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Empty Slate state */
                            <div className="flex flex-col items-center justify-center p-12 text-center my-auto min-h-[40vh]">
                                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-400 flex items-center justify-center text-2xl mb-4">
                                    📝
                                </div>
                                <h3 className="text-lg font-bold text-zinc-900 dark:text-white uppercase tracking-tight">No Study Note Active</h3>
                                <p className="text-zinc-500 text-xs mt-1 mb-4">Select an existing brief from the sidebar, or create a brand new draft.</p>
                                <button
                                    onClick={handleNewNote}
                                    className="px-4 py-2 bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white text-xs font-bold uppercase tracking-wider hover:bg-zinc-850 dark:hover:bg-zinc-100 transitionactive:scale-95 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]"
                                >
                                    Create First Note
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotesView;
