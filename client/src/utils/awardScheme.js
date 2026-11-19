const asObject = (value) => (value && typeof value === 'object' ? value : null);
const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

export const unwrap = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.member)) return data.member;
    if (Array.isArray(data?.['hydra:member'])) return data['hydra:member'];
    return [];
};

const normaliseCategory = (raw) => {
    const c = asObject(raw);
    if (!c) return null;
    return { id: String(c.id ?? c.name ?? ''), name: c.name || 'Other', group: c.group ?? null, type: c.type || c.categoryType || '' };
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
        type: a.type || a.awardType || '',
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

export const normaliseIssuedAward = (raw) => {
    const item = asObject(raw);
    if (!item) return null;
    const award = normaliseAward(item.award) || {
        id: String(item.title ?? ''),
        name: item.title || 'Award',
        points: toNumber(item.points),
        housePoints: 0,
        tier: null,
        type: item.type || item.awardType || '',
        category: item.category ? { id: String(item.category), name: String(item.category), group: null, type: '' } : null,
        archived: false
    };
    return {
        id: String(item.id ?? `${award.id}:${item.date ?? ''}`),
        date: item.date || null,
        award,
        type: item.type || item.awardType || award.type || award.category?.type || '',
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
        context: h.context ?? null
    };
};

const areaName = (levels) => levels[0]?.name.replace(/[\s\-–:#]*\d+\s*$/, '').trim() || 'Other';

export const normaliseList = (data, normalise) => unwrap(data).map(normalise).filter(Boolean);

export const RECORD_KINDS = [
    { id: 'award', label: 'Points' },
    { id: 'nomination', label: 'Nominations' },
    { id: 'badge', label: 'Badges' },
    { id: 'decoration', label: 'Presentation night' },
    { id: 'prize', label: 'Prizes' }
];

const byDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));

export const summariseAwards = ({
    awards = [], badges = [], decorations = [], prizes = [], rollover = null,
    catalog = [], nominations = [], prizeLadder = [], houses = []
}) => {
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
        if (!points || item.nomination) return;
        const group = category?.group;
        if (group != null) groupPoints.set(group, (groupPoints.get(group) || 0) + points);
        const name = category?.name || 'Other';
        categoryPoints.set(name, (categoryPoints.get(name) || 0) + points);
    });
    const byCategory = [...categoryPoints]
        .map(([name, points]) => ({ name, points }))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

    const earnedNominations = new Map();
    issued.forEach(item => {
        if (item.nomination) earnedNominations.set(item.nomination.id, item);
    });

    const nominationLadder = nominations
        .map(n => {
            const points = n.fromGroup == null ? totalPoints : (groupPoints.get(n.fromGroup) || 0);
            let earnedItem = earnedNominations.get(n.id);

            if (!earnedItem) {
                earnedItem = issued.find(item =>
                    item.nomination &&
                    item.nomination.name === n.name &&
                    item.nomination.fromGroup === n.fromGroup &&
                    item.nomination.pointsRequired === n.pointsRequired
                );
            }

            if (!earnedItem) {
                earnedItem = issued.find(item =>
                    item.nomination && item.nomination.name === n.name
                );
            }

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

    const nextNomination = nominationLadder
        .filter(n => n.state === 'progress' && n.pointsRequired > 0)
        .sort((a, b) => (b.points / b.pointsRequired) - (a.points / a.pointsRequired) || a.remaining - b.remaining)[0] || null;

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
        const levelGap = 30;
        return {
            id: String(levels[0].fromGroup ?? 'all'),
            name: areaName(levels),
            points: levels[0].points,
            levels: levels.length,
            earned: earned.length,
            basePoints: earned.length ? Math.max(...earned.map(n => n.pointsRequired)) : 0,
            levelGap,
            reached: levels.filter(n => n.state === 'reached').length,
            next,
            complete: !next
        };
    });
    const areas = allAreas
        .filter(area => area.name !== 'Presentation Night & Co-Curricular Awards & Rollover Points')
        .sort((a, b) => b.points - a.points || b.earned - a.earned || a.name.localeCompare(b.name));
    const areasNotStarted = [];

    const nominationsAllTime = issued.filter(item => item.kind === 'nomination').length;

    const wonPrizes = new Map(prizes.map(p => [p.prize.id, p]));
    const prizeRows = prizeLadder
        .map(p => ({ ...p, won: wonPrizes.get(p.id) || null }))
        .sort((a, b) => a.nominationsRequired - b.nominationsRequired || String(a.tier ?? '').localeCompare(String(b.tier ?? '')));
    prizes.forEach(p => {
        if (!prizeRows.some(row => row.id === p.prize.id)) prizeRows.push({ ...p.prize, won: p });
    });
    prizeRows.forEach(p => {
        p.state = p.won ? 'won' : p.nominationsRequired > 0 && nominationsAllTime >= p.nominationsRequired ? 'reached' : 'progress';
    });
    const latestPrize = [...prizeRows].reverse().find(p => p.state === 'won') || null;
    const nextPrize = prizeRows.find(p => p.state !== 'won') || null;

    const timeline = [
        ...issued.map(item => ({
            id: `a:${item.id}`,
            kind: item.kind,
            date: item.date,
            title: item.nomination?.name && item.kind === 'nomination' ? item.nomination.name : item.award.name,
            type: item.type,
            categoryType: item.award.category?.type || '',
            detail: item.kind === 'nomination'
                ? `Nomination${item.nomination.tier != null ? ` · level ${item.nomination.tier}` : ''}`
                : item.award.category?.name || '',
            points: item.award.points
        })),
        ...prizes.map(p => ({ id: `p:${p.id}`, kind: 'prize', date: p.date, title: p.prize.name, detail: p.prize.tier != null ? `Tier ${p.prize.tier}` : '', points: 0 }))
    ].sort(byDateDesc);

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
