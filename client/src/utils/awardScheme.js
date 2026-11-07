// The SBHS award scheme, shaped for the Awards page.
//
// How the scheme fits together (from the Core API's schema):
// - Awards are issued to a student and carry points (and house points). Each award
//   belongs to a category, and categories belong to a numbered group.
// - A nomination is earned once a student has enough points in one group
//   (`fromGroup`, `pointsRequired`). It is issued as an award with `nomination` set.
// - Prizes need a number of nominations (`nominationsRequired`). Nominations can
//   roll over from last year towards a prize.
// - Blazer badges and presentation-night decorations are issued awards too, listed
//   by their own endpoints.

const asObject = (value) => (value && typeof value === 'object' ? value : null);
const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

// Collections arrive as plain arrays, or wrapped in `member` / `hydra:member`.
export const unwrap = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.member)) return data.member;
    if (Array.isArray(data?.['hydra:member'])) return data['hydra:member'];
    return [];
};

const normaliseCategory = (raw) => {
    const c = asObject(raw);
    if (!c) return null;
    return { id: String(c.id ?? c.name ?? ''), name: c.name || 'Other', group: c.group ?? null, type: c.type || '' };
};

export const normaliseAward = (raw) => {
    const a = asObject(raw);
    if (!a) return null;
    return {
        id: String(a.id ?? a.name ?? ''),
        name: a.name || 'Award',
        points: toNumber(a.points),
        housePoints: toNumber(a.housePoints),
        tier: a.tier ?? null,
        type: a.type || '',
        category: normaliseCategory(a.category),
        archived: Boolean(a.archived)
    };
};

export const normaliseNomination = (raw) => {
    const n = asObject(raw);
    if (!n) return null;
    return {
        id: String(n.id ?? n.name ?? ''),
        name: n.name || 'Nomination',
        fromGroup: n.fromGroup ?? null,
        pointsRequired: toNumber(n.pointsRequired),
        tier: n.tier ?? null,
        category: normaliseCategory(n.category)
    };
};

export const normalisePrize = (raw) => {
    const p = asObject(raw);
    if (!p) return null;
    return {
        id: String(p.id ?? p.name ?? ''),
        name: p.name || 'Prize',
        tier: p.tier ?? null,
        nominationsRequired: toNumber(p.nominationsRequired)
    };
};

// One issued award (also used for badges and decorations).
export const normaliseIssuedAward = (raw) => {
    const item = asObject(raw);
    if (!item) return null;
    const award = normaliseAward(item.award) || {
        id: String(item.title ?? ''),
        name: item.title || 'Award',
        points: toNumber(item.points),
        housePoints: 0,
        tier: null,
        type: item.type || '',
        category: item.category ? { id: String(item.category), name: String(item.category), group: null, type: '' } : null,
        archived: false
    };
    return {
        id: String(item.id ?? `${award.id}:${item.date ?? ''}`),
        date: item.date || null,
        award,
        type: item.type || award.type || award.category?.type || '',
        nomination: normaliseNomination(item.nomination)
    };
};

export const normaliseIssuedPrize = (raw) => {
    const item = asObject(raw);
    if (!item) return null;
    const prize = normalisePrize(item.prize) || normalisePrize({ name: item.title });
    return { id: String(item.id ?? `${prize.id}:${item.date ?? ''}`), date: item.date || null, prize };
};

export const normaliseRollover = (data) => {
    const r = asObject(Array.isArray(data) ? data[0] : Array.isArray(data?.member) ? data.member[0] : data);
    if (!r) return null;
    const count = toNumber(r.nominationCount);
    const prize = normalisePrize(r.prize);
    return count > 0 || prize ? { nominationCount: count, prize } : null;
};

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const NAMED = /^[a-z]{3,20}$/i;
const normaliseColour = (value) => {
    const v = String(value ?? '').trim();
    if (HEX.test(v)) return v.startsWith('#') ? v : `#${v}`;
    return NAMED.test(v) ? v : null;
};

export const normaliseHouse = (raw) => {
    const h = asObject(raw);
    if (!h) return null;
    return {
        id: String(h.houseId ?? h.id ?? h.name ?? h.house ?? ''),
        name: h.name || h.house || 'House',
        colour: normaliseColour(h.color ?? h.colour),
        points: toNumber(h.points),
        // Standings come for several contexts (years); only the latest is shown.
        context: h.context ?? null
    };
};

