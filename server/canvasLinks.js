// Canvas course links: each student's own links, plus links shared between
// classmates.
//
// A student's own links are private and keyed by the class's short title
// ("Ma1"), the way the timetable shows it. Only links to a Canvas course on the
// school's Canvas host are shared, and they are keyed by year and class
// ("9Ma1") within one school year, because short titles repeat across year
// groups and courses change every year.
//
// The rules that keep shared links honest:
// - The server reads the student's own SBHS timetable before it accepts a
//   shared link or a vote, so only students in a class can affect its link.
// - Only https://sydneyboyshigh.instructure.com/courses/<id> and
//   https://app.wellioeducation.com/schools/<id> links are shared (Canvas or
//   Wellio course pages). Nothing else leaves the student's own account.
// - Each student has one vote per link and backs at most one link per class.
//   Votes are stored one row per student, and counts are worked out when read,
//   so they can't drift and concurrent votes can't be lost.
// - A link is used for the whole class once CANVAS_LINK_CONFIRMATIONS students
//   back it and they outnumber the students reporting it. It is hidden once
//   CANVAS_LINK_REJECTIONS students report it and they match or outnumber its
//   backers.
// - Blacklisted students can't share or vote, and their past votes and
//   suggestions stop counting.
// - Writes are rate-limited per student, and new shared links are capped per
//   day.
// - Admins can pin a link as correct or hide it, overriding the votes.

const crypto = require('crypto');

const SBHS_TIMETABLE_URL = 'https://student.sbhs.net.au/api/timetable/timetable.json';

const intEnv = (name, fallback) => {
    const n = Number.parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};
