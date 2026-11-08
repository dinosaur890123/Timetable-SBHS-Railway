import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, LogOut, Sun, Moon, BookOpen, MessageSquare, FileCode, Monitor, Smartphone, Share2, PlusCircle, X } from 'lucide-react';
import { useSky } from './modern/AmbientLight';
import { usePWAInstall } from '../hooks/usePWAInstall';

const ACCENTS = [
    { id: 'zinc', name: 'Default', swatch: 'bg-zinc-900 dark:bg-zinc-100' },
    { id: 'mint', name: 'Mint', swatch: 'bg-emerald-600' },
    { id: 'teal', name: 'Teal', swatch: 'bg-teal-600' },
    { id: 'sky', name: 'Sky', swatch: 'bg-sky-500' },
    { id: 'blue', name: 'Blue', swatch: 'bg-blue-600' },
    { id: 'violet', name: 'Violet', swatch: 'bg-violet-500' },
    { id: 'rose', name: 'Rose', swatch: 'bg-rose-500' },
    { id: 'orange', name: 'Orange', swatch: 'bg-orange-500' },
    { id: 'amber', name: 'Amber', swatch: 'bg-amber-500' }
];

const Section = ({ label, children }) => (
    <section>
        <h2 className="px-1 mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">{label}</h2>
        <div className="rounded-2xl border border-zinc-900/[0.07] dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.025] divide-y divide-zinc-900/[0.06] dark:divide-white/[0.06]">
            {children}
        </div>
    </section>
);

const Row = ({ title, description, children, stack = false }) => (
    <div className={`px-4 py-3.5 sm:px-5 flex ${stack ? 'flex-col gap-3' : 'items-center justify-between gap-4 sm:gap-6'}`}>
        <div className="min-w-0">
            <div className="text-[14px] font-medium text-zinc-900 dark:text-white">{title}</div>
            {description && <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{description}</p>}
        </div>
        {children && <div className="shrink-0">{children}</div>}
    </div>
);

