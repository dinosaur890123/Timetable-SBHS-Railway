import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Pause, Play, RotateCcw } from 'lucide-react';
import './noteflow.css';

export const NOTEFLOW_URL = 'https://noteflow.study';

// NoteFlow's two easings: in-place moves and things arriving.
const EASE = [0.2, 0.7, 0.2, 1];
const EASE_OUT = [0.16, 1, 0.3, 1];

/* ---------- Brand and gestures ---------- */

export const Mark = ({ size = 22 }) => {
    // Stroke weight rises as size falls, per the logo rules.
    const stroke = size >= 56 ? 2.4 : size >= 32 ? 2.8 : size >= 22 ? 3.3 : 3.7;
    return (
        <svg className="nf-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
                <path d="M40.24 30.14V40.74Q40.24 44.54 36.44 44.54H8.4Q3 44.54 3 39.14V13.34C3 6.58 4.6 3.54 14.68 3.54C18.84 3.54 23.64 7.06 29.24 7.06C32.64 7.06 34.16 5.9 35.12 5.26V20.54" />
                <path d="M35.12 11.74C35.12 10.14 36.16 9.26 37.68 9.26C39.28 9.26 40.16 10.22 40.16 11.9V18.74" />
                <path d="M45.04 20.7C41.6 25.1 38 25.7 34.88 25.7C27.92 25.7 23.6 19.78 19.04 19.78C11.52 19.78 8.08 23.9 8.08 34.1V39.58C9.24 37.86 12.8 35.82 16.2 35.82C21.8 35.82 23.72 39.5 29.92 39.5C31.64 39.5 34.08 38.78 35.12 37.82V30.94" />
            </g>
        </svg>
    );
};

export const Lockup = ({ size = 22 }) => (
    <span className="nf-lockup" style={{ gap: size * 0.35, fontSize: size * 0.82 }}>
        <Mark size={size} />
        <span>NoteFlow</span>
    </span>
);

const Tick = ({ size = 18 }) => (
    <svg className="nf-doodle" width={size} height={size * 0.875} viewBox="0 0 32 28" aria-hidden="true">
        <path d="M4 15.5C7 17.5 9.5 20.5 11.5 24C15.5 15 21 8.5 28.5 3.5" />
    </svg>
);

const WAVE = 'M3 9.5C12 3.6 24 2.8 38 5.2C55 8 62 11.5 78 10.6C92 9.8 99 5.4 117 4.2';
const RING = 'M178 13C118 2 38 14 17 57C3 91 40 127 122 130.5C196 133.5 250 110 251 70C252 32 214 10 160 7C130 5.4 104 8 85 13';

// Progress is the logo's wave, never a bar: the track in rule-2, the done part in ink.
const Wave = React.forwardRef(({ from = 0, to = 0, delay = 0, still, className = '' }, doneRef) => (
    <div className={`nf-wave ${className}`} aria-hidden="true">
        <div className="nf-wave__track">
            <svg viewBox="0 0 120 14" preserveAspectRatio="none"><path d={WAVE} /></svg>
        </div>
        <motion.div
            ref={doneRef}
            className="nf-wave__done"
            initial={doneRef || still ? false : { clipPath: `inset(0 ${100 - from * 100}% 0 0)` }}
            animate={doneRef ? undefined : { clipPath: `inset(0 ${100 - to * 100}% 0 0)` }}
            transition={{ delay, duration: 0.42, ease: EASE }}
        >
            <svg viewBox="0 0 120 14" preserveAspectRatio="none"><path d={WAVE} /></svg>
        </motion.div>
    </div>
));

// The one highlighter swipe on screen. It draws left to right once.
const Hl = ({ children, delay = 0, still, display = false }) => (
    <span className={`nf-hl${display ? ' nf-hl--display' : ''}`}>
        <motion.span
            aria-hidden="true"
            className="nf-hl__swipe"
            initial={still ? false : { clipPath: 'inset(0 100% 0 0)' }}
            animate={{ clipPath: 'inset(0 0% 0 0)' }}
            transition={{ delay: delay + 0.12, duration: 0.34, ease: EASE }}
        />
        {children}
    </span>
);

