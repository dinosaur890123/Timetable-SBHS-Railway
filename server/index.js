const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const crypto = require('crypto');

const compression = require('compression');

const db = require('./db');
const { registerCanvasLinkRoutes } = require('./canvasLinks');
const { guardBypassAuth, securityHeaders, corsOptionsDelegate, makeLimiter, rateLimit, createTokenVerifier } = require('./security');

dotenv.config();
guardBypassAuth();

const app = express();
const PORT = process.env.PORT || 8080;

// Railway (and Vercel) sit behind one proxy: trust it for the client's IP and https.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Middleware
// Origins allowed to call the API from a browser, besides the app's own origin.
// Add more with ALLOWED_ORIGINS (comma-separated).
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

// In-memory fallback storage (used only when POSTGRES_URL/DATABASE_URL is not set)
let users = [];
let logs = []; // System logs
let aiUsageLogs = []; // AI usage logs memory fallback
let notes = []; // Study notes memory fallback
let feedbackEntries = []; // Feedback submissions memory fallback
let assignments = []; // Homework/assignments memory fallback
let deletionRequests = []; // Data deletion requests memory fallback
let broadcastNotificationsMemory = []; // { id, message, createdBy, createdAt } memory fallback
const broadcastNotificationDismissalsMemory = new Set(); // `${broadcastId}:${studentId}` memory fallback
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
    broadcast: null, // { message: "...", type: "info/warning/error" }
    aiProvider: 'hackclub',
    aiModel: 'qwen/qwen3-32b',
    aiDisabled: false,
    aiFeatures: { timetableQa: true, noticeRanking: true },
    festiveAmbient: false,
    hiddenPages: []
};

// Sage features admins can toggle individually. Anything not listed here is
// always on; a feature is off only when its flag is explicitly false.
const AI_FEATURE_KEYS = new Set(['timetableQa', 'noticeRanking']);
const DEFAULT_AI_FEATURES = { timetableQa: true, noticeRanking: true };

const normalizeAiFeatures = (raw) => {
    const parsed = typeof raw === 'string'
        ? (() => { try { return JSON.parse(raw); } catch { return null; } })()
        : raw;
    return { ...DEFAULT_AI_FEATURES, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
};

// System metrics for the admin dashboard, sampled every 10 seconds (last 20 samples).
// "sessions" is the number of students who made an authenticated request in the
// last 5 minutes.
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
    // Ensure app_build_notes table exists
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

// Logs one AI interaction for admin visibility and rate-limit auditing.
// question MUST be the student's raw typed text only (capped at 500 chars by the
// caller). No timetable JSON, system-prompt context, or AI-generated answer is stored.
const addAiLog = async (studentId, question, provider, model, status = 'ok') => {
    const log = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        studentId: studentId || 'UNKNOWN',
        question: String(question || '').slice(0, 500), // cap enforced defensively
        status: status || 'ok',
        provider: provider || 'unknown',
        model: model || 'unknown'
    };

    if (!isDbEnabled) {
        aiUsageLogs.unshift(log);
        if (aiUsageLogs.length > 100) aiUsageLogs.pop();
        return;
    }

    try {
        await db.query(
            'INSERT INTO ai_usage_logs (id, created_at, student_id, question, status, provider, model) VALUES ($1, NOW(), $2, $3, $4, $5, $6)',
            [log.id, log.studentId, log.question, log.status, log.provider, log.model]
        );
    } catch (err) {
        console.error('Failed to write AI log to DB:', err);
    }
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

// System state is read on every page load (/api/system/status) and by every AI
// call, so it's cached briefly. Writes below clear the cache, so admin changes
// show immediately on this server.
const SYSTEM_STATE_TTL_MS = 10 * 1000;
let systemStateCache = null; // { at, value }

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
        if (!systemState.aiProvider) systemState.aiProvider = 'hackclub';
        if (!systemState.aiModel) systemState.aiModel = 'qwen/qwen3-32b';
        if (systemState.aiDisabled === undefined) systemState.aiDisabled = false;
        if (!systemState.aiFeatures || typeof systemState.aiFeatures !== 'object') systemState.aiFeatures = { ...DEFAULT_AI_FEATURES };
        if (systemState.festiveAmbient === undefined) systemState.festiveAmbient = false;
        if (!Array.isArray(systemState.hiddenPages)) systemState.hiddenPages = [];
        return systemState;
    }

    // SELECT * keeps older databases working: columns added by later migrations
    // are simply absent and fall back to defaults below.
    const result = await db.query('SELECT * FROM system_state WHERE id = 1', []);

    const row = result.rows[0] || { maintenance: false, broadcast_message: null, broadcast_type: null, ai_provider: 'hackclub', ai_model: 'qwen/qwen3-32b', ai_disabled: false, ai_features: null, festive_ambient: false, hidden_pages: [], updated_at: null };
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
        aiProvider: row.ai_provider || 'hackclub',
        aiModel: row.ai_model || 'qwen/qwen3-32b',
        aiDisabled: Boolean(row.ai_disabled),
        aiFeatures: normalizeAiFeatures(row.ai_features),
        festiveAmbient: Boolean(row.festive_ambient),
        hiddenPages: Array.isArray(hiddenPages) ? hiddenPages : []
    };
}

// Admin override for the seasonal ambient glow. The festive palettes
// (Christmas Dec 1–26, NYE Dec 27–Jan 6) activate automatically in season;
// this flag forces them on outside those dates.
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
        // Self-heal databases that haven't run the schema migration yet.
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

async function setAiConfig(provider, model) {
    const cleanProvider = provider === 'gemini' ? 'gemini' : 'hackclub';
    let defaultModel = cleanProvider === 'gemini' ? 'gemini-1.5-flash' : 'qwen/qwen3-32b';
    const cleanModel = model || defaultModel;

    if (!isDbEnabled) {
        systemState.aiProvider = cleanProvider;
        systemState.aiModel = cleanModel;
        return { aiProvider: cleanProvider, aiModel: cleanModel };
    }

    systemStateCache = null;
    await db.query(
        'UPDATE system_state SET ai_provider = $1, ai_model = $2, updated_at = NOW() WHERE id = 1',
        [cleanProvider, cleanModel]
    );

    return { aiProvider: cleanProvider, aiModel: cleanModel };
}

async function setAiDisabled(disabled) {
    const value = Boolean(disabled);
    if (!isDbEnabled) {
        systemState.aiDisabled = value;
        return value;
    }

    systemStateCache = null;
    try {
        await db.query(
            'UPDATE system_state SET ai_disabled = $1, updated_at = NOW() WHERE id = 1',
            [value]
        );
    } catch (e) {
        // Self-heal databases that haven't run the schema migration yet.
        if (!/ai_disabled/.test(e?.message || '')) throw e;
        await db.query('ALTER TABLE system_state ADD COLUMN IF NOT EXISTS ai_disabled BOOLEAN NOT NULL DEFAULT FALSE');
        await db.query(
            'UPDATE system_state SET ai_disabled = $1, updated_at = NOW() WHERE id = 1',
            [value]
        );
    }
    return value;
}

// Toggles one Sage feature (e.g. 'timetableQa', 'noticeRanking'). `disabled`
// is the new off state; stored flags only ever turn a feature off when false.
async function setAiFeature(feature, disabled) {
    if (!AI_FEATURE_KEYS.has(feature)) {
        throw new Error(`Unknown AI feature: ${feature}`);
    }
    const value = !Boolean(disabled);

    if (!isDbEnabled) {
        systemState.aiFeatures = { ...DEFAULT_AI_FEATURES, ...(systemState.aiFeatures || {}), [feature]: value };
        return systemState.aiFeatures;
    }

    systemStateCache = null;
    const write = async () => {
        const state = await getSystemState();
        const features = { ...(state.aiFeatures || {}), [feature]: value };
        await db.query(
            'UPDATE system_state SET ai_features = $1::jsonb, updated_at = NOW() WHERE id = 1',
            [JSON.stringify(features)]
        );
        return features;
    };

    try {
        return await write();
    } catch (e) {
        // Self-heal databases that haven't run the schema migration yet.
        if (!/ai_features/.test(e?.message || '')) throw e;
        await db.query('ALTER TABLE system_state ADD COLUMN IF NOT EXISTS ai_features JSONB');
        return await write();
    }
}

