import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Search, Trophy, Award, Medal, Sparkles, Shield, ChevronDown } from 'lucide-react';
import { useCachedLoad } from '../utils/pageCache';
import { summariseAwards, RECORD_KINDS } from '../utils/awardScheme';
import { awardsPage } from '../services/pageData';

const VIEWS = [
    { id: 'overview', label: 'My progress' },
    { id: 'earn', label: 'Ways to earn points' }
];

const RECORD_PREVIEW = 8;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const formatDate = (iso, withYear = false) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-AU', withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
};

const Eyebrow = ({ children, className = '' }) => (
    <div className={`font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500 ${className}`}>{children}</div>
);

const Card = ({ children, className = '' }) => (
    <section className={`min-w-0 rounded-2xl border border-m-line bg-m-card p-4 ${className}`}>{children}</section>
);

const CardTitle = ({ children, aside }) => (
    <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="text-[15px] font-medium text-zinc-900 dark:text-white">{children}</h2>
        {aside && <span className="text-[12px] text-zinc-400 dark:text-zinc-500 tabular-nums">{aside}</span>}
    </div>
);

const Empty = ({ children }) => (
    <p className="py-8 text-center text-sm text-zinc-400">{children}</p>
);

// A thin bar. The accent marks progress the student is working towards; other
// bars stay neutral or take a house's own colour.
const Bar = ({ value, max, tone = 'neutral', colour }) => {
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    const fill = tone === 'accent' ? 'bg-accent' : 'bg-zinc-900/25 dark:bg-white/25';
    return (
        <div className="h-1.5 w-full rounded-full bg-zinc-900/[0.06] dark:bg-white/[0.07] overflow-hidden">
            <div className={`h-full rounded-full ${colour ? '' : fill}`} style={{ width: `${pct}%`, ...(colour ? { backgroundColor: colour, opacity: 0.75 } : {}) }} />
        </div>
    );
};