const Swipe = ({ delay = 0, still }) => (
    <motion.span
        aria-hidden="true"
        className="nf-hl__swipe"
        initial={still ? false : { clipPath: 'inset(0 100% 0 0)' }}
        animate={{ clipPath: 'inset(0 0% 0 0)' }}
        transition={{ delay: delay + 0.12, duration: 0.34, ease: EASE }}
    />
);

// The red pen marks results only: one loop that overshoots, inked once the score lands.
const Ring = ({ delay = 0, still }) => (
    <svg className="nf-ring" viewBox="0 0 260 140" preserveAspectRatio="none" aria-hidden="true">
        <motion.path
            d={RING}
            initial={still ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay, duration: 0.7, ease: EASE }}
        />
    </svg>
);

/* ---------- Motion helpers ---------- */

// Words arrive the way the site's headlines do: lift, unblur, fade.
const Words = ({ text, delay = 0, step = 0.045, still }) => text.split(' ').map((word, i, all) => (
    <React.Fragment key={i}>
        <motion.span
            className="nf-word"
            initial={still ? false : { opacity: 0, y: 6, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ delay: delay + i * step, duration: 0.36, ease: EASE_OUT }}
        >
            {word}
        </motion.span>
        {i < all.length - 1 && ' '}
    </React.Fragment>
));

const Rise = ({ as = 'div', delay = 0, still, y = 8, className, children, ...rest }) => {
    const Tag = motion[as];
    return (
        <Tag
            className={className}
            initial={still ? false : { opacity: 0, y, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ delay, duration: 0.4, ease: EASE_OUT }}
            {...rest}
        >
            {children}
        </Tag>
    );
};

// Steps a scene through its beats; at rest (reduced motion) it shows the last one.
const useBeats = (times, still) => {
    const [beat, setBeat] = useState(still ? times.length : 0);
    useEffect(() => {
        if (still) {
            setBeat(times.length);
            return undefined;
        }
        setBeat(0);
        const ids = times.map((t, i) => setTimeout(() => setBeat(i + 1), t * 1000));
        return () => ids.forEach(clearTimeout);
    }, [still]);
    return beat;
};

const Caption = ({ label, title, body, still }) => (
    <div>
        <Rise still={still} className="nf-cap__label">{label}</Rise>
        <Rise still={still} as="h3" delay={0.06} className="nf-cap__title">{title}</Rise>
        <Rise still={still} as="p" delay={0.14} className="nf-cap__body">{body}</Rise>
    </div>
);

/* ---------- Scenes ---------- */

const ReserveButton = ({ className = '' }) => (
    <a href={NOTEFLOW_URL} target="_blank" rel="noopener noreferrer" className={`nf-btn nf-btn--ink ${className}`}>
        Reserve your spot
        <ArrowUpRight size={16} strokeWidth={1.75} />
    </a>
);

const IntroScene = ({ still }) => (
    <div className="nf-intro">
        <h2 className="nf-display">
            <Words text="Walk into every exam" still={still} step={0.07} />
            <br />
            <em>
                <Hl display delay={1.1} still={still}>
                    <Words text="already knowing it." delay={0.45} step={0.08} still={still} />
                </Hl>
            </em>
        </h2>
        <Rise still={still} as="p" delay={1.5} className="nf-lede">
            NoteFlow is the study app where your notes become flashcards, practice papers and challenges your
            friends can play, and each one comes back right before you&rsquo;d forget it.
        </Rise>
        <Rise still={still} delay={1.8} className="nf-intro__cta">
            <ReserveButton />
            <span className="nf-meta">Early access. Opens to everyone in time for 2027.</span>
        </Rise>
    </div>
);

const STAGES = [
    ['Glycolysis', 'Cytoplasm', '2 ATP'],
    ['Krebs cycle', 'Mitochondrial matrix', '2 ATP'],
    ['Electron transport', 'Inner membrane', '~34 ATP']
];