async function setAiModel(model) {
    const res = await setAiConfig(undefined, model);
    return res.aiModel;
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

// "notification"-type broadcasts are pushed to each student's bell panel
// instead of the banner. They live for 30 days and each student can dismiss
// them permanently.
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

// Removes every row the server holds for a student. The app_users delete
// cascades to notes, assignments, Canvas links, feedback, notifications and
// resource shares; the student-keyed tables without a foreign key are cleaned
// up by hand. Audit logs are kept — they prune after 30 days.
async function deleteStudentData(studentId) {
    const id = String(studentId);
    if (!isDbEnabled) {
        users = users.filter(u => String(u.id) !== id);
        notes = notes.filter(n => String(n.studentId) !== id);
        assignments = assignments.filter(a => String(a.studentId) !== id);
        feedbackEntries = feedbackEntries.filter(f => String(f.studentId) !== id);
        aiUsageLogs = aiUsageLogs.filter(l => String(l.studentId) !== id);
        return;
    }

    await db.query('DELETE FROM ai_usage_logs WHERE student_id = $1', [id]);
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

// Purge archived feedback older than 90 days
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

// Run archived feedback purge on boot and then every 12 hours
purgeArchivedFeedback().catch((err) => {
    console.error('[purge-feedback] Initial purge failed:', err);
});
setInterval(() => {
    purgeArchivedFeedback().catch((err) => {
        console.error('[purge-feedback] Interval purge failed:', err);
    });
}, 12 * 60 * 60 * 1000).unref();

// Initial log (best-effort)
addLog('STARTUP', 'SYSTEM', 'Server service started').catch((e) => {
    console.warn('[admin-db] Failed to write startup log:', e?.message || e);
});

// Get authorized admin IDs from env or default
const getAdminIds = () => {
    if (process.env.ADMIN_IDS) {
        return process.env.ADMIN_IDS.split(',').map(id => id.trim());
    }
    return ["449130511", "449596935"];
};

// Verify SBHS Access Token via SBHS API. Results are cached briefly per token
// (see security.js), so SBHS is asked once per few minutes, not once per request.
const tokenVerifier = createTokenVerifier({
    fetchUserInfo: async (token) => {
        try {
            // Without a timeout an unresponsive SBHS API keeps the request open
            // indefinitely, and every page load hangs behind it.
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
    }
});

const verifySbhsToken = async (req) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return tokenVerifier.verify(authHeader.slice('Bearer '.length).trim());
};

// Require valid student authentication (Any logged-in student)
const requireStudentAuth = async (req, res, next) => {
    if (process.env.BYPASS_AUTH === 'true') {
        req.user = { studentId: '449130511', givenName: 'Local', surname: 'Admin', email: 'admin@sbhs.nsw.edu.au', yearGroup: '12' };
        return next();
    }
    const userData = await verifySbhsToken(req);
    if (!userData) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing SBHS token' });
    }
    req.user = userData;
    next();
};

// Get a user by ID
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

// Require admin privilege (Only users with Admin role in DB, or bootstrap list if not configured in DB as Student)
const requireAdminAuth = async (req, res, next) => {
    if (process.env.BYPASS_AUTH === 'true') {
        req.user = { studentId: '449130511', givenName: 'Local', surname: 'Admin', email: 'admin@sbhs.nsw.edu.au', yearGroup: '12' };
        return next();
    }
    const userData = await verifySbhsToken(req);
    if (!userData) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing SBHS token' });
    }
    const studentId = String(userData.studentId);
    
    try {
        const dbUser = await getUserById(studentId);
        // If they exist in DB and are NOT Admin, reject immediately (strict check)
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

    // Fallback: If not registered in DB yet, check bootstrap list
    const adminIds = getAdminIds();
    if (adminIds.includes(studentId)) {
        req.user = userData;
        return next();
    }

    return res.status(403).json({ error: 'Forbidden: Admin access required' });
};

// Enforce admin privileges for general requireAuth routes
const requireAuth = requireAdminAuth;

// True when the requester is an admin (DB role, or the bootstrap admin list).
const isAdminUser = async (studentId) => {
    try {
        const dbUser = await getUserById(studentId);
        if (dbUser) return dbUser.role === 'Admin';
    } catch (e) {
        console.error('[auth] Admin role check failed:', e?.message || e);
    }
    return getAdminIds().includes(String(studentId));
};

// When an admin disables AI — globally or for a single Sage feature — the
// student-facing AI endpoints answer 503 so clients can show a maintenance
// notice. Only timetable-qa (Ask Sage) lets admins through, so the admin
// panel tester keeps working; every other AI feature is dead for everyone.
// Returns true when the response was sent.
const aiUnderMaintenance = async (req, res, { allowAdmin = false, feature = null } = {}) => {
    const state = await getSystemState();
    const featureOff = !!feature && state.aiFeatures?.[feature] === false;
    if (!state.aiDisabled && !featureOff) return false;
    if (allowAdmin && await isAdminUser(String(req.user?.studentId || ''))) return false;
    res.status(503).json({ error: 'Sage is under maintenance' });
    return true;
};

// Routes
// POST /api/register - Auto-register users on login (DB-backed)
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

        // Fetch pending feedback notifications where status is 'resolved' and user hasn't been notified
        let resolvedFeedbacks = [];
        if (!isDbEnabled) {
            const pending = feedbackEntries.filter(f => String(f.studentId) === userId && f.status === 'resolved' && f.resolvedNotified === false);
            resolvedFeedbacks = pending.map(f => ({
                id: f.id,
                ticketNumber: f.ticketNumber,
                category: f.category,
                details: f.details
            }));
            // Mark them as notified
            pending.forEach(f => {
                f.resolvedNotified = true;
            });
        } else {
            const result = await db.query(
                `SELECT id, ticket_number, category, details 
                 FROM app_feedback 
                 WHERE student_id = $1 AND status = 'resolved' AND resolved_notified = FALSE`,
                [userId]
            );
            resolvedFeedbacks = result.rows.map(row => ({
                id: row.id,
                ticketNumber: row.ticket_number,
                category: row.category,
                details: row.details
            }));
            if (resolvedFeedbacks.length > 0) {
                await db.query(
                    `UPDATE app_feedback 
                     SET resolved_notified = TRUE 
                     WHERE student_id = $1 AND status = 'resolved' AND resolved_notified = FALSE`,
                    [userId]
                );
            }
        }

        console.log(`User registered/updated: ${safeUser.name} (${userId}). Found ${resolvedFeedbacks.length} pending feedback notifications.`);
        res.json({ success: true, user: dbUser, resolvedFeedbacks });
    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ error: 'Failed to register user' });
    }
});

// Canvas course links: students' own links and links shared between classmates.
registerCanvasLinkRoutes(app, {
    db,
    isDbEnabled,
    requireStudentAuth,
    requireAdminAuth,
    getUserById,
    isAdminUser,
    addLog,
    getMemoryUsers: () => users
});

// GET /api/users/:id/preferences - Get user preferences (dashboard layout, theme, etc.)
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

// PUT /api/users/:id/preferences - Update user preferences
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

// --- Study Notes Endpoints (CRUD) ---

