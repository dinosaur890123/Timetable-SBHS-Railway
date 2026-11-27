import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, LogOut, Sun, Moon, BookOpen, MessageSquare, FileCode, Share2, PlusCircle, Shield, Download, Palette } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useCanvasLinks } from '../context/CanvasLinksContext';
import { classKey } from '../utils/canvasLinks';

const ACCENTS = [
    { id: 'navy', name: 'Navy Blue', swatch: '#233B79' },
    { id: 'mint', name: 'Mint Green', swatch: '#3F8A59' },
    { id: 'teal', name: 'Teal Green', swatch: '#138A83' },
    { id: 'sky', name: 'Sky Blue', swatch: '#3695C8' },
    { id: 'blue', name: 'Royal Blue', swatch: '#3049A8' },
    { id: 'violet', name: 'Violet Purple', swatch: '#8052C7' },
    { id: 'rose', name: 'Rose Pink', swatch: '#D84E83' },
    { id: 'orange', name: 'Bright Orange', swatch: '#E87924' },
    { id: 'amber', name: 'Golden Amber', swatch: '#C28A16' }
];

// Keep Paper's named surface/highlighter swatches and add the three accent variants previously folded into them.
const PAPER_THEMES = [
    { id: 'zinc', name: 'Paper Violet', ground: '#F3F1EC', pen: '#D6C2FF' },
    { id: 'navy', name: 'Harbour Navy', ground: '#EDF1F6', pen: '#A8D8FF' },
    { id: 'mint', name: 'Sage Mint', ground: '#EDF2EA', pen: '#B4EFA0' },
    { id: 'violet', name: 'Twilight Violet', ground: '#F1EAF6', pen: '#D6C2FF' },
    { id: 'rose', name: 'Blossom Rose', ground: '#F6ECF0', pen: '#FFB8DC' },
    { id: 'amber', name: 'Manila Amber', ground: '#F3EDE0', pen: '#FFE94A' },
    { id: 'sky', name: 'Cumulus Sky', ground: '#EAF0F8', pen: '#FFC685' },
    { id: 'teal', name: 'Teal Green', ground: '#EDF2EA', pen: '#B4EFA0' },
    { id: 'blue', name: 'Royal Blue', ground: '#EDF1F6', pen: '#A8D8FF' },
    { id: 'orange', name: 'Bright Orange', ground: '#F3EDE0', pen: '#FFE94A' }
];

const Section = ({ label, children }) => (
    <section>
        <h2 className="px-1 mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">{label}</h2>
        <div className="rounded-2xl border border-zinc-900/[0.07] dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.025] divide-y divide-zinc-900/[0.06] dark:divide-white/[0.06]">
            {children}
        </div>
    </section>
);

const Row = ({ title, description, children, stack = false, className = '' }) => (
    <div className={`px-4 py-3.5 sm:px-5 flex ${stack ? 'flex-col gap-3' : 'items-center justify-between gap-4 sm:gap-6'} ${className}`}>
        <div className="min-w-0">
            <div className="text-[14px] font-medium text-zinc-900 dark:text-white">{title}</div>
            {description && <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{description}</p>}
        </div>
        {children && <div className="shrink-0">{children}</div>}
    </div>
);

