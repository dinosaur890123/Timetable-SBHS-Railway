const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const crypto = require('crypto');
const multer = require('multer');

const compression = require('compression');

const db = require('./db');
const { registerCanvasLinkRoutes } = require('./canvasLinks');
const { guardBypassAuth, securityHeaders, corsOptionsDelegate, makeLimiter, rateLimit, createTokenVerifier } = require('./security');

dotenv.config();
guardBypassAuth();

const app = express();
const PORT = process.env.PORT || 8080;

app.set('trust proxy', 1);
app.disable('x-powered-by');

const allowedOrigins = [
    'https://www.synchron.work',
    'https://synchron.work',
    'http://localhost:5173',
    'http://localhost:3000',
    ...String(process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean)
];

app.use(securityHeaders);
app.use(compression());
app.use(cors(corsOptionsDelegate(allowedOrigins)));
app.use(express.json({ limit: '1mb' }));

let users = [];
let logs = [];
let notes = [];
let feedbackEntries = [];
let assignments = [];
let deletionRequests = [];
let anonymizeCanvasContributions = {
    anonymizeContributor: async () => {},
    anonymizeDeletedContributors: async () => {}
};
let broadcastNotificationsMemory = [];
const broadcastNotificationDismissalsMemory = new Set();
let buildNotesMemory = [
    {
        id: 'initial-build-note',
        version: 'Alpha 0.9.4',
        title: 'Canvas Links Sync & Performance Updates',
        content: `### What's New\n- **Canvas Links Sync**: Your Canvas class links now reliably sync across devices to the backend database.\n- **Direct Protocol Linking**: Fixed issue where custom URLs appended to the site domain.\n- **Optimized Shell & Dock**: Faster page navigation and smoother animations.\n- **Build Notes**: Introducing in-app build notes for tracking releases.`,
        author: 'Synchron Devs',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }
];
let systemState = {
    maintenance: false,
    broadcast: null,
    festiveAmbient: false,
    hiddenPages: ['notes']
};

const statsHistory = [];
const MAX_HISTORY = 20;

const sampleStats = () => {
    statsHistory.push({
        time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        sessions: tokenVerifier.activeCount()
    });
    if (statsHistory.length > MAX_HISTORY) statsHistory.shift();
};
setInterval(sampleStats, 10000).unref();

