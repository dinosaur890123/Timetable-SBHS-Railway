import React, { useEffect } from 'react';
import { ArrowUpRight } from 'lucide-react';
import NoteFlowFilm, { NOTEFLOW_URL } from './study/NoteFlowFilm';

// NoteFlow's own faces, loaded only when someone opens Study.
const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wdth,wght@0,75..100,400..700;1,75..100,400..700&family=Instrument+Serif:ital@0;1&display=swap';

const useNoteFlowFonts = () => {
    useEffect(() => {
        if (document.querySelector(`link[href="${FONTS_HREF}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = FONTS_HREF;
        document.head.appendChild(link);
    }, []);
};

const ALSO = [
    ['AI tutor', 'Stuck at eleven at night? Ask.', 'Models from OpenAI, Google and Anthropic, reading your own notes. Any answer becomes a note or a deck of cards in one step.'],
    ['Focus', 'Twenty-five minutes. Nothing else.', 'A timer that floats above every window, ambient radio that starts and stops with it, and a streak that survives the term.'],
    ['Grades', 'A running grade for every subject.', 'Weighted assessments, so you always know where you stand.'],
    ['Google Calendar', 'Two-way sync.', 'Planner events and deadlines kept in step with the calendar you already use.'],
    ['Offline', 'Works without Wi-Fi.', 'A local copy of everything, synced when you are back online.'],
    ['Your data', 'Out in one click.', 'Export to Markdown, Word or plain text, or back up your whole library.']
];

// Study lives in NoteFlow, a separate app; this page shows what it does and links out.
const StudyView = () => {
    useNoteFlowFonts();

    return (
        <div className="nf nf-page">
            <NoteFlowFilm />

            <h2 className="nf-head">Everything else a term needs</h2>
            <div className="nf-also">
                {ALSO.map(([name, line, body]) => (
                    <div key={name}>
                        <span className="nf-meta">{name}</span>
                        <b>{line}</b>
                        <p>{body}</p>
                    </div>
                ))}
            </div>

            <h2 className="nf-head">Free to study. Plans when you want more.</h2>
            <div className="nf-plans">
                <p>
                    Notes, tasks, planner, Pomodoro, grades, flashcards and practice exams are free without limits.
                    Plans add more AI requests, the most capable models and unlimited cloud sync.
                </p>
                <a className="nf-btn nf-btn--sheet" href={`${NOTEFLOW_URL}/#pricing`} target="_blank" rel="noopener noreferrer">
                    See plans
                    <ArrowUpRight size={16} strokeWidth={1.75} />
                </a>
            </div>
        </div>
    );
};

export default StudyView;
