// What each page loads, as { key, load } pairs. The pages use them through useCachedLoad, and
// prefetchPages loads them in the background after start-up, so a page usually opens on data that
// is already there. Keys include the student, since the cache is saved on the device.
import { format, startOfMonth, endOfMonth } from 'date-fns';
import {
    fetchCalendarEvents,
    fetchDateInfo,
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

// A request's result, or the fallback if it failed. A 404 means SBHS has nothing for this student
// (e.g. no rollover), which is an answer; anything else is a failure and marks the page incomplete.
const settle = (promise, fallback) => promise.then(
    value => ({ ok: true, value }),
    error => ({ ok: error?.status === 404, value: fallback })
);

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



export const awardsPage = (studentId) => ({
    key: `awards:${studentId}`,
    load: async () => {
        const results = await Promise.all([
            settle(fetchStudentAwards(studentId), []),
            settle(fetchStudentBadges(studentId), []),
            settle(fetchStudentDecorations(studentId), []),
            settle(fetchStudentPrizes(studentId), []),
            settle(fetchStudentRollover(studentId), null),
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
    }
});

// --- Clipboard ---

export const clipboardPage = (studentId) => ({
    key: `clipboard:${studentId}`,
    load: async () => {
        const results = await Promise.all([
            settle(fetchStudentClipboardAttendance(studentId), []),
            settle(fetchStudentPreExplainedAbsences(studentId), []),
            settle(fetchStudentClipboardSessions(studentId), []),
            settle(fetchStudentClipboardTeams(studentId), []),
            settle(fetchGlobalActivities(), [])
        ]);
        // Nothing of the student's came back: that's a failure, not an empty Clipboard.
        if (results.slice(0, 4).every(r => !r.ok)) throw new Error('Clipboard unavailable');
        const [attendance, preExplained, sessions, teams, globalActivities] = results.map(r => r.value);
        return { attendance, preExplained, sessions, teams, globalActivities, incomplete: results.some(r => !r.ok) };
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
        !hiddenPages.includes('clipboard') && clipboardPage(studentId)
    ].filter(Boolean);

    for (const page of pages) {
        if (!navigator.onLine) return;
        await prefetchCached(page.key, page.load);
    }
};
