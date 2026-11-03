import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Search, Trophy, Award, Medal, Sparkles, Shield, ChevronDown } from 'lucide-react';
import { useCachedLoad } from '../utils/pageCache';
import { summariseAwards, RECORD_KINDS } from '../utils/awardScheme';
import {
    fetchStudentAwards,
    fetchStudentBadges,
    fetchStudentDecorations,
    fetchStudentPrizes,
    fetchStudentRollover,
    fetchGlobalAwards,
    fetchGlobalHousePoints,
    fetchGlobalNominations,
    fetchGlobalPrizes
} from '../services/api';

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
    <section className={`min-w-0 rounded-2xl border border-m-line bg-m-card p-5 ${className}`}>{children}</section>
);

const CardTitle = ({ children, aside }) => (
    <div className="flex items-baseline justify-between gap-3 mb-4">
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

const PointsCard = ({ summary }) => {
    const { totalPoints, housePoints, awardCount, nextNomination, byCategory, nominationLadder } = summary;
    const allEarned = nominationLadder.length > 0 && nominationLadder.every(n => n.state !== 'progress');
    const topCategories = byCategory.slice(0, 5);
    const maxCategory = topCategories[0]?.points || 0;

    return (
        <Card className="lg:col-span-2">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
                <div>
                    <Eyebrow>Points this year</Eyebrow>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-5xl font-semibold tracking-[-0.03em] tabular-nums text-zinc-900 dark:text-white">{totalPoints}</span>
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">{totalPoints === 1 ? 'point' : 'points'}</span>
                    </div>
                    <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                        {awardCount === 0 ? 'No awards yet this year' : <>From {plural(awardCount, 'award')}</>}
                        {housePoints > 0 && <> · {plural(housePoints, 'house point')} for your house</>}
                    </p>
                </div>

                {nextNomination ? (
                    <div className="w-full sm:w-72">
                        <div className="flex items-baseline justify-between gap-3 text-[13px]">
                            <span className="text-zinc-500 dark:text-zinc-400">Next: <span className="font-medium text-zinc-900 dark:text-white">{nextNomination.name}</span></span>
                            <span className="font-mono text-[12px] tabular-nums text-zinc-500">{nextNomination.points}/{nextNomination.pointsRequired}</span>
                        </div>
                        <div className="mt-2"><Bar value={nextNomination.points} max={nextNomination.pointsRequired} tone="accent" /></div>
                        <p className="mt-1.5 text-[12px] text-zinc-400 dark:text-zinc-500">
                            {plural(nextNomination.remaining, 'more point')} to be nominated
                        </p>
                    </div>
                ) : allEarned ? (
                    <p className="text-[13px] text-zinc-500 dark:text-zinc-400 sm:max-w-[15rem]">You’ve reached every nomination this year.</p>
                ) : null}
            </div>

            {topCategories.length > 0 && (
                <div className="mt-6 pt-5 border-t border-m-line">
                    <Eyebrow className="mb-3">Where your points came from</Eyebrow>
                    <ul className="space-y-2.5">
                        {topCategories.map(c => (
                            <li key={c.name} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[10rem_minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-1">
                                <span className="text-[13px] text-zinc-700 dark:text-zinc-300 truncate">{c.name}</span>
                                <span className="text-[13px] font-mono tabular-nums text-zinc-500 text-right sm:order-last">{c.points}</span>
                                <div className="col-span-2 sm:col-span-1"><Bar value={c.points} max={maxCategory} /></div>
                            </li>
                        ))}
                    </ul>
                    {byCategory.length > topCategories.length && (
                        <p className="mt-3 text-[12px] text-zinc-400">and {plural(byCategory.length - topCategories.length, 'other category', 'other categories')}</p>
                    )}
                </div>
            )}
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
                <ol className="space-y-3">
                    {houses.map((house, index) => (
                        <li key={house.id || house.name}>
                            <div className="flex items-center gap-3">
                                <span className="w-4 font-mono text-[12px] tabular-nums text-zinc-400">{index + 1}</span>
                                <span aria-hidden className="w-2 h-2 rounded-full shrink-0 bg-zinc-400" style={house.colour ? { backgroundColor: house.colour } : undefined} />
                                <span className="flex-1 min-w-0 truncate text-[13.5px] text-zinc-900 dark:text-white">{house.name}</span>
                                <span className="font-mono text-[12px] tabular-nums text-zinc-500">{house.points.toLocaleString('en-AU')}</span>
                            </div>
                            <div className="mt-1.5 pl-7"><Bar value={house.points} max={leader} colour={house.colour} /></div>
                        </li>
                    ))}
                </ol>
            )}
        </Card>
    );
};