// POST /api/feedback - Submit authenticated feedback
app.post('/api/feedback', requireStudentAuth, async (req, res) => {
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
                createdAt: now,
                updatedAt: now
            };
            feedbackEntries.unshift(savedFeedback);
            if (feedbackEntries.length > 200) feedbackEntries.pop();
        } else {
            const result = await db.query(
                `INSERT INTO app_feedback (id, ticket_number, student_id, category, severity, details, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, 'open', NOW(), NOW())
                 RETURNING id, ticket_number, student_id, category, severity, details, status, created_at, updated_at`,
                [id, ticketNumber, studentId, category, severity, details]
            );
            savedFeedback = formatFeedbackRow(result.rows[0]);
        }

        await addLog('FEEDBACK', studentId, `Submitted ${category} feedback (${ticketNumber})`);
        res.status(201).json({ success: true, ticket: ticketNumber, feedback: savedFeedback });
    } catch (e) {
        console.error('Feedback submit error:', e);
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

// GET /api/notes - Retrieve notes for authenticated student
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

// POST /api/notes - Create or update a note
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
            // First check if note exists and who it belongs to
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

// DELETE /api/notes/:id - Delete a note
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

// GET /api/assignments - Retrieve homework/assignments for authenticated student
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

// POST /api/assignments - Create or update a homework/assignment task
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
            // First check if assignment exists and who it belongs to
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

// DELETE /api/assignments/:id - Delete a homework/assignment task
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

// POST /api/users/promote - Promote user to Admin by student ID
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

// PUT /api/users/:id - Update user details (Role/Status)
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

// GET /api/stats
app.get('/api/stats', requireAuth, async (req, res) => {
    try {
        const allUsers = await listUsers();
        const state = await getSystemState();

        let availableHackClubModels = ['qwen/qwen3-32b'];
        try {
            const modelsRes = await fetch('https://ai.hackclub.com/proxy/v1/models', { signal: AbortSignal.timeout(5000) });
            if (modelsRes.ok) {
                const modelsData = await modelsRes.json();
                if (modelsData && Array.isArray(modelsData.data)) {
                    availableHackClubModels = modelsData.data.map(m => m.id);
                }
            }
        } catch (e) {
            console.warn('[ai] Failed to fetch live models list:', e.message);
            availableHackClubModels = [
                'qwen/qwen3-32b',
                'meta-llama/llama-3-8b-instruct',
                'meta-llama/llama-3-70b-instruct',
                'mistralai/mixtral-8x7b-instruct',
                'openai/gpt-4o-mini',
                'anthropic/claude-3-haiku'
            ];
        }

        const isPostgresDb = isDbEnabled;
        let dbHealth = 'Offline';
        if (isPostgresDb) {
            try {
                await db.query('SELECT 1');
                dbHealth = 'Online';
            } catch (e) {
                dbHealth = `Error: ${e?.message || e}`;
            }
        }

        // Aggregate year breakdown
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
            // Local fallback
            allUsers.forEach(u => {
                const yr = u.year || 'Unknown';
                yearBreakdown[yr] = (yearBreakdown[yr] || 0) + 1;
            });
        }

        // Aggregate extended analytics
        const now = new Date();
        let activeToday = 0;
        let activeThisWeek = 0;
        const growthByDate = {}; // 'YYYY-MM-DD' -> count
        const classCounts = {}; // subjectTitle -> count

        allUsers.forEach(u => {
            // Retention check
            const lastSeenStr = u.lastSeen || u.joined;
            const lastSeen = lastSeenStr ? new Date(lastSeenStr) : null;
            if (lastSeen) {
                const diffMs = now - lastSeen;
                const diffDays = diffMs / (1000 * 60 * 60 * 24);
                if (diffDays <= 1) activeToday++;
                if (diffDays <= 7) activeThisWeek++;
            }

            // Growth registration check
            const joinedStr = u.joined;
            const joined = joinedStr ? new Date(joinedStr) : null;
            if (joined) {
                const dateStr = joined.toISOString().split('T')[0];
                growthByDate[dateStr] = (growthByDate[dateStr] || 0) + 1;
            }

            // Parse timetable for popular classes
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

        // Format growth data for the past 14 days
        const growthData = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            growthData.push({
                date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                count: growthByDate[dateStr] || 0
            });
        }

        // Format top classes (sorted by student enrollment count)
        const popularClasses = Object.entries(classCounts)
            .map(([title, count]) => ({ title, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);

        res.json({
            totalUsers: allUsers.length,
            systemStatus: state.maintenance ? 'Maintenance' : 'Operational',
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage().heapUsed,
            aiProvider: state.aiProvider || 'hackclub',
            aiModel: state.aiModel || 'qwen/qwen3-32b',
            aiDisabled: Boolean(state.aiDisabled),
            aiFeatures: state.aiFeatures || {},
            festiveAmbient: Boolean(state.festiveAmbient),
            hiddenPages: state.hiddenPages || [],
            availableHackClubModels,
            availableGeminiModels: [
                'gemini-1.5-flash',
                'gemini-1.5-pro',
                'gemini-2.0-flash',
                'gemini-2.5-flash'
            ],
            activeSessions: tokenVerifier.activeCount(),
            history: statsHistory,
            
            // Year group analytics
            yearDistribution: yearBreakdown,

            // New extended metrics
            activeToday,
            activeThisWeek,
            growthData,
            popularClasses,

            // New diagnostic checks
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

// GET /api/logs
app.get('/api/logs', requireAuth, async (req, res) => {
    try {
        const out = await listLogs(100);
        res.json(out);
    } catch (e) {
        console.error('Logs error:', e);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// POST /api/broadcast
app.post('/api/broadcast', requireAuth, async (req, res) => {
    try {
        const { message, type } = req.body || {};

        // "notification" broadcasts go straight to each student's bell panel;
        // they don't occupy the banner slot and live for 30 days.
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

// GET /api/broadcast (Publicly accessible usually, but here requires auth for viewing in admin)
// Real app would have a public endpoint for clients to pull this
app.get('/api/broadcast', requireAuth, async (req, res) => {
    try {
        const state = await getSystemState();
        res.json(state.broadcast);
    } catch (e) {
        console.error('Get broadcast error:', e);
        res.status(500).json({ error: 'Failed to fetch broadcast' });
    }
});

// GET /api/broadcast/notifications — the student's undismissed admin
// notification broadcasts from the last 30 days.
app.get('/api/broadcast/notifications', requireStudentAuth, async (req, res) => {
    try {
        const notifications = await listBroadcastNotifications(String(req.user.studentId));
        res.json({ notifications });
    } catch (e) {
        console.error('Broadcast notifications error:', e);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// POST /api/broadcast/notifications/:id/dismiss — permanently dismisses one
// notification broadcast for this student.
app.post('/api/broadcast/notifications/:id/dismiss', requireStudentAuth, async (req, res) => {
    try {
        await dismissBroadcastNotification(req.params.id, String(req.user.studentId));
        res.json({ success: true });
    } catch (e) {
        console.error('Dismiss broadcast notification error:', e);
        res.status(500).json({ error: 'Failed to dismiss notification' });
    }
});

// GET /api/broadcast/history — admin: notification broadcasts sent in the
// last 30 days with per-broadcast dismissal counts.
app.get('/api/broadcast/history', requireAuth, async (req, res) => {
    try {
        const notifications = await listBroadcastNotificationHistory();
        res.json({ notifications });
    } catch (e) {
        console.error('Broadcast history error:', e);
        res.status(500).json({ error: 'Failed to fetch broadcast history' });
    }
});

// DELETE /api/broadcast/history/:id — admin: removes a notification broadcast
// before its 30-day retention ends, for every student.
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

// GET /api/system/status (Public endpoint for client app)
app.get('/api/system/status', (req, res) => {
    (async () => {
        try {
            const state = await getSystemState();
            res.json({
                maintenance: state.maintenance,
                broadcast: state.broadcast,
                aiDisabled: Boolean(state.aiDisabled),
                aiFeatures: state.aiFeatures || {},
                festiveAmbient: Boolean(state.festiveAmbient),
                aiProvider: state.aiProvider || 'hackclub',
                hiddenPages: state.hiddenPages || []
            });
        } catch (e) {
            console.error('System status error:', e);
            res.status(500).json({ error: 'Failed to fetch system status' });
        }
    })();
});

// POST /api/maintenance (Toggle Maintenance Mode)
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


// POST /api/maintenance/prune-logs (Prune logs older than 30 days)
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

// POST /api/system/ai-model
app.post('/api/system/ai-model', requireAuth, async (req, res) => {
    try {
        const { model } = req.body || {};
        if (!model) {
            return res.status(400).json({ error: 'Missing model name' });
        }
        const updated = await setAiConfig(undefined, model);
        await addLog('SETTINGS', req.user?.studentId || 'ADMIN', `Changed AI model to ${updated.aiModel}`);
        res.json({ success: true, aiModel: updated.aiModel });
    } catch (e) {
        console.error('Update AI model error:', e);
        res.status(500).json({ error: 'Failed to update AI model' });
    }
});

// POST /api/system/ai-config
app.post('/api/system/ai-config', requireAuth, async (req, res) => {
    try {
        const { provider, model } = req.body || {};
        if (!provider) {
            return res.status(400).json({ error: 'Missing provider name' });
        }
        const updated = await setAiConfig(provider, model);
        await addLog('SETTINGS', req.user?.studentId || 'ADMIN', `Changed AI config to ${updated.aiProvider} (${updated.aiModel})`);
        res.json({ success: true, ...updated });
    } catch (e) {
        console.error('Update AI config error:', e);
        res.status(500).json({ error: 'Failed to update AI configuration' });
    }
});

// POST /api/system/ai-disabled (Admin only: global AI kill switch)
app.post('/api/system/ai-disabled', requireAuth, async (req, res) => {
    try {
        const { disabled } = req.body || {};
        if (typeof disabled !== 'boolean') {
            return res.status(400).json({ error: 'disabled must be a boolean' });
        }
        const aiDisabled = await setAiDisabled(disabled);
        await addLog('SETTINGS', req.user?.studentId || 'ADMIN', `AI features ${aiDisabled ? 'DISABLED' : 'ENABLED'} for all students`);
        res.json({ success: true, aiDisabled });
    } catch (e) {
        console.error('Update AI disabled error:', e);
        res.status(500).json({ error: 'Failed to update AI status' });
    }
});

// POST /api/system/ai-feature (Admin only: toggle one Sage feature)
app.post('/api/system/ai-feature', requireAuth, async (req, res) => {
    try {
        const { feature, disabled } = req.body || {};
        if (!AI_FEATURE_KEYS.has(feature)) {
            return res.status(400).json({ error: `Unknown AI feature: ${feature}` });
        }
        if (typeof disabled !== 'boolean') {
            return res.status(400).json({ error: 'disabled must be a boolean' });
        }
        const aiFeatures = await setAiFeature(feature, disabled);
        await addLog('SETTINGS', req.user?.studentId || 'ADMIN', `Sage feature ${feature} ${disabled ? 'DISABLED' : 'ENABLED'} for students`);
        res.json({ success: true, aiFeatures });
    } catch (e) {
        console.error('Update AI feature error:', e);
        res.status(500).json({ error: 'Failed to update Sage feature' });
    }
});

// POST /api/system/festive-ambient (Admin only: seasonal glow toggle)
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

// GET /api/system/hidden-pages (Public endpoint)
app.get('/api/system/hidden-pages', async (req, res) => {
    try {
        const state = await getSystemState();
        res.json({ hiddenPages: state.hiddenPages || [] });
    } catch (e) {
        console.error('Get hidden pages error:', e);
        res.status(500).json({ error: 'Failed to fetch hidden pages' });
    }
});

// POST /api/system/hidden-pages (Admin only)
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

// --- Build Notes Endpoints ---

// GET /api/build-notes - Fetch build notes for user view
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

// GET /api/admin/build-notes - Fetch build notes for admin panel
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

// POST /api/admin/build-notes - Save (create/update) a build note
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

// DELETE /api/admin/build-notes/:id - Delete a build note
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

// GET /api/users
app.get('/api/users', requireAuth, async (req, res) => {
    try {
        const out = await listUsers();
        res.json(out);
    } catch (e) {
        console.error('Users error:', e);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// DELETE /api/users/:id
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

// --- Data Deletion Requests (Privacy page → admin panel) ---

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

// GET /api/privacy/deletion-request - The signed-in student's latest request, if any
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

// POST /api/privacy/deletion-request - Student asks for their server-side data to be deleted
app.post('/api/privacy/deletion-request', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);
        const name = [req.user.givenName, req.user.surname].filter(Boolean).join(' ').trim() || null;
        const email = req.user.email ? String(req.user.email) : null;

        // One open request per student; a repeat click returns the existing one.
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
        // A concurrent request can win the partial unique index; return theirs.
        if (e?.code === '23505') {
            try {
                const studentId = String(req.user.studentId);
                const existing = await findPendingDeletionRequest(studentId);
                if (existing) return res.status(200).json({ success: true, request: existing, alreadyRequested: true });
            } catch { /* fall through to the 500 */ }
        }
        console.error('Deletion request submit error:', e);
        res.status(500).json({ error: 'Failed to submit deletion request' });
    }
});

// GET /api/admin/deletion-requests - List all deletion requests for the admin panel
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

// PUT /api/admin/deletion-requests/:id - 'completed' deletes the student's data; 'dismissed' closes the request
app.put('/api/admin/deletion-requests/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body || {};
        if (!['completed', 'dismissed'].includes(status)) {
            return res.status(400).json({ error: 'Status must be completed or dismissed' });
        }

        // Resolve the pending request first so a failed deletion leaves it open for a retry.
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

// --- Feedback Admin Endpoints ---

// GET /api/admin/feedback - List all feedback entries
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

// PUT /api/admin/feedback/:id - Update feedback status
app.put('/api/admin/feedback/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body || {};

        if (!status || !['open', 'resolved', 'archived'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status value. Must be open, resolved, or archived.' });
        }

        let updatedEntry;
        if (!isDbEnabled) {
            const index = feedbackEntries.findIndex(f => String(f.id) === String(id));
            if (index === -1) {
                return res.status(404).json({ error: 'Feedback entry not found' });
            }
            feedbackEntries[index].status = status;
            if (status === 'resolved') {
                feedbackEntries[index].resolvedNotified = false;
            }
            feedbackEntries[index].updatedAt = new Date();
            updatedEntry = feedbackEntries[index];
        } else {
            const result = await db.query(
                `UPDATE app_feedback 
                 SET status = $1, resolved_notified = CASE WHEN $1 = 'resolved' THEN FALSE ELSE resolved_notified END, updated_at = NOW() 
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

// DELETE /api/admin/feedback/:id - Delete feedback manually
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

// PUT /api/admin/feedback/bulk - Bulk update feedback status
app.put('/api/admin/feedback/bulk', requireAuth, async (req, res) => {
    try {
        const { ids, status } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid feedback IDs array' });
        }
        if (!status || !['open', 'resolved', 'archived'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status value. Must be open, resolved, or archived.' });
        }

        const idsStrings = ids.map(id => String(id));
        if (!isDbEnabled) {
            idsStrings.forEach(id => {
                const index = feedbackEntries.findIndex(f => String(f.id) === id);
                if (index !== -1) {
                    feedbackEntries[index].status = status;
                    if (status === 'resolved') {
                        feedbackEntries[index].resolvedNotified = false;
                    }
                    feedbackEntries[index].updatedAt = new Date();
                }
            });
        } else {
            await db.query(
                `UPDATE app_feedback 
                 SET status = $1, resolved_notified = CASE WHEN $1 = 'resolved' THEN FALSE ELSE resolved_notified END, updated_at = NOW() 
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

// DELETE /api/admin/feedback/bulk - Bulk delete feedback entries
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

// GET /api/users/:id/timetable
// REMOVED FOR PRIVACY

let aiMemoryCache = {};

// AI calls cost money and can hang: cap how often each student can make them,
// how big their input can be, and how long the provider gets to answer.
const AI_TIMEOUT_MS = 30 * 1000;
const aiLimit = rateLimit(
    [makeLimiter(20, 60 * 60 * 1000), makeLimiter(60, 24 * 60 * 60 * 1000)],
    (req) => String(req.user?.studentId),
    'You’ve used the AI features a lot recently. Try again later.'
);
const briefingLimit = rateLimit(
    [makeLimiter(30, 60 * 60 * 1000)],
    (req) => String(req.user?.studentId),
    'Too many requests. Try again later.'
);
const clip = (value, max) => String(value ?? '').slice(0, max);

// Today's notices, straight from SBHS with the student's own token. The briefing
// is shared by every student, so it must never be built from notices a client
// sent in.
const fetchTodaysNotices = async (authHeader) => {
    const response = await fetch('https://student.sbhs.net.au/api/dailynews/list.json', {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`SBHS notices request failed (${response.status})`);
    const data = await response.json();
    return Array.isArray(data?.notices) ? data.notices : [];
};

// Only the AI's ranking is cached — [{index, priority}] numbers, never notice
// content. Clients sort their own locally-fetched notices with it.
const readBriefingCache = async (dateKey) => {
    if (aiMemoryCache[dateKey]) return aiMemoryCache[dateKey];
    if (!isDbEnabled) return null;
    try {
        const cacheResult = await db.query(
            'SELECT notice_priorities FROM ai_cache WHERE date_key = $1',
            [dateKey]
        );
        if (cacheResult.rows.length === 0) return null;
        const cached = cacheResult.rows[0].notice_priorities;
        if (!Array.isArray(cached)) return null;
        aiMemoryCache[dateKey] = cached;
        return cached;
    } catch (err) {
        console.error('[ai-cache] Failed to query cache database:', err);
        return null;
    }
};

const writeBriefingCache = async (dateKey, priorities) => {
    aiMemoryCache[dateKey] = priorities;
    if (!isDbEnabled) return;
    try {
        await db.query(
            'INSERT INTO ai_cache (date_key, notice_priorities) VALUES ($1, $2::jsonb) ON CONFLICT (date_key) DO UPDATE SET notice_priorities = EXCLUDED.notice_priorities, created_at = NOW()',
            [dateKey, JSON.stringify(priorities)]
        );
    } catch (err) {
        console.error('[ai-cache] Failed to write cache to DB:', err);
    }
};

const parseAiJson = (aiText) => {
    let jsonText = String(aiText || '').trim();
    if (jsonText.startsWith('```json')) jsonText = jsonText.substring(7);
    else if (jsonText.startsWith('```')) jsonText = jsonText.substring(3);
    if (jsonText.endsWith('```')) jsonText = jsonText.substring(0, jsonText.length - 3);
    return JSON.parse(jsonText.trim());
};

const generateBriefing = async (notices) => {
    if (notices.length === 0) return { priorities: [] };

    const promptNotices = notices.map((n, i) => ({
        index: i,
        title: n.title || '',
        content: (n.content || '').replace(/<[^>]*>/g, ''), // strip HTML to save context window tokens
        isMeeting: n.isMeeting || 0,
        displayYears: n.displayYears || 'All Students'
    }));

    const systemPrompt = `You are a school assistant. Prioritize the daily school notices.
Return a JSON object in this exact format:
{
  "prioritizedNotices": [
    {
      "index": 0, // The index of the notice in the original array
      "priority": 3 // 1 to 5, where 5 is highest/urgent (meetings today, deadlines, important year assemblies) and 1 is lowest
    }
  ]
}
Return ONLY the JSON. Do not include markdown code block wraps.`;

    const { aiText } = await runAiPrompt(systemPrompt, `Here are today's notices:\n${JSON.stringify(promptNotices)}`, await getSystemState(), 'application/json');
    const parsed = parseAiJson(aiText);
    const priorities = Array.isArray(parsed.prioritizedNotices) ? parsed.prioritizedNotices : [];

    return { priorities };
};

// One briefing is generated per day; students who ask while it's being made wait
// for the same result instead of starting their own AI call.
const briefingInFlight = new Map(); // dateKey -> Promise

// POST /api/ai/briefing
app.post('/api/ai/briefing', requireStudentAuth, briefingLimit, async (req, res) => {
    if (await aiUnderMaintenance(req, res, { feature: 'noticeRanking' })) return;
    const dateKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

    try {
        const cached = await readBriefingCache(dateKey);
        if (cached) return res.json({ priorities: cached });

        if (!briefingInFlight.has(dateKey)) {
            const job = (async () => {
                const notices = await fetchTodaysNotices(req.headers.authorization);
                const result = await generateBriefing(notices);
                await writeBriefingCache(dateKey, result.priorities);
                console.log(`[ai] Briefing priorities cached for ${dateKey}`);
                return result;
            })().finally(() => briefingInFlight.delete(dateKey));
            briefingInFlight.set(dateKey, job);
        }
        const result = await briefingInFlight.get(dateKey);
        res.json({ priorities: result.priorities });
    } catch (err) {
        // Nothing is cached, so the next request tries again. The client keeps
        // its own notice order when priorities come back null.
        console.error('[ai] Briefing failed:', err?.message || err);
        res.json({ priorities: null });
    }
});

// Clipboard sessions change rarely, so the compact summary Sage sees is cached
// per student — Ask Sage doesn't hit the portal API on every question.
const sageSessionsCache = new Map(); // studentId -> { at, text }
const SAGE_SESSIONS_TTL_MS = 15 * 60 * 1000;

const pad2 = (n) => String(n).padStart(2, '0');
const ymdOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtSageDate = (d) => d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// "(today)", "(tomorrow)", "(in 3 days)"… anchored to the server's current date so
// the model never has to work out which day a session falls on.
const sageRelLabel = (date) => {
    const d = new Date(`${date}T00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return ' (today)';
    if (diff === 1) return ' (tomorrow)';
    if (diff === -1) return ' (yesterday)';
    return diff > 0 ? ` (in ${diff} days)` : ` (${-diff} days ago)`;
};

const formatSageSessions = (items) => {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const sessions = (Array.isArray(items) ? items : [])
        .map((s) => {
            const start = s.startDateTime ? new Date(s.startDateTime) : null;
            if (!start || Number.isNaN(start.getTime())) return null;
            const end = s.endDateTime ? new Date(s.endDateTime) : null;
            const time = end && !Number.isNaN(end.getTime())
                ? `${start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}–${end.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`
                : start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
            const relDay = ymdOf(start);
            return {
                start,
                line: `${fmtSageDate(start)}${sageRelLabel(relDay)}, ${time} — ${s.title || s.activity?.name || 'Session'}`
                    + `${s.activity?.name && s.title && s.title !== s.activity.name ? ` (${s.activity.name})` : ''}`
                    + `${s.location?.name ? `, ${s.location.name}` : ''}`
                    + `${s.opponent?.name || typeof s.opponent === 'string' ? ` vs ${s.opponent?.name || s.opponent}` : ''}`
                    + `${s.cancelled ? ' [cancelled]' : ''}`
                    + `${s.scored && (s.organisationScore != null || s.opponentScore != null) ? `, score ${s.organisationScore ?? '?'}–${s.opponentScore ?? '?'}` : ''}`
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.start - b.start);

    const upcoming = sessions.filter((s) => s.start.getTime() >= now - DAY_MS).slice(0, 20);
    const recent = sessions.filter((s) => s.start.getTime() < now - DAY_MS).slice(-8).reverse();
    const parts = [];
    if (upcoming.length) parts.push(`Upcoming:\n${upcoming.map((s) => `- ${s.line}`).join('\n')}`);
    if (recent.length) parts.push(`Recent:\n${recent.map((s) => `- ${s.line}`).join('\n')}`);
    return parts.join('\n') || null;
};

const fetchSageClipboardSessions = async (req) => {
    const authHeader = req.headers['authorization'];
    if (process.env.BYPASS_AUTH === 'true' || !authHeader?.startsWith('Bearer ')) return null;
    const studentId = String(req.user.studentId);
    const cached = sageSessionsCache.get(studentId);
    if (cached && Date.now() - cached.at < SAGE_SESSIONS_TTL_MS) return cached.text;

    try {
        const currentYear = new Date().getFullYear();
        const url = new URL(`${SBHS_PORTAL_API}/students/${studentId}/clipboard/sessions`);
        url.searchParams.set('date[after]', `${currentYear}-01-01`);
        url.searchParams.set('date[before]', `${currentYear}-12-31`);
        url.searchParams.set('_itemsPerPage', '300');
        const response = await fetch(url.toString(), {
            headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) {
            console.warn(`[ai] SBHS clipboard/sessions returned ${response.status}`);
            return cached?.text ?? null;
        }
        const data = await response.json();
        const items = Array.isArray(data) ? data : (Array.isArray(data?.member) ? data.member : []);
        const text = formatSageSessions(items);
        sageSessionsCache.set(studentId, { at: Date.now(), text });
        return text;
    } catch (e) {
        console.warn('[ai] clipboard/sessions fetch failed:', e?.message || e);
        return cached?.text ?? null;
    }
};

// --- Dated class schedule -------------------------------------------------
// The cycle JSON alone forces the model to compute which cycle day a date
// falls on — it gets that wrong. Instead we fetch the next few school days'
// day timetables (same endpoint the app uses) and hand Sage the answer:
// explicit dates, 24-hour times, cycle day names, substitutions applied.

const sageScheduleCache = new Map(); // studentId -> { at, text }
const SAGE_SCHEDULE_TTL_MS = 30 * 60 * 1000;
const SAGE_SCHEDULE_DAYS = 5;
const SBHS_TIMETABLE_API = 'https://student.sbhs.net.au/api/timetable/daytimetable.json';

// Next N Mon–Fri dates from `from`, as YYYY-MM-DD strings.
const nextSchoolDates = (from, count) => {
    const dates = [];
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    while (dates.length < count) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) dates.push(ymdOf(d));
        d.setDate(d.getDate() + 1);
    }
    return dates;
};

const sageIsBreak = (bellId, title) => {
    const id = String(bellId ?? '').toUpperCase();
    if (id === 'R' || id === 'L' || id === 'RC') return true;
    return /lunch|recess|roll\s*call|free\s*period/i.test(String(title || ''));
};

// Same matching rule as the client's variationMatchesPeriod.
const sageVarMatches = (variation, periodInfo) => {
    if (!variation || !periodInfo) return false;
    if (variation.title && periodInfo.title && variation.title !== periodInfo.title) return false;
    if (variation.year != null && periodInfo.year != null && String(variation.year) !== String(periodInfo.year)) return false;
    return true;
};

// One day timetable -> a compact dated block, or null when there's nothing on.
const summariseSageDay = (data, dateKey) => {
    const inner = data?.timetable?.timetable || data?.timetable;
    const periods = inner?.periods || {};
    const bells = Array.isArray(data?.bells) ? data.bells : [];
    // SBHS rolls non-school days forward to the next school day — don't list
    // the same day twice under two dates.
    if (/^\d{4}-\d{2}-\d{2}$/.test(data?.date || '') && data.date !== dateKey) return null;
    const routine = typeof inner?.routine === 'string'
        ? inner.routine.split(',').map(s => s.trim()).filter(Boolean)
        : Object.keys(periods);
    if (!routine.length) return null;

    // Period titles are short codes ("Ma1"); the subjects map has full names.
    const subjectIndex = {};
    Object.values(inner?.subjects || {}).forEach(s => {
        if (s?.shortTitle) subjectIndex[`${s.year ?? ''}${s.shortTitle}`] = s;
    });
    const fullName = (p) => {
        const subject = subjectIndex[`${p?.year ?? ''}${p?.title ?? ''}`];
        if (!subject?.title) return p?.title || '';
        const prefix = subject.year != null ? `${subject.year} ` : null;
        return prefix && subject.title.startsWith(prefix) ? subject.title.slice(prefix.length) : subject.title;
    };

    const rows = [];
    for (const bellId of routine) {
        const bell = bells.find(b => String(b.bell) === String(bellId));
        const p = periods[bellId];
        if (!p) continue; // free period
        if (sageIsBreak(bellId, p.title || bell?.bellDisplay)) continue;

        let teacher = p.fullTeacher || p.teacher || '';
        let room = p.room || '';
        const flags = [];
        const classVar = data?.classVariations?.[bellId];
        if (sageVarMatches(classVar, p)) {
            const type = String(classVar.type || '').toLowerCase();
            if (type === 'replacement') {
                teacher = classVar.casualSurname || classVar.casual || teacher;
                flags.push('sub');
            } else if (type === 'nocover') {
                teacher = 'No teacher';
                flags.push('no cover');
            }
        }
        const roomVar = data?.roomVariations?.[bellId];
        if (sageVarMatches(roomVar, p) && roomVar.roomTo) {
            if (roomVar.roomFrom && roomVar.roomFrom !== room) flags.push(`was ${roomVar.roomFrom}`);
            room = roomVar.roomTo;
        }

        const time = bell?.time && bell?.endTime ? `${bell.time}–${bell.endTime}` : (bell?.time || '');
        const label = bell?.bellDisplay || `Period ${bellId}`;
        const name = fullName(p) || p.title || label;
        const detail = [teacher, room ? `Rm ${room}` : ''].filter(Boolean).join(', ');
        rows.push(`- ${label} ${time} — ${name}${detail ? `, ${detail}` : ''}${flags.length ? ` [${flags.join(', ')}]` : ''}`);
    }
    if (!rows.length) return null;

    const dayname = inner?.dayname ? `, cycle day "${inner.dayname}"` : '';
    const rel = sageRelLabel(dateKey);
    return `${fmtSageDate(new Date(`${dateKey}T00:00`))}${rel}${dayname}:\n${rows.join('\n')}`;
};

const fetchSageDaySchedule = async (req) => {
    const authHeader = req.headers['authorization'];
    if (process.env.BYPASS_AUTH === 'true' || !authHeader?.startsWith('Bearer ')) return null;
    const studentId = String(req.user.studentId);
    const cached = sageScheduleCache.get(studentId);
    if (cached && Date.now() - cached.at < SAGE_SCHEDULE_TTL_MS) return cached;

    try {
        const dates = nextSchoolDates(new Date(), SAGE_SCHEDULE_DAYS);
        const fetchDay = async (dateKey) => {
            const response = await fetch(`${SBHS_TIMETABLE_API}?date=${dateKey}`, {
                headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
                signal: AbortSignal.timeout(8000)
            });
            if (!response.ok) return null;
            return summariseSageDay(await response.json(), dateKey);
        };
        const days = await Promise.all(dates.map(d => fetchDay(d).catch(() => null)));
        const blocks = days.filter(Boolean);
        if (!blocks.length) return cached ?? null;
        const result = { at: Date.now(), text: blocks.join('\n\n') };
        sageScheduleCache.set(studentId, result);
        return result;
    } catch (e) {
        console.warn('[ai] day schedule fetch failed:', e?.message || e);
        return cached ?? null;
    }
};

// POST /api/ai/timetable-qa
app.post('/api/ai/timetable-qa', requireStudentAuth, aiLimit, async (req, res) => {
    if (await aiUnderMaintenance(req, res, { allowAdmin: true, feature: 'timetableQa' })) return;
    try {
        const studentId = String(req.user.studentId);
        const dbUser = await getUserById(studentId);
        if (!dbUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { timetable, currentMinutes, completeTimetable } = req.body || {};
        const question = clip(req.body?.question, 500).trim();
        if (!question) {
            return res.status(400).json({ error: 'Missing question' });
        }

        const systemStateObj = await getSystemState();
        const activeProvider = systemStateObj.aiProvider || 'hackclub';
        const activeModel = systemStateObj.aiModel || (activeProvider === 'gemini' ? 'gemini-1.5-flash' : 'qwen/qwen3-32b');
        const providerName = activeProvider === 'gemini' ? 'Google Gemini' : activeProvider === 'hackclub' ? 'Hack Club AI' : activeProvider;

        // Construct a prompt with explicit dates: a dated class schedule for the
        // next school days, the full cycle for anything further out, and the
        // student's Clipboard sessions — all with concrete dates and times so
        // the model never has to work out which day something falls on.
        const now = new Date();
        const todayDateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const nowTimeStr = now.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
        const todayDayname = timetable?.timetable?.dayname || timetable?.dayname || 'Unknown';
        const [sessionsText, schedule] = await Promise.all([
            fetchSageClipboardSessions(req),
            fetchSageDaySchedule(req)
        ]);
        const scheduleText = schedule?.text || null;

        const systemPrompt = `You are Sage, a school assistant. Answer timetable and Clipboard session questions using the data below.

- Today: ${todayDateStr}; current time ${nowTimeStr} (${currentMinutes} min since midnight). Today's cycle day: ${todayDayname}.
- Dated class schedule (times are 24-hour; authoritative for the dates shown, substitutions and room changes already applied):
${scheduleText || 'unavailable'}
- Full cycle timetable (all cycle days — use only for dates NOT covered by the dated schedule): ${JSON.stringify(completeTimetable)}
- Clipboard sessions (sport/activities): ${sessionsText || 'unavailable'}

Rules: be brief (1-2 sentences, markdown bullets for lists). Every date and time above is exact — never move a class or session onto a different day, and never assume something scheduled for another date is today. If the dated schedule is unavailable or the date asked about is beyond it, work it out from the cycle carefully or say you only have the next few school days rather than guessing. School runs Mon-Fri. Decline questions unrelated to the timetable or Clipboard sessions politely. If asked about storage or who processes data: your typed question, timetable, and Clipboard session details are sent to ${providerName} to generate the answer; only your typed question text (not timetable or session data) is logged for admin review; answers are never stored. Don't assume teacher genders.`;

        let answer = '';

        if (activeProvider === 'gemini') {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                answer = "AI features are temporarily unavailable because the API key is not configured on the server.";
            } else {
                console.log(`[ai] Querying Google Gemini API (${activeModel}) for Timetable Q&A...`);
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: `${systemPrompt}\n\nQuestion: ${question}`
                            }]
                        }],
                        generationConfig: {
                            temperature: 0.4,
                            maxOutputTokens: 150
                        }
                    })
                });

                if (!response.ok) {
                    throw new Error(`Gemini API responded with status ${response.status}`);
                }

                const aiData = await response.json();
                answer = aiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            }
        } else {
            const apiKey = process.env.HACKCLUB_AI_API_KEY;
            if (!apiKey) {
                answer = "AI features are temporarily unavailable because the API key is not configured on the server.";
            } else {
                console.log(`[ai] Querying Hack Club AI (${activeModel}) for Timetable Q&A...`);
                const response = await fetch('https://ai.hackclub.com/proxy/v1/chat/completions', {
                    method: 'POST',
                    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: activeModel,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: question }
                        ],
                        temperature: 0.4,
                        max_tokens: 150
                    })
                });

                if (!response.ok) {
                    throw new Error(`Hack Club AI responded with status ${response.status}`);
                }

                const aiData = await response.json();
                answer = aiData.choices?.[0]?.message?.content?.trim() || '';
            }
        }

        await addAiLog(req.user?.studentId || 'UNKNOWN', question, activeProvider, activeModel);
        res.json({ answer });

    } catch (err) {
        console.error('[ai-timetable-qa] Failed:', err);
        const errMsg = 'Failed to generate answer';
        await addAiLog(req.user?.studentId || 'UNKNOWN', clip(req.body?.question || '', 500).trim(), 'unknown', 'unknown', 'error').catch(() => {});
        res.status(500).json({ error: errMsg });
    }
});

async function runAiPrompt(systemPrompt, userPrompt, systemStateObj, responseMimeType = 'text/plain') {
    const activeProvider = systemStateObj.aiProvider || 'hackclub';
    const activeModel = systemStateObj.aiModel || (activeProvider === 'gemini' ? 'gemini-1.5-flash' : 'qwen/qwen3-32b');

    let aiText = '';

    if (activeProvider === 'gemini') {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not set on the server.');
        }

        const body = {
            contents: [{
                parts: [{
                    text: `${systemPrompt}\n\n${userPrompt}`
                }]
            }],
            generationConfig: {
                temperature: 0.3
            }
        };

        if (responseMimeType === 'application/json') {
            body.generationConfig.responseMimeType = 'application/json';
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`, {
            method: 'POST',
            signal: AbortSignal.timeout(AI_TIMEOUT_MS),
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Gemini API responded with status ${response.status}`);
        }

        const aiData = await response.json();
        aiText = aiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } else {
        const apiKey = process.env.HACKCLUB_AI_API_KEY;
        if (!apiKey) {
            throw new Error('HACKCLUB_AI_API_KEY is not set on the server.');
        }

        const response = await fetch('https://ai.hackclub.com/proxy/v1/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(AI_TIMEOUT_MS),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: activeModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) {
            throw new Error(`Hack Club AI responded with status ${response.status}`);
        }

        const aiData = await response.json();
        aiText = aiData.choices?.[0]?.message?.content?.trim() || '';
    }

    return { aiText, activeProvider, activeModel };
}

// POST /api/cache/clear
app.post('/api/cache/clear', requireAuth, async (req, res) => {
    try {
        console.log('Cache clear requested by admin');
        aiMemoryCache = {};
        if (isDbEnabled) {
            await db.query('DELETE FROM ai_cache', []);
        }
        res.json({ success: true, message: 'Server cache and AI cache cleared successfully' });
    } catch (e) {
        console.error('Clear cache error:', e);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

// GET /api/ai/logs (Admin only: view AI usage logs)
app.get('/api/ai/logs', requireAuth, async (req, res) => {
    try {
        if (!isDbEnabled) {
            return res.json(aiUsageLogs);
        }
        const result = await db.query(
            'SELECT id, created_at, student_id, question, status, provider, model FROM ai_usage_logs ORDER BY created_at DESC LIMIT 100',
            []
        );
        const out = result.rows.map(row => ({
            id: row.id,
            timestamp: row.created_at,
            studentId: row.student_id,
            question: row.question,
            status: row.status,
            provider: row.provider,
            model: row.model
        }));
        res.json(out);
    } catch (e) {
        console.error('AI logs fetch error:', e);
        res.status(500).json({ error: 'Failed to fetch AI usage logs' });
    }
});

// POST /api/ai/cache/clear (Admin only: clear AI briefings cache)
app.post('/api/ai/cache/clear', requireAuth, async (req, res) => {
    try {
        console.log('AI cache clear requested by admin');
        aiMemoryCache = {};
        if (isDbEnabled) {
            await db.query('DELETE FROM ai_cache', []);
        }
        await addLog('SETTINGS', req.user?.studentId || 'ADMIN', 'Cleared AI cache (briefing notices and summary)');
        res.json({ success: true, message: 'AI Cache cleared successfully' });
    } catch (e) {
        console.error('Clear AI cache error:', e);
        res.status(500).json({ error: 'Failed to clear AI cache' });
    }
});



// --- NEW STUDENT & PORTAL ENDPOINTS ---

// Helper for student access control (Admin or the student themselves)
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

// SBHS Core API (award scheme, clipboard, attendance, enrolments). Spec: https://api.sbhs.net.au/api/core/#/
// Asking for plain JSON returns collections as arrays rather than JSON-LD `member` wrappers.
const SBHS_PORTAL_API = 'https://api.sbhs.net.au/api/core';

// Forwards query string params to upstream URL, preserving bracketed parameter
// names (e.g. date[after], date[before]) without Express qs nested-object stringification.
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

// SBHS can be slow on big collections (a year of Clipboard sessions); the browser waits 20s.
const PORTAL_TIMEOUT_MS = 15000;

// A signed-in student's request that SBHS failed. Sending the mock (an empty list) here
// used to look like "no data" and overwrite the copy saved on the device, so a slow or
// failing SBHS blanked pages like Clipboard. An error lets the app keep its saved copy.
// 404 still gets the mock: it means there's nothing there, not that SBHS failed.
// 401 becomes 403 so a Core API refusal is never read as the sign-in having lapsed.
const sendPortalFailure = (res, status, generateMockData, user) => {
    if (status === 404) return res.json(generateMockData(user));
    const code = !status ? 504 : status >= 500 ? 502 : status === 401 ? 403 : status;
    return res.status(code).json({ error: 'sbhs_unavailable', upstreamStatus: status || null });
};

// Main proxy/mock resolver for student endpoints
const resolveStudentPortalApi = async (req, res, subpath, generateMockData) => {
    const isAuthorized = await checkStudentAccess(req, res);
    if (!isAuthorized) return;
    const studentId = req.params.studentId;
    const authHeader = req.headers['authorization'];
    if (process.env.BYPASS_AUTH !== 'true' && authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const url = new URL(`${SBHS_PORTAL_API}/students/${studentId}/${subpath}`);
            forwardPortalQueryParams(url, req);

            // If clipboard/sessions is requested without explicit date filters, default to
            // the full current school year and 300 items per page so the upstream API
            // does not default to a rolling 3-week window.
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

// Generic resolver for global endpoints
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

// 1. Attendance Absences
registerRoutePair('/students/:studentId/attendance/absences', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'attendance/absences', (user) => []);
});

// 2. Attendance Absence Detail
registerRoutePair('/students/:studentId/attendance/absences/:id', requireStudentAuth, (req, res) => {
    const id = req.params.id;
    resolveStudentPortalApi(req, res, `attendance/absences/${id}`, (user) => null);
});

// 3. Scan-ins
registerRoutePair('/students/:studentId/attendance/scan-ins', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'attendance/scan-ins', (user) => []);
});

// 4. Scan-in Detail
registerRoutePair('/students/:studentId/attendance/scan-ins/:dateId', requireStudentAuth, (req, res) => {
    const dateId = req.params.dateId;
    resolveStudentPortalApi(req, res, `attendance/scan-ins/${dateId}`, (user) => null);
});

// 5. Issued Awards
registerRoutePair('/students/:studentId/award-scheme/awards', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'award-scheme/awards', (user) => []);
});

// 6. Badges
registerRoutePair('/students/:studentId/award-scheme/badges', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'award-scheme/badges', (user) => []);
});

// 7. Decorations
registerRoutePair('/students/:studentId/award-scheme/decorations', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'award-scheme/decorations', (user) => []);
});

// 8. Student Prizes
registerRoutePair('/students/:studentId/award-scheme/prizes', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'award-scheme/prizes', (user) => []);
});

// 9. Rollover
registerRoutePair('/students/:studentId/award-scheme/rollover', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'award-scheme/rollover', (user) => null);
});