const isDbEnabled = db.hasDb();
if (!isDbEnabled) {
    console.warn('[admin-db] POSTGRES_URL/DATABASE_URL not set; using in-memory admin storage');
} else {
    (async () => {
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS app_build_notes (
                    id TEXT PRIMARY KEY,
                    version TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    author TEXT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS app_build_notes_created_at_idx ON app_build_notes (created_at DESC);
            `);
            const countRes = await db.query('SELECT COUNT(*) FROM app_build_notes');
            if (parseInt(countRes.rows[0]?.count || '0', 10) === 0 && buildNotesMemory.length > 0) {
                const initNote = buildNotesMemory[0];
                await db.query(`
                    INSERT INTO app_build_notes (id, version, title, content, author, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                    ON CONFLICT (id) DO NOTHING
                `, [initNote.id, initNote.version, initNote.title, initNote.content, initNote.author]);
            }
        } catch (e) {
            console.warn('[build-notes] Table init failed:', e?.message || e);
        }
    })();
}

const toIso = (v) => (v instanceof Date ? v.toISOString() : v);

const addLog = async (action, user, details) => {
    const log = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        action: String(action || '').toUpperCase(),
        user: user || 'SYSTEM',
        details
    };

    if (!isDbEnabled) {
        logs.unshift(log);
        if (logs.length > 100) logs.pop();
        return;
    }

    await db.query(
        'INSERT INTO logs (id, created_at, action, actor, details) VALUES ($1, NOW(), $2, $3, $4)',
        [log.id, log.action, log.user, log.details || null]
    );
};

const FEEDBACK_CATEGORIES = new Set(['error', 'suggestion']);

const generateFeedbackTicket = () => {
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const shortId = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    return `FB-${dateStamp}-${shortId}`;
};

const formatFeedbackRow = (row) => ({
    id: row.id,
    ticketNumber: row.ticket_number,
    studentId: row.student_id,
    category: row.category,
    severity: row.severity,
    details: row.details,
    status: row.status ?? 'open',
    resolvedNotified: row.resolved_notified ?? false,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
});

const consumeFeedbackStatusUpdates = async (studentId) => {
    const notifiedStatuses = ['resolved', 'considering', 'implemented', 'rejected'];
    if (!isDbEnabled) {
        const pending = feedbackEntries.filter(entry => String(entry.studentId) === String(studentId)
            && notifiedStatuses.includes(entry.status) && entry.resolvedNotified === false);
        pending.forEach(entry => { entry.resolvedNotified = true; });
        return pending.map(entry => ({ id: entry.id, ticketNumber: entry.ticketNumber, status: entry.status }));
    }

    const result = await db.query(
        `WITH pending AS (
            UPDATE app_feedback SET resolved_notified = TRUE
            WHERE student_id = $1 AND status IN ('resolved', 'considering', 'implemented', 'rejected') AND resolved_notified = FALSE
            RETURNING id, ticket_number, status
         ) SELECT id, ticket_number, status FROM pending`,
        [String(studentId)]
    );
    return result.rows.map(row => ({ id: row.id, ticketNumber: row.ticket_number, status: row.status }));
};

const SYSTEM_STATE_TTL_MS = 10 * 1000;
let systemStateCache = null;

async function getSystemState() {
    if (isDbEnabled && systemStateCache && Date.now() - systemStateCache.at < SYSTEM_STATE_TTL_MS) {
        return systemStateCache.value;
    }
    const value = await readSystemState();
    if (isDbEnabled) systemStateCache = { at: Date.now(), value };
    return value;
}

async function readSystemState() {
    if (!isDbEnabled) {
        if (systemState.festiveAmbient === undefined) systemState.festiveAmbient = false;
        if (!Array.isArray(systemState.hiddenPages)) systemState.hiddenPages = ['notes'];
        return systemState;
    }

    const result = await db.query('SELECT * FROM system_state WHERE id = 1', []);

    const row = result.rows[0] || { maintenance: false, broadcast_message: null, broadcast_type: null, festive_ambient: false, hidden_pages: ['notes'], updated_at: null };
    let hiddenPages = [];
    if (Array.isArray(row.hidden_pages)) {
        hiddenPages = row.hidden_pages;
    } else if (typeof row.hidden_pages === 'string') {
        try {
            hiddenPages = JSON.parse(row.hidden_pages);
        } catch {
            hiddenPages = [];
        }
    }
    return {
        maintenance: Boolean(row.maintenance),
        broadcast: row.broadcast_message ? { message: row.broadcast_message, type: row.broadcast_type || 'info', id: row.updated_at } : null,
        festiveAmbient: Boolean(row.festive_ambient),
        hiddenPages: Array.isArray(hiddenPages) ? hiddenPages : []
    };
}

async function setFestiveAmbient(enabled) {
    const value = Boolean(enabled);
    if (!isDbEnabled) {
        systemState.festiveAmbient = value;
        return value;
    }

    systemStateCache = null;
    try {
        await db.query(
            'UPDATE system_state SET festive_ambient = $1, updated_at = NOW() WHERE id = 1',
            [value]
        );
    } catch (e) {
        if (!/festive_ambient/.test(e?.message || '')) throw e;
        await db.query('ALTER TABLE system_state ADD COLUMN IF NOT EXISTS festive_ambient BOOLEAN NOT NULL DEFAULT FALSE');
        await db.query(
            'UPDATE system_state SET festive_ambient = $1, updated_at = NOW() WHERE id = 1',
            [value]
        );
    }
    return value;
}

async function setHiddenPages(hiddenPages) {
    const cleanPages = Array.isArray(hiddenPages) ? hiddenPages : [];
    if (!isDbEnabled) {
        systemState.hiddenPages = cleanPages;
        return systemState.hiddenPages;
    }

    systemStateCache = null;
    await db.query(
        'UPDATE system_state SET hidden_pages = $1::jsonb, updated_at = NOW() WHERE id = 1',
        [JSON.stringify(cleanPages)]
    );
    return cleanPages;
}

async function setBroadcast(message, type) {
    if (!isDbEnabled) {
        const ts = new Date().toISOString();
        systemState.broadcast = message ? { message, type: type || 'info', id: ts } : null;
        return systemState.broadcast;
    }

    systemStateCache = null;
    const res = await db.query(
        'UPDATE system_state SET broadcast_message = $1, broadcast_type = $2, updated_at = NOW() WHERE id = 1 RETURNING updated_at',
        [message || null, message ? (type || 'info') : null]
    );

    const ts = res.rows[0]?.updated_at;
    return message ? { message, type: type || 'info', id: ts } : null;
}

const BROADCAST_NOTIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const pruneBroadcastNotificationsMemory = () => {
    const cutoff = Date.now() - BROADCAST_NOTIFICATION_TTL_MS;
    for (let i = broadcastNotificationsMemory.length - 1; i >= 0; i--) {
        if (new Date(broadcastNotificationsMemory[i].createdAt).getTime() < cutoff) {
            const [removed] = broadcastNotificationsMemory.splice(i, 1);
            for (const key of [...broadcastNotificationDismissalsMemory]) {
                if (key.startsWith(`${removed.id}:`)) broadcastNotificationDismissalsMemory.delete(key);
            }
        }
    }
};

const toBroadcastNotification = (n, extra = {}) => ({
    id: n.id,
    message: n.message,
    createdBy: n.created_by ?? n.createdBy ?? null,
    createdByName: n.created_by_name ?? null,
    createdAt: n.created_at instanceof Date ? n.created_at.toISOString() : (n.created_at || n.createdAt),
    dismissals: n.dismissals ?? null,
    ...extra
});

async function createBroadcastNotification(message, createdBy) {
    const record = { id: crypto.randomUUID(), message, createdBy: createdBy || null, createdAt: new Date().toISOString() };
    if (!isDbEnabled) {
        broadcastNotificationsMemory.unshift(record);
        pruneBroadcastNotificationsMemory();
        return record;
    }
    await db.query(
        'INSERT INTO broadcast_notifications (id, message, created_by) VALUES ($1, $2, $3)',
        [record.id, message, record.createdBy]
    );
    await db.query(`DELETE FROM broadcast_notifications WHERE created_at < NOW() - INTERVAL '30 days'`);
    return record;
}

async function listBroadcastNotifications(studentId) {
    if (!isDbEnabled) {
        pruneBroadcastNotificationsMemory();
        const cutoff = Date.now() - BROADCAST_NOTIFICATION_TTL_MS;
        return broadcastNotificationsMemory
            .filter(n => new Date(n.createdAt).getTime() >= cutoff && !broadcastNotificationDismissalsMemory.has(`${n.id}:${studentId}`))
            .map(n => toBroadcastNotification(n));
    }
    await db.query(`DELETE FROM broadcast_notifications WHERE created_at < NOW() - INTERVAL '30 days'`);
    const result = await db.query(
        `SELECT n.id, n.message, n.created_at
         FROM broadcast_notifications n
         WHERE n.created_at > NOW() - INTERVAL '30 days'
           AND NOT EXISTS (
               SELECT 1 FROM broadcast_notification_dismissals d
               WHERE d.broadcast_id = n.id AND d.student_id = $1
           )
         ORDER BY n.created_at DESC LIMIT 50`,
        [String(studentId)]
    );
    return result.rows.map(r => toBroadcastNotification(r));
}

async function dismissBroadcastNotification(id, studentId) {
    if (!isDbEnabled) {
        if (broadcastNotificationsMemory.some(n => n.id === id)) {
            broadcastNotificationDismissalsMemory.add(`${id}:${studentId}`);
        }
        return;
    }
    await db.query(
        `INSERT INTO broadcast_notification_dismissals (broadcast_id, student_id)
         SELECT id, $2 FROM broadcast_notifications WHERE id = $1
         ON CONFLICT DO NOTHING`,
        [id, String(studentId)]
    );
}

async function deleteBroadcastNotification(id) {
    if (!isDbEnabled) {
        const index = broadcastNotificationsMemory.findIndex(n => n.id === id);
        if (index === -1) return false;
        broadcastNotificationsMemory.splice(index, 1);
        for (const key of [...broadcastNotificationDismissalsMemory]) {
            if (key.startsWith(`${id}:`)) broadcastNotificationDismissalsMemory.delete(key);
        }
        return true;
    }
    const result = await db.query('DELETE FROM broadcast_notifications WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
}

async function listBroadcastNotificationHistory() {
    if (!isDbEnabled) {
        pruneBroadcastNotificationsMemory();
        return broadcastNotificationsMemory.map(n => toBroadcastNotification(n, {
            dismissals: [...broadcastNotificationDismissalsMemory].filter(k => k.startsWith(`${n.id}:`)).length
        }));
    }
    const result = await db.query(
        `SELECT n.id, n.message, n.created_by, u.name AS created_by_name, n.created_at,
                (SELECT COUNT(*)::int FROM broadcast_notification_dismissals d WHERE d.broadcast_id = n.id) AS dismissals
         FROM broadcast_notifications n
         LEFT JOIN app_users u ON u.id = n.created_by
         ORDER BY n.created_at DESC LIMIT 100`
    );
    return result.rows.map(r => toBroadcastNotification(r));
}

async function setMaintenance(maintenance) {
    if (!isDbEnabled) {
        systemState.maintenance = Boolean(maintenance);
        return systemState.maintenance;
    }

    systemStateCache = null;
    const result = await db.query(
        'UPDATE system_state SET maintenance = $1, updated_at = NOW() WHERE id = 1 RETURNING maintenance',
        [Boolean(maintenance)]
    );
    return Boolean(result.rows?.[0]?.maintenance);
}

async function listUsers() {
    if (!isDbEnabled) {
        return users;
    }
    const result = await db.query(
        'SELECT id, name, email, role, year, status, joined, last_seen, stripe_customer_id, stripe_subscription_id, subscription_status, show_supporter, blacklisted FROM app_users ORDER BY last_seen DESC, joined DESC',
        []
    );
    return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        year: row.year,
        status: row.status,
        joined: toIso(row.joined),
        lastSeen: toIso(row.last_seen),
        stripeCustomerId: row.stripe_customer_id ?? null,
        stripeSubscriptionId: row.stripe_subscription_id ?? null,
        subscriptionStatus: row.subscription_status ?? null,
        showSupporter: row.show_supporter !== false,
        blacklisted: row.blacklisted ?? false,
    }));
}

async function upsertUser(newUser) {
    if (!isDbEnabled) {
        const userId = String(newUser.id);
        const safeUser = { ...newUser, id: userId };
        const existingIndex = users.findIndex(u => String(u.id) === userId);
        if (existingIndex >= 0) {
            const existing = users[existingIndex];
            users[existingIndex] = {
                ...existing,
                name: safeUser.name || existing.name,
                email: safeUser.email || existing.email,
                year: safeUser.year || existing.year,
                lastSeen: new Date()
            };
            return users[existingIndex];
        }

        const adminIds = getAdminIds();
        const initialRole = adminIds.includes(userId) ? 'Admin' : 'Student';

        const created = {
            id: userId,
            email: safeUser.email,
            name: safeUser.name || null,
            year: safeUser.year || null,
            status: 'Active',
            role: initialRole,
            joined: new Date(),
            lastSeen: new Date(),
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            subscriptionStatus: null,
            showSupporter: true,
            preferences: {},
            blacklisted: false
        };
        users.push(created);
        return created;
    }

    const userId = String(newUser.id);
    const adminIds = getAdminIds();
    const initialRole = adminIds.includes(userId) ? 'Admin' : 'Student';

    const result = await db.query(
        `INSERT INTO app_users (id, email, name, role, year, last_seen)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (id) DO UPDATE SET
           email = COALESCE(EXCLUDED.email, app_users.email),
           name = COALESCE(EXCLUDED.name, app_users.name),
           year = COALESCE(EXCLUDED.year, app_users.year),
           last_seen = NOW()
         RETURNING id, name, email, role, year, status, joined, last_seen, stripe_customer_id, stripe_subscription_id, subscription_status, show_supporter, blacklisted`,
        [userId, newUser.email, newUser.name || null, initialRole, newUser.year || null]
    );

    const row = result.rows[0];
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        year: row.year,
        status: row.status,
        joined: toIso(row.joined),
        lastSeen: toIso(row.last_seen),
        timetable: row.timetable ?? null,
        stripeCustomerId: row.stripe_customer_id ?? null,
        stripeSubscriptionId: row.stripe_subscription_id ?? null,
        subscriptionStatus: row.subscription_status ?? null,
        showSupporter: row.show_supporter !== false,
        blacklisted: row.blacklisted ?? false,
    };
}

async function updateUserById(id, updates) {
    if (updates.role !== undefined && !['Student', 'Admin'].includes(updates.role)) {
        return { error: 'Invalid role. Must be Student or Admin' };
    }

    if (!isDbEnabled) {
        const userIndex = users.findIndex(u => String(u.id) === String(id));
        if (userIndex === -1) return null;

        const allowedUpdates = ['role', 'name', 'year', 'stripeCustomerId', 'stripeSubscriptionId', 'subscriptionStatus', 'showSupporter', 'blacklisted'];
        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) users[userIndex][field] = updates[field];
        });
        return users[userIndex];
    }

    const allowed = {
        role: 'role',
        name: 'name',
        year: 'year',
        stripeCustomerId: 'stripe_customer_id',
        stripeSubscriptionId: 'stripe_subscription_id',
        subscriptionStatus: 'subscription_status',
        showSupporter: 'show_supporter',
        blacklisted: 'blacklisted'
    };

    const sets = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, col] of Object.entries(allowed)) {
        if (updates[key] !== undefined) {
            sets.push(`${col} = $${paramIndex++}`);
            values.push(updates[key]);
        }
    }

    if (sets.length === 0) {
        return { error: 'No valid fields to update' };
    }

    values.push(String(id));
    const result = await db.query(
        `UPDATE app_users SET ${sets.join(', ')} WHERE id = $${paramIndex}
         RETURNING id, name, email, role, year, status, joined, last_seen, timetable, stripe_customer_id, stripe_subscription_id, subscription_status, show_supporter, blacklisted`,
        values
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        year: row.year,
        status: row.status,
        joined: toIso(row.joined),
        lastSeen: toIso(row.last_seen),
        timetable: row.timetable ?? null,
        stripeCustomerId: row.stripe_customer_id ?? null,
        stripeSubscriptionId: row.stripe_subscription_id ?? null,
        subscriptionStatus: row.subscription_status ?? null,
        showSupporter: row.show_supporter !== false,
        blacklisted: row.blacklisted ?? false,
    };
}

async function deleteUserById(id) {
    if (!isDbEnabled) {
        const initialLength = users.length;
        users = users.filter(user => String(user.id) !== String(id));
        return users.length !== initialLength;
    }

    const result = await db.query('DELETE FROM app_users WHERE id = $1 RETURNING id', [String(id)]);
    return result.rows.length > 0;
}

async function deleteStudentData(studentId) {
    const id = String(studentId);
    await anonymizeCanvasContributions.anonymizeContributor(id);
    if (!isDbEnabled) {
        users = users.filter(u => String(u.id) !== id);
        notes = notes.filter(n => String(n.studentId) !== id);
        assignments = assignments.filter(a => String(a.studentId) !== id);
        feedbackEntries = feedbackEntries.filter(f => String(f.studentId) !== id);
        return;
    }

    await db.query('DELETE FROM canvas_class_link_votes WHERE student_id = $1', [id]);
    await db.query('DELETE FROM app_users WHERE id = $1', [id]);
}

async function listLogs(limit = 100) {
    if (!isDbEnabled) return logs;

    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const result = await db.query(
        'SELECT id, created_at, action, actor, details FROM logs ORDER BY created_at DESC LIMIT $1',
        [safeLimit]
    );

    return result.rows.map((row) => ({
        id: row.id,
        timestamp: toIso(row.created_at),
        action: row.action,
        user: row.actor,
        details: row.details,
    }));
}

async function purgeArchivedFeedback() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    try {
        if (!isDbEnabled) {
            const initialLength = feedbackEntries.length;
            feedbackEntries = feedbackEntries.filter(f => {
                const isArchived = f.status === 'archived';
                const createdTime = f.createdAt instanceof Date ? f.createdAt : new Date(f.createdAt);
                const isOlderThan90Days = createdTime < cutoffDate;
                return !(isArchived && isOlderThan90Days);
            });
            const prunedCount = initialLength - feedbackEntries.length;
            if (prunedCount > 0) {
                console.log(`[purge-feedback] Purged ${prunedCount} archived feedback entries from memory fallback.`);
                await addLog('FEEDBACK_PURGE', 'SYSTEM', `Purged ${prunedCount} archived feedback entries (>90 days)`);
            }
        } else {
            const result = await db.query(
                `DELETE FROM app_feedback 
                 WHERE status = 'archived' AND created_at < NOW() - INTERVAL '90 days'`
            );
            const prunedCount = result.rowCount || 0;
            if (prunedCount > 0) {
                console.log(`[purge-feedback] Purged ${prunedCount} archived feedback entries from database.`);
                await addLog('FEEDBACK_PURGE', 'SYSTEM', `Purged ${prunedCount} archived feedback entries (>90 days)`);
            }
        }
    } catch (err) {
        console.error('[purge-feedback] Failed to prune old feedback:', err?.message || err);
    }
}

purgeArchivedFeedback().catch((err) => {
    console.error('[purge-feedback] Initial purge failed:', err);
});
setInterval(() => {
    purgeArchivedFeedback().catch((err) => {
        console.error('[purge-feedback] Interval purge failed:', err);
    });
}, 12 * 60 * 60 * 1000).unref();

addLog('STARTUP', 'SYSTEM', 'Server service started').catch((e) => {
    console.warn('[admin-db] Failed to write startup log:', e?.message || e);
});

const getAdminIds = () => {
    if (process.env.ADMIN_IDS) {
        return process.env.ADMIN_IDS.split(',').map(id => id.trim());
    }
    return ["449130511", "449596935"];
};

const STAGING_ACCESS_RESTRICTED_MESSAGE = 'Access restricted to authorized staging testers.';
const getAllowedStagingUsers = () => String(process.env.ALLOWED_STAGING_USERS || '')
    .split(',')
    .map(userId => userId.trim().toLowerCase())
    .filter(Boolean);
const isAllowedStagingUser = (userData) => {
    const allowedUsers = getAllowedStagingUsers();
    if (allowedUsers.length === 0) return true;
    const studentId = String(userData?.studentId || '').trim().toLowerCase();
    return Boolean(studentId) && allowedUsers.includes(studentId);
};
const rejectRestrictedStagingUser = (res) => res.status(403).json({ error: STAGING_ACCESS_RESTRICTED_MESSAGE });

const fetchSbhsUserInfo = async (token) => {
    try {
        const response = await fetch('https://student.sbhs.net.au/api/details/userinfo.json', {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) return null;
        const user = await response.json();
        return user || null;
    } catch (e) {
        console.error('[auth] SBHS Token validation failed:', e?.message || e);
        return null;
    }
};

const tokenVerifier = createTokenVerifier({
    fetchUserInfo: fetchSbhsUserInfo
});

const verifySbhsToken = async (req) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return tokenVerifier.verify(authHeader.slice('Bearer '.length).trim());
};

const requireStudentAuth = async (req, res, next) => {
    if (process.env.BYPASS_AUTH === 'true') {
        req.user = { studentId: '449130511', givenName: 'Local', surname: 'Admin', email: 'admin@sbhs.nsw.edu.au', yearGroup: '12' };
        if (!isAllowedStagingUser(req.user)) return rejectRestrictedStagingUser(res);
        return next();
    }
    const userData = await verifySbhsToken(req);
    if (!userData) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing SBHS token' });
    }
    if (!isAllowedStagingUser(userData)) return rejectRestrictedStagingUser(res);
    req.user = userData;
    next();
};

async function getUserById(id) {
    if (!isDbEnabled) {
        const u = users.find(u => String(u.id) === String(id));
        if (!u) return null;
        return {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            status: u.status,
            stripeCustomerId: u.stripeCustomerId ?? null,
            stripeSubscriptionId: u.stripeSubscriptionId ?? null,
            subscriptionStatus: u.subscriptionStatus ?? null,
            showSupporter: u.showSupporter !== false,
            blacklisted: u.blacklisted ?? false
        };
    }
    const result = await db.query(
        'SELECT id, name, email, role, status, stripe_customer_id, stripe_subscription_id, subscription_status, show_supporter, blacklisted FROM app_users WHERE id = $1',
        [String(id)]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        status: row.status,
        stripeCustomerId: row.stripe_customer_id ?? null,
        stripeSubscriptionId: row.stripe_subscription_id ?? null,
        subscriptionStatus: row.subscription_status ?? null,
        showSupporter: row.show_supporter !== false,
        blacklisted: row.blacklisted ?? false
    };
}

const requireAdminAuth = async (req, res, next) => {
    if (process.env.BYPASS_AUTH === 'true') {
        req.user = { studentId: '449130511', givenName: 'Local', surname: 'Admin', email: 'admin@sbhs.nsw.edu.au', yearGroup: '12' };
        if (!isAllowedStagingUser(req.user)) return rejectRestrictedStagingUser(res);
        return next();
    }
    const userData = await verifySbhsToken(req);
    if (!userData) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing SBHS token' });
    }
    if (!isAllowedStagingUser(userData)) return rejectRestrictedStagingUser(res);
    const studentId = String(userData.studentId);

    try {
        const dbUser = await getUserById(studentId);
        if (dbUser) {
            if (dbUser.role === 'Admin') {
                req.user = userData;
                return next();
            } else {
                return res.status(403).json({ error: 'Forbidden: Admin access required' });
            }
        }
    } catch (e) {
        console.error('[auth] Database admin check failed:', e?.message || e);
    }

    const adminIds = getAdminIds();
    if (adminIds.includes(studentId)) {
        req.user = userData;
        return next();
    }

    return res.status(403).json({ error: 'Forbidden: Admin access required' });
};

const requireAuth = requireAdminAuth;

app.get('/api/auth/session', requireStudentAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(204).end();
});

const isAdminUser = async (studentId) => {
    try {
        const dbUser = await getUserById(studentId);
        if (dbUser) return dbUser.role === 'Admin';
    } catch (e) {
        console.error('[auth] Admin role check failed:', e?.message || e);
    }
    return getAdminIds().includes(String(studentId));
};

app.post('/api/register', requireStudentAuth, async (req, res) => {
    try {
        const { id, email, name, year } = req.body || {};

        if (!id || !email) {
            return res.status(400).json({ error: 'Missing user ID or email' });
        }

        const userId = String(id);
        if (userId !== String(req.user.studentId)) {
            return res.status(403).json({ error: 'Forbidden: Cannot register details for another student' });
        }

        const safeUser = {
            id: userId,
            email: String(email),
            name: name ? String(name) : null,
            year: year ? String(year) : null
        };

        const dbUser = await upsertUser(safeUser);
        await addLog('REGISTER', `${safeUser.name} (${userId})`, 'User sync/login');

        const feedbackStatusUpdates = await consumeFeedbackStatusUpdates(userId);

        console.log(`User registered/updated: ${safeUser.name} (${userId}). Found ${feedbackStatusUpdates.length} pending feedback status notifications.`);
        res.json({ success: true, user: dbUser, feedbackStatusUpdates, resolvedFeedbacks: feedbackStatusUpdates.filter(entry => entry.status === 'resolved') });
    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ error: 'Failed to register user' });
    }
});

anonymizeCanvasContributions = registerCanvasLinkRoutes(app, {
    db,
    isDbEnabled,
    requireStudentAuth,
    requireAdminAuth,
    getUserById,
    isAdminUser,
    addLog,
    getMemoryUsers: () => users
});
anonymizeCanvasContributions.anonymizeDeletedContributors().catch(err => {
    console.warn('[privacy] Could not anonymize links from previously deleted accounts:', err?.message || err);
});

app.get('/api/users/:id/preferences', requireStudentAuth, async (req, res) => {
    try {
        const requestedId = String(req.params.id);
        const studentId = String(req.user.studentId);

        if (requestedId !== studentId) {
            return res.status(403).json({ error: 'Forbidden: Cannot access another user\'s preferences' });
        }

        let preferences = {};
        if (!isDbEnabled) {
            const userIndex = users.findIndex(u => String(u.id) === studentId);
            if (userIndex !== -1) {
                preferences = users[userIndex].preferences || {};
            }
        } else {
            const result = await db.query(
                'SELECT user_preferences FROM app_users WHERE id = $1',
                [studentId]
            );
            if (result.rows.length > 0) {
                preferences = result.rows[0].user_preferences || {};
            }
        }

        res.json({ success: true, preferences });
    } catch (e) {
        console.error('Fetch preferences error:', e);
        res.status(500).json({ error: 'Failed to fetch preferences' });
    }
});

app.put('/api/users/:id/preferences', requireStudentAuth, async (req, res) => {
    try {
        const requestedId = String(req.params.id);
        const studentId = String(req.user.studentId);
        const { preferences } = req.body || {};

        if (requestedId !== studentId) {
            return res.status(403).json({ error: 'Forbidden: Cannot modify another user\'s preferences' });
        }

        if (!preferences || typeof preferences !== 'object') {
            return res.status(400).json({ error: 'Invalid preferences object' });
        }

        if (!isDbEnabled) {
            const userIndex = users.findIndex(u => String(u.id) === studentId);
            if (userIndex !== -1) {
                users[userIndex].preferences = preferences;
            }
        } else {
            await db.query(
                'UPDATE app_users SET user_preferences = $1 WHERE id = $2',
                [JSON.stringify(preferences), studentId]
            );
        }

        res.json({ success: true, preferences });
    } catch (e) {
        console.error('Update preferences error:', e);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

const escapeHtml = (str) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sendFeedbackNotificationEmail = async ({ ticketNumber, studentId, studentName, senderEmail, category, severity, details, attachment }) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    const toEmail = process.env.FEEDBACK_TO_EMAIL || 'synchron.work@gmail.com';
    const fromEmail = process.env.FEEDBACK_FROM_EMAIL || 'Synchron Feedback <onboarding@resend.dev>';

    const severityLabels = { 1: 'Low', 2: 'Minor', 3: 'Moderate', 4: 'High', 5: 'Critical' };
    const severityText = `${severity}/5 (${severityLabels[severity] || 'Unknown'})`;
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

    const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #18181b; line-height: 1.5;">
            <div style="padding: 20px 24px; border: 1px solid #e4e4e7; border-radius: 12px; background: #ffffff;">
                <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; margin-bottom: 4px;">
                    Synchron Feedback
                </div>
                <h2 style="margin: 0 0 16px; font-size: 18px; font-weight: 600; color: #09090b;">
                    ${escapeHtml(ticketNumber)} &ndash; ${escapeHtml(categoryLabel)}
                </h2>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 14px;">
                    <tr>
                        <td style="padding: 6px 0; color: #71717a; width: 120px;">Severity</td>
                        <td style="padding: 6px 0; font-weight: 500;">${escapeHtml(severityText)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; color: #71717a;">Student ID</td>
                        <td style="padding: 6px 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${escapeHtml(studentId)}</td>
                    </tr>
                    ${studentName ? `
                    <tr>
                        <td style="padding: 6px 0; color: #71717a;">Student Name</td>
                        <td style="padding: 6px 0; font-weight: 500;">${escapeHtml(studentName)}</td>
                    </tr>` : ''}
                    ${senderEmail ? `
                    <tr>
                        <td style="padding: 6px 0; color: #71717a;">Sender Email</td>
                        <td style="padding: 6px 0;"><a href="mailto:${escapeHtml(senderEmail)}" style="color: #2563eb; text-decoration: none;">${escapeHtml(senderEmail)}</a></td>
                    </tr>` : ''}
                </table>
                <div style="padding: 14px 16px; border-radius: 8px; background: #f4f4f5; font-size: 14px; white-space: pre-wrap; color: #27272a;">${escapeHtml(details)}</div>
            </div>
        </div>
    `.trim();

    const payload = {
        from: fromEmail,
        to: [toEmail],
        subject: `[Synchron Feedback] ${ticketNumber} (${categoryLabel}, ${severity}/5)`,
        html,
        text: [
            `Ticket: ${ticketNumber}`,
            `Category: ${categoryLabel}`,
            `Severity: ${severityText}`,
            `Student ID: ${studentId}`,
            studentName ? `Student Name: ${studentName}` : null,
            senderEmail ? `Sender Email: ${senderEmail}` : null,
            '',
            details
        ].filter(line => line !== null).join('\n')
    };

    if (senderEmail) {
        payload.reply_to = senderEmail;
    }

    if (attachment) {
        payload.attachments = [{
            filename: attachment.originalname,
            content: attachment.buffer.toString('base64')
        }];
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Resend API error ${response.status}: ${body}`);
    }
};

const feedbackUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        const allowed = /^image\/(jpeg|png|gif|webp)|video\/(mp4|webm|quicktime)$/;
        cb(null, allowed.test(file.mimetype));
    }
});

app.post('/api/feedback', requireStudentAuth, feedbackUpload.single('attachment'), async (req, res) => {
    try {
        const studentId = String(req.user.studentId);
        const category = String(req.body?.category || '').toLowerCase().trim();
        const severity = Number.parseInt(req.body?.severity, 10);
        const details = String(req.body?.details || '').trim();

        if (!FEEDBACK_CATEGORIES.has(category)) {
            return res.status(400).json({ error: 'Invalid feedback category' });
        }

        if (!Number.isInteger(severity) || severity < 1 || severity > 5) {
            return res.status(400).json({ error: 'Severity must be between 1 and 5' });
        }

        if (details.length < 20) {
            return res.status(400).json({ error: 'Please add more detail to your feedback' });
        }

        const now = new Date();
        const id = crypto.randomUUID();
        const ticketNumber = generateFeedbackTicket();

        let savedFeedback;
        if (!isDbEnabled) {
            savedFeedback = {
                id,
                ticketNumber,
                studentId,
                category,
                severity,
                details,
                status: 'open',
                resolvedNotified: true,
                createdAt: now,
                updatedAt: now
            };
            feedbackEntries.unshift(savedFeedback);
            if (feedbackEntries.length > 200) feedbackEntries.pop();
        } else {
            const result = await db.query(
                `INSERT INTO app_feedback (id, ticket_number, student_id, category, severity, details, status, resolved_notified, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, 'open', TRUE, NOW(), NOW())
                 RETURNING id, ticket_number, student_id, category, severity, details, status, created_at, updated_at`,
                [id, ticketNumber, studentId, category, severity, details]
            );
            savedFeedback = formatFeedbackRow(result.rows[0]);
        }

        await addLog('FEEDBACK', studentId, `Submitted ${category} feedback (${ticketNumber})`);
        const studentName = [req.user?.givenName, req.user?.surname].filter(Boolean).join(' ')
            || req.user?.name
            || req.user?.fullName
            || null;
        sendFeedbackNotificationEmail({
            ticketNumber,
            studentId,
            studentName,
            senderEmail: req.user?.email || null,
            category,
            severity,
            details,
            attachment: req.file || null
        }).catch((err) => {
            console.error('Feedback email notification error:', err.message);
        });
        res.status(201).json({ success: true, ticket: ticketNumber, feedback: savedFeedback });
    } catch (e) {
        console.error('Feedback submit error:', e);
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

app.get('/api/feedback', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);
        if (!isDbEnabled) {
            const entries = feedbackEntries
                .filter(entry => String(entry.studentId) === studentId)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return res.json({ success: true, feedback: entries });
        }

        const result = await db.query(
            `SELECT id, ticket_number, student_id, category, severity, details, status, created_at, updated_at
             FROM app_feedback WHERE student_id = $1 ORDER BY created_at DESC`,
            [studentId]
        );
        res.json({ success: true, feedback: result.rows.map(formatFeedbackRow) });
    } catch (e) {
        console.error('Student feedback list error:', e);
        res.status(500).json({ error: 'Failed to fetch your feedback' });
    }
});

app.get('/api/feedback/notifications', requireStudentAuth, async (req, res) => {
    try {
        const updates = await consumeFeedbackStatusUpdates(String(req.user.studentId));
        res.json({ success: true, feedbackStatusUpdates: updates });
    } catch (e) {
        console.error('Feedback status notification error:', e);
        res.status(500).json({ error: 'Failed to fetch feedback status updates' });
    }
});

app.get('/api/notes', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);
        if (!isDbEnabled) {
            const studentNotes = notes.filter(n => String(n.studentId) === studentId);
            return res.json({ success: true, notes: studentNotes });
        }

        const result = await db.query(
            'SELECT id, subject, title, content, created_at, updated_at FROM app_notes WHERE student_id = $1 ORDER BY updated_at DESC',
            [studentId]
        );

        const formattedNotes = result.rows.map(row => ({
            id: row.id,
            subject: row.subject,
            title: row.title,
            content: row.content,
            createdAt: toIso(row.created_at),
            updatedAt: toIso(row.updated_at)
        }));

        res.json({ success: true, notes: formattedNotes });
    } catch (e) {
        console.error('Fetch notes error:', e);
        res.status(500).json({ error: 'Failed to fetch notes' });
    }
});

app.post('/api/notes', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);
        const { id, subject, title, content } = req.body || {};

        if (!id || !subject || !title || content === undefined) {
            return res.status(400).json({ error: 'Missing required note fields (id, subject, title, content)' });
        }

        const noteId = String(id);
        const noteSubject = String(subject);
        const noteTitle = String(title);
        const noteContent = String(content);
        const now = new Date();

        let savedNote;
        if (!isDbEnabled) {
            const existingIndex = notes.findIndex(n => String(n.id) === noteId);
            if (existingIndex !== -1) {
                if (String(notes[existingIndex].studentId) !== studentId) {
                    return res.status(403).json({ error: 'Forbidden: Cannot edit another student\'s note' });
                }
                notes[existingIndex] = {
                    ...notes[existingIndex],
                    subject: noteSubject,
                    title: noteTitle,
                    content: noteContent,
                    updatedAt: now
                };
                savedNote = notes[existingIndex];
            } else {
                savedNote = {
                    id: noteId,
                    studentId,
                    subject: noteSubject,
                    title: noteTitle,
                    content: noteContent,
                    createdAt: now,
                    updatedAt: now
                };
                notes.push(savedNote);
            }
        } else {
            const existingCheck = await db.query(
                'SELECT student_id FROM app_notes WHERE id = $1',
                [noteId]
            );
            if (existingCheck.rows.length > 0) {
                if (String(existingCheck.rows[0].student_id) !== studentId) {
                    return res.status(403).json({ error: 'Forbidden: Cannot edit another student\'s note' });
                }

                const result = await db.query(
                    'UPDATE app_notes SET subject = $1, title = $2, content = $3, updated_at = NOW() WHERE id = $4 RETURNING id, subject, title, content, created_at, updated_at',
                    [noteSubject, noteTitle, noteContent, noteId]
                );

                const row = result.rows[0];
                savedNote = {
                    id: row.id,
                    subject: row.subject,
                    title: row.title,
                    content: row.content,
                    createdAt: toIso(row.created_at),
                    updatedAt: toIso(row.updated_at)
                };
            } else {
                const result = await db.query(
                    'INSERT INTO app_notes (id, student_id, subject, title, content, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING id, subject, title, content, created_at, updated_at',
                    [noteId, studentId, noteSubject, noteTitle, noteContent]
                );

                const row = result.rows[0];
                savedNote = {
                    id: row.id,
                    subject: row.subject,
                    title: row.title,
                    content: row.content,
                    createdAt: toIso(row.created_at),
                    updatedAt: toIso(row.updated_at)
                };
            }
        }

        res.json({ success: true, note: savedNote });
    } catch (e) {
        console.error('Save note error:', e);
        res.status(500).json({ error: 'Failed to save note' });
    }
});

app.delete('/api/notes/:id', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ error: 'Missing note ID' });
        }

        if (!isDbEnabled) {
            const noteIndex = notes.findIndex(n => String(n.id) === String(id));
            if (noteIndex !== -1) {
                if (String(notes[noteIndex].studentId) !== studentId) {
                    return res.status(403).json({ error: 'Forbidden: Cannot delete another student\'s note' });
                }
                notes.splice(noteIndex, 1);
            }
            return res.json({ success: true });
        }

        const checkResult = await db.query(
            'SELECT student_id FROM app_notes WHERE id = $1',
            [String(id)]
        );

        if (checkResult.rows.length > 0) {
            if (String(checkResult.rows[0].student_id) !== studentId) {
                return res.status(403).json({ error: 'Forbidden: Cannot delete another student\'s note' });
            }

            await db.query(
                'DELETE FROM app_notes WHERE id = $1',
                [String(id)]
            );
        }

        res.json({ success: true });
    } catch (e) {
        console.error('Delete note error:', e);
        res.status(500).json({ error: 'Failed to delete note' });
    }
});

app.get('/api/assignments', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);

        const dbUser = await getUserById(studentId);
        if (!dbUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!isDbEnabled) {
            const studentAssignments = assignments.filter(a => String(a.studentId) === studentId);
            return res.json({ success: true, assignments: studentAssignments });
        }

        const result = await db.query(
            'SELECT id, title, subject, due_date, status, priority, notes, created_at, updated_at FROM app_assignments WHERE student_id = $1 ORDER BY due_date ASC',
            [studentId]
        );

        const formatted = result.rows.map(row => ({
            id: row.id,
            title: row.title,
            subject: row.subject,
            dueDate: toIso(row.due_date),
            status: row.status,
            priority: row.priority,
            notes: row.notes,
            createdAt: toIso(row.created_at),
            updatedAt: toIso(row.updated_at)
        }));

        res.json({ success: true, assignments: formatted });
    } catch (e) {
        console.error('Fetch assignments error:', e);
        res.status(500).json({ error: 'Failed to fetch assignments' });
    }
});

app.post('/api/assignments', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);

        const dbUser = await getUserById(studentId);
        if (!dbUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { id, title, subject, dueDate, status, priority, notes: taskNotes } = req.body || {};

        if (!id || !title || !subject || !dueDate) {
            return res.status(400).json({ error: 'Missing required assignment fields (id, title, subject, dueDate)' });
        }

        const assignmentId = String(id);
        const taskTitle = String(title);
        const taskSubject = String(subject);
        const taskDueDate = String(dueDate);
        const taskStatus = String(status || 'Pending');
        const taskPriority = String(priority || 'Medium');
        const taskNotesStr = String(taskNotes || '');
        const now = new Date();

        let savedAssignment;
        if (!isDbEnabled) {
            const existingIndex = assignments.findIndex(a => String(a.id) === assignmentId);
            if (existingIndex !== -1) {
                if (String(assignments[existingIndex].studentId) !== studentId) {
                    return res.status(403).json({ error: 'Forbidden: Cannot edit another student\'s assignment' });
                }
                assignments[existingIndex] = {
                    ...assignments[existingIndex],
                    title: taskTitle,
                    subject: taskSubject,
                    dueDate: taskDueDate,
                    status: taskStatus,
                    priority: taskPriority,
                    notes: taskNotesStr,
                    updatedAt: now
                };
                savedAssignment = assignments[existingIndex];
            } else {
                savedAssignment = {
                    id: assignmentId,
                    studentId,
                    title: taskTitle,
                    subject: taskSubject,
                    dueDate: taskDueDate,
                    status: taskStatus,
                    priority: taskPriority,
                    notes: taskNotesStr,
                    createdAt: now,
                    updatedAt: now
                };
                assignments.push(savedAssignment);
            }
        } else {
            const existingCheck = await db.query(
                'SELECT student_id FROM app_assignments WHERE id = $1',
                [assignmentId]
            );

            if (existingCheck.rows.length > 0) {
                if (String(existingCheck.rows[0].student_id) !== studentId) {
                    return res.status(403).json({ error: 'Forbidden: Cannot edit another student\'s assignment' });
                }

                const result = await db.query(
                    'UPDATE app_assignments SET title = $1, subject = $2, due_date = $3, status = $4, priority = $5, notes = $6, updated_at = NOW() WHERE id = $7 RETURNING id, title, subject, due_date, status, priority, notes, created_at, updated_at',
                    [taskTitle, taskSubject, taskDueDate, taskStatus, taskPriority, taskNotesStr, assignmentId]
                );

                const row = result.rows[0];
                savedAssignment = {
                    id: row.id,
                    title: row.title,
                    subject: row.subject,
                    dueDate: toIso(row.due_date),
                    status: row.status,
                    priority: row.priority,
                    notes: row.notes,
                    createdAt: toIso(row.created_at),
                    updatedAt: toIso(row.updated_at)
                };
            } else {
                const result = await db.query(
                    'INSERT INTO app_assignments (id, student_id, title, subject, due_date, status, priority, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING id, title, subject, due_date, status, priority, notes, created_at, updated_at',
                    [assignmentId, studentId, taskTitle, taskSubject, taskDueDate, taskStatus, taskPriority, taskNotesStr]
                );

                const row = result.rows[0];
                savedAssignment = {
                    id: row.id,
                    title: row.title,
                    subject: row.subject,
                    dueDate: toIso(row.due_date),
                    status: row.status,
                    priority: row.priority,
                    notes: row.notes,
                    createdAt: toIso(row.created_at),
                    updatedAt: toIso(row.updated_at)
                };
            }
        }

        res.json({ success: true, assignment: savedAssignment });
    } catch (e) {
        console.error('Save assignment error:', e);
        res.status(500).json({ error: 'Failed to save assignment' });
    }
});

app.delete('/api/assignments/:id', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ error: 'Missing assignment ID' });
        }

        const dbUser = await getUserById(studentId);
        if (!dbUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!isDbEnabled) {
            const assignmentIndex = assignments.findIndex(a => String(a.id) === String(id));
            if (assignmentIndex !== -1) {
                if (String(assignments[assignmentIndex].studentId) !== studentId) {
                    return res.status(403).json({ error: 'Forbidden: Cannot delete another student\'s assignment' });
                }
                assignments.splice(assignmentIndex, 1);
            }
            return res.json({ success: true });
        }

        const checkResult = await db.query(
            'SELECT student_id FROM app_assignments WHERE id = $1',
            [String(id)]
        );

        if (checkResult.rows.length > 0) {
            if (String(checkResult.rows[0].student_id) !== studentId) {
                return res.status(403).json({ error: 'Forbidden: Cannot delete another student\'s assignment' });
            }

            await db.query(
                'DELETE FROM app_assignments WHERE id = $1',
                [String(id)]
            );
        }

        res.json({ success: true });
    } catch (e) {
        console.error('Delete assignment error:', e);
        res.status(500).json({ error: 'Failed to delete assignment' });
    }
});

app.post('/api/users/promote', requireAuth, async (req, res) => {
    try {
        const { studentId } = req.body || {};
        if (!studentId) {
            return res.status(400).json({ error: 'Missing student ID' });
        }

        const id = String(studentId).trim();
        const defaultEmail = `${id}@student.sbhs.nsw.edu.au`;
        const defaultName = `Admin (${id})`;

        let promotedUser;
        if (!isDbEnabled) {
            const existingIndex = users.findIndex(u => String(u.id) === id);
            if (existingIndex >= 0) {
                users[existingIndex].role = 'Admin';
                promotedUser = users[existingIndex];
            } else {
                promotedUser = {
                    id,
                    email: defaultEmail,
                    name: defaultName,
                    role: 'Admin',
                    status: 'Active',
                    joined: new Date(),
                    lastSeen: new Date(),
                    timetable: null
                };
                users.push(promotedUser);
            }
        } else {
            const result = await db.query(
                `INSERT INTO app_users (id, email, name, role, status, last_seen)
                 VALUES ($1, $2, $3, 'Admin', 'Active', NOW())
                 ON CONFLICT (id) DO UPDATE SET
                   role = 'Admin',
                   last_seen = NOW()
                 RETURNING id, name, email, role, year, status, joined, last_seen, timetable`,
                [id, defaultEmail, defaultName]
            );
            promotedUser = result.rows[0];
        }

        await addLog('PROMOTE', req.user?.studentId || 'ADMIN', `Promoted ${id} to Admin`);
        res.json({ success: true, user: promotedUser });
    } catch (e) {
        console.error('Promote error:', e);
        res.status(500).json({ error: 'Failed to promote user to Admin' });
    }
});

app.put('/api/users/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body || {};

        const updated = await updateUserById(id, updates);
        if (!updated) return res.status(404).json({ error: 'User not found' });
        if (updated?.error) return res.status(400).json({ error: updated.error });

        await addLog('UPDATE', updated.name || updated.id, `Updated fields: ${Object.keys(updates).join(', ')} by Admin (${req.user?.studentId || 'unknown'})`);

        res.json({ success: true, user: updated });
    } catch (e) {
        console.error('Update user error:', e);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

app.get('/api/stats', requireAuth, async (req, res) => {
    try {
        const allUsers = await listUsers();
        const state = await getSystemState();

        const isPostgresDb = isDbEnabled;
        let dbHealth = 'Offline';
        let accountsDeletedPastMonth = 0;
        if (isPostgresDb) {
            try {
                await db.query('SELECT 1');
                dbHealth = 'Online';
                const deletedResult = await db.query(
                    `SELECT COUNT(*)::int AS count FROM logs
                     WHERE action = 'PRIVACY'
                       AND created_at >= NOW() - INTERVAL '30 days'
                       AND (details = 'Self-service account deletion'
                         OR details LIKE 'Fulfilled data deletion request%')`
                );
                accountsDeletedPastMonth = Number(deletedResult.rows[0]?.count || 0);
            } catch (e) {
                dbHealth = `Error: ${e?.message || e}`;
            }
        } else {
            const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
            accountsDeletedPastMonth = logs.filter(log => {
                const deleted = String(log.details || '') === 'Self-service account deletion'
                    || String(log.details || '').startsWith('Fulfilled data deletion request');
                return log.action === 'PRIVACY' && deleted && new Date(log.timestamp).getTime() >= cutoff;
            }).length;
        }

        const yearBreakdown = {};
        if (isPostgresDb && dbHealth === 'Online') {
            try {
                const yrResult = await db.query(
                    "SELECT COALESCE(year, 'Unknown') as year_val, COUNT(*) as count FROM app_users GROUP BY year_val ORDER BY year_val",
                    []
                );
                yrResult.rows.forEach(r => {
                    yearBreakdown[r.year_val] = Number(r.count);
                });
            } catch (e) {
                console.error('Failed to query year groups:', e);
            }
        } else {
            allUsers.forEach(u => {
                const yr = u.year || 'Unknown';
                yearBreakdown[yr] = (yearBreakdown[yr] || 0) + 1;
            });
        }

        const now = new Date();
        let activeToday = 0;
        let activeThisWeek = 0;
        const growthByDate = {};
        const classCounts = {};

        allUsers.forEach(u => {
            const lastSeenStr = u.lastSeen || u.joined;
            const lastSeen = lastSeenStr ? new Date(lastSeenStr) : null;
            if (lastSeen) {
                const diffMs = now - lastSeen;
                const diffDays = diffMs / (1000 * 60 * 60 * 24);
                if (diffDays <= 1) activeToday++;
                if (diffDays <= 7) activeThisWeek++;
            }

            const joinedStr = u.joined;
            const joined = joinedStr ? new Date(joinedStr) : null;
            if (joined) {
                const dateStr = new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'Australia/Sydney',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                }).format(joined);
                growthByDate[dateStr] = (growthByDate[dateStr] || 0) + 1;
            }

            if (u.timetable) {
                const innerTimetable = u.timetable.timetable?.timetable || u.timetable.timetable || u.timetable;
                const countPeriod = (key, p) => {
                    const isBreak = ["R", "L", "RC"].includes(key);
                    if (!isBreak && p && p.title) {
                        const title = String(p.title).trim();
                        if (title && title.length > 1) {
                            classCounts[title] = (classCounts[title] || 0) + 1;
                        }
                    }
                };

                if (innerTimetable?.periods) {
                    Object.entries(innerTimetable.periods).forEach(([key, p]) => countPeriod(key, p));
                } else if (innerTimetable?.days) {
                    Object.values(innerTimetable.days).forEach(day => {
                        if (day && day.periods) {
                            Object.entries(day.periods).forEach(([key, p]) => countPeriod(key, p));
                        }
                    });
                }
            }
        });

        const sydneyDateKey = (date) => new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Australia/Sydney',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(date);
        const sydneyToday = sydneyDateKey(new Date());
        const [sydneyYear, sydneyMonth, sydneyDay] = sydneyToday.split('-').map(Number);
        const growthData = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date(Date.UTC(sydneyYear, sydneyMonth - 1, sydneyDay - i));
            const dateStr = sydneyDateKey(d);
            growthData.push({
                date: dateStr,
                count: growthByDate[dateStr] || 0
            });
        }

        const popularClasses = Object.entries(classCounts)
            .map(([title, count]) => ({ title, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);

        res.json({
            totalUsers: allUsers.length,
            accountsDeletedPastMonth,
            systemStatus: state.maintenance ? 'Maintenance' : 'Operational',
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage().heapUsed,
            festiveAmbient: Boolean(state.festiveAmbient),
            hiddenPages: state.hiddenPages || [],
            activeSessions: tokenVerifier.activeCount(),
            history: statsHistory,

            yearDistribution: yearBreakdown,

            activeToday,
            activeThisWeek,
            growthData,
            popularClasses,

            databaseConfigured: !!process.env.DATABASE_URL,
            databaseStatus: dbHealth,
            nodeVersion: process.version,
            platform: process.platform,
            bypassAuthEnabled: process.env.BYPASS_AUTH === 'true',
            adminCount: getAdminIds().length
        });
    } catch (e) {
        console.error('Stats error:', e);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

app.get('/api/logs', requireAuth, async (req, res) => {
    try {
        const out = await listLogs(100);
        res.json(out);
    } catch (e) {
        console.error('Logs error:', e);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

app.post('/api/broadcast', requireAuth, async (req, res) => {
    try {
        const { message, type } = req.body || {};

        if (message && type === 'notification') {
            const notification = await createBroadcastNotification(message, req.user?.studentId);
            await addLog('BROADCAST', 'ADMIN', `Notification broadcast: "${message}"`);
            return res.json({ success: true, broadcast: null, notification });
        }

        const broadcast = await setBroadcast(message, type);

        if (message) await addLog('BROADCAST', 'ADMIN', `Global alert: "${message}"`);
        else await addLog('BROADCAST', 'ADMIN', 'Cleared global alert');

        res.json({ success: true, broadcast });
    } catch (e) {
        console.error('Broadcast error:', e);
        res.status(500).json({ error: 'Failed to set broadcast' });
    }
});

app.get('/api/broadcast', requireAuth, async (req, res) => {
    try {
        const state = await getSystemState();
        res.json(state.broadcast);
    } catch (e) {
        console.error('Get broadcast error:', e);
        res.status(500).json({ error: 'Failed to fetch broadcast' });
    }
});

app.get('/api/broadcast/notifications', requireStudentAuth, async (req, res) => {
    try {
        const notifications = await listBroadcastNotifications(String(req.user.studentId));
        res.json({ notifications });
    } catch (e) {
        console.error('Broadcast notifications error:', e);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

app.post('/api/broadcast/notifications/:id/dismiss', requireStudentAuth, async (req, res) => {
    try {
        await dismissBroadcastNotification(req.params.id, String(req.user.studentId));
        res.json({ success: true });
    } catch (e) {
        console.error('Dismiss broadcast notification error:', e);
        res.status(500).json({ error: 'Failed to dismiss notification' });
    }
});

app.get('/api/broadcast/history', requireAuth, async (req, res) => {
    try {
        const notifications = await listBroadcastNotificationHistory();
        res.json({ notifications });
    } catch (e) {
        console.error('Broadcast history error:', e);
        res.status(500).json({ error: 'Failed to fetch broadcast history' });
    }
});

app.delete('/api/broadcast/history/:id', requireAuth, async (req, res) => {
    try {
        const deleted = await deleteBroadcastNotification(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Broadcast notification not found' });
        await addLog('BROADCAST', 'ADMIN', `Deleted notification broadcast ${req.params.id}`);
        res.json({ success: true });
    } catch (e) {
        console.error('Delete broadcast notification error:', e);
        res.status(500).json({ error: 'Failed to delete broadcast notification' });
    }
});

app.get('/api/system/status', (req, res) => {
    (async () => {
        try {
            const state = await getSystemState();
            res.json({
                maintenance: state.maintenance,
                broadcast: state.broadcast,
                festiveAmbient: Boolean(state.festiveAmbient),
                hiddenPages: state.hiddenPages || []
            });
        } catch (e) {
            console.error('System status error:', e);
            res.status(500).json({ error: 'Failed to fetch system status' });
        }
    })();
});

app.post('/api/maintenance', requireAuth, async (req, res) => {
    try {
        const { maintenance } = req.body || {};
        const newValue = await setMaintenance(maintenance);

        await addLog('MAINTENANCE', 'ADMIN', `System maintenance mode ${newValue ? 'ENABLED' : 'DISABLED'}`);

        res.json({ success: true, maintenance: newValue });
    } catch (e) {
        console.error('Maintenance error:', e);
        res.status(500).json({ error: 'Failed to toggle maintenance' });
    }
});

app.post('/api/maintenance/prune-logs', requireAuth, async (req, res) => {
    try {
        let deletedCount = 0;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);

        if (!isDbEnabled) {
            const initialLength = logs.length;
            logs = logs.filter(l => new Date(l.timestamp) >= cutoffDate);
            deletedCount = initialLength - logs.length;
        } else {
            const result = await db.query(
                "DELETE FROM logs WHERE created_at < NOW() - INTERVAL '30 days' RETURNING id",
                []
            );
            deletedCount = result.rows.length;
        }

        await addLog('MAINTENANCE', req.user?.studentId || 'ADMIN', `Pruned ${deletedCount} logs older than 30 days`);
        res.json({ success: true, count: deletedCount });
    } catch (e) {
        console.error('Prune logs error:', e);
        res.status(500).json({ error: 'Failed to prune old logs' });
    }
});

app.post('/api/system/festive-ambient', requireAuth, async (req, res) => {
    try {
        const { enabled } = req.body || {};
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled must be a boolean' });
        }
        const festiveAmbient = await setFestiveAmbient(enabled);
        await addLog('SETTINGS', req.user?.studentId || 'ADMIN', `Festive ambient light ${festiveAmbient ? 'ENABLED' : 'DISABLED'} for all students`);
        res.json({ success: true, festiveAmbient });
    } catch (e) {
        console.error('Update festive ambient error:', e);
        res.status(500).json({ error: 'Failed to update festive ambient setting' });
    }
});

app.get('/api/system/hidden-pages', async (req, res) => {
    try {
        const state = await getSystemState();
        res.json({ hiddenPages: state.hiddenPages || [] });
    } catch (e) {
        console.error('Get hidden pages error:', e);
        res.status(500).json({ error: 'Failed to fetch hidden pages' });
    }
});

app.post('/api/system/hidden-pages', requireAuth, async (req, res) => {
    try {
        const { hiddenPages } = req.body || {};
        if (!Array.isArray(hiddenPages)) {
            return res.status(400).json({ error: 'hiddenPages must be an array' });
        }
        const updated = await setHiddenPages(hiddenPages);
        await addLog('SETTINGS', req.user?.studentId || 'ADMIN', `Updated hidden pages: ${updated.join(', ') || 'none'}`);
        res.json({ success: true, hiddenPages: updated });
    } catch (e) {
        console.error('Update hidden pages error:', e);
        res.status(500).json({ error: 'Failed to update hidden pages' });
    }
});

app.get('/api/build-notes', async (req, res) => {
    try {
        if (!isDbEnabled) {
            return res.json({ success: true, notes: buildNotesMemory });
        }
        const result = await db.query(
            'SELECT id, version, title, content, author, created_at, updated_at FROM app_build_notes ORDER BY created_at DESC'
        );
        const notes = result.rows.map(row => ({
            id: row.id,
            version: row.version,
            title: row.title,
            content: row.content,
            author: row.author,
            createdAt: toIso(row.created_at),
            updatedAt: toIso(row.updated_at)
        }));
        res.json({ success: true, notes });
    } catch (e) {
        console.error('Failed to fetch build notes:', e);
        res.json({ success: true, notes: buildNotesMemory });
    }
});

app.get('/api/admin/build-notes', requireAuth, async (req, res) => {
    try {
        if (!isDbEnabled) {
            return res.json({ success: true, notes: buildNotesMemory });
        }
        const result = await db.query(
            'SELECT id, version, title, content, author, created_at, updated_at FROM app_build_notes ORDER BY created_at DESC'
        );
        const notes = result.rows.map(row => ({
            id: row.id,
            version: row.version,
            title: row.title,
            content: row.content,
            author: row.author,
            createdAt: toIso(row.created_at),
            updatedAt: toIso(row.updated_at)
        }));
        res.json({ success: true, notes });
    } catch (e) {
        console.error('Admin fetch build notes error:', e);
        res.status(500).json({ error: 'Failed to fetch build notes' });
    }
});

app.post('/api/admin/build-notes', requireAuth, async (req, res) => {
    try {
        const { id, version, title, content, author } = req.body || {};
        if (!version || !title || !content) {
            return res.status(400).json({ error: 'Version, title, and content are required' });
        }

        const noteId = id || crypto.randomUUID();
        const noteAuthor = (author && String(author).trim()) || req.user?.givenName || 'Dev Team';
        const now = new Date();

        if (!isDbEnabled) {
            const existingIdx = buildNotesMemory.findIndex(n => n.id === noteId);
            const noteObj = {
                id: noteId,
                version: String(version).trim(),
                title: String(title).trim(),
                content: String(content).trim(),
                author: noteAuthor,
                createdAt: existingIdx >= 0 ? buildNotesMemory[existingIdx].createdAt : now.toISOString(),
                updatedAt: now.toISOString()
            };
            if (existingIdx >= 0) {
                buildNotesMemory[existingIdx] = noteObj;
            } else {
                buildNotesMemory.unshift(noteObj);
            }
            await addLog('BUILD_NOTES_SAVE', req.user?.studentId || 'ADMIN', `Saved build note ${version} (${title})`);
            return res.json({ success: true, note: noteObj });
        }

        const result = await db.query(`
            INSERT INTO app_build_notes (id, version, title, content, author, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET
                version = EXCLUDED.version,
                title = EXCLUDED.title,
                content = EXCLUDED.content,
                author = EXCLUDED.author,
                updated_at = NOW()
            RETURNING id, version, title, content, author, created_at, updated_at
        `, [noteId, String(version).trim(), String(title).trim(), String(content).trim(), noteAuthor]);

        const savedRow = result.rows[0];
        const savedNote = {
            id: savedRow.id,
            version: savedRow.version,
            title: savedRow.title,
            content: savedRow.content,
            author: savedRow.author,
            createdAt: toIso(savedRow.created_at),
            updatedAt: toIso(savedRow.updated_at)
        };

        await addLog('BUILD_NOTES_SAVE', req.user?.studentId || 'ADMIN', `Saved build note ${version} (${title})`);
        res.json({ success: true, note: savedNote });
    } catch (e) {
        console.error('Save build note error:', e);
        res.status(500).json({ error: 'Failed to save build note' });
    }
});

app.delete('/api/admin/build-notes/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 'Missing note ID' });

        if (!isDbEnabled) {
            buildNotesMemory = buildNotesMemory.filter(n => n.id !== id);
            await addLog('BUILD_NOTES_DELETE', req.user?.studentId || 'ADMIN', `Deleted build note ${id}`);
            return res.json({ success: true, message: 'Build note deleted' });
        }

        await db.query('DELETE FROM app_build_notes WHERE id = $1', [id]);
        await addLog('BUILD_NOTES_DELETE', req.user?.studentId || 'ADMIN', `Deleted build note ${id}`);
        res.json({ success: true, message: 'Build note deleted' });
    } catch (e) {
        console.error('Delete build note error:', e);
        res.status(500).json({ error: 'Failed to delete build note' });
    }
});

app.get('/api/users', requireAuth, async (req, res) => {
    try {
        const out = await listUsers();
        res.json(out);
    } catch (e) {
        console.error('Users error:', e);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.delete('/api/users/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const ok = await deleteUserById(id);
        await addLog('DELETE', id, 'User deleted manually');

        if (!ok) return res.status(404).json({ error: 'User not found' });

        res.json({ success: true, message: 'User deleted successfully' });
    } catch (e) {
        console.error('Delete user error:', e);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

const DELETION_REQUEST_COLS = 'id, student_id, name, email, status, created_at, updated_at';

const formatDeletionRequest = (row) => ({
    id: row.id,
    studentId: row.student_id ?? row.studentId,
    name: row.name ?? null,
    email: row.email ?? null,
    status: row.status ?? 'pending',
    createdAt: toIso(row.created_at ?? row.createdAt),
    updatedAt: toIso(row.updated_at ?? row.updatedAt)
});

const findPendingDeletionRequest = async (studentId) => {
    if (!isDbEnabled) {
        return deletionRequests.find(r => String(r.studentId) === studentId && r.status === 'pending') || null;
    }
    const result = await db.query(
        `SELECT ${DELETION_REQUEST_COLS} FROM data_deletion_requests WHERE student_id = $1 AND status = 'pending'`,
        [studentId]
    );
    return result.rows.length > 0 ? formatDeletionRequest(result.rows[0]) : null;
};

app.get('/api/privacy/deletion-request', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);
        let request = null;
        if (!isDbEnabled) {
            request = deletionRequests.find(r => String(r.studentId) === studentId) || null;
        } else {
            const result = await db.query(
                `SELECT ${DELETION_REQUEST_COLS} FROM data_deletion_requests WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1`,
                [studentId]
            );
            if (result.rows.length > 0) request = formatDeletionRequest(result.rows[0]);
        }
        res.json({ request: request ? formatDeletionRequest(request) : null });
    } catch (e) {
        console.error('Deletion request fetch error:', e);
        res.status(500).json({ error: 'Failed to fetch deletion request' });
    }
});

app.post('/api/privacy/deletion-request', requireStudentAuth, async (req, res) => {
    try {
        if (req.body?.confirmation !== 'CONFIRM') {
            return res.status(400).json({ error: 'Type CONFIRM to continue. The word is case-sensitive.' });
        }
        const studentId = String(req.user.studentId);
        const isAdmin = await isAdminUser(studentId);
        if (!isAdmin) {
            await deleteStudentData(studentId);
            if (!isDbEnabled) {
                deletionRequests = deletionRequests.filter(r => String(r.studentId) !== studentId);
            } else {
                await db.query('DELETE FROM data_deletion_requests WHERE student_id = $1', [studentId]);
            }
            await addLog('PRIVACY', 'SYSTEM', 'Self-service account deletion');
            return res.json({ success: true, deleted: true });
        }

        const name = [req.user.givenName, req.user.surname].filter(Boolean).join(' ').trim() || null;
        const email = req.user.email ? String(req.user.email) : null;

        const existing = await findPendingDeletionRequest(studentId);
        if (existing) {
            return res.status(200).json({ success: true, request: existing, alreadyRequested: true });
        }

        let request;
        if (!isDbEnabled) {
            const now = new Date();
            request = { id: crypto.randomUUID(), studentId, name, email, status: 'pending', createdAt: now, updatedAt: now };
            deletionRequests.unshift(request);
        } else {
            const result = await db.query(
                `INSERT INTO data_deletion_requests (id, student_id, name, email, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())
                 RETURNING ${DELETION_REQUEST_COLS}`,
                [crypto.randomUUID(), studentId, name, email]
            );
            request = formatDeletionRequest(result.rows[0]);
        }

        await addLog('PRIVACY', studentId, 'Requested deletion of all server-side data');
        res.status(201).json({ success: true, request: formatDeletionRequest(request) });
    } catch (e) {
        if (e?.code === '23505') {
            try {
                const studentId = String(req.user.studentId);
                const existing = await findPendingDeletionRequest(studentId);
                if (existing) return res.status(200).json({ success: true, request: existing, alreadyRequested: true });
            } catch {}
        }
        console.error('Deletion request submit error:', e);
        res.status(500).json({ error: 'Failed to submit deletion request' });
    }
});

app.get('/api/admin/deletion-requests', requireAuth, async (req, res) => {
    try {
        let requests;
        if (!isDbEnabled) {
            requests = deletionRequests.map(r => {
                const u = users.find(user => String(user.id) === String(r.studentId));
                return {
                    ...formatDeletionRequest(r),
                    name: u?.name || r.name || 'Unknown Student',
                    email: u?.email || r.email || `${r.studentId}@student.sbhs.nsw.edu.au`
                };
            });
        } else {
            const result = await db.query(
                `SELECT d.id, d.student_id, d.name, d.email, d.status, d.created_at, d.updated_at,
                        u.name AS user_name, u.email AS user_email
                 FROM data_deletion_requests d
                 LEFT JOIN app_users u ON d.student_id = u.id
                 ORDER BY d.created_at DESC`
            );
            requests = result.rows.map(row => ({
                ...formatDeletionRequest(row),
                name: row.user_name || row.name || 'Unknown Student',
                email: row.user_email || row.email || `${row.student_id}@student.sbhs.nsw.edu.au`
            }));
        }
        res.json(requests);
    } catch (e) {
        console.error('Deletion requests list error:', e);
        res.status(500).json({ error: 'Failed to fetch deletion requests' });
    }
});

app.put('/api/admin/deletion-requests/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body || {};
        if (!['completed', 'dismissed'].includes(status)) {
            return res.status(400).json({ error: 'Status must be completed or dismissed' });
        }

        let existing = null;
        if (!isDbEnabled) {
            existing = deletionRequests.find(r => String(r.id) === String(id)) || null;
        } else {
            const found = await db.query(
                `SELECT ${DELETION_REQUEST_COLS} FROM data_deletion_requests WHERE id = $1`,
                [String(id)]
            );
            if (found.rows.length > 0) existing = formatDeletionRequest(found.rows[0]);
        }
        if (!existing) return res.status(404).json({ error: 'Request not found' });
        if (existing.status !== 'pending') return res.status(409).json({ error: 'Request already resolved' });

        if (status === 'completed') {
            await deleteStudentData(existing.studentId);
        }

        let updated;
        if (!isDbEnabled) {
            existing.status = status;
            existing.updatedAt = new Date();
            updated = formatDeletionRequest(existing);
        } else {
            const result = await db.query(
                `UPDATE data_deletion_requests SET status = $1, updated_at = NOW()
                 WHERE id = $2 RETURNING ${DELETION_REQUEST_COLS}`,
                [status, String(id)]
            );
            updated = formatDeletionRequest(result.rows[0]);
        }

        await addLog('PRIVACY', req.user?.studentId || 'ADMIN',
            `${status === 'completed' ? 'Fulfilled' : 'Dismissed'} data deletion request for ${existing.studentId || id}`);
        res.json({ success: true, request: updated });
    } catch (e) {
        console.error('Deletion request update error:', e);
        res.status(500).json({ error: 'Failed to update deletion request' });
    }
});

app.get('/api/admin/feedback', requireAuth, async (req, res) => {
    try {
        let entries = [];
        if (!isDbEnabled) {
            entries = feedbackEntries.map(f => {
                const u = users.find(user => String(user.id) === String(f.studentId));
                return {
                    ...f,
                    name: u ? u.name : 'Unknown Student',
                    email: u ? u.email : `${f.studentId}@student.sbhs.nsw.edu.au`
                };
            });
        } else {
            const result = await db.query(
                `SELECT f.id, f.ticket_number, f.student_id, f.category, f.severity, f.details, f.status, f.created_at, f.updated_at, u.name, u.email
                 FROM app_feedback f
                 LEFT JOIN app_users u ON f.student_id = u.id
                 ORDER BY f.created_at DESC`
            );
            entries = result.rows.map(row => ({
                id: row.id,
                ticketNumber: row.ticket_number,
                studentId: row.student_id,
                category: row.category,
                severity: row.severity,
                details: row.details,
                status: row.status,
                createdAt: toIso(row.created_at),
                updatedAt: toIso(row.updated_at),
                name: row.name || 'Unknown Student',
                email: row.email || `${row.student_id}@student.sbhs.nsw.edu.au`
            }));
        }
        res.json(entries);
    } catch (e) {
        console.error('Feedback list error:', e);
        res.status(500).json({ error: 'Failed to fetch feedback entries' });
    }
});

app.put('/api/admin/feedback/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body || {};

        if (!status || !['open', 'resolved', 'archived', 'considering', 'implemented', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid feedback status.' });
        }

        let updatedEntry;
        if (!isDbEnabled) {
            const index = feedbackEntries.findIndex(f => String(f.id) === String(id));
            if (index === -1) {
                return res.status(404).json({ error: 'Feedback entry not found' });
            }
            if (feedbackEntries[index].status !== status) {
                feedbackEntries[index].resolvedNotified = false;
            }
            feedbackEntries[index].status = status;
            feedbackEntries[index].updatedAt = new Date();
            updatedEntry = feedbackEntries[index];
        } else {
            const result = await db.query(
                `UPDATE app_feedback 
                 SET status = $1, resolved_notified = CASE WHEN status IS DISTINCT FROM $1 THEN FALSE ELSE resolved_notified END, updated_at = NOW()
                 WHERE id = $2 
                 RETURNING id, ticket_number, student_id, category, severity, details, status, resolved_notified, created_at, updated_at`,
                [status, String(id)]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Feedback entry not found' });
            }
            updatedEntry = formatFeedbackRow(result.rows[0]);
        }

        await addLog('FEEDBACK_UPDATE', req.user?.studentId || 'ADMIN', `Updated feedback ${updatedEntry.ticketNumber || id} status to ${status}`);
        res.json({ success: true, feedback: updatedEntry });
    } catch (e) {
        console.error('Feedback update error:', e);
        res.status(500).json({ error: 'Failed to update feedback entry' });
    }
});

app.delete('/api/admin/feedback/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        let ok = false;
        let ticketNumber = id;
        if (!isDbEnabled) {
            const index = feedbackEntries.findIndex(f => String(f.id) === String(id));
            if (index !== -1) {
                ticketNumber = feedbackEntries[index].ticketNumber;
                feedbackEntries.splice(index, 1);
                ok = true;
            }
        } else {
            const getTicket = await db.query('SELECT ticket_number FROM app_feedback WHERE id = $1', [String(id)]);
            if (getTicket.rows.length > 0) {
                ticketNumber = getTicket.rows[0].ticket_number;
            }
            const result = await db.query('DELETE FROM app_feedback WHERE id = $1 RETURNING id', [String(id)]);
            ok = result.rows.length > 0;
        }

        if (!ok) {
            return res.status(404).json({ error: 'Feedback entry not found' });
        }

        await addLog('FEEDBACK_DELETE', req.user?.studentId || 'ADMIN', `Deleted feedback entry ${ticketNumber}`);
        res.json({ success: true, message: 'Feedback entry deleted successfully' });
    } catch (e) {
        console.error('Feedback delete error:', e);
        res.status(500).json({ error: 'Failed to delete feedback entry' });
    }
});

app.put('/api/admin/feedback/bulk', requireAuth, async (req, res) => {
    try {
        const { ids, status } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid feedback IDs array' });
        }
        if (!status || !['open', 'resolved', 'archived', 'considering', 'implemented', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid feedback status.' });
        }

        const idsStrings = ids.map(id => String(id));
        if (!isDbEnabled) {
            idsStrings.forEach(id => {
                const index = feedbackEntries.findIndex(f => String(f.id) === id);
                if (index !== -1) {
                    if (feedbackEntries[index].status !== status) {
                        feedbackEntries[index].resolvedNotified = false;
                    }
                    feedbackEntries[index].status = status;
                    feedbackEntries[index].updatedAt = new Date();
                }
            });
        } else {
            await db.query(
                `UPDATE app_feedback 
                 SET status = $1, resolved_notified = CASE WHEN status IS DISTINCT FROM $1 THEN FALSE ELSE resolved_notified END, updated_at = NOW()
                 WHERE id = ANY($2)`,
                [status, idsStrings]
            );
        }

        await addLog('FEEDBACK_BULK_UPDATE', req.user?.studentId || 'ADMIN', `Updated status to ${status} for ${ids.length} feedbacks`);
        res.json({ success: true, message: `Successfully updated ${ids.length} feedback entries` });
    } catch (e) {
        console.error('Feedback bulk update error:', e);
        res.status(500).json({ error: 'Failed to bulk update feedback entries' });
    }
});

app.delete('/api/admin/feedback/bulk', requireAuth, async (req, res) => {
    try {
        const { ids } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid feedback IDs array' });
        }

        const idsStrings = ids.map(id => String(id));
        if (!isDbEnabled) {
            feedbackEntries = feedbackEntries.filter(f => !idsStrings.includes(String(f.id)));
        } else {
            await db.query(
                `DELETE FROM app_feedback WHERE id = ANY($1)`,
                [idsStrings]
            );
        }

        await addLog('FEEDBACK_BULK_DELETE', req.user?.studentId || 'ADMIN', `Bulk deleted ${ids.length} feedbacks`);
        res.json({ success: true, message: `Successfully deleted ${ids.length} feedback entries` });
    } catch (e) {
        console.error('Feedback bulk delete error:', e);
        res.status(500).json({ error: 'Failed to bulk delete feedback entries' });
    }
});

app.post('/api/cache/clear', requireAuth, async (req, res) => {
    try {
        console.log('Cache clear requested by admin');
        res.json({ success: true, message: 'Server cache cleared successfully' });
    } catch (e) {
        console.error('Clear cache error:', e);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

const checkStudentAccess = async (req, res) => {
    const requestedStudentId = String(req.params.studentId);
    const loggedInStudentId = String(req.user.studentId);
    if (requestedStudentId === loggedInStudentId) return true;
    try {
        const dbUser = await getUserById(loggedInStudentId);
        if (dbUser && dbUser.role === 'Admin') return true;
    } catch (e) {
        console.error('[auth] Error checking admin access:', e);
    }
    const adminIds = getAdminIds();
    if (adminIds.includes(loggedInStudentId)) return true;
    res.status(403).json({ error: "Forbidden: Cannot access another student's records" });
    return false;
};

const SBHS_PORTAL_API = 'https://api.sbhs.net.au/api/core';

const forwardPortalQueryParams = (targetUrl, req) => {
    const rawUrl = req.originalUrl || req.url || '';
    const queryIdx = rawUrl.indexOf('?');
    if (queryIdx !== -1) {
        const rawParams = new URLSearchParams(rawUrl.slice(queryIdx + 1));
        rawParams.forEach((val, key) => targetUrl.searchParams.append(key, val));
        return;
    }
    if (req.query && typeof req.query === 'object') {
        const appendNested = (obj, prefix = '') => {
            for (const [k, v] of Object.entries(obj)) {
                const key = prefix ? `${prefix}[${k}]` : k;
                if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                    appendNested(v, key);
                } else if (Array.isArray(v)) {
                    v.forEach(item => targetUrl.searchParams.append(`${key}[]`, String(item)));
                } else if (v !== undefined && v !== null) {
                    targetUrl.searchParams.append(key, String(v));
                }
            }
        };
        appendNested(req.query);
    }
};

const PORTAL_TIMEOUT_MS = 15000;

const sendPortalFailure = (res, status, generateMockData, user) => {
    if (status === 404) return res.json(generateMockData(user));
    const code = !status ? 504 : status >= 500 ? 502 : status === 401 ? 403 : status;
    return res.status(code).json({ error: 'sbhs_unavailable', upstreamStatus: status || null });
};

const resolveStudentPortalApi = async (req, res, subpath, generateMockData) => {
    const isAuthorized = await checkStudentAccess(req, res);
    if (!isAuthorized) return;
    const studentId = req.params.studentId;
    const authHeader = req.headers['authorization'];
    if (process.env.BYPASS_AUTH !== 'true' && authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const url = new URL(`${SBHS_PORTAL_API}/students/${studentId}/${subpath}`);
            forwardPortalQueryParams(url, req);

            if (subpath === 'clipboard/sessions') {
                if (!url.searchParams.has('date[after]') && !url.searchParams.has('date[before]')) {
                    const currentYear = new Date().getFullYear();
                    url.searchParams.set('date[after]', `${currentYear}-01-01`);
                    url.searchParams.set('date[before]', `${currentYear}-12-31`);
                }
                if (!url.searchParams.has('_itemsPerPage')) {
                    url.searchParams.set('_itemsPerPage', '300');
                }
            }

            const response = await fetch(url.toString(), {
                headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
                signal: AbortSignal.timeout(PORTAL_TIMEOUT_MS)
            });
            if (response.ok) {
                const data = await response.json();
                return res.json(data);
            }
            const detail = (await response.text().catch(() => '')).slice(0, 300);
            console.warn(`[proxy] SBHS API returned ${response.status} for ${subpath}: ${detail}`);
            return sendPortalFailure(res, response.status, generateMockData, req.user);
        } catch (e) {
            console.error(`[proxy] SBHS API call failed for ${subpath}:`, e.message);
            return sendPortalFailure(res, 0, generateMockData, req.user);
        }
    }
    res.json(generateMockData(req.user));
};

const resolveGlobalPortalApi = async (req, res, subpath, generateMockData) => {
    const authHeader = req.headers['authorization'];
    if (process.env.BYPASS_AUTH !== 'true' && authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const url = new URL(`${SBHS_PORTAL_API}/${subpath}`);
            forwardPortalQueryParams(url, req);
            const response = await fetch(url.toString(), {
                headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
                signal: AbortSignal.timeout(PORTAL_TIMEOUT_MS)
            });
            if (response.ok) {
                const data = await response.json();
                return res.json(data);
            }
            const detail = (await response.text().catch(() => '')).slice(0, 300);
            console.warn(`[proxy] SBHS API returned ${response.status} for global ${subpath}: ${detail}`);
            return sendPortalFailure(res, response.status, generateMockData, req.user);
        } catch (e) {
            console.error(`[proxy] SBHS API call failed for global ${subpath}:`, e.message);
            return sendPortalFailure(res, 0, generateMockData, req.user);
        }
    }
    res.json(generateMockData(req.user));
};

const registerRoutePair = (path, middleware, handler) => {
    app.get(path, middleware, handler);
    app.get(`/api${path}`, middleware, handler);
};

registerRoutePair('/students/:studentId/attendance/absences', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'attendance/absences', (user) => []);
});

registerRoutePair('/students/:studentId/attendance/absences/:id', requireStudentAuth, (req, res) => {
    const id = req.params.id;
    resolveStudentPortalApi(req, res, `attendance/absences/${id}`, (user) => null);
});

registerRoutePair('/students/:studentId/attendance/scan-ins', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'attendance/scan-ins', (user) => []);
});

registerRoutePair('/students/:studentId/attendance/scan-ins/:dateId', requireStudentAuth, (req, res) => {
    const dateId = req.params.dateId;
    resolveStudentPortalApi(req, res, `attendance/scan-ins/${dateId}`, (user) => null);
});

registerRoutePair('/students/:studentId/award-scheme/awards', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'award-scheme/awards', (user) => []);
});

registerRoutePair('/students/:studentId/award-scheme/badges', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'award-scheme/badges', (user) => []);
});

registerRoutePair('/students/:studentId/award-scheme/decorations', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'award-scheme/decorations', (user) => []);
});

registerRoutePair('/students/:studentId/award-scheme/prizes', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'award-scheme/prizes', (user) => []);
});

registerRoutePair('/students/:studentId/award-scheme/rollover', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'award-scheme/rollover', (user) => null);
});

registerRoutePair('/students/:studentId/clipboard/attendance', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'clipboard/attendance', (user) => []);
});

registerRoutePair('/students/:studentId/clipboard/pre-explained-absences', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'clipboard/pre-explained-absences', (user) => []);
});

registerRoutePair('/students/:studentId/clipboard/sessions', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'clipboard/sessions', (user) => []);
});

registerRoutePair('/students/:studentId/clipboard/teams', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'clipboard/teams', (user) => []);
});

registerRoutePair('/students/:studentId/clipboard/teams/:teamId', requireStudentAuth, (req, res) => {
    const teamId = req.params.teamId;
    resolveStudentPortalApi(req, res, `clipboard/teams/${teamId}`, (user) => null);
});

registerRoutePair('/students/:studentId/enrolments', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'enrolments', (user) => []);
});

registerRoutePair('/students/:studentId/enrolments/:schoolYear', requireStudentAuth, (req, res) => {
    const schoolYear = parseInt(req.params.schoolYear) || 2026;
    resolveStudentPortalApi(req, res, `enrolments/${schoolYear}`, (user) => null);
});

registerRoutePair('/students/:studentId/timetable', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'timetable', (user) => null);
});

registerRoutePair('/students/:studentId/timetable/classes', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'timetable/classes', (user) => []);
});

registerRoutePair('/students/:studentId/timetable/dates', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'timetable/dates', (user) => []);
});

registerRoutePair('/students/:studentId/timetable/dates/:date', requireStudentAuth, (req, res) => {
    const dateParam = req.params.date;
    resolveStudentPortalApi(req, res, `timetable/dates/${dateParam}`, (user) => null);
});

registerRoutePair('/award-scheme/awards', requireStudentAuth, (req, res) => {
    resolveGlobalPortalApi(req, res, 'award-scheme/awards', () => []);
});

registerRoutePair('/award-scheme/awards/:id', requireStudentAuth, (req, res) => {
    const id = req.params.id;
    resolveGlobalPortalApi(req, res, `award-scheme/awards/${id}`, () => null);
});

registerRoutePair('/award-scheme/categories', requireStudentAuth, (req, res) => {
    resolveGlobalPortalApi(req, res, 'award-scheme/categories', () => []);
});

registerRoutePair('/award-scheme/categories/:id', requireStudentAuth, (req, res) => {
    const id = req.params.id;
    resolveGlobalPortalApi(req, res, `award-scheme/categories/${id}`, () => null);
});

registerRoutePair('/award-scheme/house-points', requireStudentAuth, (req, res) => {
    resolveGlobalPortalApi(req, res, 'award-scheme/house-points', () => []);
});

registerRoutePair('/award-scheme/nominations', requireStudentAuth, (req, res) => {
    resolveGlobalPortalApi(req, res, 'award-scheme/nominations', (user) => []);
});

registerRoutePair('/award-scheme/nominations/:id', requireStudentAuth, (req, res) => {
    const id = req.params.id;
    resolveGlobalPortalApi(req, res, `award-scheme/nominations/${id}`, (user) => null);
});

registerRoutePair('/award-scheme/prizes', requireStudentAuth, (req, res) => {
    resolveGlobalPortalApi(req, res, 'award-scheme/prizes', () => []);
});

registerRoutePair('/award-scheme/prizes/:id', requireStudentAuth, (req, res) => {
    const id = req.params.id;
    resolveGlobalPortalApi(req, res, `award-scheme/prizes/${id}`, () => null);
});

registerRoutePair('/clipboard/activities', requireStudentAuth, (req, res) => {
    resolveGlobalPortalApi(req, res, 'clipboard/activities', () => []);
});

registerRoutePair('/clipboard/activities/:id', requireStudentAuth, (req, res) => {
    const id = req.params.id;
    resolveGlobalPortalApi(req, res, `clipboard/activities/${id}`, () => null);
});

registerRoutePair('/clipboard/departments', requireStudentAuth, (req, res) => {
    resolveGlobalPortalApi(req, res, 'clipboard/departments', () => []);
});

registerRoutePair('/clipboard/departments/:id', requireStudentAuth, (req, res) => {
    const id = req.params.id;
    resolveGlobalPortalApi(req, res, `clipboard/departments/${id}`, () => null);
});

registerRoutePair('/clipboard/teams/:id', requireStudentAuth, (req, res) => {
    const id = req.params.id;
    resolveGlobalPortalApi(req, res, `clipboard/teams/${id}`, () => null);
});

registerRoutePair('/transit/departures', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);
        const dbUser = await getUserById(studentId);
        if (!dbUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { stopName = 'Moore Park Light Rail' } = req.query;
        const stopToQuery = stopName;
        const apiKey = process.env.TRANSPORT_NSW_API_KEY;

        if (apiKey) {
            console.log(`[transit] Querying TfNSW APIs for: "${stopToQuery}" `);

            const stopFinderUrl = new URL('https://api.transport.nsw.gov.au/v1/tp/stop_finder');
            stopFinderUrl.searchParams.append('outputFormat', 'rapidJSON');
            stopFinderUrl.searchParams.append('type_sf', 'any');
            stopFinderUrl.searchParams.append('name_sf', stopToQuery);
            stopFinderUrl.searchParams.append('TfNSWStopFinder', 'true');

            const stopFinderRes = await fetch(stopFinderUrl.toString(), {
                headers: { 'Authorization': `Apikey ${apiKey}` }
            });

            if (!stopFinderRes.ok) {
                throw new Error(`Stop Finder failed with status ${stopFinderRes.status}`);
            }

            const stopFinderData = await stopFinderRes.json();
            const points = stopFinderData.stopFinder?.points || [];

            const matchedPoint = points.find(p => p.type === 'stop' || p.type === 'station') || points[0];

            if (!matchedPoint || !matchedPoint.id) {
                return res.json([]);
            }

            const stopId = matchedPoint.id;
            console.log(`[transit] Resolved stop ID: ${stopId} (${matchedPoint.name})`);

            const depMonUrl = new URL('https://api.transport.nsw.gov.au/v1/tp/departure_mon');
            depMonUrl.searchParams.append('outputFormat', 'rapidJSON');
            depMonUrl.searchParams.append('coordOutputFormat', 'EPSG:4326');
            depMonUrl.searchParams.append('mode', 'direct');
            depMonUrl.searchParams.append('type_dm', 'stop');
            depMonUrl.searchParams.append('name_dm', stopId);
            depMonUrl.searchParams.append('TfNSWDM', 'true');

            const depMonRes = await fetch(depMonUrl.toString(), {
                headers: { 'Authorization': `Apikey ${apiKey}` }
            });

            if (!depMonRes.ok) {
                throw new Error(`Departure Monitor failed with status ${depMonRes.status}`);
            }

            const depMonData = await depMonRes.json();
            const stopEvents = depMonData.stopEvents || [];

            const now = new Date();
            const departures = stopEvents.map(event => {
                const planned = new Date(event.departureTimePlanned);
                const estimated = event.departureTimeEstimated ? new Date(event.departureTimeEstimated) : null;
                const actualTime = estimated || planned;
                const diffMs = actualTime - now;
                const minutes = Math.max(0, Math.round(diffMs / 60000));

                const route = event.transportation?.number || event.transportation?.name || 'Bus';
                let type = 'Bus';
                if (route.startsWith('L') && !isNaN(route.substring(1))) {
                    type = 'Light Rail';
                } else if (route.startsWith('T') && !isNaN(route.substring(1))) {
                    type = 'Train';
                }

                return {
                    route,
                    destination: event.transportation?.destination?.name || 'Unknown',
                    minutes,
                    realtime: !!event.departureTimeEstimated,
                    type
                };
            });

            return res.json(departures.slice(0, 10));
        } else {
            const nowMs = Date.now();
            const getMockMinutes = (interval, offset) => {
                const cycle = interval * 60 * 1000;
                const elapsed = (nowMs + offset * 60 * 1000) % cycle;
                return Math.max(0, Math.round((cycle - elapsed) / 60000));
            };

            let departures = [];
            const cleanStopName = stopToQuery.toLowerCase();
            if (cleanStopName.includes('moore') || cleanStopName.includes('park')) {
                departures = [
                    { route: 'L2', destination: 'Circular Quay via Central', minutes: getMockMinutes(10, 0), realtime: true, type: 'Light Rail' },
                    { route: 'L3', destination: 'Circular Quay via Central', minutes: getMockMinutes(12, 3), realtime: true, type: 'Light Rail' },
                    { route: 'L2', destination: 'Randwick', minutes: getMockMinutes(10, 5), realtime: true, type: 'Light Rail' },
                    { route: 'L3', destination: 'Kingsford', minutes: getMockMinutes(12, 8), realtime: true, type: 'Light Rail' },
                    { route: '396', destination: 'Circular Quay', minutes: getMockMinutes(15, 2), realtime: false, type: 'Bus' },
                    { route: '374', destination: 'Central Pitt St', minutes: getMockMinutes(20, 11), realtime: true, type: 'Bus' }
                ];
            } else if (cleanStopName.includes('central')) {
                departures = [
                    { route: 'T1', destination: 'Hornsby via Chatswood', minutes: getMockMinutes(6, 1), realtime: true, type: 'Train' },
                    { route: 'T2', destination: 'Parramatta', minutes: getMockMinutes(8, 2), realtime: true, type: 'Train' },
                    { route: 'T8', destination: 'Macarthur via Airport', minutes: getMockMinutes(10, 4), realtime: true, type: 'Train' },
                    { route: 'L2', destination: 'Randwick', minutes: getMockMinutes(10, 0), realtime: true, type: 'Light Rail' },
                    { route: 'L3', destination: 'Kingsford', minutes: getMockMinutes(12, 2), realtime: true, type: 'Light Rail' }
                ];
            } else {
                departures = [
                    { route: '396', destination: 'City Circular Quay', minutes: getMockMinutes(15, 0), realtime: true, type: 'Bus' },
                    { route: '373', destination: 'Coogee Beach', minutes: getMockMinutes(12, 4), realtime: true, type: 'Bus' },
                    { route: 'L2', destination: 'Circular Quay', minutes: getMockMinutes(10, 5), realtime: true, type: 'Light Rail' }
                ];
            }
            departures.sort((a, b) => a.minutes - b.minutes);

            return res.json(departures);
        }
    } catch (e) {
        console.error('Transit API error:', e);
        res.status(500).json({ error: 'Failed to fetch transit departures' });
    }
});

const SBHS_TOKEN_ENDPOINT = 'https://auth.sbhs.net.au/token';
const envFirst = (...names) => names.map(n => String(process.env[n] || '').trim()).find(Boolean) || '';
const tokenLimit = rateLimit(
    [makeLimiter(30, 60 * 1000)],
    (req) => req.ip,
    'Too many sign-in attempts. Wait a minute and try again.'
);

app.post('/api/auth/token', tokenLimit, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const clientId = envFirst('SBHS_CLIENT_ID', 'VITE_SBHS_CLIENT_ID');
    if (!clientId) {
        return res.status(500).json({ error: 'server_misconfigured', error_description: 'SBHS_CLIENT_ID is not set on the server.' });
    }

    const { grant_type: grantType, code, refresh_token: refreshToken, redirect_uri: redirectUri } = req.body || {};
    const form = new URLSearchParams({ client_id: clientId });
    if (grantType === 'authorization_code' && typeof code === 'string' && code && code.length <= 4096) {
        form.set('grant_type', 'authorization_code');
        form.set('code', code);
        form.set('redirect_uri', envFirst('SBHS_REDIRECT_URI', 'VITE_SBHS_REDIRECT_URI') || String(redirectUri || ''));
    } else if (grantType === 'refresh_token' && typeof refreshToken === 'string' && refreshToken && refreshToken.length <= 4096) {
        form.set('grant_type', 'refresh_token');
        form.set('refresh_token', refreshToken);
    } else {
        return res.status(400).json({ error: 'invalid_request' });
    }
    const secret = envFirst('SBHS_CLIENT_SECRET', 'VITE_SBHS_CLIENT_SECRET');
    if (secret) form.set('client_secret', secret);

    try {
        const response = await fetch(SBHS_TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: form,
            signal: AbortSignal.timeout(10000)
        });
        const body = await response.text();
        if (response.ok && getAllowedStagingUsers().length > 0) {
            let tokenData = null;
            try {
                tokenData = JSON.parse(body);
            } catch {
                tokenData = null;
            }
            const userData = tokenData?.access_token ? await fetchSbhsUserInfo(tokenData.access_token) : null;
            if (!isAllowedStagingUser(userData)) {
                return res.status(403).json({
                    error: STAGING_ACCESS_RESTRICTED_MESSAGE,
                    error_description: STAGING_ACCESS_RESTRICTED_MESSAGE
                });
            }
        }
        res.status(response.status).type(response.headers.get('content-type') || 'application/json').send(body);
    } catch (e) {
        console.error('[auth] SBHS token request failed:', e?.message || e);
        res.status(502).json({ error: 'sbhs_unreachable', error_description: 'Couldn’t reach SBHS. Try again.' });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/health/ready', async (req, res) => {
    if (!isDbEnabled) return res.json({ status: 'ok', database: 'not configured' });
    try {
        await db.query('SELECT 1');
        res.json({ status: 'ok', database: 'ok' });
    } catch (e) {
        res.status(503).json({ status: 'unavailable', database: 'unreachable' });
    }
});

app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'Not found' });
});

const path = require('path');
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist, {
    setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (/\.(png|ico|svg|webp|jpg|woff2?)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
        } else {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    if (req.path === '/privacy' || req.path === '/privacy/') {
        return res.sendFile(path.join(clientDist, 'privacy.html'));
    }
    res.sendFile(path.join(clientDist, 'index.html'));
});

app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error('[server] Unhandled route error:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Something went wrong' });
});

process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled promise rejection:', reason);
});

if (require.main === module) {
    const server = app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
    server.keepAliveTimeout = 65 * 1000;
    server.headersTimeout = 66 * 1000;

    let shuttingDown = false;
    const shutdown = (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[server] ${signal} received, shutting down`);
        const force = setTimeout(() => process.exit(0), 10 * 1000);
        force.unref();
        server.close(() => {
            db.close().catch(() => {}).finally(() => process.exit(0));
        });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
