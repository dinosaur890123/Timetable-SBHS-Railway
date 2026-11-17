import { isLinklessTitle } from './canvasLinks';

// Convert 24-hour time string (HH:mm) to 12-hour format (h:mm am/pm)
export const formatTime12Hour = (timeStr) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return timeStr;
    const period = hours >= 12 ? 'pm' : 'am';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${String(minutes).padStart(2, '0')}\u00A0${period}`;
};

// Helpers for merging the school's daily variation feeds (substitute teachers /
// room changes) into the raw period data returned by timetable/daytimetable.json.
//
// The API returns variations in two sibling collections keyed by period code:
//   - classVariations[period]: teacher absences / substitutions
//   - roomVariations[period]:  room moves
// Neither is applied by the raw `periods` map, so they must be merged in before
// a period is rendered, otherwise substitutions silently never appear.

// A variation entry carries the year group it applies to (variations are sent
// for all year groups). Only apply one when it actually matches the student's
// class for that period — guard on the class shortTitle, and on year when both
// sides expose it (accelerants can sit in multiple years for the same period).
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

// Check if a bell ID represents a break period (recess, lunch, roll call, or period 0 with no class)
export const isBreakBell = (bellId, periodInfo = null) => {
    if (!bellId) return false;
    const id = String(bellId).toUpperCase().trim();
    if (id === 'RC') return true;
    if (periodInfo && periodInfo.title) {
        const title = String(periodInfo.title).toLowerCase();
        // R/L can identify a lunch slot that contains a real class. An
        // assigned class title takes precedence over the legacy bell code.
        if (title.includes('lunch') || title.includes('recess') || title.includes('roll call')) return true;
        if (id === "0" && title === "period 0") return true;
        return false;
    }
    return id === 'R' || id === 'L';
};

// Check if a period represents sport or scripture using the same exception logic as canvas links
export const isSportOrScripturePeriod = (periodInfo) => {
    if (!periodInfo) return false;
    const title = typeof periodInfo === 'string' ? periodInfo : periodInfo.title;
    const fullTitle = typeof periodInfo === 'object' ? periodInfo.fullTitle : null;
    return isLinklessTitle(title) || isLinklessTitle(fullTitle);
};

// Check if a period should be styled as a break in daily view (includes sport/scripture for visual purposes)
export const isBreakStylePeriod = (bellId, periodInfo = null) => {
    if (isBreakBell(bellId, periodInfo)) return true;
    return isSportOrScripturePeriod(periodInfo);
};

// Returns a new period object enriched with substitution / room-change fields.
// Never mutates the source period.
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
        }
        // type === 'novariation' (regular teacher) needs no change.
    }

    const roomVar = roomVariations?.[bellId];
    if (roomVar && variationMatchesPeriod(roomVar, periodInfo) && roomVar.roomTo) {
        enriched.oldRoom = roomVar.roomFrom || periodInfo.room || '';
        enriched.room = roomVar.roomTo;
        enriched.hasRoomChange = true;
    }

    return enriched;
};

// ---------------------------------------------------------------------------
// Full class names and subject colours
//
// A period only carries a short class code ("Ma1"). The day timetable's
// `subjects` map, keyed by year + short code, has the full name ("9 Maths 1")
// and a colour ("cccccc"). The complete-cycle timetable has full names but no
// colours, so colours are remembered from every day timetable fetched.

const COLOUR_STORE = 'subject_colours';
let colourCache = null;

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

// Call with each day timetable response so its subject colours outlive that day.
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
    } catch { /* storage unavailable: colours still apply this session */ }
};

// The complete timetable lists subjects by index; index them by year + short code instead.
export const indexSubjects = (completeTimetable) => {
    const subjects = (completeTimetable?.timetable || completeTimetable)?.subjects;
    const index = {};
    Object.values(subjects || {}).forEach(subject => {
        if (subject?.shortTitle) index[subjectKey(subject.year, subject.shortTitle)] = subject;
    });
    return index;
};

// "9 Maths 1" -> "Maths 1": the year prefix only repeats the class's year.
const withoutYear = (title, year) => {
    const prefix = year != null ? `${year} ` : null;
    return prefix && title.startsWith(prefix) ? title.slice(prefix.length) : title;
};

// Relative luminance (WCAG) of a #rgb or #rrggbb colour, 0 (black) to 1 (white).
const luminance = (colour) => {
    let hex = colour.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const [r, g, b] = [0, 2, 4].map(i => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// Props that paint a subject colour through index.css's .subject-fill / .subject-edge. The
// school's colours aren't chosen for legibility: the tone lets very pale ones deepen on light
// surfaces and very dark ones lift on dark surfaces.
export const subjectInk = (colour) => {
    const l = luminance(colour);
    return { style: { '--subject': colour }, 'data-tone': l > 0.65 ? 'pale' : l < 0.06 ? 'deep' : 'mid' };
};

// Full name and colour for a period. `daySubjects` is the day timetable's subjects map and
// `subjectIndex` comes from indexSubjects(); either may be missing. Falls back to the short code.
export const describeClass = (periodInfo, daySubjects, subjectIndex) => {
    if (!periodInfo?.title) return { name: periodInfo?.title || '', colour: null };
    const key = subjectKey(periodInfo.year, periodInfo.title);
    const subject = daySubjects?.[key] || subjectIndex?.[key];
    return {
        name: subject?.title ? withoutYear(subject.title, subject.year ?? periodInfo.year) : periodInfo.title,
        colour: normaliseColour(daySubjects?.[key]?.colour) || readColours()[key] || null
    };
};