const Segmented = ({ value, onChange }) => (
    <div role="tablist" aria-label="Awards" className="inline-flex p-0.5 rounded-lg bg-zinc-900/[0.05] dark:bg-white/[0.06]">
        {VIEWS.map(view => {
            const active = view.id === value;
            return (
                <button
                    key={view.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onChange(view.id)}
                    className={`relative px-3 h-8 rounded-md text-[13px] font-medium transition-colors ${active ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                >
                    {active && (
                        <motion.span
                            layoutId="awards-view"
                            transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                            className="absolute inset-0 rounded-md bg-white dark:bg-zinc-800 shadow-[0_1px_2px_rgb(0_0_0/0.05)]"
                        />
                    )}
                    <span className="relative">{view.label}</span>
                </button>
            );
        })}
    </div>
);

// --- My progress -----------------------------------------------------------

const Stat = ({ label, value, sub, className = '', valueClass = 'text-2xl sm:text-3xl tracking-[-0.03em]' }) => (
    <div className={`min-w-0 ${className}`}>
        <Eyebrow>{label}</Eyebrow>
        <div className={`mt-1 font-semibold tabular-nums text-zinc-900 dark:text-white truncate ${valueClass}`}>{value}</div>
        {sub && <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{sub}</p>}
    </div>
);

const prizeProgress = (prize, nominations) => {
    if (!prize) return null;
    if (prize.state === 'reached') return `${prize.name}: nominations reached`;
    return `${prize.name} at ${plural(prize.nominationsRequired, 'nomination')}`;
};

// The year at a glance: points, nominations, and prize.
const SummaryCard = ({ summary }) => {
    const { totalPoints, housePoints, awardCount, nominationsAllTime, latestPrize, nextPrize, rollover } = summary;
    return (
        <Card>
            <div className="flex flex-wrap gap-5">
                <Stat
                    label="Points"
                    value={totalPoints.toLocaleString('en-AU')}
                    sub={awardCount === 0 ? 'No awards yet this year' : [plural(awardCount, 'award'), housePoints > 0 && `${housePoints.toLocaleString('en-AU')} house pts`].filter(Boolean).join(' · ')}
                />
                <Stat
                    label="Nominations"
                    value={nominationsAllTime}
                    sub={rollover?.nominationCount > 0 ? `all time, +${rollover.nominationCount} carried over` : 'all time'}
                />
                <Stat
                    label="Prize"
                    value={latestPrize ? latestPrize.name : 'None yet'}
                    valueClass="text-xl sm:text-2xl tracking-[-0.02em] leading-[1.25] sm:leading-[1.5]"
                    sub={prizeProgress(nextPrize, nominationsAllTime)}
                />
            </div>
        </Card>
    );
};

const HouseCard = ({ houses }) => {
    const leader = houses[0]?.points || 0;
    return (
        <Card>
            <CardTitle>House standings</CardTitle>
            {houses.length === 0 ? (
                <Empty>No house points yet.</Empty>
            ) : (
                <ol className="space-y-2">
                    {houses.map((house, index) => (
                        <li key={house.id || house.name} className="grid grid-cols-[1rem_minmax(0,6.5rem)_minmax(0,1fr)_auto] items-center gap-x-3">
                            <span className="font-mono text-[12px] tabular-nums text-zinc-400">{index + 1}</span>
                            <span className="flex items-center gap-2 min-w-0">
                                <span aria-hidden className="w-2 h-2 rounded-full shrink-0 bg-zinc-400" style={house.colour ? { backgroundColor: house.colour } : undefined} />
                                <span className="truncate text-[13.5px] text-zinc-900 dark:text-white">{house.name}</span>
                            </span>
                            <Bar value={house.points} max={leader} colour={house.colour} />
                            <span className="font-mono text-[12px] tabular-nums text-zinc-500 text-right">{house.points.toLocaleString('en-AU')}</span>
                        </li>
                    ))}
                </ol>
            )}
        </Card>
    );
};

const StatusMark = ({ state }) => (
    <span className={`grid place-items-center w-4 h-4 rounded-full shrink-0 ${state === 'won'
        ? 'bg-accent text-accent-contrast'
        : state === 'reached' ? 'border-[1.5px] border-accent' : 'border border-zinc-900/15 dark:border-white/15'}`}>
        {state === 'won' && <Check size={10} strokeWidth={2.6} />}
    </span>
);

// The levels of one area as a smooth progress bar.
const LevelStrip = ({ area }) => {
    const isComplete = area.earned >= 30;
    const progress = Math.min(area.earned, 30) / 30;
    return (
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-zinc-900/[0.06] dark:bg-white/[0.07] overflow-hidden" aria-hidden>
            <div
                className={`h-full rounded-full ${isComplete ? 'bg-green-700 dark:bg-green-600' : 'bg-zinc-900/70 dark:bg-white/70'}`}
                style={{ width: `${progress * 100}%` }}
            />
        </div>
    );
};

// One row per area: points, levels earned, and how far to the next level.
const AreasCard = ({ summary }) => {
    const { areas, areasNotStarted } = summary;
    if (areas.length === 0 && areasNotStarted.length === 0) return null;

    return (
        <Card>
            <CardTitle>Nominations by area</CardTitle>
            {areas.length > 0 ? (
                <ul className="divide-y divide-m-line -my-1">
                    {areas.map(area => (
                        <li key={area.id} className="py-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2">
                            <div className="min-w-0">
                                <div className="text-[13.5px] text-zinc-900 dark:text-white truncate">{area.name}</div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 min-w-0"><LevelStrip area={area} /></div>
                                    <span className="mt-1.5 text-[11px] font-mono tabular-nums text-zinc-400 shrink-0">{Math.min(area.earned, 30)}/30</span>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <Empty>Points you earn will count towards nominations here.</Empty>
            )}
            {areasNotStarted.length > 0 && (
                <p className="mt-2 pt-2 border-t border-m-line text-[12px] text-zinc-400 dark:text-zinc-500">
                    Not started: {areasNotStarted.join(' · ')}
                </p>
            )}
        </Card>
    );
};

const PrizesCard = ({ summary }) => {
    const { prizeRows, nominationsAllTime, rollover } = summary;
    if (prizeRows.length === 0) return null;
    return (
        <Card>
            <CardTitle>Prizes</CardTitle>
            <ul className="space-y-0.5">
                {prizeRows.map(p => (
                    <li key={p.id} className="py-1 flex items-center gap-3">
                        <StatusMark state={p.state} />
                        <span className={`flex-1 min-w-0 truncate text-[13.5px] ${p.state === 'progress' ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-900 dark:text-white'}`}>{p.name}</span>
                        <span className="shrink-0 text-[12px] tabular-nums text-zinc-400 dark:text-zinc-500">
                            {p.state === 'won' && (p.won.date ? formatDate(p.won.date, true) : 'Won')}
                            {p.state === 'reached' && <span className="text-zinc-700 dark:text-zinc-300">Reached</span>}
                            {p.state === 'progress' && p.nominationsRequired > 0 && <span className="font-mono">{Math.min(nominationsAllTime, p.nominationsRequired)}/{p.nominationsRequired}</span>}
                        </span>
                    </li>
                ))}
            </ul>
            {rollover?.nominationCount > 0 && (
                <p className="mt-2 pt-2 border-t border-m-line text-[12px] text-zinc-500 dark:text-zinc-400">
                    {plural(rollover.nominationCount, 'nomination')} carried over{rollover.prize ? ` towards ${rollover.prize.name}` : ''}.
                </p>
            )}
        </Card>
    );
};

const KIND_ICONS = { award: Award, nomination: Sparkles, badge: Shield, decoration: Medal, prize: Trophy };
const KIND_LABELS = { nomination: 'Nomination', badge: 'Badge', decoration: 'Presentation night', prize: 'Prize' };

const RecordCard = ({ summary }) => {
    const { timeline } = summary;
    const [selectedYear, setSelectedYear] = useState(null);
    const [expanded, setExpanded] = useState(false);

    // Group timeline by year
    const yearGroups = useMemo(() => {
        const groups = new Map();
        timeline.forEach(entry => {
            if (!entry.date) return;
            const year = new Date(entry.date).getFullYear();
            if (!groups.has(year)) groups.set(year, []);
            groups.get(year).push(entry);
        });
        return Array.from(groups.entries())
            .map(([year, entries]) => ({ year, entries }))
            .sort((a, b) => b.year - a.year);
    }, [timeline]);

    // Default to the most recent year
    const activeYear = selectedYear ?? (yearGroups[0]?.year ?? null);
    const shown = activeYear ? yearGroups.find(g => g.year === activeYear)?.entries ?? [] : [];
    const visible = expanded ? shown : shown.slice(0, RECORD_PREVIEW);

    const yearFilters = yearGroups.map(g => ({
        id: String(g.year),
        label: String(g.year),
        count: g.entries.length
    }));

    return (
        <Card>
            <CardTitle aside={timeline.length > 0 ? plural(timeline.length, 'item') : null}>Your record</CardTitle>

            {yearFilters.length > 1 && (
                <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
                    {yearFilters.map(f => (
                        <button
                            key={f.id}
                            type="button"
                            aria-pressed={activeYear === Number(f.id)}
                            onClick={() => { setSelectedYear(Number(f.id)); setExpanded(false); }}
                            className={`h-7 px-2.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-colors ${activeYear === Number(f.id)
                                ? 'bg-zinc-900/[0.06] text-zinc-900 dark:bg-white/[0.08] dark:text-white'
                                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-900/[0.04] dark:hover:text-white dark:hover:bg-white/[0.04]'}`}
                        >
                            {f.label} <span className="ml-0.5 tabular-nums text-zinc-400">{f.count}</span>
                        </button>
                    ))}
                </div>
            )}

            {timeline.length === 0 ? (
                <Empty>Awards you receive this year will appear here.</Empty>
            ) : (
                <>
                    <ul className="divide-y divide-m-line">
                        {visible.map(entry => {
                            const Icon = KIND_ICONS[entry.kind] || Award;
                            return (
                                <li key={entry.id} className="py-1.5 flex items-center gap-3">
                                    <span className="w-14 shrink-0 font-mono text-[12px] tabular-nums text-zinc-400">{formatDate(entry.date)}</span>
                                    <Icon size={15} strokeWidth={1.8} className="shrink-0 text-zinc-400" aria-hidden />
                                    <div className="flex-1 min-w-0 sm:flex sm:items-baseline sm:gap-2">
                                        <div className="text-[13.5px] text-zinc-900 dark:text-white truncate sm:shrink-0 sm:max-w-[60%]">{entry.title}</div>
                                        {entry.detail && <div className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{entry.detail}</div>}
                                    </div>
                                    {entry.kind === 'nomination' && entry.points > 0 ? (
                                        <span className="shrink-0 font-mono text-[12px] tabular-nums text-zinc-700 dark:text-zinc-300">+{entry.points}</span>
                                    ) : entry.kind === 'nomination' ? (
                                        <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400 px-2 py-0.5 rounded-full border border-m-line">{KIND_LABELS[entry.kind]}</span>
                                    ) : entry.points > 0 ? (
                                        <span className="shrink-0 font-mono text-[12px] tabular-nums text-zinc-700 dark:text-zinc-300">+{entry.points}</span>
                                    ) : KIND_LABELS[entry.kind] ? (
                                        <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400 px-2 py-0.5 rounded-full border border-m-line">{KIND_LABELS[entry.kind]}</span>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                    {shown.length > RECORD_PREVIEW && (
                        <button
                            type="button"
                            onClick={() => setExpanded(e => !e)}
                            className="mt-2 h-8 px-3 inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.06]"
                        >
                            <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                            {expanded ? 'Show less' : `Show all ${shown.length}`}
                        </button>
                    )}
                </>
            )}
        </Card>
    );
};

// --- Ways to earn points ------------------------------------------------------

const EarnView = ({ summary }) => {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('all');
    const term = query.trim().toLowerCase();

    const groups = summary.catalogByCategory
        .filter(g => category === 'all' || g.name === category)
        .map(g => ({
            ...g,
            items: term ? g.items.filter(a => a.name.toLowerCase().includes(term) || g.name.toLowerCase().includes(term)) : g.items
        }))
        .filter(g => g.items.length > 0);

    if (summary.catalogByCategory.length === 0) {
        return <Card><Empty>The list of awards isn’t available right now.</Empty></Card>;
    }

    return (
        <div className="space-y-3">
            <Card>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-3">
                    Every award in the scheme and the points it’s worth. Points in an area count towards its nominations.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                    <label className="relative flex-1">
                        <span className="sr-only">Search awards</span>
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search awards"
                            className="w-full h-9 pl-8 pr-3 rounded-lg border border-m-line bg-m-card text-[13px] text-zinc-900 dark:text-white placeholder:text-zinc-400"
                        />
                    </label>
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        aria-label="Category"
                        className="h-9 px-3 rounded-lg border border-m-line bg-m-card text-[13px] text-zinc-900 dark:text-white sm:w-56"
                    >
                        <option value="all">All categories</option>
                        {summary.catalogByCategory.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
                    </select>
                </div>
            </Card>

            {groups.length === 0 ? (
                <Card><Empty>No awards match “{query.trim()}”.</Empty></Card>
            ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {groups.map(g => (
                        <Card key={g.name}>
                            <CardTitle aside={plural(g.items.length, 'award')}>{g.name}</CardTitle>
                            <ul className="divide-y divide-m-line -my-2.5">
                                {g.items.map(a => (
                                    <li key={a.id} className="py-2.5 flex items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[13.5px] text-zinc-900 dark:text-white">{a.name}</div>
                                            {(a.housePoints > 0 || a.received > 0) && (
                                                <div className="text-[12px] text-zinc-500 dark:text-zinc-400">
                                                    {a.received > 0 && <span className="text-zinc-700 dark:text-zinc-300">Received{a.received > 1 ? ` ×${a.received}` : ''}</span>}
                                                    {a.received > 0 && a.housePoints > 0 && ' · '}
                                                    {a.housePoints > 0 && plural(a.housePoints, 'house point')}
                                                </div>
                                            )}
                                        </div>
                                        <span className="shrink-0 font-mono text-[12px] tabular-nums text-zinc-700 dark:text-zinc-300">
                                            {a.points} {a.points === 1 ? 'pt' : 'pts'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- Page ----------------------------------------------------------------------

const AwardSchemeView = ({ user }) => {
    const [view, setView] = useState('overview');

    // Shows the last copy at once (from this session or saved on the device) while it refreshes.
    const page = user?.studentId ? awardsPage(user.studentId) : null;
    const { data, loading, error } = useCachedLoad(page?.key ?? null, page?.load);

    const summary = useMemo(() => (data ? summariseAwards(data) : null), [data]);

    if (loading) {
        return (
            <div className="space-y-3" aria-busy="true" aria-label="Loading awards">
                <div className="h-8 w-56 rounded-lg bg-zinc-900/[0.05] dark:bg-white/[0.06] animate-pulse-subtle" />
                <div className="grid gap-3 lg:grid-cols-2">
                    <div className="h-56 rounded-2xl bg-zinc-900/[0.05] dark:bg-white/[0.06] animate-pulse-subtle" />
                    <div className="h-56 rounded-2xl bg-zinc-900/[0.05] dark:bg-white/[0.06] animate-pulse-subtle" />
                </div>
            </div>
        );
    }

    if (error || !summary) {
        return (
            <Card className="max-w-md mx-auto mt-10 text-center">
                <Trophy size={22} strokeWidth={1.8} className="mx-auto text-zinc-400" />
                <h2 className="mt-3 text-[15px] font-medium text-zinc-900 dark:text-white">Awards didn’t load</h2>
                <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">The award scheme couldn’t be reached. Check your connection and try again.</p>
            </Card>
        );
    }

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <Eyebrow>Award scheme · {new Date().getFullYear()}</Eyebrow>
                    <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-white">Awards</h1>
                </div>
                <Segmented value={view} onChange={setView} />
            </div>

            {data.incomplete && (
                <p className="flex items-center gap-2 text-[13px] text-zinc-500 dark:text-zinc-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden />
                    Some award information couldn’t be loaded, so this may be incomplete.
                </p>
            )}

            {view === 'overview' ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <SummaryCard summary={summary} />
                    <HouseCard houses={summary.houseStandings} />
                    <AreasCard summary={summary} />
                    <PrizesCard summary={summary} />
                    <RecordCard summary={summary} />
                </div>
            ) : (
                <EarnView summary={summary} />
            )}
        </div>
    );
};

export default AwardSchemeView;
