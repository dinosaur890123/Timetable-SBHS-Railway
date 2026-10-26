import React from 'react';
import { ArrowUpRight, Repeat, MessageSquare, CalendarDays, Cloud } from 'lucide-react';

const NOTEFLOW_URL = 'https://noteflow.study';

// The separate apps a student would otherwise switch between.
const JUGGLED = ['Notes app', 'Flashcard app', 'Planner', 'Focus timer', 'AI chatbot'];

const PILLARS = [
    {
        icon: MessageSquare,
        title: 'An AI tutor that files its answers',
        body: 'Ask a question late at night, then turn the answer into a note or a flashcard deck in one step. Practice exams are generated from your own notes.'
    },
    {
        icon: Repeat,
        title: 'Spaced repetition',
        body: 'Rate a card and NoteFlow schedules its next review for just before you would forget it.'
    },
    {
        icon: CalendarDays,
        title: 'Planner, tasks and grades',
        body: 'Every note, deck and assessment belongs to a subject, with Google Calendar sync and a running grade per subject.'
    },
    {
        icon: Cloud,
        title: 'Synced, and works offline',
        body: 'One account across your browser and devices. It keeps working offline, and your whole library exports in one click.'
    }
];

const Label = ({ children }) => (
    <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">{children}</div>
);

const OpenButton = ({ children = 'Open NoteFlow' }) => (
    <a
        href={NOTEFLOW_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-900 dark:bg-white px-5 text-sm font-medium text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
    >
        {children}
        <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </a>
);

// Study lives in NoteFlow, a separate app; this page introduces it and links out.
const StudyView = () => (
    <div className="mx-auto max-w-3xl pb-8">
        <header>
            <Label>Study · NoteFlow</Label>
            <h1 className="mt-4 text-[34px] md:text-[44px] font-semibold leading-[1.05] tracking-tight text-zinc-900 dark:text-white">
                The all-in-one study app,
                <br />
                <span className="text-accent">with an AI tutor.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                Notes, flashcards, practice exams, a planner and an AI tutor, all in one place.
                No need to juggle apps.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
                <OpenButton />
                <span className="text-[13px] text-zinc-500">noteflow.study · free to start</span>
            </div>
        </header>

        {/* Instead of five apps, one */}
        <section className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-zinc-900/[0.07] dark:border-white/[0.07] bg-zinc-900/[0.07] dark:bg-white/[0.07] sm:grid-cols-2">
            <div className="bg-white/80 dark:bg-zinc-950/60 p-5">
                <Label>Instead of</Label>
                <ul className="mt-3 space-y-2">
                    {JUGGLED.map(app => (
                        <li key={app} className="text-[14px] text-zinc-400 dark:text-zinc-500 line-through decoration-zinc-300 dark:decoration-zinc-700">
                            {app}
                        </li>
                    ))}
                </ul>
            </div>
            <div className="bg-white/80 dark:bg-zinc-950/60 p-5 flex flex-col">
                <Label>Just</Label>
                <div className="mt-3 text-[22px] font-semibold tracking-tight text-zinc-900 dark:text-white">NoteFlow</div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    Everything shares the same subjects, so a note, its flashcards and the exam it's for all sit together.
                </p>
            </div>
        </section>

        <section className="mt-12 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {PILLARS.map(({ icon: Icon, title, body }) => (
                <div key={title}>
                    <div className="flex items-center gap-2 text-[15px] font-medium text-zinc-900 dark:text-white">
                        <Icon size={16} strokeWidth={1.8} className="shrink-0 text-accent" />
                        {title}
                    </div>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-500 dark:text-zinc-400">{body}</p>
                </div>
            ))}
        </section>

        <section className="mt-12 flex flex-col gap-4 rounded-2xl border border-zinc-900/[0.07] dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.025] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <div className="text-[15px] font-medium text-zinc-900 dark:text-white">Free to study with</div>
                <p className="mt-0.5 text-[14px] text-zinc-500 dark:text-zinc-400">Notes, flashcards, exams and the planner are free. Paid plans only add more AI.</p>
            </div>
            <div className="shrink-0"><OpenButton>Get started</OpenButton></div>
        </section>
    </div>
);

export default StudyView;
