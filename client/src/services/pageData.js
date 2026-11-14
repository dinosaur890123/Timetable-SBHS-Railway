// What each page loads, as { key, load } pairs. The pages use them through useCachedLoad, and
// prefetchPages loads them in the background after start-up, so a page usually opens on data that
// is already there. Keys include the student, since the cache is saved on the device.
import { format, getDay, startOfMonth, endOfMonth } from 'date-fns';
import {
    fetchCalendarEvents,
    fetchDateInfo,
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
// day on a weekday, "School holidays" for any weekday outside every term's bounds, or
// "School holidays" for any weekend outside every term's bounds (holiday weekends earn
// a dot too). Weekends that fall inside a term are open - only school days can be
// non-teaching inside term. No terms data means nothing can be called closed.
export const closureLabel = (date, termsData, eventsData = null) => {
    const dow = getDay(date); // 0 = Sunday, 6 = Saturday
    const isWeekend = dow === 0 || dow === 6;
    const key = format(date, 'yyyy-MM-dd');
    const spans = termSpans(termsData);
    const insideTerm = spans.length > 0 && spans.some(t => key >= t.start && key <= t.end);
    // Weekends inside a term are never dotted - they're always non-teaching but expected.
    if (isWeekend && insideTerm) return null;
    // Named holidays and dev days earn a dot on weekdays.
    if (!isWeekend) {
        const named = termsData?.publicHolidays?.[key] || termsData?.developmentDays?.[key];
        if (named) return named;
        // Check calendar events for development day mentions
        if (eventsData) {
            const dayGroup = eventsData.find(e => e.info?.date === key);
            if (dayGroup?.items) {
                const devDayEvent = dayGroup.items.find(item =>
                    item.title && /school development day/i.test(item.title)
                );
                if (devDayEvent) return devDayEvent.title;
            }
        }
    }
    if (spans.length === 0) return null;
    return insideTerm ? null : 'School holidays';
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
        termsPage()
    ].filter(Boolean);

    for (const page of pages) {
        if (!navigator.onLine) return;
        await prefetchCached(page.key, page.load);
    }
};
