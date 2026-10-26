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
    if (id === "R" || id === "L" || id === "RC") return true;
    if (periodInfo && periodInfo.title) {
        const title = periodInfo.title.toLowerCase();
        if (title.includes('lunch') || title.includes('recess')) return true;
        if (id === "0" && title === "period 0") return true;
    }
    return false;
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

// Get canvas link for a class from localStorage
export const getCanvasLink = (className) => {
    try {
        const stored = localStorage.getItem('canvas_links');
        if (stored) {
            const links = JSON.parse(stored);
            return links[className]?.url || null;
        }
    } catch (e) {
        console.warn('Failed to get canvas link from localStorage:', e);
    }
    return null;
};
