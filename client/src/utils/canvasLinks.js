// Helpers for Canvas course links. The server has the final say on what a link
// becomes; these give instant feedback and work out which classes a student has.

export const DEFAULT_CANVAS_HOST = 'canvas.sbhs.net.au';

// The key shared links use: year + short title, e.g. "9Ma1". Short titles repeat
// across year groups, so the year has to be part of it.
export const classKey = (year, title) => `${year ?? ''}${title ?? ''}`;

// Accepts a full link, a link without "https://", "courses/123" or a bare course
// number. Returns { url, isCanvasCourse } or { error }.
export const parseLinkInput = (raw, canvasHost = DEFAULT_CANVAS_HOST) => {
    let value = String(raw ?? '').trim();
    if (!value) return { error: 'Paste the course’s link from Canvas.' };
    if (/\s/.test(value) || value.length > 500) return { error: 'That doesn’t look like a link.' };

    if (/^\d{1,12}$/.test(value)) {
        value = `https://${canvasHost}/courses/${value}`;
    } else if (/^\/?courses\/\d{1,12}(?:[/?#]|$)/i.test(value)) {
        value = `https://${canvasHost}/${value.replace(/^\/+/, '')}`;
    } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
        value = `https://${value.replace(/^\/+/, '')}`;
    }

    let url;
    try {
        url = new URL(value);
    } catch {
        return { error: 'That doesn’t look like a link.' };
    }
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname.includes('.') || url.username || url.password) {
        return { error: 'That doesn’t look like a link.' };
    }
    const isCanvasCourse = url.hostname.toLowerCase() === canvasHost && /^\/courses\/\d{1,12}(?:\/|$)/.test(url.pathname);
    return { url: url.toString(), isCanvasCourse };
};

const isClassPeriod = (period) => period?.title
    && period.title !== 'Free Period'
    && !period.title.toLowerCase().includes('roll call');

// Every class in the student's timetable, as a Map of class key -> a period of it.
// Prefers the full cycle; falls back to the day's timetable.
export const collectClasses = (completeTimetable, timetableData) => {
    const classes = new Map();
    const add = (period) => {
        if (!isClassPeriod(period)) return;
        const key = classKey(period.year, period.title);
        if (!classes.has(key)) classes.set(key, period);
    };

    const cycle = completeTimetable?.timetable || completeTimetable;
    Object.values(cycle?.days || {}).forEach(day => Object.values(day?.periods || {}).forEach(add));
    Object.values(cycle?.periods || {}).forEach(add);

    if (classes.size === 0) {
        const day = timetableData?.timetable?.timetable || timetableData?.timetable;
        Object.values(day?.periods || {}).forEach(add);
    }
    return classes;
};
