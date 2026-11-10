// What each page loads, as { key, load } pairs. The pages use them through useCachedLoad, and
// prefetchPages loads them in the background after start-up, so a page usually opens on data that
// is already there. Keys include the student, since the cache is saved on the device.
import { format, startOfMonth, endOfMonth } from 'date-fns';
import {
    fetchCalendarEvents,
    fetchDateInfo,
    fetchDaysInfo,
    fetchTerms,
    fetchAssignments,
    fetchStudentAwards,
    fetchStudentBadges,
    fetchStudentDecorations,
    fetchStudentPrizes,
    fetchStudentRollover,
    fetchGlobalAwards,
    fetchGlobalHousePoints,
    fetchGlobalNominations,
    fetchGlobalPrizes,
    fetchStudentClipboardAttendance,
    fetchStudentPreExplainedAbsences,
    fetchStudentClipboardSessions,
    fetchStudentClipboardTeams,
    fetchGlobalActivities
} from './api';
import { prefetchCached } from '../utils/pageCache';

// --- School calendar ---

// The year's terms, holidays and development days: one public request, shared by the
// calendar page and the timetable date picker through the page cache.
export const termsPage = () => ({
    key: 'terms:v1',
    load: () => fetchTerms()
});

// Every day's term flags for a month — the days calendar's own per-day term definition.
export const schoolDaysPage = (monthDate) => ({
    key: `schooldays:${format(monthDate, 'yyyy-MM')}`,
    load: () => fetchDaysInfo(startOfMonth(monthDate), endOfMonth(monthDate))
});

// Pulls a YYYY-MM-DD out of whatever shape the API uses for a date: a plain string,
// a { date } object, or a top-level startDate/endDate field.
const ymd = (v) => {
    const s = typeof v === 'string' ? v : v?.date;
    const m = typeof s === 'string' && s.match(/\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : null;
};

// The terms' start–end spans, straight from the API.
const termSpans = (termsData) =>
    Object.values(termsData?.terms || {})
        .map(t => ({ start: ymd(t?.start) ?? ymd(t?.startDate), end: ymd(t?.end) ?? ymd(t?.endDate) }))
        .filter(t => t.start && t.end)
        .sort((a, b) => a.start.localeCompare(b.start));

// What a date is closed for, if anything: a named public holiday or staff development
// day, or "School holidays" for any day outside every term. The days calendar's own
// `term` flag ("0" = out of term) is authoritative when the API lists the date —
// an in-term weekend keeps its term number and stays open. Dates it doesn't list
// fall back to the year's term bounds. No data at all means nothing is called closed.
export const closureLabel = (date, termsData, dayInfo) => {
    const key = format(date, 'yyyy-MM-dd');
    const named = termsData?.publicHolidays?.[key] || termsData?.developmentDays?.[key];
    if (named) return named;

    if (dayInfo && dayInfo.term !== undefined && dayInfo.term !== null && dayInfo.term !== '') {
        return String(dayInfo.term) === '0' ? 'School holidays' : null;
    }

    const spans = termSpans(termsData);
    if (spans.length === 0) return null;
    return spans.some(t => key >= t.start && key <= t.end) ? null : 'School holidays';
};

// --- Calendar ---

// Fetches a month's events and the student's assignments, merged into day groups.
const loadMonth = async (monthDate) => {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);

  const [eventsData, daysData, assignmentsData] = await Promise.all([
    fetchCalendarEvents(start, end),
    fetchDateInfo(monthDate).catch(() => null),
    fetchAssignments().catch(() => ({ success: true, assignments: [] }))
  ]);

  const mergedEvents = eventsData ? JSON.parse(JSON.stringify(eventsData)) : [];
  const userAssignments = assignmentsData?.assignments || [];

  if (userAssignments.length > 0) {
    userAssignments.forEach(assignment => {
      const dueDate = new Date(assignment.dueDate);
      if (dueDate >= start && dueDate <= end) {
        const assignmentDateStr = format(dueDate, 'yyyy-MM-dd');

        let dayGroup = mergedEvents.find(group => group.info?.date === assignmentDateStr);
        if (!dayGroup) {
          let term = 1;
          let week = 1;
          let weekType = 'A';

          const siblingGroup = mergedEvents.find(g => g.info?.term);
          if (siblingGroup) {
            term = siblingGroup.info.term;
            week = siblingGroup.info.week;
            weekType = siblingGroup.info.weekType;
          } else if (daysData) {
            for (const val of Object.values(daysData)) {
              if (val && typeof val === 'object' && val.term && val.week) {
                term = val.term;
                week = val.week;
                break;
              }
            }
          }

          dayGroup = { info: { date: assignmentDateStr, term, week, weekType }, items: [] };
          mergedEvents.push(dayGroup);
        }

        dayGroup.items.push({
          title: assignment.title,
          type: 'assignment',
          subject: assignment.subject,
          time: assignment.dueDate ? format(new Date(assignment.dueDate), 'HH:mm') : '',
          status: assignment.status,
          priority: assignment.priority,
          notes: assignment.notes
        });
      }
    });

    mergedEvents.sort((a, b) => new Date(a.info.date) - new Date(b.info.date));
  }

  return mergedEvents;
};

