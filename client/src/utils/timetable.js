import { isLinklessTitle } from './canvasLinks';

export const formatTime12Hour = (timeStr) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return timeStr;
    const period = hours >= 12 ? 'pm' : 'am';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${String(minutes).padStart(2, '0')}\u00A0${period}`;
};

const variationMatchesPeriod = (variation, periodInfo) => {
    if (!variation || !periodInfo) return false;
    if (variation.title && periodInfo.title && variation.title !== periodInfo.title) {
        return false;
    }
    if (variation.year != null && periodInfo.year != null && String(variation.year) !== String(periodInfo.year)) {
        return false;
    }
    return true;
};

export const isBreakBell = (bellId, periodInfo = null) => {
    if (!bellId) return false;
    const id = String(bellId).toUpperCase().trim();
    if (['RC', 'R', 'L', 'RL'].includes(id)) return true;

    const titles = [periodInfo?.title, periodInfo?.bellDisplay]
        .filter(Boolean)
        .map(title => String(title).toLowerCase());
    if (titles.some(title => title.includes('lunch') || title.includes('recess') || title.includes('roll call'))) return true;
    if (id === '0') {
        const periodTitle = String(periodInfo?.title || '').trim().toLowerCase();
        if (!periodTitle || periodTitle === 'period 0' || periodTitle === 'free period') return true;
    }
    return false;
};

// A one-day bell change can assign a new ID to a bell while the timetable
// routine keeps its usual period IDs. Match known IDs first, then align any
// changed bells with their position in the day's routine.
export const resolveRoutineBells = (routine, bells = []) => {
    if (!Array.isArray(routine) || !Array.isArray(bells)) return [];

    const resolved = new Array(routine.length).fill(null);
    const used = new Set();

    routine.forEach((bellId, index) => {
        const match = bells.findIndex((bell, bellIndex) =>
            !used.has(bellIndex) && String(bell?.bell ?? '').trim() === String(bellId).trim()
        );
        if (match >= 0) {
            resolved[index] = bells[match];
            used.add(match);
        }
    });

    routine.forEach((_, index) => {
        if (resolved[index]) return;
        const positionMatch = index < bells.length && !used.has(index)
            ? index
            : bells.findIndex((_, bellIndex) => !used.has(bellIndex));
        if (positionMatch >= 0) {
            resolved[index] = bells[positionMatch];
            used.add(positionMatch);
        }
    });

    return resolved;
};

export const isSportOrScripturePeriod = (periodInfo) => {
    if (!periodInfo) return false;
    const title = typeof periodInfo === 'string' ? periodInfo : periodInfo.title;
    const fullTitle = typeof periodInfo === 'object' ? periodInfo.fullTitle : null;
    return isLinklessTitle(title) || isLinklessTitle(fullTitle);
};

export const isBreakStylePeriod = (bellId, periodInfo = null) => {
    if (isBreakBell(bellId, periodInfo)) return true;
    return isSportOrScripturePeriod(periodInfo);
};

export const applyPeriodVariations = (periodInfo, bellId, classVariations = {}, roomVariations = {}) => {
    if (!periodInfo) return periodInfo;

    const enriched = { ...periodInfo };

    const classVar = classVariations?.[bellId];
    if (classVar && variationMatchesPeriod(classVar, periodInfo)) {
        const type = (classVar.type || '').toLowerCase();
        if (type === 'replacement') {
            enriched.oldTeacher = periodInfo.fullTeacher || periodInfo.teacher || '';
            enriched.fullTeacher = classVar.casualSurname || classVar.casual || enriched.fullTeacher;
            enriched.isSubstituted = true;
        } else if (type === 'nocover') {
            enriched.oldTeacher = periodInfo.fullTeacher || periodInfo.teacher || '';
            enriched.fullTeacher = 'No teacher';
            enriched.isSubstituted = true;
        } else if (type === 'noclass' || type === 'cancelled' || type === 'cancel') {
            enriched.oldTeacher = periodInfo.fullTeacher || periodInfo.teacher || '';
            enriched.fullTeacher = 'Class cancelled';
            enriched.isCancelled = true;
        }
    }

    const roomVar = roomVariations?.[bellId];
    if (roomVar && variationMatchesPeriod(roomVar, periodInfo) && roomVar.roomTo) {
        enriched.oldRoom = roomVar.roomFrom || periodInfo.room || '';
        enriched.room = roomVar.roomTo;
        enriched.hasRoomChange = true;
    }

    return enriched;
};

const COLOUR_STORE = 'subject_colours';
const CUSTOM_COLOUR_STORE = 'custom_subject_colours';
let colourCache = null;
let customColourCache = null;

const subjectKey = (year, shortTitle) => `${year ?? ''}${shortTitle ?? ''}`;

const normaliseColour = (value) => {
    const hex = String(value ?? '').trim().replace(/^#/, '');
    return /^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex) ? `#${hex}` : null;
};

const readColours = () => {
    if (colourCache) return colourCache;
    try {
        colourCache = JSON.parse(localStorage.getItem(COLOUR_STORE)) || {};
    } catch {
        colourCache = {};
    }
    return colourCache;
};

const readCustomColours = () => {
    if (customColourCache) return customColourCache;
    try {
        customColourCache = JSON.parse(localStorage.getItem(CUSTOM_COLOUR_STORE)) || {};
    } catch {
        customColourCache = {};
    }
    return customColourCache;
};

const writeCustomColours = (next) => {
    customColourCache = next;
    try {
        localStorage.setItem(CUSTOM_COLOUR_STORE, JSON.stringify(next));
    } catch {}
};

export const getCustomSubjectColours = () => ({ ...readCustomColours() });

