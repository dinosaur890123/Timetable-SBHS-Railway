export const DEFAULT_CANVAS_HOST = 'sydneyboyshigh.instructure.com';
export const WELLIO_HOST = 'app.wellioeducation.com';
const CANVAS_HOSTS = new Set([DEFAULT_CANVAS_HOST, 'canvas.sbhs.net.au']);

export const classKey = (year, title) => `${year ?? ''}${title ?? ''}`;

export const parseLinkInput = (raw, canvasHost = DEFAULT_CANVAS_HOST) => {
    let value = String(raw ?? '').trim();
    if (!value) return { error: 'Paste the course’s link from Canvas or Wellio.' };
    if (/\s/.test(value) || value.length > 500) return { error: 'That doesn’t look like a link.' };

    if (/^\d{1,12}$/.test(value)) {
        value = `https://${canvasHost}/courses/${value}`;
    } else if (/^\/?courses\/\d{1,12}(?:[/?#]|$)/i.test(value)) {
        value = `https://${canvasHost}/${value.replace(/^\/+/, '')}`;
    } else if (/^\/?schools\/[A-Za-z0-9/_-]+(?:[/?#]|$)/i.test(value)) {
        value = `https://${WELLIO_HOST}/${value.replace(/^\/+/, '')}`;
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
    const host = url.hostname.toLowerCase();
    const isCanvasCourse = (CANVAS_HOSTS.has(host) || host === canvasHost.toLowerCase())
        && /^\/courses\/\d{1,12}(?:\/|$)/.test(url.pathname);
    const isWellio = host === WELLIO_HOST && /^\/schools\/[A-Za-z0-9/_-]+\/?$/.test(url.pathname);
    return { url: url.toString(), isCourseLink: isCanvasCourse || isWellio };
};

export const isWellioUrl = (raw) => {
    try {
        return new URL(String(raw ?? '')).hostname.toLowerCase() === WELLIO_HOST;
    } catch {
        return false;
    }
};

export const isLinklessTitle = (title) => {
    if (!title) return false;
    const t = String(title).toLowerCase();
    return t.includes('sport') || /^sp[\s-]?\d/.test(t) || t.includes('scripture');
};

const isClassPeriod = (period) => period?.title
    && period.title !== 'Free Period'
    && !period.title.toLowerCase().includes('roll call')
    && !isLinklessTitle(period.title);

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