// 10. Clipboard Attendance
registerRoutePair('/students/:studentId/clipboard/attendance', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'clipboard/attendance', (user) => []);
});

// 11. Clipboard Pre-explained Absences
registerRoutePair('/students/:studentId/clipboard/pre-explained-absences', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'clipboard/pre-explained-absences', (user) => []);
});

// 12. Clipboard Sessions
registerRoutePair('/students/:studentId/clipboard/sessions', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'clipboard/sessions', (user) => []);
});

// 13. Clipboard Teams
registerRoutePair('/students/:studentId/clipboard/teams', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'clipboard/teams', (user) => []);
});

// 14. Clipboard Team Detail
registerRoutePair('/students/:studentId/clipboard/teams/:teamId', requireStudentAuth, (req, res) => {
    const teamId = req.params.teamId;
    resolveStudentPortalApi(req, res, `clipboard/teams/${teamId}`, (user) => null);
});

// 15. Enrolments
registerRoutePair('/students/:studentId/enrolments', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'enrolments', (user) => []);
});

// 16. Enrolments Detail
registerRoutePair('/students/:studentId/enrolments/:schoolYear', requireStudentAuth, (req, res) => {
    const schoolYear = parseInt(req.params.schoolYear) || 2026;
    resolveStudentPortalApi(req, res, `enrolments/${schoolYear}`, (user) => null);
});