export const calendarPage = (studentId, monthDate) => ({
    key: `calendar:${studentId}:${format(monthDate, 'yyyy-MM')}`,
    load: () => loadMonth(monthDate)
});

// --- Awards ---

const settle = (promise, fallback) => promise.then(value => ({ ok: true, value }), () => ({ ok: false, value: fallback }));

export const awardsPage = (studentId) => ({
    key: `awards:${studentId}`,
    // `previous` is the saved copy: a section that fails keeps its old data rather
    // than being stored as empty, so the backup survives an outage.
    load: async (previous) => {
        const results = await Promise.all([
            settle(fetchStudentAwards(studentId), previous?.awards ?? []),
            settle(fetchStudentBadges(studentId), previous?.badges ?? []),
            settle(fetchStudentDecorations(studentId), previous?.decorations ?? []),
            settle(fetchStudentPrizes(studentId), previous?.prizes ?? []),
            settle(fetchStudentRollover(studentId), previous?.rollover ?? null),
            settle(fetchGlobalAwards(), previous?.catalog ?? []),
            settle(fetchGlobalNominations(), previous?.nominations ?? []),
            settle(fetchGlobalPrizes(), previous?.prizeLadder ?? []),
            settle(fetchGlobalHousePoints(), previous?.houses ?? [])
        ]);
        const [awards, badges, decorations, prizes, rollover, catalog, nominations, prizeLadder, houses] = results.map(r => r.value);
        if (!results[0].ok && !results[5].ok) throw new Error('Award scheme unavailable');
        return {
            awards, badges, decorations, prizes, rollover, catalog, nominations, prizeLadder, houses,
            incomplete: results.some(r => !r.ok)
        };
    }
});

// --- Clipboard ---

export const clipboardPage = (studentId) => ({
    key: `clipboard:${studentId}`,
    // `previous` is the saved copy: a section that fails keeps its old data rather
    // than being stored as empty, so the backup survives an outage.
    load: async (previous) => {
        const results = await Promise.all([
            settle(fetchStudentClipboardAttendance(studentId), previous?.attendance ?? []),
            settle(fetchStudentPreExplainedAbsences(studentId), previous?.preExplained ?? []),
            settle(fetchStudentClipboardSessions(studentId), previous?.sessions ?? []),
            settle(fetchStudentClipboardTeams(studentId), previous?.teams ?? []),
            settle(fetchGlobalActivities(), previous?.globalActivities ?? [])
        ]);
        // Nothing answered at all: keep the saved copy (and the Cached badge) rather
        // than storing five empty lists over it.
        if (!results.some(r => r.ok)) throw new Error('Clipboard unavailable');
        const [attendance, preExplained, sessions, teams, globalActivities] = results.map(r => r.value);
        return { attendance, preExplained, sessions, teams, globalActivities };
    }
});

// Loads the other pages' data in the background, one page at a time so it never competes with
// what's on screen. Skipped offline and when the device asks to save data (Data Saver, 2G).
export const prefetchPages = async ({ studentId, hiddenPages = [] }) => {
    const connection = navigator.connection;
    const slow = connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '');
    if (!studentId || !navigator.onLine || slow) return;

    const pages = [
        !hiddenPages.includes('calendar') && calendarPage(studentId, new Date()),
        !hiddenPages.includes('awards') && awardsPage(studentId),
        !hiddenPages.includes('clipboard') && clipboardPage(studentId),
        termsPage(),
        schoolDaysPage(new Date())
    ].filter(Boolean);

    for (const page of pages) {
        if (!navigator.onLine) return;
        await prefetchCached(page.key, page.load);
    }
};