// An area's name, from its first nomination level ("Academic 1" -> "Academic"). The first
// level's spelling is used because later ones vary ("Sport 1" ... "Sports 6").
const areaName = (levels) => levels[0]?.name.replace(/[\s\-–:#]*\d+\s*$/, '').trim() || 'Other';

export const normaliseList = (data, normalise) => unwrap(data).map(normalise).filter(Boolean);

// The kinds of thing on a student's record, in the order the page lists them.
export const RECORD_KINDS = [
    { id: 'award', label: 'Points' },
    { id: 'nomination', label: 'Nominations' },
    { id: 'badge', label: 'Badges' },
    { id: 'decoration', label: 'Presentation night' },
    { id: 'prize', label: 'Prizes' }
];

const byDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));

// Everything the Awards page shows, worked out from the raw lists.
export const summariseAwards = ({
    awards = [], badges = [], decorations = [], prizes = [], rollover = null,
    catalog = [], nominations = [], prizeLadder = [], houses = []
}) => {
    // The student's record. Badges and decorations may also appear in the awards
    // list, so items are merged by id and the most specific kind wins.
    const record = new Map();
    const add = (item, kind) => {
        const resolved = item.nomination ? 'nomination' : kind;
        const existing = record.get(item.id);
        if (existing) {
            if (existing.kind === 'award' && resolved !== 'award') existing.kind = resolved;
            return;
        }
        record.set(item.id, { ...item, kind: resolved });
    };
    awards.forEach(item => add(item, 'award'));
    badges.forEach(item => add(item, 'badge'));
    decorations.forEach(item => add(item, 'decoration'));
    const issued = [...record.values()];

    const totalPoints = issued.reduce((sum, item) => sum + item.award.points, 0);
    const housePoints = issued.reduce((sum, item) => sum + item.award.housePoints, 0);

    const groupPoints = new Map();
    const categoryPoints = new Map();
    issued.forEach(item => {
        const { points, category } = item.award;
        // A nomination is itself issued as an award with points; those don't count
        // towards the area's next nomination.
        if (!points || item.nomination) return;
        const group = category?.group;
        if (group != null) groupPoints.set(group, (groupPoints.get(group) || 0) + points);
        const name = category?.name || 'Other';
        categoryPoints.set(name, (categoryPoints.get(name) || 0) + points);
    });
    const byCategory = [...categoryPoints]
        .map(([name, points]) => ({ name, points }))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

    // Nominations: earned when one is on the record; otherwise progress is the
    // student's points in the nomination's group.
    const earnedNominations = new Map();
    issued.forEach(item => {
        if (item.nomination) earnedNominations.set(item.nomination.id, item);
    });
    const nominationLadder = nominations
        .map(n => {
            const points = n.fromGroup == null ? totalPoints : (groupPoints.get(n.fromGroup) || 0);
            const earnedItem = earnedNominations.get(n.id);
            const state = earnedItem ? 'earned' : points >= n.pointsRequired ? 'reached' : 'progress';
            return {
                ...n,
                points,
                remaining: Math.max(0, n.pointsRequired - points),
                state,
                earnedDate: earnedItem?.date || null
            };
        })
        .sort((a, b) => String(a.fromGroup ?? '').localeCompare(String(b.fromGroup ?? ''), undefined, { numeric: true })
            || a.pointsRequired - b.pointsRequired);

    // The nomination the student is closest to.
    const nextNomination = nominationLadder
        .filter(n => n.state === 'progress' && n.pointsRequired > 0)
        .sort((a, b) => (b.points / b.pointsRequired) - (a.points / a.pointsRequired) || a.remaining - b.remaining)[0] || null;

    // Each area (a group of categories) has a ladder of nomination levels. One row per
    // area: its points, how many levels are earned, and the next level.
    const areaGroups = new Map();
    nominationLadder.forEach(n => {
        const key = n.fromGroup ?? 'all';
        if (!areaGroups.has(key)) areaGroups.set(key, []);
        areaGroups.get(key).push(n);
    });
    const allAreas = [...areaGroups.values()].map(levels => {
        levels.sort((a, b) => a.pointsRequired - b.pointsRequired);
        const earned = levels.filter(n => n.state === 'earned');
        const next = levels.find(n => n.state !== 'earned') || null;
        return {
            id: String(levels[0].fromGroup ?? 'all'),
            name: areaName(levels),
            points: levels[0].points,
            levels: levels.length,
            earned: earned.length,
            // Points the processed (earned) nominations already account for; only
            // points past this carry over into the next nomination.
            basePoints: earned.length ? Math.max(...earned.map(n => n.pointsRequired)) : 0,
            reached: levels.filter(n => n.state === 'reached').length,
            next,
            complete: !next
        };
    });
    const started = (a) => a.points > 0 || a.earned > 0;
    const areas = allAreas.filter(started).sort((a, b) => b.points - a.points || b.earned - a.earned);
    const areasNotStarted = allAreas.filter(a => !started(a)).map(a => a.name);

    const nominationsAllTime = issued.filter(item => item.kind === 'nomination').length;

    const wonPrizes = new Map(prizes.map(p => [p.prize.id, p]));
    const prizeRows = prizeLadder
        .map(p => ({ ...p, won: wonPrizes.get(p.id) || null }))
        .sort((a, b) => a.nominationsRequired - b.nominationsRequired || String(a.tier ?? '').localeCompare(String(b.tier ?? '')));
    // Prizes the student has won that aren't in the ladder still belong on it.
    prizes.forEach(p => {
        if (!prizeRows.some(row => row.id === p.prize.id)) prizeRows.push({ ...p.prize, won: p });
    });
    prizeRows.forEach(p => {
        p.state = p.won ? 'won' : p.nominationsRequired > 0 && nominationsAllTime >= p.nominationsRequired ? 'reached' : 'progress';
    });
    const latestPrize = [...prizeRows].reverse().find(p => p.state === 'won') || null;
    const nextPrize = prizeRows.find(p => p.state !== 'won') || null;

    // Everything the student has received, newest first.
    const timeline = [
        ...issued.map(item => ({
            id: `a:${item.id}`,
            kind: item.kind,
            date: item.date,
            title: item.nomination?.name && item.kind === 'nomination' ? item.nomination.name : item.award.name,
            type: item.type,
            // A nomination's own category is just its tier ("TIER 4 NOMINATION").
            detail: item.kind === 'nomination'
                ? `Nomination${item.nomination.tier != null ? ` · level ${item.nomination.tier}` : ''}`
                : item.award.category?.name || '',
            points: item.award.points
        })),
        ...prizes.map(p => ({ id: `p:${p.id}`, kind: 'prize', date: p.date, title: p.prize.name, detail: p.prize.tier != null ? `Tier ${p.prize.tier}` : '', points: 0 }))
    ].sort(byDateDesc);

    // Nominations earned, grouped by year (names only, deduped).
    const nominationsByYearMap = new Map();
    issued.forEach(item => {
        if (item.kind !== 'nomination' || !item.date || !item.nomination?.name) return;
        const year = new Date(item.date).getFullYear();
        if (Number.isNaN(year)) return;
        if (!nominationsByYearMap.has(year)) nominationsByYearMap.set(year, []);
        const names = nominationsByYearMap.get(year);
        if (!names.includes(item.nomination.name)) names.push(item.nomination.name);
    });
    const nominationsByYear = [...nominationsByYearMap.entries()]
        .map(([year, names]) => ({ year, names }))
        .sort((a, b) => b.year - a.year);

    const kindCounts = {};
    timeline.forEach(entry => { kindCounts[entry.kind] = (kindCounts[entry.kind] || 0) + 1; });

    // The catalogue of awards, grouped by category, with how often the student has
    // received each.
    const received = new Map();
    issued.forEach(item => received.set(item.award.id, (received.get(item.award.id) || 0) + 1));
    const catalogGroups = new Map();
    catalog.filter(a => !a.archived).forEach(a => {
        const name = a.category?.name || 'Other';
        if (!catalogGroups.has(name)) catalogGroups.set(name, []);
        catalogGroups.get(name).push({ ...a, received: received.get(a.id) || 0 });
    });
    const catalogByCategory = [...catalogGroups]
        .map(([name, items]) => ({ name, items: items.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)) }))
        .sort((a, b) => a.name.localeCompare(b.name));

    // One set of standings, one row per house: this year's if the contexts are years,
    // otherwise the latest.
    const contexts = [...new Set(houses.map(h => h.context).filter(c => c != null))];
    const thisYear = contexts.find(c => String(c) === String(new Date().getFullYear()));
    const latest = thisYear ?? (contexts.length ? contexts.reduce((a, b) => (Number(b) > Number(a) ? b : a)) : null);
    const byHouse = new Map();
    houses
        .filter(h => latest == null || h.context === latest)
        .forEach(h => {
            const key = h.name.toLowerCase();
            if (!byHouse.has(key) || byHouse.get(key).points < h.points) byHouse.set(key, h);
        });
    const houseStandings = [...byHouse.values()].sort((a, b) => b.points - a.points);

    return {
        totalPoints,
        housePoints,
        awardCount: issued.filter(item => item.kind === 'award').length,
        byCategory,
        nominationLadder,
        nextNomination,
        nominationsAllTime,
        nominationsByYear,
        areas,
        areasNotStarted,
        prizeRows,
        latestPrize,
        nextPrize,
        rollover,
        timeline,
        kindCounts,
        catalogByCategory,
        houseStandings
    };
};