// 17. Timetable Student Resource
registerRoutePair('/students/:studentId/timetable', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'timetable', (user) => null);
});

// 18. Timetable Classes
registerRoutePair('/students/:studentId/timetable/classes', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'timetable/classes', (user) => []);
});

// 19. Timetable Dates
registerRoutePair('/students/:studentId/timetable/dates', requireStudentAuth, (req, res) => {
    resolveStudentPortalApi(req, res, 'timetable/dates', (user) => []);
});

// 20. Timetable Date Detail
registerRoutePair('/students/:studentId/timetable/dates/:date', requireStudentAuth, (req, res) => {
    const dateParam = req.params.date;
    resolveStudentPortalApi(req, res, `timetable/dates/${dateParam}`, (user) => null);
});

// Global Award Scheme & Clipboard routes

// 21. Global Awards
registerRoutePair('/award-scheme/awards', requireStudentAuth, (req, res) => {
    resolveGlobalPortalApi(req, res, 'award-scheme/awards', () => []);
});

// 22. Global Award Detail
registerRoutePair('/award-scheme/awards/:id', requireStudentAuth, (req, res) => {
    const id = req.params.id;
    resolveGlobalPortalApi(req, res, `award-scheme/awards/${id}`, () => null);
});

// 23. Global Categories
registerRoutePair('/award-scheme/categories', requireStudentAuth, (req, res) => {
    resolveGlobalPortalApi(req, res, 'award-scheme/categories', () => []);
});

