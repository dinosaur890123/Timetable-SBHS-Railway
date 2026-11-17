import React, { useMemo, useState, useRef, useLayoutEffect } from 'react';
import { Check, Search, Trophy, Award, Medal, Sparkles, Shield, ChevronDown, X, Plus } from 'lucide-react';
import { useCachedLoad } from '../utils/pageCache';
import { summariseAwards, RECORD_KINDS } from '../utils/awardScheme';
import { awardsPage } from '../services/pageData';

const VIEWS = [
    { id: 'overview', label: 'My progress' },
    { id: 'earn', label: 'Plan' },
    { id: 'house', label: 'House standings' }
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
    <section className={`min-w-0 rounded-2xl border border-m-line bg-m-card p-5 ${className}`}>{children}</section>
);

const CardTitle = ({ children, aside }) => (
    <div className="flex items-baseline justify-between gap-3 mb-3">
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

const Segmented = ({ value, onChange }) => {
    const tabsRef = useRef({});
    const [pill, setPill] = useState({ left: 0, width: 0, ready: false });

    useLayoutEffect(() => {
        const updatePill = () => {
            const el = tabsRef.current[value];
            if (el) {
                setPill({
                    left: el.offsetLeft,
                    width: el.offsetWidth,
                    ready: true
                });
            }
        };
        updatePill();
        window.addEventListener('resize', updatePill);
        return () => window.removeEventListener('resize', updatePill);
    }, [value]);

    return (
        <div role="tablist" aria-label="Awards" className="relative inline-flex p-0.5 rounded-lg bg-zinc-900/[0.05] dark:bg-white/[0.06]">
            {pill.ready && (
                <span
                    aria-hidden="true"
                    className="absolute top-0.5 bottom-0.5 rounded-md bg-white dark:bg-zinc-800 shadow-sm transition-all duration-200 ease-out pointer-events-none"
                    style={{
                        left: `${pill.left}px`,
                        width: `${pill.width}px`
                    }}
                />
            )}
            {VIEWS.map(view => {
                const active = view.id === value;
                return (
                    <button
                        key={view.id}
                        ref={el => { if (el) tabsRef.current[view.id] = el; }}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(view.id)}
                        className={`relative z-10 px-3 h-8 rounded-md text-[13px] font-medium transition-colors ${active ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                    >
                        {view.label}
                    </button>
                );
            })}
        </div>
    );
};

// --- My progress -----------------------------------------------------------

const Stat = ({ label, value, sub, className = '', valueClass = 'text-2xl sm:text-3xl tracking-[-0.03em]', accent = false }) => (
    <div className={`min-w-0 ${className}`}>
        <Eyebrow>{label}</Eyebrow>
        <div className={`mt-1.5 font-semibold tabular-nums ${accent ? 'text-accent' : 'text-zinc-900 dark:text-white'} truncate ${valueClass}`}>{value}</div>
        {sub && <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{sub}</p>}
    </div>
);

const prizeProgress = (prize, nominations) => {
    if (!prize) return null;
    if (prize.state === 'reached') return `${prize.name}: nominations reached`;
    return `${prize.name} at ${plural(prize.nominationsRequired, 'nomination')}`;
};

// Prize and nominations banner — no total points shown.
const PrizeBanner = ({ summary }) => {
    const { nominationsAllTime, latestPrize, nextPrize, rollover } = summary;
    return (
        <Card>
            <CardTitle>Overview</CardTitle>
            <div className="flex flex-wrap gap-6">
                <Stat
                    label="Nominations"
                    value={nominationsAllTime}
                    sub={rollover?.nominationCount > 0 ? `all time, +${rollover.nominationCount} carried over` : 'all time'}
                />
                <div className="min-w-0 flex-1">
                    <Stat
                        label="Prize"
                        value={latestPrize ? latestPrize.name : 'None yet'}
                        valueClass="text-xl sm:text-2xl tracking-[-0.02em] leading-[1.25] sm:leading-[1.5]"
                        sub={prizeProgress(nextPrize, nominationsAllTime)}
                    />
                    {nextPrize?.nominationsRequired > 0 && nextPrize.state !== 'won' && (
                        <div className="mt-2 max-w-[220px]">
                            <Bar value={Math.min(nominationsAllTime, nextPrize.nominationsRequired)} max={nextPrize.nominationsRequired} tone="accent" />
                        </div>
                    )}
                </div>
            </div>
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

// Points by area: progress toward the next 30-point block.
const AreasCard = ({ summary }) => {
    const { areas, areasNotStarted } = summary;
    if (areas.length === 0 && areasNotStarted.length === 0) return null;

    return (
        <Card>
            <CardTitle aside={areas.length > 0 ? `${areas.length} ${areas.length === 1 ? 'area' : 'areas'}` : null}>Progress</CardTitle>
            {areas.length > 0 ? (
                <ul className="divide-y divide-m-line -my-1">
                    {areas.map(area => {
                        // Points past the last processed nomination carry into the next one.
                        // Until that nomination is officially issued, the overflow shows green.
                        const next = area.next;
                        const base = area.basePoints || 0;
                        const required = area.levelGap || 30;
                        const toward = next ? Math.max(0, next.points - base) : area.points;
                        const reached = next?.state === 'reached';
                        const progress = required > 0 ? Math.min(1, toward / required) : 1;
                        const tone = reached ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-300';
                        const fill = reached ? 'bg-emerald-500' : 'bg-accent';
                        return (
                            <li key={area.id} className="py-3">
                                <div className="text-[13.5px] font-medium text-zinc-900 dark:text-white truncate">{area.name}</div>
                                <div className="mt-1.5 flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="h-1.5 w-full rounded-full bg-zinc-900/[0.06] dark:bg-white/[0.07] overflow-hidden" aria-hidden>
                                            <div
                                                className={`h-full rounded-full transition-[width] duration-500 ${fill}`}
                                                style={{ width: `${progress * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    <span className={`shrink-0 text-[12px] font-mono tabular-nums ${tone}`}>
                                        {required > 0 ? `${toward}/${required}` : `${area.points} pts`}
                                    </span>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <Empty>Points you earn will count towards nominations here.</Empty>
            )}
            {areasNotStarted.length > 0 && (
                <p className="mt-3 pt-3 border-t border-m-line text-[12px] text-zinc-400 dark:text-zinc-500">
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

const NominationsCard = ({ summary }) => {
    const { nominationsByYear } = summary;
    if (nominationsByYear.length === 0) return null;
    const total = nominationsByYear.reduce((sum, g) => sum + g.names.length, 0);
    return (
        <Card>
            <CardTitle aside={plural(total, 'nomination')}>Nominations</CardTitle>
            <ul className="divide-y divide-m-line">
                {nominationsByYear.map(g => (
                    <li key={g.year} className="py-2.5 flex gap-3">
                        <span className="w-10 shrink-0 font-mono text-[12px] tabular-nums text-zinc-400 dark:text-zinc-500 pt-0.5">{g.year}</span>
                        <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
                            {g.names.map(name => (
                                <span key={name} className="px-2 py-0.5 rounded-md bg-accent/20 text-[13px] text-zinc-900 dark:text-white">
                                    {name}
                                </span>
                            ))}
                        </div>
                    </li>
                ))}
            </ul>
        </Card>
    );
};

const KIND_ICONS = { award: Award, nomination: Sparkles, badge: Shield, decoration: Medal, prize: Trophy };
const KIND_LABELS = { nomination: 'Nomination', badge: 'Badge', decoration: 'Presentation night', prize: 'Prize' };

const YearTabs = ({ yearFilters, activeYear, onSelectYear }) => {
    const tabsRef = useRef({});
    const [pill, setPill] = useState({ left: 0, width: 0, ready: false });

    useLayoutEffect(() => {
        const updatePill = () => {
            const el = tabsRef.current[activeYear];
            if (el) {
                setPill({
                    left: el.offsetLeft,
                    width: el.offsetWidth,
                    ready: true
                });
            }
        };
        updatePill();
        window.addEventListener('resize', updatePill);
        return () => window.removeEventListener('resize', updatePill);
    }, [activeYear]);

    return (
        <div className="relative -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {pill.ready && (
                <span
                    aria-hidden="true"
                    className="absolute top-0 bottom-1 rounded-md bg-white dark:bg-zinc-800 shadow-sm transition-all duration-200 ease-out pointer-events-none"
                    style={{
                        left: `${pill.left}px`,
                        width: `${pill.width}px`
                    }}
                />
            )}
            {yearFilters.map(f => {
                const active = activeYear === Number(f.id);
                return (
                    <button
                        key={f.id}
                        ref={el => { if (el) tabsRef.current[Number(f.id)] = el; }}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onSelectYear(Number(f.id))}
                        className={`relative z-10 px-2.5 h-7 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors ${
                            active
                                ? 'text-zinc-900 dark:text-white'
                                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                        }`}
                    >
                        <span>{f.label} <span className="ml-0.5 tabular-nums text-zinc-400">{f.count}</span></span>
                    </button>
                );
            })}
        </div>
    );
};

const RecordCard = ({ summary }) => {
    const { timeline } = summary;
    const [selectedYear, setSelectedYear] = useState(null);
    const [expanded, setExpanded] = useState(false);

    // Group timeline by year, points-only (ignore prizes, badges, decorations)
    const yearGroups = useMemo(() => {
        const groups = new Map();
        timeline.forEach(entry => {
            if (!entry.date || entry.kind === 'prize' || entry.kind === 'badge' || entry.kind === 'decoration') return;
            // Filter out nominations and prize tier awards (they surface elsewhere)
            if (entry.kind === 'nomination') return;
            const titleToCheck = String(entry.title || '').toLowerCase();
            const detailToCheck = String(entry.detail || '').toLowerCase();
            if (titleToCheck.includes('nomination') || detailToCheck.includes('nomination') ||
                titleToCheck.includes('prize tier') || detailToCheck.includes('prize tier')) return;
            const year = new Date(entry.date).getFullYear();
            if (!groups.has(year)) groups.set(year, []);
            groups.get(year).push(entry);
        });
        return Array.from(groups.entries())
            .map(([year, entries]) => ({ year, entries }))
            .sort((a, b) => b.year - a.year);
    }, [timeline]);

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
            <CardTitle aside={timeline.length > 0 ? plural(timeline.length, 'item') : null}>My record</CardTitle>

            {yearFilters.length > 1 && (
                <YearTabs
                    yearFilters={yearFilters}
                    activeYear={activeYear}
                    onSelectYear={(year) => { setSelectedYear(year); setExpanded(false); }}
                />
            )}
            {shown.length === 0 ? (
                <Empty>No point awards this year yet.</Empty>
            ) : (
                <>
                    <ul className="divide-y divide-m-line">
                        {visible.map(entry => {
                            const Icon = KIND_ICONS[entry.kind] || Award;
                            return (
                                <li key={entry.id} className="py-2 flex items-center gap-3">
                                    <span className="w-14 shrink-0 font-mono text-[12px] tabular-nums text-zinc-400">{formatDate(entry.date)}</span>
                                    <Icon size={15} strokeWidth={1.8} className="shrink-0 text-zinc-400" aria-hidden />
                                    <div className="flex-1 min-w-0 sm:flex sm:items-baseline sm:gap-2">
                                        <div className="text-[13.5px] text-zinc-900 dark:text-white truncate sm:shrink-0 sm:max-w-[60%]">{entry.title}</div>
                                        {entry.detail && <div className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{entry.detail}</div>}
                                    </div>
                                    {entry.points > 0 ? (
                                        <span className="shrink-0 inline-flex items-center rounded-md bg-accent/10 px-2 py-0.5 font-mono text-[12px] tabular-nums text-accent">+{entry.points}</span>
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

// --- House standings view ------------------------------------------------------

const HouseView = ({ summary }) => {
    const { houseStandings } = summary;
    const leader = houseStandings[0]?.points || 0;
    return (
        <Card>
            <CardTitle>House standings</CardTitle>
            {houseStandings.length === 0 ? (
                <Empty>No house points yet.</Empty>
            ) : (
                <ol className="space-y-2.5">
                    {houseStandings.map((house, index) => (
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

// --- Plan view ----------------------------------------------------------------------

const PlanView = ({ summary }) => {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('all');
    const [plannedAwards, setPlannedAwards] = useState([]);
    const term = query.trim().toLowerCase();

    const groups = summary.catalogByCategory
        .filter(g => category === 'all' || g.name === category)
        .map(g => ({
            ...g,
            items: term ? g.items.filter(a => a.name.toLowerCase().includes(term)) : g.items
        }))
        .filter(g => g.items.length > 0);

    const handleAddAward = (award) => {
        setPlannedAwards(prev => [...prev, { ...award, id: `${award.id}-${Date.now()}` }]);
    };

    const handleRemoveAward = (id) => {
        setPlannedAwards(prev => prev.filter(a => a.id !== id));
    };

    // Calculate hypothetical projections
    const projections = useMemo(() => {
        const totalPlannedPoints = plannedAwards.reduce((sum, a) => sum + a.points, 0);
        const currentPoints = summary.totalPoints;
        const totalPoints = currentPoints + totalPlannedPoints;

        // Area breakdown using actual nomination levels
        const areaBreakdown = summary.areas.map(area => {
            const plannedPoints = plannedAwards
                .filter(a => a.category?.name === area.name)
                .reduce((sum, a) => sum + a.points, 0);
            const areaNominations = summary.nominationLadder.filter(n => String(n.fromGroup ?? 'all') === area.id);
            const projectedPoints = area.points + plannedPoints;
            const hypotheticallyReached = areaNominations.filter(n => n.state !== 'earned' && projectedPoints >= n.pointsRequired);
            const earnedLevels = areaNominations.filter(n => n.state === 'earned');
            const base = Math.max(0, ...earnedLevels.map(n => n.pointsRequired), ...hypotheticallyReached.map(n => n.pointsRequired));
            const required = area.levelGap || 30;
            const toward = Math.max(0, projectedPoints - base);
            const earned = area.earned + hypotheticallyReached.length;
            return { ...area, plannedPoints, earned, toward, required, hypotheticalNominations: hypotheticallyReached.length };
        });

        // Include nominations reached by planned points as well as nomination
        // awards added directly to the plan when projecting the next prize.
        const projectedNominations = summary.nominationsAllTime
            + plannedAwards.filter(a => a.type === 'nomination').length
            + areaBreakdown.reduce((sum, area) => sum + area.hypotheticalNominations, 0);
        const projectedPrizeRows = summary.prizeRows.map(prize => ({
            ...prize,
            state: prize.won ? 'won' : prize.nominationsRequired > 0 && projectedNominations >= prize.nominationsRequired ? 'reached' : 'progress'
        }));
        const projectedPrize = [...projectedPrizeRows].reverse().find(prize => prize.state === 'reached') || null;

        return {
            totalPlannedPoints,
            currentPoints,
            totalPoints,
            currentNominations: summary.nominationsAllTime,
            totalNominations: projectedNominations,
            projectedNominations,
            projectedPrize,
            areaBreakdown
        };
    }, [summary, plannedAwards]);

    if (summary.catalogByCategory.length === 0) {
        return <Card><Empty>The list of awards isn’t available right now.</Empty></Card>;
    }

    return (
        <div className="space-y-4">
            {/* Search Catalog */}
            <Card>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-3">
                    Search the award scheme to plan hypothetical awards. Click an award to add it to your plan.
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

            {/* Search Results (compact) */}
            {term && (groups.length > 0 || query.trim()) && (
                <Card>
                    <CardTitle aside={groups.length > 0 ? plural(groups.reduce((sum, g) => sum + g.items.length, 0), 'award') : null}>Search Results</CardTitle>
                    {groups.length > 0 ? <ul className="divide-y divide-m-line -my-2.5">
                        {groups.flatMap(g => g.items).slice(0, 10).map(a => (
                            <li key={a.id} className="py-2.5 flex items-center gap-3 rounded-lg px-2 -mx-2 transition-colors hover:bg-zinc-900/[0.03] dark:hover:bg-white/[0.04]">
                                <div className="flex-1 min-w-0">
                                    <div className="text-[13.5px] text-zinc-900 dark:text-white">{a.name}</div>
                                    <div className="text-[12px] text-zinc-500 dark:text-zinc-400">
                                        {a.category?.name || 'Other'}
                                    </div>
                                </div>
                                <span className="shrink-0 inline-flex items-center rounded-md bg-accent/10 px-2 py-0.5 font-mono text-[12px] tabular-nums text-accent">
                                    {a.points} {a.points === 1 ? 'pt' : 'pts'}
                                </span>
                                <button
                                    onClick={() => handleAddAward(a)}
                                    className="shrink-0 p-1 rounded-md hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.05] text-zinc-400 hover:text-accent"
                                    aria-label={`Add ${a.name} to plan`}
                                >
                                    <Plus size={14} />
                                </button>
                            </li>
                        ))}
                    </ul> : <Empty>No awards match your search.</Empty>}
                    {groups.reduce((sum, g) => sum + g.items.length, 0) > 10 && (
                        <p className="mt-2 text-[12px] text-zinc-500 dark:text-zinc-400">
                            Showing first 10 results. Refine your search to see more.
                        </p>
                    )}
                </Card>
            )}

            {/* Planned Awards & Projections */}
            {plannedAwards.length > 0 && projections && (
                <>
                    {/* Planned Awards List */}
                    <Card>
                        <CardTitle aside={plural(plannedAwards.length, 'planned award')}>Planned</CardTitle>
                        <ul className="divide-y divide-m-line -my-2.5">
                            {plannedAwards.map(a => (
                                <li key={a.id} className="py-2.5 flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[13.5px] text-zinc-900 dark:text-white">{a.name}</div>
                                        <div className="text-[12px] text-zinc-500 dark:text-zinc-400">
                                            {a.category?.name || 'Other'}
                                        </div>
                                    </div>
                                    <span className="shrink-0 inline-flex items-center rounded-md bg-accent/10 px-2 py-0.5 font-mono text-[12px] tabular-nums text-accent">
                                        +{a.points}
                                    </span>
                                    <button
                                        onClick={() => handleRemoveAward(a.id)}
                                        className="shrink-0 p-1 rounded-md hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.05] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                                        aria-label={`Remove ${a.name}`}
                                    >
                                        <X size={14} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </Card>

                    {/* Nominations Breakdown */}
                    <Card>
                        <CardTitle>Nominations Breakdown</CardTitle>
                        <div className="space-y-4">
                            {projections.areaBreakdown.map(area => (
                                <div key={area.id} className="py-2">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[13.5px] text-zinc-900 dark:text-white">{area.name}</span>
                                        <span className="text-[12px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                                            {area.earned} earned · {area.next ? `${area.next.pointsRequired} pts needed` : 'Complete'}
                                        </span>
                                    </div>
                                    <Bar value={area.toward} max={area.required} tone="accent" />
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Projections */}
                    <Card>
                        <CardTitle>Projections</CardTitle>
                        <div className="grid grid-cols-2 gap-4">
                            <Stat
                                label="Total Nominations"
                                value={projections.totalNominations}
                                sub={`+${projections.totalNominations - projections.currentNominations}`}
                                accent={projections.totalNominations > projections.currentNominations}
                            />
                            <Stat
                                label="Projected Prize"
                                value={projections.projectedPrize ? projections.projectedPrize.name : 'None yet'}
                                valueClass="text-lg"
                                sub={projections.projectedPrize ? `Tier ${projections.projectedPrize.tier || '?'}` : 'Keep earning!'}
                            />
                        </div>
                    </Card>
                </>
            )}

            {/* Current Status (no hypothetical) */}
            {plannedAwards.length === 0 && (
                <>
                    <Card>
                        <CardTitle>Nominations Breakdown</CardTitle>
                        <div className="space-y-4">
                            {summary.areas.map(area => {
                                const base = area.basePoints || 0;
                                const required = area.levelGap || 30;
                                const toward = area.next ? Math.max(0, area.next.points - base) : area.points;
                                return (
                                    <div key={area.id} className="py-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[13.5px] text-zinc-900 dark:text-white">{area.name}</span>
                                            <span className="text-[12px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                                                {area.earned} earned · {area.next ? `${area.next.pointsRequired} pts needed` : 'Complete'}
                                            </span>
                                        </div>
                                        <Bar value={toward} max={required} tone="neutral" />
                                    </div>
                                );
                            })}
                        </div>
                    </Card>

                    <Card>
                        <CardTitle>Current Status</CardTitle>
                        <div className="grid grid-cols-2 gap-4">
                            <Stat
                                label="Total Nominations"
                                value={summary.nominationsAllTime}
                                sub="All time"
                            />
                            <Stat
                                label="Current Prize"
                                value={summary.latestPrize ? summary.latestPrize.name : 'None yet'}
                                valueClass="text-lg"
                                sub={summary.nextPrize ? `Next: ${summary.nextPrize.name} at ${summary.nextPrize.nominationsRequired} noms` : 'Keep earning!'}
                            />
                        </div>
                    </Card>
                </>
            )}

            {/* Full scheme link */}
            <Card>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                    <a href="https://sydneyhigh.school/wellbeing/award-scheme" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                        View the full award scheme
                    </a>
                </p>
            </Card>
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
            <div className="space-y-4" aria-busy="true" aria-label="Loading awards">
                <div className="h-8 w-56 rounded-lg bg-zinc-900/[0.05] dark:bg-white/[0.06] animate-pulse-subtle" />
                <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                    <div className="space-y-4">
                        <div className="h-40 rounded-2xl bg-zinc-900/[0.05] dark:bg-white/[0.06] animate-pulse-subtle" />
                        <div className="h-40 rounded-2xl bg-zinc-900/[0.05] dark:bg-white/[0.06] animate-pulse-subtle" />
                    </div>
                    <div className="space-y-4">
                        <div className="h-40 rounded-2xl bg-zinc-900/[0.05] dark:bg-white/[0.06] animate-pulse-subtle" />
                        <div className="h-40 rounded-2xl bg-zinc-900/[0.05] dark:bg-white/[0.06] animate-pulse-subtle" />
                    </div>
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
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
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
                <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[2fr_1fr]">
                    <div className="space-y-4">
                        <PrizeBanner summary={summary} />
                        <NominationsCard summary={summary} />
                        <RecordCard summary={summary} />
                    </div>
                    <div className="space-y-4">
                        <AreasCard summary={summary} />
                        <PrizesCard summary={summary} />
                    </div>
                </div>
            ) : view === 'house' ? (
                <HouseView summary={summary} />
            ) : (
                <PlanView summary={summary} />
            )}
        </div>
    );
};

export default AwardSchemeView;
