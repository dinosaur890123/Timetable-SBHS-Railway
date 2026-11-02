import React from 'react';
import { useReducedMotion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { NOTEFLOW_URL, Hl, Lockup, Rise, Ring, Tick, Words, useNoteFlowFonts } from './study/noteflow';

const ExternalLink = ({ href = NOTEFLOW_URL, className, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
        <ArrowUpRight size={16} strokeWidth={1.75} />
    </a>
);

/* ---------- Small product glimpses, one per step ---------- */

const NoteArt = () => (
    <div className="nf-art-note">
        <b>Cellular respiration</b>
        <span>Turns glucose into ATP, mostly in the mitochondria.</span>
        <span className="nf-art-eq tnum">C<sub>6</sub>H<sub>12</sub>O<sub>6</sub> + 6O<sub>2</sub> → energy</span>
    </div>
);

const CardsArt = () => (
    <div className="nf-art-cards">
        <div className="nf-sheet"><b>What powers ATP synthase?</b><span>Chemiosmosis</span></div>
        <div className="nf-sheet"><b>Where is the Krebs cycle?</b></div>
    </div>
);

const ReviewArt = () => (
    <div className="nf-art-rates">
        {[['Again', '10m'], ['Hard', '7d'], ['Good', '13d'], ['Easy', '19d']].map(([label, wait]) => (
            <span key={label} className={label === 'Good' ? 'is-on' : undefined}>
                {label}<small className="tnum">{wait}</small>
            </span>
        ))}
    </div>
);

const TestArt = ({ still }) => (
    <div className="nf-art-score">
        <span className="nf-score tnum">11<small>/12</small><Ring delay={0.5} still={still} /></span>
        <span className="nf-meta">Up from 8/12</span>
    </div>
);

// Revision blocks fill the days before Friday's exam.
const PlanArt = () => (
    <div className="nf-art-plan">
        <div className="nf-art-week">
            {[['M', 2], ['T', 3], ['W', 1], ['T', 2], ['F', 0]].map(([day, blocks], i) => (
                <div key={i} className={blocks ? undefined : 'is-exam'}>
                    {blocks ? Array.from({ length: blocks }, (_, b) => <i key={b} />) : <i />}
                    <span>{day}</span>
                </div>
            ))}
        </div>
        <span className="nf-meta">Biology trial on Friday</span>
    </div>
);

const STEPS = [
    { title: 'Write it once.', body: 'Notes with equations and tables, filed by subject.', Art: NoteArt },
    { title: 'Turn it into cards.', body: 'One step makes flashcards from any note or tutor answer.', Art: CardsArt },
    { title: 'Review before you forget.', body: 'Each card comes back the day you would otherwise lose it.', Art: ReviewArt },
    { title: 'Test yourself on it.', body: 'Timed practice papers. Wrong answers become new cards.', Art: TestArt },
    { title: 'Plan round the exam.', body: 'Revision lands in the days before it, synced to Google Calendar.', Art: PlanArt }
];

const ALSO = [
    ['Challenges', 'Any deck becomes a link your friends play in their browser, with a scoreboard.'],
    ['AI tutor', 'Ask at eleven at night. Any answer becomes a note or a deck in one step.'],
    ['Focus', 'A twenty-five minute timer that floats above every window.'],
    ['Grades', 'Weighted assessments and a running grade for every subject.'],
    ['Offline', 'A local copy of everything, synced when you are back online.'],
    ['Your data', 'Export to Markdown, Word or plain text in one click.']
];

// Study lives in NoteFlow, a separate app. One screen says what it does and links out.
const StudyView = () => {
    useNoteFlowFonts();
    const still = useReducedMotion();

    return (
        <div className="nf nf-page">
            <section className="nf-hero">
                <div>
                    <Rise still={still} y={6} className="nf-hero__brand"><Lockup size={24} /></Rise>
                    <h1 className="nf-display">
                        <Words text="Walk into every exam" still={still} />
                        <br />
                        <em>
                            <Hl display delay={0.55} still={still}>
                                <Words text="already knowing it." delay={0.22} step={0.06} still={still} />
                            </Hl>
                        </em>
                    </h1>
                    <Rise still={still} as="p" delay={0.45} className="nf-lede">
                        Your notes become flashcards and practice papers, and each one comes back right before
                        you&rsquo;d forget it.
                    </Rise>
                    <Rise still={still} delay={0.6} className="nf-hero__cta">
                        <ExternalLink className="nf-btn nf-btn--ink">Reserve your spot</ExternalLink>
                        <span className="nf-meta">Free to study. Opens to everyone in time for 2027.</span>
                    </Rise>
                </div>

                <div className="nf-hero__art" aria-hidden="true">
                    <Rise still={still} delay={0.3} y={18} className="nf-hero__note-wrap">
                        <div className="nf-sheet nf-hero__note">
                            <span className="nf-meta">Biology / Cellular respiration</span>
                            <b>Cellular respiration</b>
                            <p>Every living cell runs on ATP. Cellular respiration turns glucose into ATP, mostly in the mitochondria.</p>
                            <p className="nf-hero__eq tnum">C<sub>6</sub>H<sub>12</sub>O<sub>6</sub> + 6O<sub>2</sub> → 6CO<sub>2</sub> + 6H<sub>2</sub>O + energy</p>
                        </div>
                    </Rise>
                    <Rise still={still} delay={0.7} y={-22} className="nf-hero__card-wrap">
                        <div className="nf-sheet nf-hero__card">
                            <span className="nf-meta">Flashcard</span>
                            <b>What powers ATP synthase?</b>
                            <span className="nf-hero__answer">Chemiosmosis</span>
                            <span className="nf-hero__due"><Tick size={15} /> Good. Back in 13 days.</span>
                        </div>
                    </Rise>
                </div>
            </section>

            <h2 className="nf-head">One note, all the way to the exam</h2>
            <ol className="nf-steps">
                {STEPS.map(({ title, body, Art }, i) => (
                    <Rise key={title} as="li" still={still} inView delay={i * 0.07} className="nf-sheet nf-step">
                        <span className="nf-step__n tnum">{i + 1}</span>
                        <h3>{title}</h3>
                        <p>{body}</p>
                        <div className="nf-step__art" aria-hidden="true"><Art still={still} /></div>
                    </Rise>
                ))}
            </ol>

            <h2 className="nf-head">Also in NoteFlow</h2>
            <div className="nf-also">
                {ALSO.map(([name, body]) => (
                    <div key={name}>
                        <b>{name}</b>
                        <p>{body}</p>
                    </div>
                ))}
            </div>

            <div className="nf-plans">
                <p>Notes, flashcards, practice papers, the planner and grades are free without limits. Plans only add more AI.</p>
                <ExternalLink href={`${NOTEFLOW_URL}/#pricing`} className="nf-btn nf-btn--sheet">See plans</ExternalLink>
            </div>
        </div>
    );
};

export default StudyView;