const hostList = (value) => String(value || '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);

const CANVAS_HOST = hostList(process.env.CANVAS_HOST)[0] || 'sydneyboyshigh.instructure.com';
// Other hostnames that serve the same Canvas courses (e.g. the school's
// canvas.<domain> address). Links on them are rewritten to CANVAS_HOST.
const CANVAS_HOSTS = new Set([
    CANVAS_HOST,
    'sydneyboyshigh.instructure.com',
    'canvas.sbhs.net.au',
    ...hostList(process.env.CANVAS_ALIAS_HOSTS)
]);
// Wellio hosts some classes instead of Canvas. A Wellio link is stored as
// "wellio:" + its path so the full address can be rebuilt exactly.
const WELLIO_HOST = (hostList(process.env.WELLIO_HOST)[0] || 'app.wellioeducation.com').toLowerCase();
// Earlier versions turned a bare course number into a canvas.instructure.com
// link. Stored links of exactly that form are read back on CANVAS_HOST.
const LEGACY_COURSE_URL = /^https?:\/\/canvas\.instructure\.com\/courses\/(\d{1,12})\/?$/i;

const CONFIRMATIONS = intEnv('CANVAS_LINK_CONFIRMATIONS', 2);
const REJECTIONS = intEnv('CANVAS_LINK_REJECTIONS', 3);
const DAILY_SHARED_LIMIT = intEnv('CANVAS_LINK_DAILY_SUGGESTIONS', 10);
const MAX_PERSONAL_LINKS = 60;
const MAX_URL_LENGTH = 500;
const MAX_CLASS_NAME_LENGTH = 40;
const MAX_CLIENT_CLASS_KEYS = 40;
const CLASS_CACHE_MS = 6 * 60 * 60 * 1000;
const CLASS_CACHE_MAX = 5000;

const currentSchoolYear = () => Number(
    new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric' }).format(new Date())
);

const courseUrl = (courseId) => String(courseId).startsWith('wellio:')
    ? `https://${WELLIO_HOST}/${String(courseId).slice('wellio:'.length)}`
    : `https://${CANVAS_HOST}/courses/${courseId}`;

// The course ID when a URL points at a course on the school's Canvas.
const canvasCourseId = (url) => {
    if (!CANVAS_HOSTS.has(url.hostname.toLowerCase())) return null;
    const match = url.pathname.match(/^\/courses\/(\d{1,12})(?:\/|$)/);
    return match ? match[1] : null;
};

// The stored id when a URL points at a Wellio school/class page:
// "wellio:" + the path after the host (e.g. "wellio:schools/12345").
const wellioCourseId = (url) => {
    if (url.hostname.toLowerCase() !== WELLIO_HOST) return null;
    const path = url.pathname.replace(/\/+$/, '');
    if (!/^\/schools\/[A-Za-z0-9/_-]+$/.test(path) || path.length > 200) return null;
    return `wellio:${path.slice(1)}`;
};

// Accepts a full link, a link without "https://", "courses/123",
// "schools/123" or a bare course number. Returns { url, courseId } (courseId
// only for school Canvas or Wellio course pages), or null when the input
// isn't a usable web link.
const parseLinkInput = (raw) => {
    if (typeof raw !== 'string') return null;
    let value = raw.trim();
    if (!value || value.length > MAX_URL_LENGTH || /\s/.test(value)) return null;

    if (/^\d{1,12}$/.test(value)) {
        value = courseUrl(value);
    } else if (/^\/?courses\/\d{1,12}(?:[/?#]|$)/i.test(value)) {
        value = `https://${CANVAS_HOST}/${value.replace(/^\/+/, '')}`;
    } else if (/^\/?schools\/[A-Za-z0-9/_-]+(?:[/?#]|$)/i.test(value)) {
        value = `https://${WELLIO_HOST}/${value.replace(/^\/+/, '')}`;
    } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
        value = `https://${value.replace(/^\/+/, '')}`;
    }

    let url;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    if (!url.hostname.includes('.')) return null;

    const courseId = canvasCourseId(url) || wellioCourseId(url);
    if (courseId) {
        url.protocol = 'https:';
        url.hostname = courseId.startsWith('wellio:') ? WELLIO_HOST : CANVAS_HOST;
        url.port = '';
    }
    return { url: url.toString(), courseId };
};

// A stored personal link as it should be served now.
const readStoredUrl = (stored) => {
    const legacy = typeof stored === 'string' && stored.match(LEGACY_COURSE_URL);
    if (legacy) return courseUrl(legacy[1]);
    return parseLinkInput(stored)?.url || null;
};

const cleanClassName = (value) => {
    if (typeof value !== 'string') return null;
    const name = value.trim();
    if (!name || name.length > MAX_CLASS_NAME_LENGTH) return null;
    return name;
};

const isClassKey = (value) => typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_CLASS_NAME_LENGTH
    && /^[\w .&+()/:-]+$/.test(value);

// "9 Maths 1" -> "Maths 1".
const withoutYear = (title, year) => {
    const prefix = year ? `${year} ` : null;
    return prefix && title.startsWith(prefix) ? title.slice(prefix.length) : title;
};

// Sport blocks ("SP9", "Sport 9") have no course page.
const isSportTitle = (title) => {
    const t = String(title || '').toLowerCase();
    return t.includes('sport') || /^sp[\s-]?\d/.test(t);
};

// The student's classes from SBHS's timetable.json, keyed by year + short title.
const extractClasses = (data) => {
    const timetable = data?.timetable?.days || data?.timetable?.subjects ? data.timetable : data;
    const classes = new Map();
    const add = (year, title, name) => {
        const shortTitle = String(title ?? '').trim();
        if (!shortTitle || isSportTitle(shortTitle)) return;
        const key = `${year ?? ''}${shortTitle}`;
        if (!isClassKey(key)) return;
        if (classes.has(key)) return;
        classes.set(key, { key, title: shortTitle, year: year == null ? null : String(year), name: name || shortTitle });
    };

    Object.values(timetable?.subjects || {}).forEach(subject => {
        if (!subject?.shortTitle) return;
        const title = subject.title ? withoutYear(String(subject.title), subject.year) : null;
        add(subject.year, subject.shortTitle, title);
    });
    Object.values(timetable?.days || {}).forEach(day => {
        Object.values(day?.periods || {}).forEach(period => {
            if (period?.title) add(period.year, period.title, null);
        });
    });
    return classes;
};

// Sliding-window limiter, per key, kept in memory.
const makeLimiter = (limit, windowMs) => {
    const hits = new Map();
    return (key) => {
        const now = Date.now();
        if (hits.size > 10000) {
            for (const [k, times] of hits) {
                if (!times.some(t => now - t < windowMs)) hits.delete(k);
            }
        }
        const times = (hits.get(key) || []).filter(t => now - t < windowMs);
        if (times.length >= limit) {
            hits.set(key, times);
            return false;
        }
        times.push(now);
        hits.set(key, times);
        return true;
    };
};

const statusOf = ({ up, down, lockedStatus }) => {
    if (lockedStatus) return lockedStatus;
    if (down >= REJECTIONS && down >= up) return 'rejected';
    if (up >= CONFIRMATIONS && up > down) return 'verified';
    return 'pending';
};

// A pinned link wins, then the one with the most backing net of reports.
const outranks = (a, b) => (a.pinned !== b.pinned
    ? a.pinned
    : (a.confirmations - a.reports) > (b.confirmations - b.reports));

// Rows (one per shared link, with vote counts) -> what a student sees per class:
// the link the class uses, if any, and the other suggestions still being voted on.
const summariseClasses = (rows, classKeys) => {
    const classes = {};
    classKeys.forEach(key => { classes[key] = { link: null, suggestions: [] }; });
    rows.forEach(row => {
        const entry = classes[row.classKey] || (classes[row.classKey] = { link: null, suggestions: [] });
        const status = statusOf(row);
        if (status === 'rejected') return;
        const item = {
            id: row.id,
            className: row.className,
            canvasUrl: courseUrl(row.courseId),
            confirmations: row.up,
            reports: row.down,
            status,
            pinned: row.lockedStatus === 'verified',
            myVote: row.myVote || 0
        };
        if (status === 'verified' && (!entry.link || outranks(item, entry.link))) {
            if (entry.link) entry.suggestions.push(entry.link);
            entry.link = item;
        } else {
            entry.suggestions.push(item);
        }
    });
    Object.values(classes).forEach(entry => {
        entry.suggestions.sort((a, b) => (b.confirmations - b.reports) - (a.confirmations - a.reports));
    });
    return classes;
};

// ---------------------------------------------------------------------------
// Storage. Postgres when configured, otherwise in memory (local development).

const createPgStore = (db) => {
    const voteCounts = `
        COUNT(*) FILTER (WHERE v.vote = 1 AND NOT COALESCE(voter.blacklisted, FALSE))::int AS up,
        COUNT(*) FILTER (WHERE v.vote = -1 AND NOT COALESCE(voter.blacklisted, FALSE))::int AS down`;
    const fromLinks = `
        FROM canvas_class_links l
        LEFT JOIN app_users submitter ON submitter.id = l.submitted_by
        LEFT JOIN canvas_class_link_votes v ON v.link_id = l.id
        LEFT JOIN app_users voter ON voter.id = v.student_id`;
    const toRow = (row) => ({
        id: row.id,
        classKey: row.class_key,
        className: row.class_name,
        courseId: row.course_id,
        schoolYear: row.school_year,
        submittedBy: row.submitted_by,
        lockedStatus: row.locked_status || null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        up: row.up || 0,
        down: row.down || 0,
        myVote: row.my_vote == null ? 0 : Number(row.my_vote)
    });

    return {
        async listPersonal(studentId, year) {
            const result = await db.query(
                `SELECT class_name, canvas_url, updated_at FROM canvas_links
                 WHERE student_id = $1 AND school_year = $2 ORDER BY class_name ASC`,
                [studentId, year]
            );
            return result.rows.map(row => ({ className: row.class_name, canvasUrl: row.canvas_url, updatedAt: row.updated_at }));
        },
        async savePersonal(studentId, year, className, url) {
            return db.withTransaction(async (client) => {
                const count = await client.query(
                    `SELECT COUNT(*) FILTER (WHERE class_name <> $3)::int AS others FROM canvas_links
                     WHERE student_id = $1 AND school_year = $2`,
                    [studentId, year, className]
                );
                if (count.rows[0].others >= MAX_PERSONAL_LINKS) return false;
                await client.query(
                    `INSERT INTO canvas_links (id, class_name, canvas_url, student_id, school_year, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                     ON CONFLICT (student_id, school_year, class_name)
                     DO UPDATE SET canvas_url = EXCLUDED.canvas_url, updated_at = NOW()`,
                    [crypto.randomUUID(), className, url, studentId, year]
                );
                return true;
            });
        },
        async removePersonal(studentId, year, className) {
            await db.query(
                `DELETE FROM canvas_links WHERE student_id = $1 AND school_year = $2 AND class_name = $3`,
                [studentId, year, className]
            );
        },
        // Adds links for classes that don't have one yet; never replaces.
        async importPersonal(studentId, year, entries) {
            return db.withTransaction(async (client) => {
                const existing = await client.query(
                    `SELECT COUNT(*)::int AS n FROM canvas_links WHERE student_id = $1 AND school_year = $2`,
                    [studentId, year]
                );
                let room = MAX_PERSONAL_LINKS - existing.rows[0].n;
                let added = 0;
                for (const [className, url] of entries) {
                    if (room <= 0) break;
                    const result = await client.query(
                        `INSERT INTO canvas_links (id, class_name, canvas_url, student_id, school_year, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                         ON CONFLICT (student_id, school_year, class_name) DO NOTHING`,
                        [crypto.randomUUID(), className, url, studentId, year]
                    );
                    if (result.rowCount > 0) {
                        added += 1;
                        room -= 1;
                    }
                }
                return added;
            });
        },
        async findShared(year, classKey, courseId) {
            const result = await db.query(
                `SELECT id FROM canvas_class_links WHERE school_year = $1 AND class_key = $2 AND course_id = $3`,
                [year, classKey, courseId]
            );
            return result.rows[0]?.id || null;
        },
        async countSharedSince(studentId, since) {
            const result = await db.query(
                `SELECT COUNT(*)::int AS n FROM canvas_class_links WHERE submitted_by = $1 AND created_at > $2`,
                [studentId, since]
            );
            return result.rows[0].n;
        },
        async createShared({ year, classKey, className, courseId, studentId, lockedStatus = null }) {
            const id = crypto.randomUUID();
            const result = await db.query(
                `INSERT INTO canvas_class_links (id, class_key, school_year, class_name, course_id, submitted_by, locked_status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                 ON CONFLICT (school_year, class_key, course_id) DO NOTHING
                 RETURNING id`,
                [id, classKey, year, className, courseId, studentId, lockedStatus]
            );
            return result.rows[0]?.id || this.findShared(year, classKey, courseId);
        },
        async getShared(id) {
            const result = await db.query(
                `SELECT id, class_key, class_name, course_id, school_year, submitted_by, locked_status, created_at
                 FROM canvas_class_links WHERE id = $1`,
                [id]
            );
            return result.rows[0] ? toRow(result.rows[0]) : null;
        },
        // vote: 1 backs the link (and drops the student's backing of the class's
        // other links), -1 reports it, 0 clears the student's vote.
        async setVote({ linkId, studentId, vote, year, classKey }) {
            await db.withTransaction(async (client) => {
                // One student's votes on one class are applied one at a time.
                await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`canvas:${studentId}:${year}:${classKey}`]);
                if (vote === 0) {
                    await client.query(
                        `DELETE FROM canvas_class_link_votes WHERE link_id = $1 AND student_id = $2`,
                        [linkId, studentId]
                    );
                    return;
                }
                if (vote === 1) {
                    await client.query(
                        `DELETE FROM canvas_class_link_votes v USING canvas_class_links l
                         WHERE v.link_id = l.id AND v.student_id = $1 AND v.vote = 1
                           AND l.school_year = $2 AND l.class_key = $3 AND l.id <> $4`,
                        [studentId, year, classKey, linkId]
                    );
                }
                await client.query(
                    `INSERT INTO canvas_class_link_votes (link_id, student_id, vote, created_at, updated_at)
                     VALUES ($1, $2, $3, NOW(), NOW())
                     ON CONFLICT (link_id, student_id) DO UPDATE SET vote = EXCLUDED.vote, updated_at = NOW()`,
                    [linkId, studentId, vote]
                );
            });
        },
        async listForClasses(year, classKeys, studentId) {
            if (classKeys.length === 0) return [];
            const result = await db.query(
                `SELECT l.id, l.class_key, l.class_name, l.course_id, l.school_year, l.submitted_by, l.locked_status, l.created_at,
                        ${voteCounts},
                        MAX(CASE WHEN v.student_id = $3 THEN v.vote END) AS my_vote
                 ${fromLinks}
                 WHERE l.school_year = $1 AND l.class_key = ANY($2) AND NOT COALESCE(submitter.blacklisted, FALSE)
                 GROUP BY l.id
                 ORDER BY l.created_at ASC`,
                [year, classKeys, studentId]
            );
            return result.rows.map(toRow);
        },
        async listAll(year) {
            const result = await db.query(
                `SELECT l.id, l.class_key, l.class_name, l.course_id, l.school_year, l.submitted_by, l.locked_status, l.created_at,
                        ${voteCounts}
                 ${fromLinks}
                 WHERE l.school_year = $1
                 GROUP BY l.id
                 ORDER BY l.class_key ASC, l.created_at ASC
                 LIMIT 1000`,
                [year]
            );
            return result.rows.map(toRow);
        },
        async setLock(id, lockedStatus) {
            const result = await db.query(
                `UPDATE canvas_class_links SET locked_status = $2, updated_at = NOW() WHERE id = $1`,
                [id, lockedStatus]
            );
            return result.rowCount > 0;
        },
        async removeShared(id) {
            const result = await db.query(`DELETE FROM canvas_class_links WHERE id = $1`, [id]);
            return result.rowCount > 0;
        },
        // Drops links from earlier school years; votes cascade with their links.
        async pruneBefore(year) {
            const shared = await db.query('DELETE FROM canvas_class_links WHERE school_year < $1', [year]);
            const personal = await db.query('DELETE FROM canvas_links WHERE school_year < $1', [year]);
            return { shared: shared.rowCount || 0, personal: personal.rowCount || 0 };
        }
    };
};

const createMemoryStore = (getMemoryUsers) => {
    const personal = []; // { studentId, year, className, canvasUrl, updatedAt }
    const shared = [];   // { id, classKey, className, courseId, schoolYear, submittedBy, lockedStatus, createdAt }
    const votes = new Map(); // `${linkId}:${studentId}` -> { linkId, studentId, vote }
    const blacklisted = (id) => (getMemoryUsers?.() || []).some(u => String(u.id) === String(id) && u.blacklisted);
    const withCounts = (link, studentId) => {
        let up = 0;
        let down = 0;
        let myVote = 0;
        for (const v of votes.values()) {
            if (v.linkId !== link.id) continue;
            if (v.studentId === studentId) myVote = v.vote;
            if (blacklisted(v.studentId)) continue;
            if (v.vote === 1) up += 1;
            else down += 1;
        }
        return { ...link, up, down, myVote };
    };

    return {
        async listPersonal(studentId, year) {
            return personal
                .filter(l => l.studentId === studentId && l.year === year)
                .sort((a, b) => a.className.localeCompare(b.className));
        },
        async savePersonal(studentId, year, className, url) {
            const existing = personal.find(l => l.studentId === studentId && l.year === year && l.className === className);
            if (existing) {
                existing.canvasUrl = url;
                existing.updatedAt = new Date().toISOString();
                return true;
            }
            if (personal.filter(l => l.studentId === studentId && l.year === year).length >= MAX_PERSONAL_LINKS) return false;
            personal.push({ studentId, year, className, canvasUrl: url, updatedAt: new Date().toISOString() });
            return true;
        },
        async removePersonal(studentId, year, className) {
            const index = personal.findIndex(l => l.studentId === studentId && l.year === year && l.className === className);
            if (index >= 0) personal.splice(index, 1);
        },
        async importPersonal(studentId, year, entries) {
            let added = 0;
            for (const [className, url] of entries) {
                if (personal.some(l => l.studentId === studentId && l.year === year && l.className === className)) continue;
                if (!(await this.savePersonal(studentId, year, className, url))) break;
                added += 1;
            }
            return added;
        },
        async findShared(year, classKey, courseId) {
            return shared.find(l => l.schoolYear === year && l.classKey === classKey && l.courseId === courseId)?.id || null;
        },
        async countSharedSince(studentId, since) {
            return shared.filter(l => l.submittedBy === studentId && new Date(l.createdAt) > since).length;
        },
        async createShared({ year, classKey, className, courseId, studentId, lockedStatus = null }) {
            const existing = await this.findShared(year, classKey, courseId);
            if (existing) return existing;
            const link = {
                id: crypto.randomUUID(),
                classKey,
                className,
                courseId,
                schoolYear: year,
                submittedBy: studentId,
                lockedStatus,
                createdAt: new Date().toISOString()
            };
            shared.push(link);
            return link.id;
        },
        async getShared(id) {
            const link = shared.find(l => l.id === id);
            return link ? { ...link } : null;
        },
        async setVote({ linkId, studentId, vote, year, classKey }) {
            if (vote === 1) {
                const otherIds = new Set(shared
                    .filter(l => l.schoolYear === year && l.classKey === classKey && l.id !== linkId)
                    .map(l => l.id));
                for (const [key, v] of votes) {
                    if (v.studentId === studentId && v.vote === 1 && otherIds.has(v.linkId)) votes.delete(key);
                }
            }
            const key = `${linkId}:${studentId}`;
            if (vote === 0) votes.delete(key);
            else votes.set(key, { linkId, studentId, vote });
        },
        async listForClasses(year, classKeys, studentId) {
            const keys = new Set(classKeys);
            return shared
                .filter(l => l.schoolYear === year && keys.has(l.classKey) && !blacklisted(l.submittedBy))
                .map(l => withCounts(l, studentId));
        },
        async listAll(year) {
            return shared.filter(l => l.schoolYear === year).map(l => withCounts(l, null));
        },
        async setLock(id, lockedStatus) {
            const link = shared.find(l => l.id === id);
            if (!link) return false;
            link.lockedStatus = lockedStatus;
            return true;
        },
        async removeShared(id) {
            const index = shared.findIndex(l => l.id === id);
            if (index < 0) return false;
            shared.splice(index, 1);
            for (const [key, v] of votes) {
                if (v.linkId === id) votes.delete(key);
            }
            return true;
        },
        async pruneBefore(year) {
            const removedLinkIds = new Set(shared.filter(l => l.schoolYear < year).map(l => l.id));
            const sharedBefore = shared.length;
            for (let i = shared.length - 1; i >= 0; i -= 1) {
                if (shared[i].schoolYear < year) shared.splice(i, 1);
            }
            for (const [key, v] of votes) {
                if (removedLinkIds.has(v.linkId)) votes.delete(key);
            }
            const personalBefore = personal.length;
            for (let i = personal.length - 1; i >= 0; i -= 1) {
                if (personal[i].year < year) personal.splice(i, 1);
            }
            return { shared: sharedBefore - shared.length, personal: personalBefore - personal.length };
        }
    };
};

// ---------------------------------------------------------------------------
// Routes.

const registerCanvasLinkRoutes = (app, { db, isDbEnabled, requireStudentAuth, requireAdminAuth, getUserById, isAdminUser, addLog, getMemoryUsers }) => {
    const store = isDbEnabled ? createPgStore(db) : createMemoryStore(getMemoryUsers);
    const writeLimit = makeLimiter(30, 60 * 1000);
    const voteLimit = makeLimiter(40, 60 * 60 * 1000);
    const classCache = new Map(); // studentId -> { at, classes }

    const log = (action, studentId, details) => {
        Promise.resolve(addLog(action, studentId, details)).catch(() => {});
    };

    // Links are kept per school year; clear earlier years' rows on boot and
    // daily so the feature resets each calendar year.
    const pruneOldLinks = async () => {
        try {
            const removed = await store.pruneBefore(currentSchoolYear());
            if (removed.shared || removed.personal) {
                log('CANVAS_LINKS_PRUNE', 'SYSTEM', `Cleared ${removed.shared} shared and ${removed.personal} personal Canvas links from earlier years`);
            }
        } catch (e) {
            console.error('[canvas-links] Failed to prune old links:', e?.message || e);
        }
    };
    pruneOldLinks();
    setInterval(pruneOldLinks, 24 * 60 * 60 * 1000).unref();

    // The student's classes from their own SBHS timetable, or null when auth is
    // bypassed for local development (then any class is accepted).
    const studentClasses = async (req) => {
        if (process.env.BYPASS_AUTH === 'true') return null;
        const studentId = String(req.user.studentId);
        const cached = classCache.get(studentId);
        if (cached && Date.now() - cached.at < CLASS_CACHE_MS) return cached.classes;

        try {
            const response = await fetch(SBHS_TIMETABLE_URL, {
                headers: { Authorization: req.headers.authorization },
                signal: AbortSignal.timeout(8000)
            });
            if (!response.ok) {
                console.error('[canvas-links] SBHS timetable request failed:', { status: response.status, studentId });
                throw new Error(`SBHS timetable request failed (${response.status})`);
            }
            const data = await response.json();
            const classes = extractClasses(data);

            classCache.delete(studentId);
            classCache.set(studentId, { at: Date.now(), classes });
            if (classCache.size > CLASS_CACHE_MAX) classCache.delete(classCache.keys().next().value);
            return classes;
        } catch (e) {
            console.error('[canvas-links] Error fetching student timetable:', { studentId, error: e?.message || e });
            throw e;
        }
    };

    // The class (from the student's timetable) a class key names, or null if
    // they aren't in it.
    const studentClass = async (req, classKey) => {
        const classes = await studentClasses(req);
        if (classes === null) return { key: classKey, name: classKey };
        return classes.get(classKey) || null;
    };

    const isBlacklisted = async (studentId) => {
        try {
            return Boolean((await getUserById(studentId))?.blacklisted);
        } catch {
            return false;
        }
    };

    // Same rule as the admin routes: DB role 'Admin', the ADMIN_IDS bootstrap
    // list, or everyone while auth is bypassed for local development.
    const isAdmin = async (studentId) => {
        if (process.env.BYPASS_AUTH === 'true') return true;
        try {
            return await isAdminUser(studentId);
        } catch {
            return false;
        }
    };

    // Checks every write: rate limit, then blacklist. Sends the error and
    // returns false when the request shouldn't go ahead.
    const allowWrite = async (req, res) => {
        const studentId = String(req.user.studentId);
        if (!writeLimit(studentId)) {
            res.status(429).json({ error: 'rate_limited', message: 'Too many changes at once. Wait a minute and try again.' });
            return false;
        }
        if (await isBlacklisted(studentId)) {
            res.status(403).json({ error: 'blocked', message: 'Your account can’t change Canvas links.' });
            return false;
        }
        return true;
    };

    const communityFor = async (studentId, year, classKeys) => summariseClasses(
        await store.listForClasses(year, classKeys, studentId),
        classKeys
    );

    // Shares a student's Canvas course link with their class, as their vote for
    // it. Returns 'shared', or why it wasn't shared.
    const shareLink = async (req, { classKey, title, courseId }) => {
        const studentId = String(req.user.studentId);
        const year = currentSchoolYear();

        // Check if user is admin first - admins can share for any class
        const adminUser = await isAdmin(studentId);

        let cls;
        // Only verify class membership for non-admins
        if (!adminUser) {
            try {
                cls = await studentClass(req, classKey);
            } catch (e) {
                console.error('[canvas-links] Could not read timetable to share link:', e?.message || e);
                return 'unverified';
            }
            // Match exactly by classKey - the year+shortTitle combination is the source of truth
            if (!cls) {
                console.warn('[canvas-links] Student not in class:', { studentId, classKey, title });
                return 'not_in_class';
            }
        }

        if (!voteLimit(studentId)) return 'limit';
        let linkId = await store.findShared(year, classKey, courseId);
        if (!linkId) {
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
            if (await store.countSharedSince(studentId, since) >= DAILY_SHARED_LIMIT) return 'limit';

            // Auto-approve if user is admin
            const lockedStatus = adminUser ? 'verified' : null;

            // Ensure className includes year for clarity (e.g., "9 Maths 1" not just "Maths 1")
            const className = cls?.name || (title.startsWith(String(year)) ? title : `${year} ${title}`);

            linkId = await store.createShared({ year, classKey, className, courseId, studentId, lockedStatus });
            log('CANVAS_LINK_SHARED', studentId, `Shared course ${courseId} for ${classKey} (${year})${adminUser ? ' [Auto-approved as Admin]' : ''}`);
        } else if (adminUser) {
            // An admin backing a link that's still waiting on votes pins it,
            // unless another admin already hid it.
            const existing = await store.getShared(linkId);
            if (existing && !existing.lockedStatus) {
                await store.setLock(linkId, 'verified');
                log('CANVAS_LINK_MODERATE', studentId, `Auto-verified shared link ${linkId} for ${classKey} (${year})`);
            }
        }
        await store.setVote({ linkId, studentId, vote: 1, year, classKey });
        return 'shared';
    };

    // GET /api/canvas-links - the student's own links for this school year.
    app.get('/api/canvas-links', requireStudentAuth, async (req, res) => {
        const base = { success: true, canvasHost: CANVAS_HOST, schoolYear: currentSchoolYear() };
        try {
            const rows = await store.listPersonal(String(req.user.studentId), base.schoolYear);
            const links = rows
                .map(row => ({ className: row.className, canvasUrl: readStoredUrl(row.canvasUrl) }))
                .filter(link => link.canvasUrl);
            res.json({ ...base, links });
        } catch (e) {
            console.error('Get canvas links error:', e);
            res.status(500).json({ error: 'Failed to load Canvas links' });
        }
    });

    // PUT /api/canvas-links/:className - save one link. With classKey, a Canvas
    // course link is also shared with the class.
    app.put('/api/canvas-links/:className', requireStudentAuth, async (req, res) => {
        try {
            if (!(await allowWrite(req, res))) return;
            const studentId = String(req.user.studentId);
            const className = cleanClassName(req.params.className);
            if (!className) return res.status(400).json({ error: 'invalid_class', message: 'Unknown class.' });

            const parsed = parseLinkInput(req.body?.url);
            if (!parsed) {
                return res.status(400).json({ error: 'invalid_url', message: `That doesn’t look like a link. Paste the course’s address, e.g. https://${CANVAS_HOST}/courses/12345 or https://${WELLIO_HOST}/schools/12345.` });
            }

            const year = currentSchoolYear();
            const saved = await store.savePersonal(studentId, year, className, parsed.url);
            if (!saved) return res.status(400).json({ error: 'too_many', message: `You can save up to ${MAX_PERSONAL_LINKS} links.` });

            let shared = 'not_canvas';
            const classKey = req.body?.classKey;
            if (parsed.courseId && isClassKey(classKey)) {
                try {
                    shared = await shareLink(req, { classKey, title: className, courseId: parsed.courseId });
                    // Provide detailed error messages for specific failure cases
                    if (shared === 'unverified') {
                        console.warn('[canvas-links] Share unverified for student:', { studentId, classKey });
                    } else if (shared === 'not_in_class') {
                        console.warn('[canvas-links] Student not in class:', { studentId, classKey, className });
                    } else if (shared === 'limit') {
                        console.warn('[canvas-links] Rate limited:', { studentId });
                    }
                } catch (e) {
                    console.error('[canvas-links] Share failed:', { studentId, classKey, error: e?.message || e });
                    shared = 'error';
                }
            }

            res.json({
                success: true,
                link: { className, canvasUrl: parsed.url },
                shared,
                community: shared === 'shared' ? (await communityFor(studentId, year, [classKey]))[classKey] : undefined
            });
        } catch (e) {
            console.error('Save canvas link error:', e);
            res.status(500).json({ error: 'Failed to save Canvas link' });
        }
    });

    // DELETE /api/canvas-links/:className - remove one of the student's links.
    app.delete('/api/canvas-links/:className', requireStudentAuth, async (req, res) => {
        try {
            if (!(await allowWrite(req, res))) return;
            const className = cleanClassName(req.params.className);
            if (!className) return res.status(400).json({ error: 'invalid_class', message: 'Unknown class.' });
            await store.removePersonal(String(req.user.studentId), currentSchoolYear(), className);
            res.json({ success: true });
        } catch (e) {
            console.error('Delete canvas link error:', e);
            res.status(500).json({ error: 'Failed to remove Canvas link' });
        }
    });

    // POST /api/canvas-links/import - adds links saved on this device by older
    // versions of the app, for classes that don't have one yet. Never replaces.
    app.post('/api/canvas-links/import', requireStudentAuth, async (req, res) => {
        try {
            if (!(await allowWrite(req, res))) return;
            const links = req.body?.links;
            if (!links || typeof links !== 'object' || Array.isArray(links)) {
                return res.status(400).json({ error: 'Invalid links data' });
            }
            const entries = [];
            for (const [rawName, rawLink] of Object.entries(links).slice(0, MAX_PERSONAL_LINKS)) {
                const className = cleanClassName(rawName);
                const raw = typeof rawLink === 'string' ? rawLink : rawLink?.url;
                const url = readStoredUrl(typeof raw === 'string' ? raw : null);
                if (className && url) entries.push([className, url]);
            }
            const added = await store.importPersonal(String(req.user.studentId), currentSchoolYear(), entries);
            if (added > 0) log('CANVAS_LINKS_IMPORT', String(req.user.studentId), `Imported ${added} Canvas links`);
            res.json({ success: true, added });
        } catch (e) {
            console.error('Import canvas links error:', e);
            res.status(500).json({ error: 'Failed to import Canvas links' });
        }
    });

    // GET /api/canvas-links/community - shared links for the student's classes.
    // Classes come from the student's SBHS timetable; the ?classes= list the
    // client sends is only used if SBHS can't be reached.
    app.get('/api/canvas-links/community', requireStudentAuth, async (req, res) => {
        try {
            const studentId = String(req.user.studentId);
            let classKeys;
            try {
                const classes = await studentClasses(req);
                if (classes) classKeys = [...classes.keys()];
            } catch (e) {
                console.warn('[canvas-links] Timetable unavailable, using client class list:', { studentId, error: e?.message || e });
            }
            if (!classKeys) {
                classKeys = String(req.query.classes || '')
                    .split(',')
                    .map(k => k.trim())
                    .filter(isClassKey)
                    .slice(0, MAX_CLIENT_CLASS_KEYS);
            }
            const year = currentSchoolYear();
            res.json({ success: true, schoolYear: year, classes: await communityFor(studentId, year, classKeys) });
        } catch (e) {
            console.error('Get community canvas links error:', e);
            res.status(500).json({ error: 'Failed to load shared Canvas links' });
        }
    });

    // POST /api/canvas-links/community/:id/vote - { vote: 1 | -1 | 0 }.
    app.post('/api/canvas-links/community/:id/vote', requireStudentAuth, async (req, res) => {
        try {
            if (!(await allowWrite(req, res))) return;
            const studentId = String(req.user.studentId);
            const vote = Number(req.body?.vote);
            if (![1, -1, 0].includes(vote)) return res.status(400).json({ error: 'invalid_vote' });

            const link = await store.getShared(String(req.params.id));
            const year = currentSchoolYear();
            if (!link || link.schoolYear !== year) return res.status(404).json({ error: 'not_found', message: 'That link no longer exists.' });

            let cls;
            try {
                cls = await studentClass(req, link.classKey);
            } catch (e) {
                return res.status(503).json({ error: 'timetable_unavailable', message: 'Couldn’t check your timetable. Try again soon.' });
            }
            if (!cls) return res.status(403).json({ error: 'not_in_class', message: 'Only students in this class can vote on its link.' });
            if (!voteLimit(studentId)) {
                return res.status(429).json({ error: 'rate_limited', message: 'You’ve voted a lot recently. Try again later.' });
            }

            await store.setVote({ linkId: link.id, studentId, vote, year, classKey: link.classKey });
            const community = await communityFor(studentId, year, [link.classKey]);
            res.json({ success: true, classKey: link.classKey, community: community[link.classKey] });
        } catch (e) {
            console.error('Vote canvas link error:', e);
            res.status(500).json({ error: 'Failed to save your vote' });
        }
    });

    // Admin: every shared link this school year, with its votes.
    app.get('/api/admin/canvas-links/community', requireAdminAuth, async (req, res) => {
        try {
            const year = currentSchoolYear();
            const rows = await store.listAll(year);
            res.json({
                success: true,
                schoolYear: year,
                thresholds: { confirmations: CONFIRMATIONS, rejections: REJECTIONS },
                links: rows.map(row => ({
                    id: row.id,
                    classKey: row.classKey,
                    className: row.className,
                    canvasUrl: courseUrl(row.courseId),
                    submittedBy: row.submittedBy,
                    confirmations: row.up,
                    reports: row.down,
                    lockedStatus: row.lockedStatus,
                    status: statusOf(row),
                    createdAt: row.createdAt
                }))
            });
        } catch (e) {
            console.error('Admin list canvas links error:', e);
            res.status(500).json({ error: 'Failed to load shared Canvas links' });
        }
    });

    // Admin: { lockedStatus: 'verified' | 'rejected' | null } pins, hides, or
    // hands the link back to the votes.
    app.put('/api/admin/canvas-links/community/:id', requireAdminAuth, async (req, res) => {
        try {
            const lockedStatus = req.body?.lockedStatus ?? null;
            if (![null, 'verified', 'rejected'].includes(lockedStatus)) return res.status(400).json({ error: 'Invalid status' });
            const id = String(req.params.id);
            if (!(await store.setLock(id, lockedStatus))) return res.status(404).json({ error: 'Not found' });
            log('CANVAS_LINK_MODERATE', String(req.user.studentId), `Set shared Canvas link ${id} to ${lockedStatus || 'votes'}`);
            res.json({ success: true });
        } catch (e) {
            console.error('Admin update canvas link error:', e);
            res.status(500).json({ error: 'Failed to update link' });
        }
    });

    app.delete('/api/admin/canvas-links/community/:id', requireAdminAuth, async (req, res) => {
        try {
            const id = String(req.params.id);
            if (!(await store.removeShared(id))) return res.status(404).json({ error: 'Not found' });
            log('CANVAS_LINK_DELETE', String(req.user.studentId), `Deleted shared Canvas link ${id}`);
            res.json({ success: true });
        } catch (e) {
            console.error('Admin delete canvas link error:', e);
            res.status(500).json({ error: 'Failed to delete link' });
        }
    });
};

module.exports = {
    registerCanvasLinkRoutes,
    // Exported for tests.
    parseLinkInput,
    readStoredUrl,
    extractClasses,
    summariseClasses,
    statusOf
};