// 24. Global Category Detail
registerRoutePair('/award-scheme/categories/:id', requireStudentAuth, (req, res) => {
    const id = req.params.id;
    resolveGlobalPortalApi(req, res, `award-scheme/categories/${id}`, () => null);
});

// 25. Global House Points
registerRoutePair('/award-scheme/house-points', requireStudentAuth, (req, res) => {
    resolveGlobalPortalApi(req, res, 'award-scheme/house-points', () => []);
});

// 26. Global Nominations
registerRoutePair('/award-scheme/nominations', requireStudentAuth, (req, res) => {
    resolveGlobalPortalApi(req, res, 'award-scheme/nominations', (user) => []);
});

// 27. Global Nomination Detail
registerRoutePair('/award-scheme/nominations/:id', requireStudentAuth, (req, res) => {
    const id = req.params.id;
    resolveGlobalPortalApi(req, res, `award-scheme/nominations/${id}`, (user) => null);
});

// 28. Global Prizes
registerRoutePair('/award-scheme/prizes', requireStudentAuth, (req, res) => {
    resolveGlobalPortalApi(req, res, 'award-scheme/prizes', () => []);
});

// 29. Global Prize Detail
registerRoutePair('/award-scheme/prizes/:id', requireStudentAuth, (req, res) => {
    const id = req.params.id;
    resolveGlobalPortalApi(req, res, `award-scheme/prizes/${id}`, () => null);
});