const WriteScene = ({ still, cap }) => (
    <div className="nf-scene nf-scene--split">
        <Caption still={still} {...cap} />
        <Rise still={still} delay={0.2} y={14} className="nf-sheet nf-note">
            <div className="nf-meta">Biology / Cellular respiration</div>
            <h4>Cellular respiration</h4>
            <div className="nf-meta">180 words · 1 min read</div>
            <p className="nf-note__p">
                <Words text="Every living cell runs on ATP." delay={0.6} step={0.05} still={still} />
                {' '}
                <Words text="Cellular respiration" delay={0.95} step={0.05} still={still} />
                {' '}
                <Hl delay={1.9} still={still}><Words text="turns glucose into ATP" delay={1.05} step={0.05} still={still} /></Hl>
                <Words text=", mostly in the mitochondria." delay={1.3} step={0.05} still={still} />
            </p>
            <Rise still={still} delay={2.4} className="nf-eq tnum">
                C<sub>6</sub>H<sub>12</sub>O<sub>6</sub> + 6O<sub>2</sub> → 6CO<sub>2</sub> + 6H<sub>2</sub>O + energy
            </Rise>
            <div className="nf-stages">
                {STAGES.map(([stage, where, atp], i) => (
                    <Rise key={stage} still={still} delay={2.9 + i * 0.18} y={4}>
                        <span>{stage}</span><span>{where}</span><span className="tnum">{atp}</span>
                    </Rise>
                ))}
            </div>
        </Rise>
    </div>
);

const SNIPPETS = [
    'Turns glucose into ATP',
    'Krebs cycle · Mitochondrial matrix',
    'Chemiosmosis powers ATP synthase'
];
const CARDS = [
    ['What does cellular respiration make from glucose?', 'ATP'],
    ['Where does the Krebs cycle take place?', 'Mitochondrial matrix'],
    ['What powers ATP synthase?', 'Chemiosmosis']
];