const StatusMark = ({ done }) => (
    <span className={`grid place-items-center w-5 h-5 rounded-full shrink-0 ${done ? 'bg-accent text-accent-contrast' : 'border border-m-line'}`}>
        {done && <Check size={12} strokeWidth={2.4} />}
    </span>
);

const LadderCard = ({ summary }) => {
    const { nominationLadder, prizeRows, nominationsThisYear, rollover } = summary;
    if (nominationLadder.length === 0 && prizeRows.length === 0) return null;

    return (
        <Card className="lg:col-span-3">
            <div className="mb-4">
                <h2 className="text-[15px] font-medium text-zinc-900 dark:text-white">Nominations and prizes</h2>
                <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                    Enough points in an area earns a nomination. Nominations add up to prizes.
                </p>
            </div>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                {nominationLadder.length > 0 && (
                    <div>
                        <Eyebrow className="mb-2">Nominations</Eyebrow>
                        <ul className="divide-y divide-m-line">
                            {nominationLadder.map(n => (
                                <li key={n.id} className="py-2.5 flex items-center gap-3">
                                    <StatusMark done={n.state === 'earned'} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[13.5px] text-zinc-900 dark:text-white truncate">{n.name}</div>
                                        {n.state === 'progress' && (
                                            <div className="mt-1.5 max-w-[12rem]"><Bar value={n.points} max={n.pointsRequired} /></div>
                                        )}
                                    </div>
                                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums text-right shrink-0">
                                        {n.state === 'earned' && (n.earnedDate ? `Earned ${formatDate(n.earnedDate)}` : 'Earned')}
                                        {n.state === 'reached' && 'Points reached'}
                                        {n.state === 'progress' && <span className="font-mono">{n.points}/{n.pointsRequired} pts</span>}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {prizeRows.length > 0 && (
                    <div>
                        <Eyebrow className="mb-2">Prizes</Eyebrow>
                        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-1">
                            {plural(nominationsThisYear, 'nomination')} this year
                            {rollover?.nominationCount > 0 && (
                                <>, plus {rollover.nominationCount} carried over{rollover.prize ? <> towards <span className="text-zinc-900 dark:text-white">{rollover.prize.name}</span></> : ''}</>
                            )}.
                        </p>
                        <ul className="divide-y divide-m-line">
                            {prizeRows.map(p => (
                                <li key={p.id} className="py-2.5 flex items-center gap-3">
                                    <StatusMark done={Boolean(p.won)} />
                                    <span className="flex-1 min-w-0 truncate text-[13.5px] text-zinc-900 dark:text-white">{p.name}</span>
                                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400 shrink-0">
                                        {p.won
                                            ? (p.won.date ? `Won ${formatDate(p.won.date, true)}` : 'Won')
                                            : p.nominationsRequired > 0 ? `Needs ${plural(p.nominationsRequired, 'nomination')}` : ''}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </Card>
    );
};

const KIND_ICONS = { award: Award, nomination: Sparkles, badge: Shield, decoration: Medal, prize: Trophy };
const KIND_LABELS = { nomination: 'Nomination', badge: 'Badge', decoration: 'Presentation night', prize: 'Prize' };

const RecordCard = ({ summary }) => {
    const { timeline, kindCounts } = summary;
    const [kind, setKind] = useState('all');
    const [expanded, setExpanded] = useState(false);
    const filters = [{ id: 'all', label: 'All', count: timeline.length }, ...RECORD_KINDS
        .filter(k => kindCounts[k.id])
        .map(k => ({ ...k, count: kindCounts[k.id] }))];
    const shown = kind === 'all' ? timeline : timeline.filter(entry => entry.kind === kind);
    const visible = expanded ? shown : shown.slice(0, RECORD_PREVIEW);

    return (
        <Card className="lg:col-span-3">
            <CardTitle aside={timeline.length > 0 ? plural(timeline.length, 'item') : null}>Your record</CardTitle>

            {filters.length > 2 && (
                <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
                    {filters.map(f => (
                        <button
                            key={f.id}
                            type="button"
                            aria-pressed={kind === f.id}
                            onClick={() => { setKind(f.id); setExpanded(false); }}
                            className={`h-7 px-2.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-colors ${kind === f.id
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
                                <li key={entry.id} className="py-2.5 flex items-center gap-3">
                                    <span className="w-14 shrink-0 font-mono text-[12px] tabular-nums text-zinc-400">{formatDate(entry.date)}</span>
                                    <Icon size={15} strokeWidth={1.8} className="shrink-0 text-zinc-400" aria-hidden />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[13.5px] text-zinc-900 dark:text-white truncate">{entry.title}</div>
                                        {entry.detail && <div className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{entry.detail}</div>}
                                    </div>
                                    {entry.points > 0 ? (
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
        <div className="space-y-4">
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

const settle = (promise, fallback) => promise.then(value => ({ ok: true, value }), () => ({ ok: false, value: fallback }));

const AwardSchemeView = ({ user }) => {
    const [view, setView] = useState('overview');

    // Kept for the session: coming back shows the last copy at once while it refreshes.
    const { data, loading, error } = useCachedLoad(user?.studentId ? `awards:${user.studentId}` : null, async () => {
        const id = user.studentId;
        const results = await Promise.all([
            settle(fetchStudentAwards(id), []),
            settle(fetchStudentBadges(id), []),
            settle(fetchStudentDecorations(id), []),
            settle(fetchStudentPrizes(id), []),
            settle(fetchStudentRollover(id), null),
            settle(fetchGlobalAwards(), []),
            settle(fetchGlobalNominations(), []),
            settle(fetchGlobalPrizes(), []),
            settle(fetchGlobalHousePoints(), [])
        ]);
        const [awards, badges, decorations, prizes, rollover, catalog, nominations, prizeLadder, houses] = results.map(r => r.value);
        if (!results[0].ok && !results[5].ok) throw new Error('Award scheme unavailable');
        return {
            awards, badges, decorations, prizes, rollover, catalog, nominations, prizeLadder, houses,
            incomplete: results.some(r => !r.ok)
        };
    });

    const summary = useMemo(() => (data ? summariseAwards(data) : null), [data]);

    if (loading) {
        return (
            <div className="space-y-4" aria-busy="true" aria-label="Loading awards">
                <div className="h-8 w-56 rounded-lg bg-zinc-900/[0.05] dark:bg-white/[0.06] animate-pulse-subtle" />
                <div className="grid gap-4 lg:grid-cols-3">
                    <div className="h-56 rounded-2xl bg-zinc-900/[0.05] dark:bg-white/[0.06] animate-pulse-subtle lg:col-span-2" />
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
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <PointsCard summary={summary} />
                    <HouseCard houses={summary.houseStandings} />
                    <LadderCard summary={summary} />
                    <RecordCard summary={summary} />
                </div>
            ) : (
                <EarnView summary={summary} />
            )}
        </div>
    );
};

export default AwardSchemeView;