// 30. Global Clipboard Activities
registerRoutePair('/clipboard/activities', requireStudentAuth, (req, res) => {
    resolveGlobalPortalApi(req, res, 'clipboard/activities', () => []);
});

// 31. Global Clipboard Activity Detail
registerRoutePair('/clipboard/activities/:id', requireStudentAuth, (req, res) => {
    const id = req.params.id;
    resolveGlobalPortalApi(req, res, `clipboard/activities/${id}`, () => null);
});

// 32. Global Clipboard Departments
registerRoutePair('/clipboard/departments', requireStudentAuth, (req, res) => {
    resolveGlobalPortalApi(req, res, 'clipboard/departments', () => []);
});

// 33. Global Clipboard Department Detail
registerRoutePair('/clipboard/departments/:id', requireStudentAuth, (req, res) => {
    const id = req.params.id;
    resolveGlobalPortalApi(req, res, `clipboard/departments/${id}`, () => null);
});

// 34. Global Clipboard Team Detail (this is GET /clipboard/teams/{id})
registerRoutePair('/clipboard/teams/:id', requireStudentAuth, (req, res) => {
    const id = req.params.id;
    resolveGlobalPortalApi(req, res, `clipboard/teams/${id}`, () => null);
});

// 35. Transit departures API
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
            
            // 1. Resolve stop name to ID using Stop Finder
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
            
            // Filter to actual stops/stations
            const matchedPoint = points.find(p => p.type === 'stop' || p.type === 'station') || points[0];
            
            if (!matchedPoint || !matchedPoint.id) {
                return res.json([]); // No stops found
            }

            const stopId = matchedPoint.id;
            console.log(`[transit] Resolved stop ID: ${stopId} (${matchedPoint.name})`);

            // 2. Query Departure Monitor API
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

            // Free users get 6 (3 visible + 3 blurred), Pro gets 10
            return res.json(departures.slice(0, 10));
        } else {
            // fallback to dynamic simulated mock data
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
            
            // Free users get 6 (3 visible + 3 blurred), Pro gets all
            return res.json(departures);
        }
    } catch (e) {
        console.error('Transit API error:', e);
        res.status(500).json({ error: 'Failed to fetch transit departures' });
    }
});

