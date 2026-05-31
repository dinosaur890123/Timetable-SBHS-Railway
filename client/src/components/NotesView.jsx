import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
    FileText, Plus, Search, Trash2, Eye, Edit3, Save, 
    Loader2, BookOpen, ArrowUpDown, Check, AlertCircle,
    GraduationCap, Brain, Timer, HelpCircle, ArrowLeft,
    Layers, Play, Pause, RotateCcw, ChevronLeft, ChevronRight,
    Zap, Target, Clock, Sparkles, PenTool, X, CheckCircle2
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


// =============================================
// FLASHCARDS TOOL
// =============================================
const FlashcardsTool = ({ onBack }) => {
    const [decks, setDecks] = useState(() => {
        const saved = localStorage.getItem('flashcard_decks');
        return saved ? JSON.parse(saved) : [];
    });
    const [activeDeckId, setActiveDeckId] = useState(null);
    const [studyMode, setStudyMode] = useState(false);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [showNewDeck, setShowNewDeck] = useState(false);
    const [newDeckName, setNewDeckName] = useState('');
    const [showAddCard, setShowAddCard] = useState(false);
    const [newFront, setNewFront] = useState('');
    const [newBack, setNewBack] = useState('');

    useEffect(() => {
        localStorage.setItem('flashcard_decks', JSON.stringify(decks));
    }, [decks]);

    const activeDeck = decks.find(d => d.id === activeDeckId);

    const createDeck = () => {
        if (!newDeckName.trim()) return;
        const deck = {
            id: 'deck_' + Date.now(),
            name: newDeckName.trim(),
            cards: [],
            createdAt: new Date().toISOString()
        };
        setDecks(prev => [deck, ...prev]);
        setNewDeckName('');
        setShowNewDeck(false);
        setActiveDeckId(deck.id);
    };

    const addCard = () => {
        if (!newFront.trim() || !newBack.trim()) return;
        setDecks(prev => prev.map(d => {
            if (d.id === activeDeckId) {
                return { ...d, cards: [...d.cards, { id: 'card_' + Date.now(), front: newFront.trim(), back: newBack.trim() }] };
            }
            return d;
        }));
        setNewFront('');
        setNewBack('');
        setShowAddCard(false);
    };

    const deleteDeck = (id) => {
        if (!window.confirm('Delete this deck and all its cards?')) return;
        setDecks(prev => prev.filter(d => d.id !== id));
        if (activeDeckId === id) setActiveDeckId(null);
    };

    const deleteCard = (cardId) => {
        setDecks(prev => prev.map(d => {
            if (d.id === activeDeckId) {
                return { ...d, cards: d.cards.filter(c => c.id !== cardId) };
            }
            return d;
        }));
    };

    const startStudy = () => {
        setStudyMode(true);
        setCurrentCardIndex(0);
        setIsFlipped(false);
    };

    // Study mode view
    if (studyMode && activeDeck && activeDeck.cards.length > 0) {
        const card = activeDeck.cards[currentCardIndex];
        return (
            <div className="p-6 max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between">
                    <button onClick={() => setStudyMode(false)} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                        <ArrowLeft size={14} /> Exit Study
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        {currentCardIndex + 1} / {activeDeck.cards.length}
                    </span>
                </div>

                <div className="text-center mb-2">
                    <h2 className="text-lg font-black uppercase tracking-tight text-zinc-900 dark:text-white">{activeDeck.name}</h2>
                </div>

                {/* Card */}
                <div 
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="cursor-pointer select-none"
                >
                    <div className={`min-h-[280px] border-2 border-black dark:border-zinc-700 p-8 flex flex-col items-center justify-center text-center transition-all duration-300 ${
                        isFlipped 
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-600 dark:border-emerald-700' 
                            : 'bg-white dark:bg-zinc-950'
                    } shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]`}>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-4">
                            {isFlipped ? '✓ Answer' : '? Question'}
                        </span>
                        <p className="text-xl font-bold text-zinc-900 dark:text-white leading-relaxed">
                            {isFlipped ? card.back : card.front}
                        </p>
                        <span className="text-[10px] text-zinc-400 mt-6 font-mono">
                            {isFlipped ? 'Click to see question' : 'Click to reveal answer'}
                        </span>
                    </div>
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between gap-4">
                    <button 
                        onClick={() => { setCurrentCardIndex(prev => Math.max(0, prev - 1)); setIsFlipped(false); }}
                        disabled={currentCardIndex === 0}
                        className="flex items-center gap-1 px-4 py-2 text-xs font-bold uppercase tracking-wider border-2 border-black dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                    >
                        <ChevronLeft size={14} /> Prev
                    </button>

                    <button 
                        onClick={() => { setIsFlipped(false); }}
                        className="px-3 py-2 text-xs font-bold uppercase tracking-wider border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    >
                        <RotateCcw size={14} />
                    </button>

                    <button 
                        onClick={() => { setCurrentCardIndex(prev => Math.min(activeDeck.cards.length - 1, prev + 1)); setIsFlipped(false); }}
                        disabled={currentCardIndex === activeDeck.cards.length - 1}
                        className="flex items-center gap-1 px-4 py-2 text-xs font-bold uppercase tracking-wider border-2 border-black dark:border-zinc-700 bg-black dark:bg-white text-white dark:text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                    >
                        Next <ChevronRight size={14} />
                    </button>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800">
                    <div 
                        className="h-full bg-black dark:bg-white transition-all duration-300"
                        style={{ width: `${((currentCardIndex + 1) / activeDeck.cards.length) * 100}%` }}
                    />
                </div>
            </div>
        );
    }

    // Deck detail view
    if (activeDeck) {
        return (
            <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between">
                    <button onClick={() => setActiveDeckId(null)} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                        <ArrowLeft size={14} /> All Decks
                    </button>
                    <div className="flex items-center gap-2">
                        {activeDeck.cards.length > 0 && (
                            <button onClick={startStudy} className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-xs font-black uppercase tracking-wider border-2 border-black dark:border-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.15)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
                                <Play size={14} /> Study Now
                            </button>
                        )}
                        <button onClick={() => setShowAddCard(true)} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white text-xs font-bold uppercase tracking-wider border-2 border-black dark:border-zinc-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
                            <Plus size={14} /> Add Card
                        </button>
                    </div>
                </div>

                <div>
                    <h2 className="text-2xl font-black uppercase tracking-tight text-zinc-900 dark:text-white">{activeDeck.name}</h2>
                    <p className="text-xs text-zinc-500 mt-1">{activeDeck.cards.length} card{activeDeck.cards.length !== 1 ? 's' : ''} in deck</p>
                </div>

                {/* Add Card Form */}
                {showAddCard && (
                    <div className="border-2 border-black dark:border-zinc-700 p-5 bg-white dark:bg-zinc-950 space-y-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">New Flashcard</span>
                            <button onClick={() => setShowAddCard(false)} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
                                <X size={14} />
                            </button>
                        </div>
                        <input
                            type="text"
                            value={newFront}
                            onChange={(e) => setNewFront(e.target.value)}
                            placeholder="Front (Question)..."
                            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-black dark:focus:border-white"
                        />
                        <input
                            type="text"
                            value={newBack}
                            onChange={(e) => setNewBack(e.target.value)}
                            placeholder="Back (Answer)..."
                            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-black dark:focus:border-white"
                            onKeyDown={(e) => e.key === 'Enter' && addCard()}
                        />
                        <button onClick={addCard} className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-xs font-bold uppercase tracking-wider border border-black dark:border-white hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors">
                            Add Card
                        </button>
                    </div>
                )}

                {/* Cards List */}
                <div className="space-y-2">
                    {activeDeck.cards.length === 0 ? (
                        <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 p-12 text-center">
                            <Layers size={32} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
                            <p className="text-sm font-bold text-zinc-500">No cards yet</p>
                            <p className="text-xs text-zinc-400 mt-1">Add your first flashcard to start studying</p>
                        </div>
                    ) : (
                        activeDeck.cards.map((card, idx) => (
                            <div key={card.id} className="border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-950 flex items-start justify-between gap-4 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">#{idx + 1}</span>
                                    </div>
                                    <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{card.front}</p>
                                    <p className="text-xs text-zinc-500 mt-0.5 truncate">{card.back}</p>
                                </div>
                                <button onClick={() => deleteCard(card.id)} className="text-zinc-400 hover:text-red-500 transition-colors shrink-0 mt-1">
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }

    // Decks list view
    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <button onClick={onBack} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                    <ArrowLeft size={14} /> Study Hub
                </button>
                <button onClick={() => setShowNewDeck(true)} className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-xs font-black uppercase tracking-wider border-2 border-black dark:border-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.15)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
                    <Plus size={14} /> New Deck
                </button>
            </div>

            <div>
                <h1 className="text-3xl font-black uppercase tracking-tight text-zinc-900 dark:text-white flex items-center gap-3">
                    <span className="p-2 bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white">
                        <Layers className="w-7 h-7" />
                    </span>
                    Flashcards
                </h1>
                <p className="text-zinc-550 dark:text-zinc-450 mt-2 text-xs">Create decks, add cards, and test your knowledge with flip-to-reveal study sessions.</p>
            </div>

            {/* New Deck Form */}
            {showNewDeck && (
                <div className="border-2 border-black dark:border-zinc-700 p-4 bg-white dark:bg-zinc-950 flex items-center gap-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]">
                    <input
                        type="text"
                        value={newDeckName}
                        onChange={(e) => setNewDeckName(e.target.value)}
                        placeholder="Deck name (e.g. Biology Chapter 3)..."
                        className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-black dark:focus:border-white"
                        onKeyDown={(e) => e.key === 'Enter' && createDeck()}
                        autoFocus
                    />
                    <button onClick={createDeck} className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-xs font-bold uppercase border border-black dark:border-white">Create</button>
                    <button onClick={() => { setShowNewDeck(false); setNewDeckName(''); }} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Decks Grid */}
            {decks.length === 0 ? (
                <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 p-16 text-center">
                    <Layers size={40} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white uppercase tracking-tight">No Decks Yet</h3>
                    <p className="text-xs text-zinc-500 mt-1">Create your first flashcard deck to get started</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {decks.map(deck => (
                        <div 
                            key={deck.id}
                            onClick={() => setActiveDeckId(deck.id)}
                            className="border-2 border-black dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all group shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.05)] hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[5px_5px_0px_0px_rgba(255,255,255,0.1)]"
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="font-black text-zinc-900 dark:text-white uppercase tracking-tight">{deck.name}</h3>
                                    <p className="text-xs text-zinc-500 mt-1 font-mono">{deck.cards.length} card{deck.cards.length !== 1 ? 's' : ''}</p>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); deleteDeck(deck.id); }}
                                    className="text-zinc-300 dark:text-zinc-700 hover:text-red-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


// =============================================
// POMODORO TIMER TOOL
// =============================================
const PomodoroTool = ({ onBack }) => {
    const [timeLeft, setTimeLeft] = useState(25 * 60);
    const [isRunning, setIsRunning] = useState(false);
    const [mode, setMode] = useState('focus'); // 'focus' | 'short-break' | 'long-break'
    const [sessionsCompleted, setSessionsCompleted] = useState(0);
    const intervalRef = useRef(null);

    const durations = {
        'focus': 25 * 60,
        'short-break': 5 * 60,
        'long-break': 15 * 60
    };

    useEffect(() => {
        if (isRunning && timeLeft > 0) {
            intervalRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(intervalRef.current);
                        setIsRunning(false);
                        if (mode === 'focus') {
                            setSessionsCompleted(s => s + 1);
                        }
                        // Play a notification sound
                        try {
                            const audio = new AudioContext();
                            const osc = audio.createOscillator();
                            const gain = audio.createGain();
                            osc.connect(gain);
                            gain.connect(audio.destination);
                            osc.frequency.value = 800;
                            gain.gain.value = 0.3;
                            osc.start();
                            osc.stop(audio.currentTime + 0.3);
                        } catch(e) {}
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(intervalRef.current);
    }, [isRunning, timeLeft, mode]);

    const switchMode = (newMode) => {
        setIsRunning(false);
        clearInterval(intervalRef.current);
        setMode(newMode);
        setTimeLeft(durations[newMode]);
    };

    const toggleTimer = () => {
        if (timeLeft === 0) {
            setTimeLeft(durations[mode]);
        }
        setIsRunning(!isRunning);
    };

    const resetTimer = () => {
        setIsRunning(false);
        clearInterval(intervalRef.current);
        setTimeLeft(durations[mode]);
    };

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const progress = 1 - (timeLeft / durations[mode]);

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button onClick={onBack} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                <ArrowLeft size={14} /> Study Hub
            </button>

            <div className="text-center">
                <h1 className="text-3xl font-black uppercase tracking-tight text-zinc-900 dark:text-white flex items-center justify-center gap-3">
                    <span className="p-2 bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white">
                        <Timer className="w-7 h-7" />
                    </span>
                    Pomodoro Timer
                </h1>
                <p className="text-zinc-550 dark:text-zinc-450 mt-2 text-xs">Stay focused with timed study sessions and breaks.</p>
            </div>

            {/* Mode Selector */}
            <div className="flex items-center justify-center gap-2">
                {[
                    { id: 'focus', label: 'Focus', icon: Target },
                    { id: 'short-break', label: 'Short Break', icon: Zap },
                    { id: 'long-break', label: 'Long Break', icon: Clock }
                ].map(m => (
                    <button
                        key={m.id}
                        onClick={() => switchMode(m.id)}
                        className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider border-2 transition-all ${
                            mode === m.id
                                ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.15)]'
                                : 'bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-800 hover:border-zinc-500'
                        }`}
                    >
                        <m.icon size={13} /> {m.label}
                    </button>
                ))}
            </div>

            {/* Timer Display */}
            <div className="border-2 border-black dark:border-zinc-700 bg-white dark:bg-zinc-950 p-12 text-center relative overflow-hidden shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.1)]">
                {/* Progress bar at top */}
                <div className="absolute top-0 left-0 h-1.5 bg-zinc-200 dark:bg-zinc-800 w-full">
                    <div 
                        className={`h-full transition-all duration-1000 ${
                            mode === 'focus' 
                                ? 'bg-black dark:bg-white' 
                                : 'bg-emerald-500'
                        }`}
                        style={{ width: `${progress * 100}%` }}
                    />
                </div>

                <div className="text-8xl font-black tracking-tighter text-zinc-900 dark:text-white font-mono tabular-nums">
                    {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </div>

                <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    {mode === 'focus' ? 'Focus Session' : mode === 'short-break' ? 'Short Break' : 'Long Break'}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-3 mt-8">
                    <button
                        onClick={toggleTimer}
                        className={`flex items-center gap-2 px-8 py-3 text-sm font-black uppercase tracking-wider border-2 transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${
                            isRunning
                                ? 'bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white border-black dark:border-zinc-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.1)]'
                                : 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.15)]'
                        }`}
                    >
                        {isRunning ? <><Pause size={16} /> Pause</> : <><Play size={16} /> {timeLeft === 0 ? 'Restart' : 'Start'}</>}
                    </button>
                    <button
                        onClick={resetTimer}
                        className="p-3 border-2 border-zinc-300 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-500 transition-all"
                    >
                        <RotateCcw size={16} />
                    </button>
                </div>
            </div>

            {/* Sessions counter */}
            <div className="text-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Sessions Completed</span>
                <div className="flex items-center justify-center gap-2 mt-2">
                    {Array.from({ length: Math.max(4, sessionsCompleted) }).map((_, i) => (
                        <div
                            key={i}
                            className={`w-4 h-4 border-2 transition-all ${
                                i < sessionsCompleted
                                    ? 'bg-black dark:bg-white border-black dark:border-white'
                                    : 'border-zinc-300 dark:border-zinc-800'
                            }`}
                        />
                    ))}
                </div>
                <p className="text-[10px] text-zinc-400 mt-2 font-mono">{sessionsCompleted} × 25 min = {sessionsCompleted * 25} min focused</p>
            </div>
        </div>
    );
};


// =============================================
// QUICK QUIZ TOOL
// =============================================
const QuickQuizTool = ({ onBack }) => {
    const [quizzes, setQuizzes] = useState(() => {
        const saved = localStorage.getItem('quick_quizzes');
        return saved ? JSON.parse(saved) : [];
    });
    const [activeQuizId, setActiveQuizId] = useState(null);
    const [takingQuiz, setTakingQuiz] = useState(false);
    const [currentQIndex, setCurrentQIndex] = useState(0);
    const [selectedAnswers, setSelectedAnswers] = useState({});
    const [showResults, setShowResults] = useState(false);
    const [showNewQuiz, setShowNewQuiz] = useState(false);
    const [newQuizName, setNewQuizName] = useState('');
    const [showAddQuestion, setShowAddQuestion] = useState(false);
    const [newQuestion, setNewQuestion] = useState('');
    const [newOptions, setNewOptions] = useState(['', '', '', '']);
    const [correctIndex, setCorrectIndex] = useState(0);

    useEffect(() => {
        localStorage.setItem('quick_quizzes', JSON.stringify(quizzes));
    }, [quizzes]);

    const activeQuiz = quizzes.find(q => q.id === activeQuizId);

    const createQuiz = () => {
        if (!newQuizName.trim()) return;
        const quiz = {
            id: 'quiz_' + Date.now(),
            name: newQuizName.trim(),
            questions: [],
            createdAt: new Date().toISOString()
        };
        setQuizzes(prev => [quiz, ...prev]);
        setNewQuizName('');
        setShowNewQuiz(false);
        setActiveQuizId(quiz.id);
    };

    const addQuestion = () => {
        if (!newQuestion.trim() || newOptions.filter(o => o.trim()).length < 2) return;
        const cleanOptions = newOptions.filter(o => o.trim());
        setQuizzes(prev => prev.map(q => {
            if (q.id === activeQuizId) {
                return {
                    ...q,
                    questions: [...q.questions, {
                        id: 'q_' + Date.now(),
                        question: newQuestion.trim(),
                        options: cleanOptions,
                        correctIndex: Math.min(correctIndex, cleanOptions.length - 1)
                    }]
                };
            }
            return q;
        }));
        setNewQuestion('');
        setNewOptions(['', '', '', '']);
        setCorrectIndex(0);
        setShowAddQuestion(false);
    };

    const deleteQuiz = (id) => {
        if (!window.confirm('Delete this quiz?')) return;
        setQuizzes(prev => prev.filter(q => q.id !== id));
        if (activeQuizId === id) setActiveQuizId(null);
    };

    const startQuiz = () => {
        setTakingQuiz(true);
        setCurrentQIndex(0);
        setSelectedAnswers({});
        setShowResults(false);
    };

    const selectAnswer = (qId, answerIndex) => {
        setSelectedAnswers(prev => ({ ...prev, [qId]: answerIndex }));
    };

    const getScore = () => {
        if (!activeQuiz) return 0;
        let correct = 0;
        activeQuiz.questions.forEach(q => {
            if (selectedAnswers[q.id] === q.correctIndex) correct++;
        });
        return correct;
    };

    // Taking quiz view
    if (takingQuiz && activeQuiz) {
        if (showResults) {
            const score = getScore();
            const total = activeQuiz.questions.length;
            const percentage = Math.round((score / total) * 100);
            return (
                <div className="p-6 max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="border-2 border-black dark:border-zinc-700 p-8 bg-white dark:bg-zinc-950 text-center shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.1)]">
                        <div className={`w-20 h-20 mx-auto flex items-center justify-center border-2 mb-4 ${
                            percentage >= 80 ? 'border-emerald-500 text-emerald-500' : percentage >= 50 ? 'border-amber-500 text-amber-500' : 'border-red-500 text-red-500'
                        }`}>
                            <span className="text-2xl font-black">{percentage}%</span>
                        </div>
                        <h2 className="text-xl font-black uppercase tracking-tight text-zinc-900 dark:text-white">
                            {percentage >= 80 ? 'Excellent!' : percentage >= 50 ? 'Good Effort!' : 'Keep Studying!'}
                        </h2>
                        <p className="text-sm text-zinc-500 mt-1">{score} out of {total} correct</p>
                        
                        <div className="flex items-center justify-center gap-3 mt-6">
                            <button onClick={startQuiz} className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-xs font-bold uppercase tracking-wider border-2 border-black dark:border-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.15)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
                                Retry Quiz
                            </button>
                            <button onClick={() => { setTakingQuiz(false); setShowResults(false); }} className="px-4 py-2 text-xs font-bold uppercase tracking-wider border-2 border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-500">
                                Back to Quiz
                            </button>
                        </div>
                    </div>

                    {/* Review answers */}
                    <div className="space-y-3">
                        {activeQuiz.questions.map((q, idx) => {
                            const isCorrect = selectedAnswers[q.id] === q.correctIndex;
                            return (
                                <div key={q.id} className={`border-2 p-4 ${isCorrect ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/10' : 'border-red-500 bg-red-50/50 dark:bg-red-950/10'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        {isCorrect ? <CheckCircle2 size={14} className="text-emerald-500" /> : <X size={14} className="text-red-500" />}
                                        <span className="text-xs font-bold text-zinc-900 dark:text-white">Q{idx + 1}: {q.question}</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500">
                                        Your answer: <span className={isCorrect ? 'text-emerald-600' : 'text-red-500'}>{q.options[selectedAnswers[q.id]] || 'Not answered'}</span>
                                        {!isCorrect && <span className="text-emerald-600"> • Correct: {q.options[q.correctIndex]}</span>}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }

        const currentQ = activeQuiz.questions[currentQIndex];
        return (
            <div className="p-6 max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between">
                    <button onClick={() => setTakingQuiz(false)} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                        <ArrowLeft size={14} /> Exit Quiz
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        Question {currentQIndex + 1} / {activeQuiz.questions.length}
                    </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800">
                    <div className="h-full bg-black dark:bg-white transition-all duration-300" style={{ width: `${((currentQIndex + 1) / activeQuiz.questions.length) * 100}%` }} />
                </div>

                <div className="border-2 border-black dark:border-zinc-700 p-6 bg-white dark:bg-zinc-950 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]">
                    <h3 className="text-lg font-black text-zinc-900 dark:text-white mb-4">{currentQ.question}</h3>
                    <div className="space-y-2">
                        {currentQ.options.map((opt, idx) => (
                            <button
                                key={idx}
                                onClick={() => selectAnswer(currentQ.id, idx)}
                                className={`w-full text-left px-4 py-3 text-sm font-medium border-2 transition-all ${
                                    selectedAnswers[currentQ.id] === idx
                                        ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white'
                                        : 'bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                                }`}
                            >
                                <span className="font-black mr-2 text-[10px] uppercase">{String.fromCharCode(65 + idx)}.</span>
                                {opt}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setCurrentQIndex(prev => Math.max(0, prev - 1))}
                        disabled={currentQIndex === 0}
                        className="px-4 py-2 text-xs font-bold uppercase tracking-wider border-2 border-zinc-300 dark:border-zinc-800 disabled:opacity-30 text-zinc-600 dark:text-zinc-400"
                    >
                        Previous
                    </button>
                    {currentQIndex === activeQuiz.questions.length - 1 ? (
                        <button
                            onClick={() => setShowResults(true)}
                            className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black text-xs font-black uppercase tracking-wider border-2 border-black dark:border-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.15)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                        >
                            Submit Quiz
                        </button>
                    ) : (
                        <button
                            onClick={() => setCurrentQIndex(prev => prev + 1)}
                            className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-xs font-bold uppercase tracking-wider border-2 border-black dark:border-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                        >
                            Next
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Quiz detail view
    if (activeQuiz) {
        return (
            <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between">
                    <button onClick={() => setActiveQuizId(null)} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                        <ArrowLeft size={14} /> All Quizzes
                    </button>
                    <div className="flex items-center gap-2">
                        {activeQuiz.questions.length > 0 && (
                            <button onClick={startQuiz} className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-xs font-black uppercase tracking-wider border-2 border-black dark:border-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.15)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
                                <Play size={14} /> Take Quiz
                            </button>
                        )}
                        <button onClick={() => setShowAddQuestion(true)} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white text-xs font-bold uppercase tracking-wider border-2 border-black dark:border-zinc-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
                            <Plus size={14} /> Add Question
                        </button>
                    </div>
                </div>

                <div>
                    <h2 className="text-2xl font-black uppercase tracking-tight text-zinc-900 dark:text-white">{activeQuiz.name}</h2>
                    <p className="text-xs text-zinc-500 mt-1">{activeQuiz.questions.length} question{activeQuiz.questions.length !== 1 ? 's' : ''}</p>
                </div>

                {/* Add Question Form */}
                {showAddQuestion && (
                    <div className="border-2 border-black dark:border-zinc-700 p-5 bg-white dark:bg-zinc-950 space-y-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">New Question</span>
                            <button onClick={() => setShowAddQuestion(false)} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
                                <X size={14} />
                            </button>
                        </div>
                        <input
                            type="text"
                            value={newQuestion}
                            onChange={(e) => setNewQuestion(e.target.value)}
                            placeholder="Enter question..."
                            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-black dark:focus:border-white"
                        />
                        <div className="space-y-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Answer Options (click to mark correct)</span>
                            {newOptions.map((opt, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCorrectIndex(idx)}
                                        className={`w-6 h-6 border-2 flex items-center justify-center shrink-0 transition-all ${
                                            correctIndex === idx
                                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                                : 'border-zinc-300 dark:border-zinc-700 hover:border-emerald-400'
                                        }`}
                                    >
                                        {correctIndex === idx && <Check size={12} />}
                                    </button>
                                    <input
                                        type="text"
                                        value={opt}
                                        onChange={(e) => {
                                            const updated = [...newOptions];
                                            updated[idx] = e.target.value;
                                            setNewOptions(updated);
                                        }}
                                        placeholder={`Option ${String.fromCharCode(65 + idx)}...`}
                                        className="flex-1 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-black dark:focus:border-white"
                                    />
                                </div>
                            ))}
                        </div>
                        <button onClick={addQuestion} className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-xs font-bold uppercase tracking-wider border border-black dark:border-white">
                            Add Question
                        </button>
                    </div>
                )}

                {/* Questions List */}
                <div className="space-y-2">
                    {activeQuiz.questions.length === 0 ? (
                        <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 p-12 text-center">
                            <HelpCircle size={32} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
                            <p className="text-sm font-bold text-zinc-500">No questions yet</p>
                            <p className="text-xs text-zinc-400 mt-1">Add questions to build your quiz</p>
                        </div>
                    ) : (
                        activeQuiz.questions.map((q, idx) => (
                            <div key={q.id} className="border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-950">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Q{idx + 1}</span>
                                        <p className="text-sm font-bold text-zinc-900 dark:text-white">{q.question}</p>
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {q.options.map((opt, oIdx) => (
                                                <span key={oIdx} className={`text-[10px] px-1.5 py-0.5 border ${oIdx === q.correctIndex ? 'bg-emerald-100 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-bold' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'}`}>
                                                    {String.fromCharCode(65 + oIdx)}. {opt}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setQuizzes(prev => prev.map(quiz => {
                                                if (quiz.id === activeQuizId) {
                                                    return { ...quiz, questions: quiz.questions.filter(question => question.id !== q.id) };
                                                }
                                                return quiz;
                                            }));
                                        }}
                                        className="text-zinc-400 hover:text-red-500 transition-colors shrink-0"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }

    // Quizzes list view
    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <button onClick={onBack} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                    <ArrowLeft size={14} /> Study Hub
                </button>
                <button onClick={() => setShowNewQuiz(true)} className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-xs font-black uppercase tracking-wider border-2 border-black dark:border-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.15)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
                    <Plus size={14} /> New Quiz
                </button>
            </div>

            <div>
                <h1 className="text-3xl font-black uppercase tracking-tight text-zinc-900 dark:text-white flex items-center gap-3">
                    <span className="p-2 bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white">
                        <HelpCircle className="w-7 h-7" />
                    </span>
                    Quick Quiz
                </h1>
                <p className="text-zinc-550 dark:text-zinc-450 mt-2 text-xs">Create multiple-choice quizzes to test yourself before exams.</p>
            </div>

            {showNewQuiz && (
                <div className="border-2 border-black dark:border-zinc-700 p-4 bg-white dark:bg-zinc-950 flex items-center gap-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]">
                    <input
                        type="text"
                        value={newQuizName}
                        onChange={(e) => setNewQuizName(e.target.value)}
                        placeholder="Quiz name (e.g. Chem Test Prep)..."
                        className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-black dark:focus:border-white"
                        onKeyDown={(e) => e.key === 'Enter' && createQuiz()}
                        autoFocus
                    />
                    <button onClick={createQuiz} className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-xs font-bold uppercase border border-black dark:border-white">Create</button>
                    <button onClick={() => { setShowNewQuiz(false); setNewQuizName(''); }} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
                        <X size={16} />
                    </button>
                </div>
            )}

            {quizzes.length === 0 ? (
                <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 p-16 text-center">
                    <HelpCircle size={40} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white uppercase tracking-tight">No Quizzes Yet</h3>
                    <p className="text-xs text-zinc-500 mt-1">Create your first quiz to start testing yourself</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {quizzes.map(quiz => (
                        <div
                            key={quiz.id}
                            onClick={() => setActiveQuizId(quiz.id)}
                            className="border-2 border-black dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all group shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.05)] hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[5px_5px_0px_0px_rgba(255,255,255,0.1)]"
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="font-black text-zinc-900 dark:text-white uppercase tracking-tight">{quiz.name}</h3>
                                    <p className="text-xs text-zinc-500 mt-1 font-mono">{quiz.questions.length} question{quiz.questions.length !== 1 ? 's' : ''}</p>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); deleteQuiz(quiz.id); }}
                                    className="text-zinc-300 dark:text-zinc-700 hover:text-red-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


// =============================================
// NOTES EDITOR (EXISTING, PRESERVED)
// =============================================
const NotesEditor = ({ user, timetableData, setView, onBack }) => {
    const [notes, setNotes] = useState([]);
    const [activeNoteId, setActiveNoteId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('All');
    const [sortBy, setSortBy] = useState('updatedAt-desc');
    const [previewMode, setPreviewMode] = useState(false);
    const [loading, setLoading] = useState(true);
    
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
                    <div className="flex items-center gap-3 mb-2">
                        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                            <ArrowLeft size={14} /> Study Hub
                        </button>
                    </div>
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
                                                placeholder={"# Write markdown notes here...\n\nUse ## for headings\nUse **bold** and *italic*\nUse - for list items"}
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


// =============================================
// MAIN STUDY HUB (NotesView)
// =============================================
const NotesView = ({ user, timetableData, setView }) => {
    const isProUser = user?.role === 'Admin' || user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'pro';

    // Which tool is active: null = hub landing, 'notes' | 'flashcards' | 'pomodoro' | 'quiz'
    const [activeTool, setActiveTool] = useState(null);

    if (!isProUser) {
        return (
            <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-white dark:bg-zinc-950 p-12 border-2 border-black dark:border-zinc-800 text-center relative overflow-hidden select-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
                    
                    <div className="w-20 h-20 bg-purple-100 dark:bg-purple-950/40 rounded-2xl flex items-center justify-center mx-auto mb-6 text-purple-600 dark:text-purple-400 border border-purple-200/20">
                        <GraduationCap size={36} className="animate-pulse" />
                    </div>

                    <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 bg-purple-600 text-white border border-purple-700">PRO FEATURE</span>
                    </div>

                    <h2 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tight mb-2">Unlock Study Platform</h2>
                    
                    <p className="text-zinc-550 dark:text-zinc-450 text-sm max-w-md mx-auto mb-8 leading-relaxed">
                        Supercharge your study sessions. Take notes, create flashcards, time your focus with Pomodoro, and quiz yourself — all in one hub.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto mb-8 text-left text-xs font-mono">
                        <div className="border border-zinc-200 dark:border-zinc-850 p-4 bg-zinc-50/50 dark:bg-zinc-900/10">
                            <span className="font-bold text-zinc-950 dark:text-white block mb-1">📝 Study Notes</span>
                            Write notes in clean markdown with headings, bold, lists, and a live toggle preview.
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-850 p-4 bg-zinc-50/50 dark:bg-zinc-900/10">
                            <span className="font-bold text-zinc-950 dark:text-white block mb-1">🧠 Flashcards</span>
                            Create decks and test your knowledge with flip-to-reveal study cards.
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-850 p-4 bg-zinc-50/50 dark:bg-zinc-900/10">
                            <span className="font-bold text-zinc-950 dark:text-white block mb-1">⏱️ Pomodoro & Quiz</span>
                            Focus timer with sessions tracking, plus quick self-assessment quizzes.
                        </div>
                    </div>

                    <button
                        onClick={() => setView && setView('profile')}
                        className="px-6 py-3 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold uppercase tracking-wider text-sm border-2 border-black dark:border-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.15)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    >
                        Upgrade to Pro ($5.99 Annually)
                    </button>
                </div>
            </div>
        );
    }

    // Render active tool
    if (activeTool === 'notes') {
        return <NotesEditor user={user} timetableData={timetableData} setView={setView} onBack={() => setActiveTool(null)} />;
    }
    if (activeTool === 'flashcards') {
        return <FlashcardsTool onBack={() => setActiveTool(null)} />;
    }
    if (activeTool === 'pomodoro') {
        return <PomodoroTool onBack={() => setActiveTool(null)} />;
    }
    if (activeTool === 'quiz') {
        return <QuickQuizTool onBack={() => setActiveTool(null)} />;
    }

    // Study Hub Landing Page
    const studyTools = [
        {
            id: 'notes',
            icon: PenTool,
            title: 'Take Notes',
            description: 'Write detailed study notes with Markdown editor, auto-save, and subject tagging from your timetable.',
            color: 'from-blue-500 to-indigo-600',
            borderColor: 'hover:border-blue-500 dark:hover:border-blue-400',
            iconBg: 'bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
            tag: 'Cloud Sync'
        },
        {
            id: 'flashcards',
            icon: Layers,
            title: 'Flashcards',
            description: 'Create custom decks and study with flip-to-reveal cards. Perfect for vocabulary, definitions, and key concepts.',
            color: 'from-emerald-500 to-teal-600',
            borderColor: 'hover:border-emerald-500 dark:hover:border-emerald-400',
            iconBg: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
            tag: 'Active Recall'
        },
        {
            id: 'pomodoro',
            icon: Timer,
            title: 'Pomodoro Timer',
            description: 'Stay focused with timed 25-minute study sessions and built-in breaks. Track your daily focus streaks.',
            color: 'from-amber-500 to-orange-600',
            borderColor: 'hover:border-amber-500 dark:hover:border-amber-400',
            iconBg: 'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
            tag: 'Focus Mode'
        },
        {
            id: 'quiz',
            icon: HelpCircle,
            title: 'Quick Quiz',
            description: 'Build multiple-choice quizzes to test yourself before exams. Track your scores and review wrong answers.',
            color: 'from-violet-500 to-purple-600',
            borderColor: 'hover:border-violet-500 dark:hover:border-violet-400',
            iconBg: 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400',
            tag: 'Self-Test'
        }
    ];

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-black text-zinc-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
                    <span className="p-2 bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white">
                        <GraduationCap className="w-7 h-7" />
                    </span>
                    Study
                </h1>
                <p className="text-zinc-550 dark:text-zinc-450 mt-2 text-xs">
                    Your all-in-one study toolkit. Choose a tool to get started.
                </p>
            </div>

            {/* Study Tools Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {studyTools.map((tool) => (
                    <button
                        key={tool.id}
                        onClick={() => setActiveTool(tool.id)}
                        className={`text-left border-2 border-black dark:border-zinc-800 p-6 bg-white dark:bg-zinc-950 transition-all duration-200 group cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${tool.borderColor}`}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`p-3 border border-zinc-200/50 dark:border-zinc-800/50 shrink-0 ${tool.iconBg} transition-transform duration-200 group-hover:scale-110`}>
                                <tool.icon size={24} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-black text-lg text-zinc-900 dark:text-white uppercase tracking-tight">
                                        {tool.title}
                                    </h3>
                                    <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 whitespace-nowrap">
                                        {tool.tag}
                                    </span>
                                </div>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                    {tool.description}
                                </p>
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {/* Quick Stats Footer */}
            <div className="border-2 border-black dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-5 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.05)]">
                <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={14} className="text-zinc-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Study Tip</span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Use <strong className="text-zinc-900 dark:text-white">active recall</strong> with flashcards, then reinforce with <strong className="text-zinc-900 dark:text-white">spaced repetition</strong>. 
                    Combine 25-minute <strong className="text-zinc-900 dark:text-white">Pomodoro sessions</strong> with short breaks for optimal focus. 
                    Test yourself with <strong className="text-zinc-900 dark:text-white">quick quizzes</strong> to identify weak areas before exams.
                </p>
            </div>
        </div>
    );
};

export default NotesView;