const LinkRow = ({ icon: Icon, title, onClick, dot = false }) => (
    <button onClick={onClick} className="group w-full px-4 py-3.5 sm:px-5 flex items-center gap-3 text-left hover:bg-zinc-900/[0.025] dark:hover:bg-white/[0.025] transition-colors first:rounded-t-2xl last:rounded-b-2xl">
        <Icon size={16} strokeWidth={1.8} className="shrink-0 text-zinc-400" />
        <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[14px] font-medium text-zinc-900 dark:text-white">
                {title}
                {dot && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" aria-label="Not set up" />}
            </div>
        </div>
        <ChevronRight size={16} className="shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
    </button>
);

const Segmented = ({ id, options, value, onChange }) => (
    <div role="radiogroup" className="paper-toggle-track inline-flex p-0.5 rounded-lg bg-zinc-900/[0.05] dark:bg-white/[0.06]">
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
                            className="paper-toggle-active absolute inset-0 rounded-md bg-white dark:bg-white/[0.12] border border-zinc-900/[0.07] dark:border-white/[0.12] shadow-sm"
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
    user, theme, setTheme, colorTheme, setColorTheme,
    showClipboardEvents, setShowClipboardEvents, canvasLinksEnabled, setCanvasLinksEnabled, uiLook, setUiLook, onSignOut, setView
}) => {
    const { isInstalled, hasPrompt, isIOS, promptToInstall } = usePWAInstall();
    const isPaperLook = uiLook === 'paper';
    const accentName = (isPaperLook ? PAPER_THEMES : ACCENTS).find(a => a.id === colorTheme)?.name || (isPaperLook ? 'Paper' : 'Default');
    const paperAccentOnly = isPaperLook ? accentName.split(' ').pop() : null;
    const { classes: canvasClasses, getLink: getCanvasLink, status: canvasLinksStatus, community, links } = useCanvasLinks();
    const canvasLinksMissing = useMemo(() => {
        if (canvasLinksStatus === 'loading') return false;
        return Array.from(canvasClasses.keys()).some(key => {
            const period = canvasClasses.get(key);
            return !getCanvasLink(period.title, period.year);
        });
    }, [canvasClasses, getCanvasLink, canvasLinksStatus]);
    return (
        <div className="mx-auto max-w-2xl space-y-8 pb-8">
            <div className="flex items-center gap-4">
                <span className="w-14 h-14 shrink-0 rounded-full grid place-items-center text-lg font-semibold bg-accent/15 text-accent">
                    {initialsOf(user)}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white truncate">{user?.givenName} {user?.surname}</div>
                    <div className="text-[13px] text-zinc-500 dark:text-zinc-400 truncate">{user?.email}</div>
                </div>
                <button
                    onClick={onSignOut}
                    className="shrink-0 h-9 px-3 rounded-lg border border-zinc-900/10 dark:border-white/10 text-[13px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/30 transition-colors flex items-center gap-1.5"
                >
                    <LogOut size={14} />
                    <span className="hidden sm:inline">Sign out</span>
                </button>
            </div>

            {!isInstalled && (
                <Section label="Install App">
                    {isIOS ? (
                        <Row title="Add Synchron to your Home Screen" description={<>In Safari, tap <span className="inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300"><Share2 size={12} /> Share</span>, then <span className="inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300"><PlusCircle size={12} /> Add to Home Screen</span> for quick access and offline use.</>} />
                    ) : hasPrompt ? (
                        <Row title="Install Synchron" description="Open it from your home screen and use your timetable offline.">
                            <button
                                onClick={promptToInstall}
                                className="h-9 px-4 rounded-lg bg-accent text-[13px] font-semibold text-accent-contrast hover:brightness-110 transition flex items-center gap-2"
                            >
                                <Download size={14} />
                                <span>Install</span>
                            </button>
                        </Row>
                    ) : (
                        <Row title="Install Synchron" description="Use your browser’s install option (address bar or menu) to add Synchron to your home screen for quick access and offline use." />
                    )}
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
                <Row title="Interface">
                    <Segmented
                        id="interface"
                        value={uiLook}
                        onChange={setUiLook}
                        options={[{ value: 'paper', label: 'Paper' }, { value: 'ambient', label: 'Ambient' }]}
                    />
                </Row>
                <Row title={isPaperLook ? (
                    <span>Paper <span className="font-normal text-zinc-500 dark:text-zinc-400">{paperAccentOnly}</span></span>
                ) : 'Accent colour'} stack>
                    <div className="flex flex-wrap gap-2.5">
                        {(isPaperLook ? PAPER_THEMES : ACCENTS).map(a => (
                            <button
                                key={a.id}
                                onClick={() => setColorTheme(a.id)}
                                aria-label={a.name}
                                aria-pressed={colorTheme === a.id}
                                title={a.name}
                                className={`w-8 h-8 rounded-full grid place-items-center transition ${colorTheme === a.id
                                    ? 'outline outline-2 outline-offset-2 outline-zinc-900 dark:outline-white'
                                    : 'hover:scale-110'}`}
                            >
                                {isPaperLook ? (
                                    <span
                                        className="w-6 h-6 rounded-full border border-zinc-900/10 dark:border-white/10"
                                        style={{ background: `linear-gradient(135deg, ${a.ground} 52%, ${a.pen} 52%)` }}
                                    />
                                ) : (
                                    <span className="w-6 h-6 rounded-full border border-zinc-900/15 dark:border-white/20" style={{ backgroundColor: a.swatch }} />
                                )}
                            </button>
                        ))}
                    </div>
                </Row>
                <LinkRow
                    icon={Palette}
                    title="Subject colours"
                    subtitle="Customise subject colours & presets"
                    onClick={() => setView('subject-colours')}
                />
            </Section>

            <Section label="Integrations">
                <Row title="Clipboard on timetable">
                    <Switch checked={showClipboardEvents} onChange={setShowClipboardEvents} label="Clipboard on timetable" />
                </Row>
                <LinkRow
                    icon={BookOpen}
                    title="Canvas links"
                    dot={canvasLinksMissing}
                    onClick={() => setView('canvas-links')}
                />
                <Row title="Tap to open Canvas">
                    <Switch checked={canvasLinksEnabled} onChange={setCanvasLinksEnabled} label="Tap to open Canvas" />
                </Row>
            </Section>

            <Section label="About">
                <LinkRow
                    icon={FileCode}
                    title="Build notes"
                    onClick={() => setView('build-notes')}
                />
                <LinkRow
                    icon={Shield}
                    title="Privacy & data deletion"
                    onClick={() => setView('privacy')}
                />
            </Section>

            <Section label="Help">
                <LinkRow
                    icon={MessageSquare}
                    title="Send feedback"
                    onClick={() => setView('feedback')}
                />
            </Section>

            <p className="text-center font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-600">
                © Synchron {new Date().getFullYear()}
            </p>
        </div>
    );
};

export default SettingsView;