// --- Sign-in ---
// The SBHS client secret stays on the server. The browser sends its sign-in code
// or refresh token here; the server adds the client ID and secret and forwards
// the request to SBHS. SBHS_CLIENT_* fall back to the VITE_SBHS_CLIENT_* names
// the client build already uses, so existing deployments need no new settings.
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
        res.status(response.status).type(response.headers.get('content-type') || 'application/json').send(body);
    } catch (e) {
        console.error('[auth] SBHS token request failed:', e?.message || e);
        res.status(502).json({ error: 'sbhs_unreachable', error_description: 'Couldn’t reach SBHS. Try again.' });
    }
});

// Health check endpoint (public). Liveness only: it doesn't touch the database,
// so a database blip doesn't get the server restarted.
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Readiness: 200 when the database (if configured) answers, 503 otherwise.
app.get('/health/ready', async (req, res) => {
    if (!isDbEnabled) return res.json({ status: 'ok', database: 'not configured' });
    try {
        await db.query('SELECT 1');
        res.json({ status: 'ok', database: 'ok' });
    } catch (e) {
        res.status(503).json({ status: 'unavailable', database: 'unreachable' });
    }
});

// Unknown API routes get a JSON 404, not the app's HTML page.
app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Serve static assets from Vite build in client/dist.
// Files under /assets have content hashes in their names, so browsers can keep
// them for a year. Everything else (index.html, the service worker,
// version.json) is revalidated on every load so new deploys show up at once.
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

// Fallback unmatched routes to the SPA shell. The public privacy page is a
// separate prerendered document so crawlers and no-JS visitors can read it.
app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    if (req.path === '/privacy' || req.path === '/privacy/') {
        return res.sendFile(path.join(clientDist, 'privacy.html'));
    }
    res.sendFile(path.join(clientDist, 'index.html'));
});

// Last-resort error handler: log it, and never send a stack trace to the browser.
app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error('[server] Unhandled route error:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Something went wrong' });
});

// A stray rejected promise shouldn't take the whole server down.
process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled promise rejection:', reason);
});

if (require.main === module) {
    const server = app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
    // Railway can keep connections open between requests; keep ours open a bit
    // longer than its proxy so it never reuses a socket we just closed.
    server.keepAliveTimeout = 65 * 1000;
    server.headersTimeout = 66 * 1000;

    // On redeploy Railway sends SIGTERM: finish in-flight requests, then close
    // the database pool, instead of dropping requests mid-way.
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

// Export the app for Vercel
module.exports = app;
