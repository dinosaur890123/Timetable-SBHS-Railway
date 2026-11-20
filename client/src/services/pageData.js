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
    fetchStudentClipboardTeams
} from './api';
import { loadCached, peekCached, prefetchCached } from '../utils/pageCache';

export const termsPage = () => ({
    key: 'terms:v1',
    load: () => fetchTerms()
});

const ymd = (v) => {
    const s = typeof v === 'string' ? v : v?.date;
    const m = typeof s === 'string' && s.match(/\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : null;
};

const termSpans = (termsData) =>
    Object.values(termsData?.terms || {})
        .map(t => ({ start: ymd(t?.start) ?? ymd(t?.startDate), end: ymd(t?.end) ?? ymd(t?.endDate) }))
        .filter(t => t.start && t.end)
        .sort((a, b) => a.start.localeCompare(b.start));

const LAST_DAY_OF_TERM = /last\s+day\s+of\s+term/i;

const lastDayOfTermDates = (eventsData) => {
    if (!Array.isArray(eventsData)) return [];
    return [...new Set(eventsData.flatMap(group => {
        const date = ymd(group?.info?.date);
        if (!date || !(group?.items || []).some(item => item?.title && LAST_DAY_OF_TERM.test(item.title))) return [];
        return [date];
    }))].sort();
};

const afterCalendarTermEnd = (key, spans, eventsData) =>
    lastDayOfTermDates(eventsData).some(end => {
        if (key <= end) return false;
        const nextStart = spans.find(span => span.start > end)?.start;
        return !nextStart || key < nextStart;
    });

export const closureLabel = (date, termsData, eventsData = null) => {
    const dow = getDay(date);
    const isWeekend = dow === 0 || dow === 6;
    const key = format(date, 'yyyy-MM-dd');
    const spans = termSpans(termsData);
    const apiInTerm = spans.length > 0 && spans.some(t => key >= t.start && key <= t.end);
    const insideTerm = apiInTerm && !afterCalendarTermEnd(key, spans, eventsData);
    if (isWeekend && insideTerm) return null;
    if (!isWeekend) {
        const named = termsData?.publicHolidays?.[key] || termsData?.developmentDays?.[key];
        if (named) return named;
        if (eventsData) {
            const dayGroup = eventsData.find(e => e.info?.date === key);
            if (dayGroup?.items) {
                const devDayEvent = dayGroup.items.find(item =>
                    item.title && /school development day/i.test(item.title)
                );
                if (devDayEvent) return devDayEvent.title;
                const publicHolidayEvent = dayGroup.items.find(item =>
                    item.title && /public holiday/i.test(item.title)
                );
                if (publicHolidayEvent) return publicHolidayEvent.title;
            }
        }
    }
    if (spans.length === 0) return null;
    return insideTerm ? null : 'School holidays';
};

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
          time: assignment.dueDate ? format(new Date(assignment.dueDate), 'h:mm a') : '',
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

const settle = (promise, fallback) => promise.then(value => ({ ok: true, value }), () => ({ ok: false, value: fallback }));

export const awardsPage = (studentId) => ({
    key: `awards:${studentId}`,
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

export const clipboardSessionsKey = (studentId) => `clipboard-sessions:${studentId}`;

export const peekClipboardSessions = (studentId) =>
    studentId
        ? peekCached(clipboardSessionsKey(studentId)) ?? peekCached(`clipboard:${studentId}`)?.sessions
        : undefined;

export const loadClipboardSessions = (studentId) => {
    if (!studentId) return Promise.resolve([]);
    const key = clipboardSessionsKey(studentId);
    return loadCached(key, async (previous) => {
        try {
            return await fetchStudentClipboardSessions(studentId);
        } catch (error) {
            const cached = previous ?? peekClipboardSessions(studentId);
            if (cached !== undefined) return cached;
            throw error;
        }
    });
};

export const clipboardPage = (studentId) => ({
    key: `clipboard:${studentId}`,
    load: async (previous) => {
        const results = await Promise.all([
            settle(fetchStudentClipboardAttendance(studentId), previous?.attendance ?? []),
            settle(fetchStudentPreExplainedAbsences(studentId), previous?.preExplained ?? []),
            settle(loadClipboardSessions(studentId), previous?.sessions ?? peekClipboardSessions(studentId) ?? []),
            settle(fetchStudentClipboardTeams(studentId), previous?.teams ?? [])
        ]);
        if (!results.some(r => r.ok)) throw new Error('Clipboard unavailable');
        const [attendance, preExplained, sessions, teams] = results.map(r => r.value);
        return { attendance, preExplained, sessions, teams };
    }
});

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