export const setCustomSubjectColoursMap = (map) => {
    const next = {};
    if (map && typeof map === 'object') {
        Object.entries(map).forEach(([k, v]) => {
            const norm = normaliseColour(v);
            if (norm) next[k] = norm;
        });
    }
    writeCustomColours(next);
    return next;
};

export const getKnownSubjectColours = () => ({ ...readColours() });

export const setCustomSubjectColour = (key, colour) => {
    if (!key) return getCustomSubjectColours();
    const next = { ...readCustomColours() };
    const normalised = normaliseColour(colour);
    if (normalised) {
        next[key] = normalised;
    } else {
        delete next[key];
    }
    writeCustomColours(next);
    return next;
};

export const resetAllCustomSubjectColours = () => {
    writeCustomColours({});
    return {};
};

export const SUBJECT_COLOUR_PRESETS = [
    {
        id: 'default',
        name: 'School Default',
        colours: [],
    },
    {
        id: 'pastel',
        name: 'Soft Pastel',
        colours: ['#93c5fd', '#a5b4fc', '#c4b5fd', '#f9a8d4', '#fda4af', '#fdba74', '#fde047', '#86efac', '#5eead4', '#67e8f9'],
    },
    {
        id: 'vivid',
        name: 'Vivid',
        colours: ['#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4'],
    },
    {
        id: 'nordic',
        name: 'Nordic',
        colours: ['#5e81ac', '#81a1c1', '#88c0d0', '#8fbcbb', '#a3be8c', '#ebcb8b', '#d08770', '#bf616a', '#b48ead', '#4c566a'],
    },
    {
        id: 'earth',
        name: 'Warm Earth',
        colours: ['#b45309', '#c2410c', '#a16207', '#4d7c0f', '#0f766e', '#0369a1', '#6d28d9', '#be185d', '#9f1239', '#78716c'],
    },
];

const toPastelHex = (hex) => {
    const norm = normaliseColour(hex);
    if (!norm) return '#93c5fd';
    let raw = norm.slice(1);
    if (raw.length === 3) raw = raw.split('').map(c => c + c).join('');
    const r = parseInt(raw.slice(0, 2), 16) / 255;
    const g = parseInt(raw.slice(2, 4), 16) / 255;
    const b = parseInt(raw.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
    }
    const ps = Math.min(s, 0.72);
    const pl = 0.68;
    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    const q = pl < 0.5 ? pl * (1 + ps) : pl + ps - pl * ps;
    const p = 2 * pl - q;
    const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(hue2rgb(p, q, h + 1 / 3))}${toHex(hue2rgb(p, q, h))}${toHex(hue2rgb(p, q, h - 1 / 3))}`;
};

export const applySubjectColourPreset = (presetId, subjectKeys = []) => {
    if (presetId === 'default') {
        return resetAllCustomSubjectColours();
    }
    const apiColours = readColours();
    const keys = subjectKeys.length > 0 ? [...subjectKeys] : Object.keys(apiColours);
    if (presetId === 'pastel') {
        const next = { ...readCustomColours() };
        keys.forEach((key) => {
            next[key] = toPastelHex(apiColours[key]);
        });
        writeCustomColours(next);
        return next;
    }
    const preset = SUBJECT_COLOUR_PRESETS.find(p => p.id === presetId);
    if (!preset || preset.colours.length === 0) return getCustomSubjectColours();
    const next = { ...readCustomColours() };
    keys.sort().forEach((key, index) => {
        next[key] = preset.colours[index % preset.colours.length];
    });
    writeCustomColours(next);
    return next;
};

export const rememberSubjectColours = (timetableData) => {
    const subjects = timetableData?.timetable?.subjects;
    if (!subjects) return;
    const colours = { ...readColours() };
    let changed = false;
    Object.entries(subjects).forEach(([key, subject]) => {
        const colour = normaliseColour(subject?.colour);
        if (colour && colours[key] !== colour) {
            colours[key] = colour;
            changed = true;
        }
    });
    if (!changed) return;
    colourCache = colours;
    try {
        localStorage.setItem(COLOUR_STORE, JSON.stringify(colours));
    } catch {}
};

export const indexSubjects = (completeTimetable) => {
    const subjects = (completeTimetable?.timetable || completeTimetable)?.subjects;
    const index = {};
    Object.values(subjects || {}).forEach(subject => {
        if (subject?.shortTitle) index[subjectKey(subject.year, subject.shortTitle)] = subject;
    });
    return index;
};

const withYear = (title, year, separator) => {
    if (!title || year == null) return title || '';
    const yearPrefix = String(year);
    if (new RegExp(`^${yearPrefix}(?=\\D|$)`).test(title)) return title;
    return `${yearPrefix}${separator}${title}`;
};

const luminance = (colour) => {
    let hex = colour.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const [r, g, b] = [0, 2, 4].map(i => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const subjectInk = (colour) => {
    const l = luminance(colour);
    return { style: { '--subject': colour }, 'data-tone': l > 0.65 ? 'pale' : l < 0.06 ? 'deep' : 'mid' };
};

export const describeClass = (periodInfo, daySubjects, subjectIndex) => {
    if (!periodInfo?.title) return { name: periodInfo?.title || '', shortName: periodInfo?.title || '', colour: null };
    const key = subjectKey(periodInfo.year, periodInfo.title);
    const subject = daySubjects?.[key] || subjectIndex?.[key];
    // The API's period and matching subject records carry the class year;
    // the student's profile year is not used to label individual classes.
    const classYear = subject?.year ?? periodInfo.year;
    return {
        name: subject?.title
            ? withYear(subject.title, classYear, ' ')
            : withYear(periodInfo.title, classYear, ''),
        shortName: withYear(periodInfo.title, classYear, ''),
        colour: readCustomColours()[key] || normaliseColour(daySubjects?.[key]?.colour) || readColours()[key] || null
    };
};