// A row that navigates somewhere else in the app.
const LinkRow = ({ icon: Icon, title, description, onClick }) => (
    <button onClick={onClick} className="group w-full px-4 py-3.5 sm:px-5 flex items-center gap-3 text-left hover:bg-zinc-900/[0.025] dark:hover:bg-white/[0.025] transition-colors first:rounded-t-2xl last:rounded-b-2xl">
        <Icon size={16} strokeWidth={1.8} className="shrink-0 text-zinc-400" />
        <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium text-zinc-900 dark:text-white">{title}</div>
            {description && <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">{description}</p>}
        </div>
        <ChevronRight size={16} className="shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
    </button>
);

const Segmented = ({ id, options, value, onChange }) => (
    <div role="radiogroup" className="inline-flex p-0.5 rounded-lg bg-zinc-900/[0.05] dark:bg-white/[0.06]">
        {options.map(opt => {
            const active = opt.value === value;
            return (
                <button
                    key={opt.value}
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChange(opt.value)}
                    className={`relative px-3 h-8 flex items-center gap-1.5 rounded-md text-[13px] font-medium transition-colors ${active ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                >
                    {active && (
                        <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.15 }}
                            className="absolute inset-0 rounded-md bg-white dark:bg-zinc-800 shadow-sm"
                        />
                    )}
                    {opt.icon && <opt.icon size={14} className="relative" />}
                    <span className="relative">{opt.label}</span>
                </button>
            );
        })}
    </div>
);

const Switch = ({ checked, onChange, label }) => (
    <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-zinc-900/15 dark:bg-white/15'}`}
    >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
);

const initialsOf = (user) => `${user?.givenName?.[0] || ''}${user?.surname?.[0] || ''}`.toUpperCase() || 'S';

const SettingsView = ({
    user, theme, setTheme, colorTheme, setColorTheme, aiDisabled, setAiDisabled, aiProviderName = 'an AI provider',
    ambientLight, setAmbientLight, showClipboardEvents, setShowClipboardEvents, onSignOut, setView
}) => {
    const meta = [user?.yearGroup ? `Year ${user.yearGroup}` : null, user?.role === 'Admin' ? 'Admin' : null, user?.studentId]
        .filter(Boolean).join(' · ');
    const accentName = ACCENTS.find(a => a.id === colorTheme)?.name || 'Default';
    const sky = useSky();
    const { isInstalled, dismiss, showIOSInstructions } = usePWAInstall();

    return (
        <div className="mx-auto max-w-2xl space-y-8 pb-8">
            {/* Account */}
            <div className="flex items-center gap-4">
                <span className="w-14 h-14 shrink-0 rounded-full grid place-items-center text-lg font-semibold bg-accent/15 text-accent">
                    {initialsOf(user)}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white truncate">{user?.givenName} {user?.surname}</div>
                    <div className="text-[13px] text-zinc-500 dark:text-zinc-400 truncate">{user?.email}</div>
                    {meta && <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500 truncate">{meta}</div>}
                </div>
                <button
                    onClick={onSignOut}
                    className="shrink-0 h-9 px-3 rounded-lg border border-zinc-900/10 dark:border-white/10 text-[13px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/30 transition-colors flex items-center gap-1.5"
                >
                    <LogOut size={14} />
                    <span className="hidden sm:inline">Sign out</span>
                </button>
            </div>

            {/* PWA Install Section - iOS only; other platforms use the browser's native install UI */}
            {!isInstalled && showIOSInstructions && (
                <Section label="Install App">
                    <div className="px-4 py-3.5 sm:px-5 relative">
                            <button
                                onClick={dismiss}
                                className="absolute top-3 right-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                                aria-label="Dismiss"
                            >
                                <X size={16} />
                            </button>
                            <div className="flex items-start gap-3 pr-6">
                                <div className="shrink-0 w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                    <Smartphone size={20} className="text-blue-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[14px] font-medium text-zinc-900 dark:text-white mb-1">Install on iPhone/iPad</div>
                                    <p className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400 mb-2">
                                        Tap the <span className="inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300"><Share2 size={14} /> Share</span> button, then choose "Add to Home Screen".
                                    </p>
                                </div>
                            </div>
                    </div>
                </Section>
            )}

            <Section label="Appearance">
                <Row title="Mode">
                    <Segmented
                        id="mode"
                        value={theme}
                        onChange={setTheme}
                        options={[{ value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: Moon }]}
                    />
                </Row>
                <Row title="Accent colour" description={accentName} stack>
                    <div className="flex flex-wrap gap-2.5">
                        {ACCENTS.map(a => (
                            <button
                                key={a.id}
                                onClick={() => setColorTheme(a.id)}
                                aria-label={a.name}
                                aria-pressed={colorTheme === a.id}
                                title={a.name}
                                className={`w-8 h-8 rounded-full grid place-items-center transition ${colorTheme === a.id
                                    ? 'ring-2 ring-offset-2 ring-zinc-900 dark:ring-white ring-offset-white dark:ring-offset-zinc-900'
                                    : 'hover:scale-110'}`}
                            >
                                <span className={`w-6 h-6 rounded-full ${a.swatch}`} />
                            </button>
                        ))}
                    </div>
                </Row>
                <Row title="Ambient light" description={`A glow that follows the time of day. Right now it's ${sky.name}.`}>
                    <Switch checked={ambientLight} onChange={setAmbientLight} label="Ambient light" />
                </Row>
            </Section>

            <Section label="Features">
                <Row title={<>AI features <span className="sage-name">by Sage</span></>} description="Off by default. When enabled: prioritised daily notices and answers to questions about your timetable.">
                    <Switch checked={!aiDisabled} onChange={(on) => setAiDisabled(!on)} label="AI features" />
                </Row>
                <Row title="Clipboard on timetable" description="A single line in your day for each sport or training session.">
                    <Switch checked={showClipboardEvents} onChange={setShowClipboardEvents} label="Clipboard on timetable" />
                </Row>
                <LinkRow
                    icon={BookOpen}
                    title="Canvas links"
                    description="Open a class's Canvas page straight from your timetable."
                    onClick={() => setView('canvas-links')}
                />
                <LinkRow
                    icon={FileCode}
                    title="Build notes"
                    description="See the latest updates, bug fixes, and changelog."
                    onClick={() => setView('build-notes')}
                />
            </Section>

            <Section label="AI & privacy">
                <Row title="What AI features send" description={`When enabled, Sage and notice ranking send your question and relevant information to ${aiProviderName} to generate a response. Timetable and notice data comes straight from the SBHS API to your device.`}>
                </Row>
                <Row title="What's stored" description="AI answers are not stored. Questions are logged for admin review, and daily notice rankings are cached so the AI isn't called repeatedly.">
                </Row>
            </Section>

            <Section label="Help">
                <LinkRow
                    icon={MessageSquare}
                    title="Send feedback"
                    description="Report a problem or suggest an improvement."
                    onClick={() => setView('feedback')}
                />
            </Section>

            <p className="text-center font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-600">
                Synchron BETA· build {__APP_BUILD__.sha}
            </p>
        </div>
    );
};

export default SettingsView;