const CardsScene = ({ still, cap }) => {
    const beat = useBeats([1.6, 1.9, 3.7], still);
    return (
        <div className="nf-scene nf-scene--split">
            <Caption still={still} {...cap} />
            <div className="nf-cards">
                <Rise still={still} delay={0.2} className="nf-snips">
                    <div className="nf-meta" style={{ borderTop: 0, paddingTop: 0 }}>From your note</div>
                    {SNIPPETS.map((s, i) => (
                        <Rise key={s} still={still} delay={0.4 + i * 0.16} y={4}>{s}</Rise>
                    ))}
                    <span
                        aria-hidden="true"
                        className={`nf-btn nf-btn--ink nf-btn--md${beat === 1 ? ' is-pressed' : ''}`}
                        style={beat === 1 ? { transform: 'translateY(1px)' } : undefined}
                    >
                        Make flashcards
                    </span>
                </Rise>
                <div className="nf-deck">
                    {CARDS.map(([q, a], i) => (
                        <motion.div
                            key={q}
                            className="nf-sheet nf-card"
                            initial={still ? false : { opacity: 0, y: -14, scale: 0.96, rotate: i % 2 ? 1.2 : -1.2 }}
                            animate={beat >= 2 ? { opacity: 1, y: 0, scale: 1, rotate: 0 } : undefined}
                            transition={{ delay: i * 0.22, duration: 0.42, ease: EASE_OUT }}
                        >
                            <b>{q}</b>
                            <span>{a}</span>
                        </motion.div>
                    ))}
                    <motion.div
                        className="nf-added"
                        initial={still ? false : { opacity: 0, y: 4 }}
                        animate={beat >= 3 ? { opacity: 1, y: 0 } : undefined}
                        transition={{ duration: 0.3, ease: EASE_OUT }}
                    >
                        <span style={{ color: 'var(--ok)', display: 'flex' }}><Tick /></span>
                        3 cards added to Cellular respiration
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

const RATES = [['Again', '10 min'], ['Hard', '7 days'], ['Good', '13 days'], ['Easy', '19 days']];

const ReviewScene = ({ still, cap }) => {
    // flip, show ratings, press Good, say when it comes back
    const beat = useBeats([1.7, 2.5, 3.7, 4.1], still);
    return (
        <div className="nf-scene nf-scene--split">
            <Caption still={still} {...cap} />
            <div className="nf-review">
                <Rise still={still} delay={0.15} className="nf-meta">Cellular respiration · 3 of 14 due</Rise>
                <Rise still={still} delay={0.25} y={14} className="nf-flip">
                    <motion.div
                        className="nf-flip__inner"
                        initial={false}
                        animate={{ rotateY: beat >= 1 ? 180 : 0 }}
                        transition={{ duration: still ? 0 : 0.7, ease: EASE }}
                    >
                        <div className="nf-sheet nf-flip__face">
                            <span className="nf-meta">Front</span>
                            <p>What powers ATP synthase?</p>
                        </div>
                        <div className="nf-sheet nf-flip__face nf-flip__face--back">
                            <span className="nf-meta">Back</span>
                            <p>Chemiosmosis: H<sup>+</sup> ions flowing back across the inner membrane.</p>
                        </div>
                    </motion.div>
                </Rise>
                <div className="nf-rates" aria-hidden="true">
                    {RATES.map(([label, wait], i) => (
                        <motion.span
                            key={label}
                            className={`nf-btn nf-btn--sheet nf-rate${beat >= 3 && label === 'Good' ? ' is-on' : ''}`}
                            initial={still ? false : { opacity: 0, y: 6 }}
                            animate={beat >= 2 ? { opacity: 1, y: 0 } : undefined}
                            transition={{ delay: i * 0.07, duration: 0.3, ease: EASE_OUT }}
                        >
                            {label}
                            <small className="tnum">{wait}</small>
                        </motion.span>
                    ))}
                </div>
                <div className="nf-note-line" style={{ minHeight: 24 }}>
                    {beat >= 4 && (
                        <>
                            <Words text="Back in" still={still} />{' '}
                            <Hl delay={0.3} still={still}><Words text="13 days" delay={0.1} still={still} /></Hl>,{' '}
                            <Words text="just before you'd forget it." delay={0.2} still={still} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const OPTIONS = ['Cytoplasm', 'Mitochondrial matrix', 'Inner mitochondrial membrane', 'Nucleus'];

const Countdown = ({ from, running }) => {
    const [left, setLeft] = useState(from);
    useEffect(() => {
        if (!running) return undefined;
        const id = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000);
        return () => clearInterval(id);
    }, [running]);
    return <span className="nf-meta tnum">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>;
};

const TestScene = ({ still, cap }) => {
    // pick B, mark it, then show the paper's result
    const beat = useBeats([1.5, 2.2, 3.2], still);
    const showResult = beat >= 3;
    return (
        <div className="nf-scene nf-scene--split">
            <Caption still={still} {...cap} />
            <Rise still={still} delay={0.2} y={14} className="nf-sheet nf-exam">
                <AnimatePresence mode="wait" initial={false}>
                    {!showResult ? (
                        <motion.div
                            key="question"
                            exit={{ opacity: 0, y: -6, filter: 'blur(8px)' }}
                            transition={{ duration: 0.22, ease: EASE }}
                        >
                            <div className="nf-exam__head">
                                <b>Biology practice exam</b>
                                <Countdown from={14 * 60 + 32} running={!still} />
                            </div>
                            <div className="nf-meta tnum" style={{ margin: '2px 0 10px' }}>Question 4 of 12</div>
                            <Wave from={3 / 12} to={beat >= 2 ? 4 / 12 : 3 / 12} still={still} />
                            <div className="nf-exam__q">Where does the Krebs cycle take place?</div>
                            <div className="nf-opts">
                                {OPTIONS.map((opt, i) => {
                                    const picked = i === 1 && beat >= 1;
                                    return (
                                        <div key={opt} className={`nf-opt${picked ? ' is-picked' : ''}`}>
                                            <i>{'ABCD'[i]}</i>
                                            {opt}
                                            {picked && beat >= 2 && (
                                                <motion.span initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.22, ease: EASE_OUT }} style={{ marginLeft: 'auto', display: 'flex' }}>
                                                    <Tick size={16} />
                                                </motion.span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="result"
                            className="nf-result"
                            initial={still ? false : { opacity: 0, y: 8, filter: 'blur(10px)' }}
                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                            transition={{ duration: 0.4, ease: EASE_OUT }}
                        >
                            <div className="nf-meta">Biology practice exam · 12 questions in 18:40</div>
                            <div className="nf-score">
                                11<small>/12</small>
                                <Ring delay={0.45} still={still} />
                            </div>
                            <Rise still={still} delay={1.1} className="nf-comment">Up from 8/12 last time.</Rise>
                            <Rise still={still} delay={1.4} className="nf-newcard">
                                The one you missed is now a card in
                                <span className="nf-tag nf-tag--bio">Cellular respiration</span>
                            </Rise>
                        </motion.div>
                    )}
                </AnimatePresence>
            </Rise>
        </div>
    );
};

const WEEK = [
    { day: 'Mon', date: 19, fixed: [['Maths Advanced', '11:30']], plan: [['Review · 14 cards', '4:00']] },
    { day: 'Tue', date: 20, fixed: [['History group', '6:00']], plan: [['Practice exam', '4:30']] },
    { day: 'Wed', date: 21, fixed: [['Prac report', '2:00']], plan: [['Focus · 25 min', '5:00']] },
    { day: 'Thu', date: 22, fixed: [], plan: [['Review · 9 cards', '4:00']] },
    { day: 'Fri', date: 23, fixed: [], exam: ['Biology trial exam', '9:00'] }
];

const PlanScene = ({ still, cap }) => {
    // the exam lands on Friday, then revision fills the days before it
    const beat = useBeats([0.9, 1.5, 3.6], still);
    return (
        <div className="nf-scene nf-scene--split">
            <Caption still={still} {...cap} />
            <Rise still={still} delay={0.2} y={14} className="nf-sheet nf-week">
                <div className="nf-week__head">
                    <b>Week of 19 Oct</b>
                    <motion.span
                        className="nf-tag nf-tag--bio"
                        initial={still ? false : { opacity: 0 }}
                        animate={beat >= 1 ? { opacity: 1 } : undefined}
                        transition={{ duration: 0.28 }}
                    >
                        Biology trial in 4 days
                    </motion.span>
                </div>
                <div className="nf-days">
                    {WEEK.map(({ day, date, fixed, plan = [], exam }, d) => (
                        <div key={day} className="nf-day">
                            <div className="nf-day__name">{day}<b className="tnum">{date}</b></div>
                            <div className="nf-day__events">
                                {fixed.map(([title, time]) => (
                                    <div key={title} className="nf-ev nf-ev--fixed">{title}<span className="tnum">{time}</span></div>
                                ))}
                                {exam && (
                                    <motion.div
                                        className="nf-ev nf-ev--exam"
                                        initial={still ? false : { opacity: 0, y: -10, scale: 0.96 }}
                                        animate={beat >= 1 ? { opacity: 1, y: 0, scale: 1 } : undefined}
                                        transition={{ duration: 0.4, ease: EASE_OUT }}
                                    >
                                        {exam[0]}<span className="tnum">{exam[1]}</span>
                                    </motion.div>
                                )}
                                {plan.map(([title, time]) => (
                                    <motion.div
                                        key={title}
                                        className="nf-ev"
                                        initial={still ? false : { opacity: 0, y: -10 }}
                                        animate={beat >= 2 ? { opacity: 1, y: 0 } : undefined}
                                        transition={{ delay: (3 - d) * 0.28, duration: 0.4, ease: EASE_OUT }}
                                    >
                                        {title}<span className="tnum">{time}</span>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <motion.div
                    className="nf-synced"
                    initial={still ? false : { opacity: 0 }}
                    animate={beat >= 3 ? { opacity: 1 } : undefined}
                    transition={{ duration: 0.3 }}
                >
                    <span style={{ color: 'var(--ok)', display: 'flex' }}><Tick size={16} /></span>
                    Synced with Google Calendar
                </motion.div>
            </Rise>
        </div>
    );
};

const BOARD = [
    ['priya_s', '3/3', '0:19'],
    ['jonah_r', '3/3', '0:27'],
    ['maya_k', '2/3', '0:24', true],
    ['Sam', '2/3', '0:30'],
    ['Tilly', '2/3', '0:38']
];

const ChallengeScene = ({ still, cap }) => {
    const beat = useBeats([2.1, 2.7], still);
    return (
        <div className="nf-scene nf-scene--split">
            <Caption still={still} {...cap} />
            <Rise still={still} delay={0.2} y={14} className="nf-sheet nf-board">
                <div className="nf-board__head">
                    <b>Biology: cell parts</b>
                    <span className="nf-meta tnum">9 players</span>
                </div>
                {BOARD.map(([name, score, time, you], i) => (
                    <Rise
                        key={name}
                        still={still}
                        delay={0.5 + i * 0.22}
                        y={6}
                        className={`nf-board__row tnum${you ? ' nf-row-hl' : ''}`}
                    >
                        {you && beat >= 1 && <Swipe still={still} />}
                        <span className="nf-board__rank">{i + 1}</span>
                        <span>{name === 'Sam' || name === 'Tilly' ? name : <><span className="nf-at">@</span>{name}</>}</span>
                        <span className="nf-board__num">{score}</span>
                        <span className="nf-board__num nf-board__time">{time}</span>
                    </Rise>
                ))}
                <motion.div
                    className="nf-comment"
                    style={{ marginTop: 14 }}
                    initial={still ? false : { opacity: 0, y: 4 }}
                    animate={beat >= 2 ? { opacity: 1, y: 0 } : undefined}
                    transition={{ duration: 0.3, ease: EASE_OUT }}
                >
                    You came 3rd of 9, in 0:24.
                </motion.div>
            </Rise>
        </div>
    );
};

const EndScene = ({ still, onReplay }) => (
    <div className="nf-intro">
        <h2 className="nf-display">
            <Words text="Learn it once." delay={0.2} step={0.08} still={still} />
            <br />
            <em>
                <Hl display delay={1.0} still={still}>
                    <Words text="Keep it for good." delay={0.5} step={0.08} still={still} />
                </Hl>
            </em>
        </h2>
        <Rise still={still} as="p" delay={1.4} className="nf-lede">
            Notes, flashcards, practice exams, the planner and grades are free without limits. Plans only add more AI.
            Opens to everyone in time for 2027.
        </Rise>
        <Rise still={still} delay={1.7} className="nf-intro__cta">
            <ReserveButton />
            <button type="button" className="nf-btn nf-btn--ghost" onClick={onReplay}>
                <RotateCcw size={15} strokeWidth={1.75} />
                Watch again
            </button>
        </Rise>
    </div>
);

/* ---------- The film ---------- */

const SCENES = [
    { id: 'intro', dur: 4.6, Scene: IntroScene },
    {
        id: 'write', chip: 'Write', dur: 6.2, Scene: WriteScene,
        cap: { label: 'Notes', title: 'Write it once.', body: 'Take the lecture down as it happens, with equations, tables and an outline for the long ones. Every note lives inside its subject.' }
    },
    {
        id: 'cards', chip: 'Cards', dur: 5.6, Scene: CardsScene,
        cap: { label: 'Notes → Flashcards', title: 'Turn it into cards.', body: 'One step makes flashcards from any note, or from any answer the AI tutor gives you. Nothing is retyped.' }
    },
    {
        id: 'review', chip: 'Review', dur: 6.4, Scene: ReviewScene,
        cap: { label: 'Flashcards', title: 'Review before you forget.', body: 'Rate each card and NoteFlow brings it back the day you would otherwise lose it. Easy cards wait longer; hard ones come back tomorrow.' }
    },
    {
        id: 'test', chip: 'Test', dur: 6.6, Scene: TestScene,
        cap: { label: 'Practice exams → Flashcards', title: 'Test yourself on it.', body: 'A timed practice exam is built from the same note. Anything you get wrong comes straight back as a new card.' }
    },
    {
        id: 'plan', chip: 'Plan', dur: 5.8, Scene: PlanScene,
        cap: { label: 'Planner · Focus', title: 'Plan the week round the exam.', body: 'Put the exam date in and revision lands in the days before it, next to your lectures and deadlines. It syncs with Google Calendar.' }
    },
    {
        id: 'challenge', chip: 'Challenge', dur: 5.6, Scene: ChallengeScene,
        cap: { label: 'Challenges', title: 'Top the class. Bring the class.', body: 'Any deck becomes a challenge link. Friends play it in their browser with no account, and the scoreboard fills up by lunch.' }
    },
    { id: 'end', Scene: EndScene }
];

const LAST = SCENES.length - 1;
const TOTAL = SCENES.reduce((sum, s) => sum + (s.dur || 0), 0);
const startOf = (index) => SCENES.slice(0, index).reduce((sum, s) => sum + (s.dur || 0), 0);

// A short film of how one note becomes an exam you walk into ready.
// It plays once when it comes into view, holds while off screen or in a hidden tab,
// and under reduced motion every scene is shown at rest for the chapters to step through.
const NoteFlowFilm = () => {
    const still = useReducedMotion();
    const [index, setIndex] = useState(still ? 1 : 0);
    const [playing, setPlaying] = useState(!still);
    const [inView, setInView] = useState(false);
    const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
    const [started, setStarted] = useState(false);

    const rootRef = useRef(null);
    const progressRef = useRef(null);
    const indexRef = useRef(index);
    const elapsedRef = useRef(0);

    const paintProgress = useCallback(() => {
        const el = progressRef.current;
        if (!el) return;
        const i = indexRef.current;
        const done = i >= LAST ? 1 : (startOf(i) + Math.min(elapsedRef.current, SCENES[i].dur || 0)) / TOTAL;
        el.style.clipPath = `inset(0 ${(100 - done * 100).toFixed(2)}% 0 0)`;
    }, []);

    const go = useCallback((next) => {
        indexRef.current = next;
        elapsedRef.current = 0;
        setIndex(next);
        if (next >= LAST) setPlaying(false);
        paintProgress();
    }, [paintProgress]);

    useEffect(() => {
        const el = rootRef.current;
        if (!el) return undefined;
        const io = new IntersectionObserver(([entry]) => {
            setInView(entry.isIntersecting);
            if (entry.isIntersecting) setStarted(true);
        }, { threshold: 0.35 });
        io.observe(el);
        const onVisibility = () => setPageVisible(!document.hidden);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            io.disconnect();
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);

    const running = !still && started && playing && inView && pageVisible && index < LAST;

    useEffect(() => {
        if (!running) return undefined;
        // A steady clock rather than requestAnimationFrame, which browsers throttle. Each step is
        // capped, so time stands still through a stall instead of skipping scenes afterwards.
        let last = performance.now();
        const id = setInterval(() => {
            const now = performance.now();
            elapsedRef.current += Math.min(now - last, 250) / 1000;
            last = now;
            const scene = SCENES[indexRef.current];
            if (scene.dur && elapsedRef.current >= scene.dur) go(indexRef.current + 1);
            else paintProgress();
        }, 40);
        return () => clearInterval(id);
    }, [running, go, paintProgress]);

    useEffect(paintProgress, [paintProgress, index]);

    const jump = (next) => {
        go(next);
        if (!still) setPlaying(next < LAST);
    };
    const replay = () => jump(0);
    const toggle = () => setPlaying(p => !p);

    const { Scene, cap } = SCENES[index];
    const atEnd = index >= LAST;

    return (
        <section ref={rootRef} className="nf-film" aria-label="NoteFlow, from one note to the exam">
            <div className="nf-film__top">
                <Lockup size={22} />
                <a className="nf-film__site" href={NOTEFLOW_URL} target="_blank" rel="noopener noreferrer">
                    noteflow.study
                    <ArrowUpRight size={14} strokeWidth={1.75} />
                </a>
            </div>

            <div className="nf-stage" aria-live="polite">
                {(started || still) && (
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={SCENES[index].id}
                            style={{ display: 'grid' }}
                            initial={still ? false : { opacity: 1 }}
                            exit={still ? undefined : { opacity: 0, y: -8, filter: 'blur(10px)' }}
                            transition={{ duration: 0.24, ease: EASE }}
                        >
                            <Scene still={still} cap={cap} onReplay={replay} />
                        </motion.div>
                    </AnimatePresence>
                )}
            </div>

            <div className="nf-film__foot">
                <Wave ref={progressRef} />
                <div className="nf-film__bar">
                    <nav className="nf-chips" aria-label="Chapters">
                        {SCENES.map((s, i) => s.chip && (
                            <button
                                key={s.id}
                                type="button"
                                className={`nf-chip${i < index ? ' is-done' : ''}`}
                                aria-current={i === index ? 'step' : undefined}
                                onClick={() => jump(i)}
                            >
                                {s.chip}
                            </button>
                        ))}
                    </nav>
                    {!still && !atEnd && (
                        <button type="button" className="nf-btn nf-btn--ghost nf-btn--sm" onClick={toggle}>
                            {playing ? <Pause size={14} strokeWidth={1.75} /> : <Play size={14} strokeWidth={1.75} />}
                            {playing ? 'Pause' : 'Play'}
                        </button>
                    )}
                </div>
            </div>
        </section>
    );
};

export default NoteFlowFilm;
