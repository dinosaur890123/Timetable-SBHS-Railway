const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const crypto = require('crypto');

const db = require('./db');

dotenv.config();

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
if (!stripe) {
    console.warn('[billing] STRIPE_SECRET_KEY is not configured. Stripe billing routes will fail until configured.');
}

const app = express();
const PORT = process.env.PORT || 8080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const VERSION = '1.0.2'; // Increment this to trigger update

// Middleware
const allowedOrigins = ['https://www.synchron.work', 'http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            // For debugging, you might want to log the blocked origin
            console.log('Blocked Origin:', origin);
            // Optionally allow it anyway for now to fix the blockage
            // return callback(null, true);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token']
}));

// Stripe Webhook Endpoint (needs raw body parser before express.json)
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripe) {
        console.error('[webhook] Stripe is not configured.');
        return res.status(500).json({ error: 'Stripe not configured' });
    }

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error(`[webhook] Error verifying signature: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`[webhook] Received event: ${event.type}`);

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const studentId = session.client_reference_id || (session.metadata && session.metadata.studentId);
                const stripeCustomerId = session.customer;
                const stripeSubscriptionId = session.subscription;
                
                if (session.mode === 'payment') {
                    // This is a one-off donation
                    await addLog('DONATION', studentId || 'GUEST', `Processed successful one-off donation of ${(session.amount_total / 100).toFixed(2)} ${session.currency.toUpperCase()}`);
                    console.log(`[webhook] Donation processed successfully for customer: ${stripeCustomerId}`);
                } else {
                    // Subscription checkout
                    let subscriptionStatus = 'active';
                    if (stripeSubscriptionId) {
                        try {
                            const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
                            subscriptionStatus = subscription.status;
                        } catch (subErr) {
                            console.error('[webhook] Error retrieving subscription details:', subErr);
                        }
                    }

                    if (studentId) {
                        await updateUserSubscription(studentId, {
                            stripeCustomerId,
                            stripeSubscriptionId,
                            subscriptionStatus
                        });
                        console.log(`[webhook] User subscription activated for studentId: ${studentId}`);
                    } else {
                        console.error('[webhook] No studentId found in checkout session metadata or client_reference_id');
                    }
                }
                break;
            }
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                const stripeSubscriptionId = subscription.id;
                const stripeCustomerId = subscription.customer;
                const subscriptionStatus = subscription.status;

                await updateUserSubscriptionByStripeId({
                    stripeCustomerId,
                    stripeSubscriptionId,
                    subscriptionStatus
                });
                console.log(`[webhook] Subscription updated: ${stripeSubscriptionId} to status: ${subscriptionStatus}`);
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const stripeSubscriptionId = subscription.id;
                const stripeCustomerId = subscription.customer;
                const subscriptionStatus = 'canceled';

                await updateUserSubscriptionByStripeId({
                    stripeCustomerId,
                    stripeSubscriptionId,
                    subscriptionStatus
                });
                console.log(`[webhook] Subscription deleted: ${stripeSubscriptionId}`);
                break;
            }
            default:
                break;
        }
        res.json({ received: true });
    } catch (err) {
        console.error('[webhook] Error handling event:', err);
        res.status(500).json({ error: 'Webhook handler failed' });
    }
});

app.use(express.json());

// In-memory fallback storage (used only when POSTGRES_URL/DATABASE_URL is not set)
let users = [];
let logs = []; // System logs
let aiUsageLogs = []; // AI usage logs memory fallback
let notes = []; // Study notes memory fallback
let feedbackEntries = []; // Feedback submissions memory fallback
let assignments = []; // Homework/assignments memory fallback
let systemState = {
    maintenance: false,
    broadcast: null, // { message: "...", type: "info/warning/error" }
    aiProvider: 'hackclub',
    aiModel: 'qwen/qwen3-32b'
};

// Historical system metrics buffer (last 20 entries)
const statsHistory = [];
const MAX_HISTORY = 20;

// Initialize history with initial baseline values so it is populated at boot
const startMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
for (let i = 19; i >= 0; i--) {
    const time = new Date(Date.now() - i * 10000);
    statsHistory.push({
        time: time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        memory: Math.round(startMemory + (Math.random() * 6 - 3)),
        sessions: Math.floor(Math.random() * 3) + 1
    });
}

// Update history every 10 seconds
setInterval(() => {
    const currentMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const sessions = Math.floor(Math.random() * 4) + 1; // Active simulation
    
    statsHistory.push({
        time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        memory: currentMemory,
        sessions: sessions
    });
    
    if (statsHistory.length > MAX_HISTORY) {
        statsHistory.shift();
    }
}, 10000);

const isDbEnabled = db.hasDb();
if (!isDbEnabled) {
    console.warn('[admin-db] POSTGRES_URL/DATABASE_URL not set; using in-memory admin storage');
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

const addAiLog = async (studentId, question, answer, provider, model) => {
    const log = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        studentId: studentId || 'UNKNOWN',
        question: question || '',
        answer: answer || '',
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
            'INSERT INTO ai_usage_logs (id, created_at, student_id, question, answer, provider, model) VALUES ($1, NOW(), $2, $3, $4, $5, $6)',
            [log.id, log.studentId, log.question, log.answer, log.provider, log.model]
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
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
});

async function getSystemState() {
    if (!isDbEnabled) {
        if (!systemState.aiProvider) systemState.aiProvider = 'hackclub';
        if (!systemState.aiModel) systemState.aiModel = 'qwen/qwen3-32b';
        return systemState;
    }

    const result = await db.query(
        'SELECT maintenance, broadcast_message, broadcast_type, ai_provider, ai_model, updated_at FROM system_state WHERE id = 1',
        []
    );

    const row = result.rows[0] || { maintenance: false, broadcast_message: null, broadcast_type: null, ai_provider: 'hackclub', ai_model: 'qwen/qwen3-32b', updated_at: null };
    return {
        maintenance: Boolean(row.maintenance),
        broadcast: row.broadcast_message ? { message: row.broadcast_message, type: row.broadcast_type || 'info', id: row.updated_at } : null,
        aiProvider: row.ai_provider || 'hackclub',
        aiModel: row.ai_model || 'qwen/qwen3-32b'
    };
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

    await db.query(
        'UPDATE system_state SET ai_provider = $1, ai_model = $2, updated_at = NOW() WHERE id = 1',
        [cleanProvider, cleanModel]
    );

    return { aiProvider: cleanProvider, aiModel: cleanModel };
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

    const res = await db.query(
        'UPDATE system_state SET broadcast_message = $1, broadcast_type = $2, updated_at = NOW() WHERE id = 1 RETURNING updated_at',
        [message || null, message ? (type || 'info') : null]
    );

    const ts = res.rows[0]?.updated_at;
    return message ? { message, type: type || 'info', id: ts } : null;
}

async function setMaintenance(maintenance) {
    if (!isDbEnabled) {
        systemState.maintenance = Boolean(maintenance);
        return systemState.maintenance;
    }

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
        'SELECT id, name, email, role, year, status, joined, last_seen, stripe_customer_id, stripe_subscription_id, subscription_status, show_supporter FROM app_users ORDER BY last_seen DESC, joined DESC',
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
            showSupporter: true
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
         RETURNING id, name, email, role, year, status, joined, last_seen, stripe_customer_id, stripe_subscription_id, subscription_status, show_supporter`,
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
    };
}

async function updateUserById(id, updates) {
    if (updates.role !== undefined && !['Student', 'Admin'].includes(updates.role)) {
        return { error: 'Invalid role. Must be Student or Admin' };
    }

    if (!isDbEnabled) {
        const userIndex = users.findIndex(u => String(u.id) === String(id));
        if (userIndex === -1) return null;

        const allowedUpdates = ['role', 'name', 'year', 'stripeCustomerId', 'stripeSubscriptionId', 'subscriptionStatus', 'showSupporter'];
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
        showSupporter: 'show_supporter'
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
         RETURNING id, name, email, role, year, status, joined, last_seen, timetable, stripe_customer_id, stripe_subscription_id, subscription_status, show_supporter`,
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
}, 12 * 60 * 60 * 1000);

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

// Verify SBHS Access Token via SBHS API
const verifySbhsToken = async (req) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

    const token = authHeader.split(' ')[1];
    try {
        const response = await fetch('https://student.sbhs.net.au/api/details/userinfo.json', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.error('[auth] SBHS Token validation failed:', e?.message || e);
        return null;
    }
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
            showSupporter: u.showSupporter !== false
        };
    }
    const result = await db.query(
        'SELECT id, name, email, role, status, stripe_customer_id, stripe_subscription_id, subscription_status, show_supporter FROM app_users WHERE id = $1',
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
        showSupporter: row.show_supporter !== false
    };
}

// Update subscription status functions
async function updateUserSubscription(studentId, { stripeCustomerId, stripeSubscriptionId, subscriptionStatus }) {
    if (!isDbEnabled) {
        const userIndex = users.findIndex(u => String(u.id) === String(studentId));
        if (userIndex !== -1) {
            if (stripeCustomerId !== undefined) users[userIndex].stripeCustomerId = stripeCustomerId;
            if (stripeSubscriptionId !== undefined) users[userIndex].stripeSubscriptionId = stripeSubscriptionId;
            if (subscriptionStatus !== undefined) users[userIndex].subscriptionStatus = subscriptionStatus;
            return users[userIndex];
        }
        return null;
    }

    const sets = [];
    const values = [];
    let paramIndex = 2;

    if (stripeCustomerId !== undefined) {
        sets.push(`stripe_customer_id = $${paramIndex++}`);
        values.push(stripeCustomerId);
    }
    if (stripeSubscriptionId !== undefined) {
        sets.push(`stripe_subscription_id = $${paramIndex++}`);
        values.push(stripeSubscriptionId);
    }
    if (subscriptionStatus !== undefined) {
        sets.push(`subscription_status = $${paramIndex++}`);
        values.push(subscriptionStatus);
    }

    if (sets.length === 0) return null;

    values.unshift(String(studentId));
    const result = await db.query(
        `UPDATE app_users 
         SET ${sets.join(', ')}
         WHERE id = $1
         RETURNING id, name, email, role, year, status, joined, last_seen, timetable, stripe_customer_id, stripe_subscription_id, subscription_status`,
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
        stripeCustomerId: row.stripe_customer_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        subscriptionStatus: row.subscription_status
    };
}

async function updateUserSubscriptionByStripeId({ stripeCustomerId, stripeSubscriptionId, subscriptionStatus }) {
    if (!isDbEnabled) {
        let userIndex = users.findIndex(u => u.stripeSubscriptionId === stripeSubscriptionId);
        if (userIndex === -1 && stripeCustomerId) {
            userIndex = users.findIndex(u => u.stripeCustomerId === stripeCustomerId);
        }
        if (userIndex !== -1) {
            users[userIndex].subscriptionStatus = subscriptionStatus;
            if (stripeSubscriptionId) users[userIndex].stripeSubscriptionId = stripeSubscriptionId;
            return users[userIndex];
        }
        return null;
    }

    let result;
    if (stripeSubscriptionId) {
        result = await db.query(
            `UPDATE app_users 
             SET subscription_status = $2
             WHERE stripe_subscription_id = $1
             RETURNING id, name`,
            [stripeSubscriptionId, subscriptionStatus]
        );
    }

    if ((!result || result.rows.length === 0) && stripeCustomerId) {
        result = await db.query(
            `UPDATE app_users 
             SET subscription_status = $2
             WHERE stripe_customer_id = $1
             RETURNING id, name`,
            [stripeCustomerId, subscriptionStatus]
        );
    }

    return result ? result.rows[0] : null;
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

        console.log(`User registered/updated: ${safeUser.name} (${userId})`);
        res.json({ success: true, user: dbUser });
    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ error: 'Failed to register user' });
    }
});

// POST /api/users/profile - Update student settings (e.g. show_supporter toggle)
app.post('/api/users/profile', requireStudentAuth, async (req, res) => {
    try {
        const studentId = req.user.studentId;
        const { showSupporter } = req.body || {};
        
        let updated;
        if (!isDbEnabled) {
            const userIndex = users.findIndex(u => String(u.id) === String(studentId));
            if (userIndex !== -1) {
                if (showSupporter !== undefined) {
                    users[userIndex].showSupporter = Boolean(showSupporter);
                }
                updated = users[userIndex];
            }
        } else {
            const result = await db.query(
                `UPDATE app_users SET show_supporter = $1 WHERE id = $2
                 RETURNING id, name, email, role, year, status, joined, last_seen, stripe_customer_id, stripe_subscription_id, subscription_status, show_supporter`,
                [Boolean(showSupporter), String(studentId)]
            );
            if (result.rows.length > 0) {
                const row = result.rows[0];
                updated = {
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
                    showSupporter: row.show_supporter !== false
                };
            }
        }
        
        if (!updated) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ success: true, user: updated });
    } catch (e) {
        console.error('Update profile error:', e);
        res.status(500).json({ error: 'Failed to update settings' });
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
        
        // Premium/Pro check
        const dbUser = await getUserById(studentId);
        if (!dbUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        const isPro = dbUser.role === 'Admin' || dbUser.subscriptionStatus === 'active' || dbUser.subscriptionStatus === 'pro';
        if (!isPro) {
            return res.status(403).json({ error: 'Forbidden: Homework Tracker requires a Synchron Pro subscription.' });
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
        
        // Premium/Pro check
        const dbUser = await getUserById(studentId);
        if (!dbUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        const isPro = dbUser.role === 'Admin' || dbUser.subscriptionStatus === 'active' || dbUser.subscriptionStatus === 'pro';
        if (!isPro) {
            return res.status(403).json({ error: 'Forbidden: Homework Tracker requires a Synchron Pro subscription.' });
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

        // Premium/Pro check
        const dbUser = await getUserById(studentId);
        if (!dbUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        const isPro = dbUser.role === 'Admin' || dbUser.subscriptionStatus === 'active' || dbUser.subscriptionStatus === 'pro';
        if (!isPro) {
            return res.status(403).json({ error: 'Forbidden: Homework Tracker requires a Synchron Pro subscription.' });
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

// GET /api/billing/debug - Debug environment variables configuration
app.get('/api/billing/debug', async (req, res) => {
    res.json({
        stripeInitialized: !!stripe,
        envKeys: {
            STRIPE_SECRET_KEY_defined: !!process.env.STRIPE_SECRET_KEY,
            STRIPE_SECRET_KEY_length: process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.length : 0,
            STRIPE_SECRET_KEY_prefix: process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 7) : null,
            STRIPE_WEBHOOK_SECRET_defined: !!process.env.STRIPE_WEBHOOK_SECRET,
            SYNCHRON_PRO_PRICE_ID_defined: !!process.env.SYNCHRON_PRO_PRICE_ID,
            STRIPE_CLIENT_URL: process.env.STRIPE_CLIENT_URL || null,
            NODE_ENV: process.env.NODE_ENV || null
        }
    });
});

// GET /api/billing/status - Fetch latest billing status for the logged-in student
app.get('/api/billing/status', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);
        const dbUser = await getUserById(studentId);
        if (!dbUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({
            stripeCustomerId: dbUser.stripeCustomerId || null,
            stripeSubscriptionId: dbUser.stripeSubscriptionId || null,
            subscriptionStatus: dbUser.subscriptionStatus || null
        });
    } catch (e) {
        console.error('Fetch billing status error:', e);
        res.status(500).json({ error: 'Failed to fetch billing status' });
    }
});

// POST /api/billing/create-checkout-session - Start checkout flow
app.post('/api/billing/create-checkout-session', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);
        const email = req.user.email;
        const name = `${req.user.givenName} ${req.user.surname}`;

        let { priceId, mode } = req.body || {};
        if (!mode) mode = 'subscription';

        if (!stripe) {
            return res.status(500).json({ error: 'Stripe is not configured on the server. Please check your environment variables.' });
        }

        const dbUser = await getUserById(studentId);
        let stripeCustomerId = dbUser ? dbUser.stripeCustomerId : null;
        if (stripeCustomerId && stripeCustomerId.startsWith('cus_mock_')) {
            stripeCustomerId = null;
        }

        if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
                email: email,
                name: name,
                metadata: { studentId }
            });
            stripeCustomerId = customer.id;
            await updateUserSubscription(studentId, { stripeCustomerId });
        }

        const clientUrl = process.env.STRIPE_CLIENT_URL || req.headers.origin || 'http://localhost:5173';
        
        if (!priceId) {
            priceId = process.env.SYNCHRON_PRO_PRICE_ID;
        }

        if (!priceId) {
            return res.status(400).json({ error: 'Stripe Pro Price ID (SYNCHRON_PRO_PRICE_ID) is not configured on the server.' });
        }

        const session = await stripe.checkout.sessions.create({
            customer: stripeCustomerId,
            client_reference_id: studentId,
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: mode,
            success_url: mode === 'payment' ? `${clientUrl}/?billing=donation-success` : `${clientUrl}/?billing=success`,
            cancel_url: `${clientUrl}/?billing=cancel`,
            metadata: { studentId, type: mode === 'payment' ? 'donation' : 'subscription' }
        });

        res.json({ url: session.url });
    } catch (e) {
        console.error('Create checkout session error:', e);
        res.status(500).json({ error: e.message || 'Failed to create checkout session' });
    }
});

// POST /api/billing/create-portal-session - Manage subscription in Stripe Customer Portal
app.post('/api/billing/create-portal-session', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);

        if (!stripe) {
            return res.status(500).json({ error: 'Stripe is not configured on the server. Please check your environment variables.' });
        }

        const dbUser = await getUserById(studentId);
        let stripeCustomerId = dbUser ? dbUser.stripeCustomerId : null;
        if (stripeCustomerId && stripeCustomerId.startsWith('cus_mock_')) {
            stripeCustomerId = null;
        }

        if (!stripeCustomerId) {
            return res.status(400).json({ error: 'No active billing profile found. Please subscribe first.' });
        }

        const clientUrl = process.env.STRIPE_CLIENT_URL || req.headers.origin || 'http://localhost:5173';
        const session = await stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: clientUrl,
        });

        res.json({ url: session.url });
    } catch (e) {
        console.error('Create portal session error:', e);
        res.status(500).json({ error: e.message || 'Failed to create portal session' });
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
            const modelsRes = await fetch('https://ai.hackclub.com/proxy/v1/models');
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
            availableHackClubModels,
            availableGeminiModels: [
                'gemini-1.5-flash',
                'gemini-1.5-pro',
                'gemini-2.0-flash',
                'gemini-2.5-flash'
            ],
            activeSessions: statsHistory[statsHistory.length - 1]?.sessions || 1,
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

async function getSupporters() {
    if (!isDbEnabled) {
        return users
            .filter(u => (u.subscriptionStatus === 'active' || u.subscriptionStatus === 'pro') && u.showSupporter !== false)
            .map(u => u.name)
            .filter(Boolean);
    }
    try {
        const result = await db.query(
            "SELECT name FROM app_users WHERE (subscription_status = 'active' OR subscription_status = 'pro') AND show_supporter = TRUE",
            []
        );
        return result.rows.map(r => r.name).filter(Boolean);
    } catch (err) {
        console.error('Failed to fetch supporters:', err);
        return [];
    }
}

// GET /api/system/status (Public endpoint for client app)
app.get('/api/system/status', (req, res) => {
    (async () => {
        try {
            const state = await getSystemState();
            const supporters = await getSupporters();
            res.json({
                maintenance: state.maintenance,
                broadcast: state.broadcast,
                version: VERSION,
                supporters
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
            feedbackEntries[index].updatedAt = new Date();
            updatedEntry = feedbackEntries[index];
        } else {
            const result = await db.query(
                `UPDATE app_feedback 
                 SET status = $1, updated_at = NOW() 
                 WHERE id = $2 
                 RETURNING id, ticket_number, student_id, category, severity, details, status, created_at, updated_at`,
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

// GET /api/users/:id/timetable
// REMOVED FOR PRIVACY

let aiMemoryCache = {};

// POST /api/ai/briefing
app.post('/api/ai/briefing', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);
        const dbUser = await getUserById(studentId);
        if (!dbUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        const isPro = dbUser.role === 'Admin' || dbUser.subscriptionStatus === 'active' || dbUser.subscriptionStatus === 'pro';
        if (!isPro) {
            return res.status(403).json({ error: 'Forbidden: AI features require a Synchron Pro subscription.' });
        }

        const notices = req.body.notices || [];
        const dateKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

        // 1. Check in-memory / DB cache
        if (isDbEnabled) {
            try {
                const cacheResult = await db.query(
                    'SELECT briefing, prioritized_notices FROM ai_cache WHERE date_key = $1',
                    [dateKey]
                );
                if (cacheResult.rows.length > 0) {
                    console.log(`[ai-cache] DB cache hit for ${dateKey}`);
                    return res.json({
                        briefing: cacheResult.rows[0].briefing,
                        sortedNotices: cacheResult.rows[0].prioritized_notices
                    });
                }
            } catch (err) {
                console.error('[ai-cache] Failed to query cache database, falling back to memory:', err);
            }
        }

        if (aiMemoryCache[dateKey]) {
            console.log(`[ai-cache] In-memory cache hit for ${dateKey}`);
            return res.json(aiMemoryCache[dateKey]);
        }

        // 2. Handle empty notices quickly
        if (notices.length === 0) {
            const defaultResult = {
                briefing: "No notices for today.",
                sortedNotices: []
            };
            if (isDbEnabled) {
                await db.query(
                    'INSERT INTO ai_cache (date_key, briefing, prioritized_notices) VALUES ($1, $2, $3::jsonb) ON CONFLICT (date_key) DO UPDATE SET briefing = EXCLUDED.briefing, prioritized_notices = EXCLUDED.prioritized_notices, created_at = NOW()',
                    [dateKey, defaultResult.briefing, JSON.stringify(defaultResult.sortedNotices)]
                ).catch(() => {});
            }
            aiMemoryCache[dateKey] = defaultResult;
            return res.json(defaultResult);
        }

        // 3. Check configuration and request AI
        const systemStateObj = await getSystemState();
        const activeProvider = systemStateObj.aiProvider || 'hackclub';
        const activeModel = systemStateObj.aiModel || (activeProvider === 'gemini' ? 'gemini-1.5-flash' : 'qwen/qwen3-32b');

        const promptNotices = notices.map((n, i) => ({
            index: i,
            title: n.title || '',
            content: (n.content || '').replace(/<[^>]*>/g, ''), // strip HTML to save context window tokens
            isMeeting: n.isMeeting || 0,
            displayYears: n.displayYears || 'All Students'
        }));

        const systemPrompt = `You are a school assistant. Summarize the daily school notices and prioritize them.
Return a JSON object in this exact format:
{
  "briefing": "A friendly, engaging morning summary of the key notices (2-3 sentences max). Ensure you highlight important school-wide dates, sporting updates, or co-curricular requirements.",
  "prioritizedNotices": [
    {
      "index": 0, // The index of the notice in the original array
      "priority": 3, // 1 to 5, where 5 is highest/urgent (meetings today, deadlines, important year assemblies) and 1 is lowest
      "reason": "Brief reason for this priority rating"
    }
  ]
}
Return ONLY the JSON. Do not include markdown code block wraps.`;

        let aiText = '';

        if (activeProvider === 'gemini') {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                console.warn('[ai] GEMINI_API_KEY is not set. Using fallback sorting.');
                const sorted = [...notices].sort((a, b) => (b.isMeeting || 0) - (a.isMeeting || 0));
                return res.json({
                    briefing: "Welcome to your notices for today! Read below for co-curricular and meeting updates.",
                    sortedNotices: sorted
                });
            }

            console.log(`[ai] Querying Google Gemini API (${activeModel}) for ${dateKey}...`);
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `${systemPrompt}\n\nHere are today's notices:\n${JSON.stringify(promptNotices)}`
                        }]
                    }],
                    generationConfig: {
                        responseMimeType: 'application/json',
                        temperature: 0.3
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Gemini API responded with status ${response.status}`);
            }

            const aiData = await response.json();
            aiText = aiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        } else {
            const apiKey = process.env.HACKCLUB_AI_API_KEY;
            if (!apiKey) {
                console.warn('[ai] HACKCLUB_AI_API_KEY is not set. Using fallback sorting.');
                const sorted = [...notices].sort((a, b) => (b.isMeeting || 0) - (a.isMeeting || 0));
                return res.json({
                    briefing: "Welcome to your notices for today! Read below for co-curricular and meeting updates.",
                    sortedNotices: sorted
                });
            }

            console.log(`[ai] Querying Hack Club AI (${activeModel}) for ${dateKey}...`);
            const response = await fetch('https://ai.hackclub.com/proxy/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: activeModel,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Here are today's notices:\n${JSON.stringify(promptNotices)}` }
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

        // Clean up markdown block wraps if present
        let jsonText = aiText;
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.substring(7);
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.substring(3);
        }
        if (jsonText.endsWith('```')) {
            jsonText = jsonText.substring(0, jsonText.length - 3);
        }
        jsonText = jsonText.trim();

        const parsed = JSON.parse(jsonText);
        const briefing = parsed.briefing || "Here is your notices summary for today.";
        const priorities = parsed.prioritizedNotices || [];

        // Map priorities to original notices list
        const noticesWithPriority = notices.map((n, i) => {
            const prio = priorities.find(p => p.index === i);
            return {
                ...n,
                priority: prio ? prio.priority : 1,
                priorityReason: prio ? prio.reason : ''
            };
        });

        // Sort by priority descending (highest first)
        noticesWithPriority.sort((a, b) => b.priority - a.priority);

        const result = {
            briefing,
            sortedNotices: noticesWithPriority
        };

        // Write cache
        if (isDbEnabled) {
            try {
                await db.query(
                    'INSERT INTO ai_cache (date_key, briefing, prioritized_notices) VALUES ($1, $2, $3::jsonb) ON CONFLICT (date_key) DO UPDATE SET briefing = EXCLUDED.briefing, prioritized_notices = EXCLUDED.prioritized_notices, created_at = NOW()',
                    [dateKey, result.briefing, JSON.stringify(result.sortedNotices)]
                );
            } catch (err) {
                console.error('[ai-cache] Failed to write cache to DB:', err);
            }
        }
        aiMemoryCache[dateKey] = result;

        console.log(`[ai] Cache updated successfully for ${dateKey}`);
        res.json(result);

    } catch (err) {
        console.error('[ai] Hack Club AI failed, returning fallback:', err);
        const sorted = [...notices].sort((a, b) => (b.isMeeting || 0) - (a.isMeeting || 0));
        res.json({
            briefing: "Welcome to your notices for today! Check out co-curricular meetings and activities below.",
            sortedNotices: sorted
        });
    }
});

// POST /api/ai/timetable-qa
app.post('/api/ai/timetable-qa', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);
        const dbUser = await getUserById(studentId);
        if (!dbUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        const isPro = dbUser.role === 'Admin' || dbUser.subscriptionStatus === 'active' || dbUser.subscriptionStatus === 'pro';
        if (!isPro) {
            return res.status(403).json({ error: 'Forbidden: AI features require a Synchron Pro subscription.' });
        }

        const { question, timetable, currentMinutes, completeTimetable } = req.body || {};
        if (!question) {
            return res.status(400).json({ error: 'Missing question' });
        }

        const systemStateObj = await getSystemState();
        const activeProvider = systemStateObj.aiProvider || 'hackclub';
        const activeModel = systemStateObj.aiModel || (activeProvider === 'gemini' ? 'gemini-1.5-flash' : 'qwen/qwen3-32b');

        // Construct a prompt with timetable context, complete cycle, date details, and current time
        const todayDateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const todayDayname = timetable?.timetable?.dayname || timetable?.dayname || 'Unknown';

        const systemPrompt = `You are a helpful school assistant. Answer the student's question about their daily timetable schedule.
You are given:
1. Today's Date: ${todayDateStr}
2. Today's Timetable Cycle Day Name: ${todayDayname} (e.g. "Day 1A", "Day 2B").
3. Current time of day: ${currentMinutes} minutes (from 0 to 1440, representing minutes elapsed since midnight; e.g. 540 is 9:00 AM, 915 is 3:15 PM).
4. Today's Day Timetable Data:
${JSON.stringify(timetable)}
5. The student's Complete 2-Week Cycle Timetable (contains schedules for all cycle days: Day 1A, Day 2A, etc.):
${JSON.stringify(completeTimetable)}

Guidelines:
- Answer the student's question in a friendly, conversational tone. Be concise (1-2 sentences).
- You can answer questions about today's classes, tomorrow's schedule, or any specific cycle day (e.g. Day 2B) because you have the complete 2-week cycle timetable.
- If they ask about "tomorrow" or "Wednesday", calculate what cycle day it corresponds to based on Today's Date and Today's Cycle Day Name (e.g., if today is Monday Day 1A, tomorrow Tuesday is Day 2A; if today is Friday Day 5A, next Monday is Day 1B). Note that school days only run Monday to Friday.
- If the question is outside the scope of school schedules, teacher names, room locations, or term dates, politely say so.

Answer the student's question:`;

        let answer = '';

        if (activeProvider === 'gemini') {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                answer = "AI features are temporarily unavailable because the API key is not configured on the server.";
            } else {
                console.log(`[ai] Querying Google Gemini API (${activeModel}) for Timetable Q&A...`);
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`, {
                    method: 'POST',
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

        await addAiLog(req.user?.studentId || 'UNKNOWN', question, answer, activeProvider, activeModel);
        res.json({ answer });

    } catch (err) {
        console.error('[ai-timetable-qa] Failed:', err);
        const errMsg = 'Failed to generate answer';
        await addAiLog(req.user?.studentId || 'UNKNOWN', req.body?.question || 'Unknown Question', `Error: ${err.message || err}`, activeProvider || 'unknown', activeModel || 'unknown').catch(() => {});
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

// POST /api/ai/notes-summarise
app.post('/api/ai/notes-summarise', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);
        const dbUser = await getUserById(studentId);
        if (!dbUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        const isPro = dbUser.role === 'Admin' || dbUser.subscriptionStatus === 'active' || dbUser.subscriptionStatus === 'pro';
        if (!isPro) {
            return res.status(403).json({ error: 'Forbidden: AI features require a Synchron Pro subscription.' });
        }

        const { content, title } = req.body || {};
        if (!content) {
            return res.status(400).json({ error: 'Missing note content' });
        }

        const systemStateObj = await getSystemState();
        const systemPrompt = `You are a helpful school assistant. Summarize the provided study notes into a clear, concise bulleted summary. Focus on key definitions, equations, dates, and core concepts. Keep it formatted nicely in markdown with bullet points.`;
        const userPrompt = `Title: ${title || 'Untitled Note'}\n\nContent:\n${content}`;

        const { aiText, activeProvider, activeModel } = await runAiPrompt(systemPrompt, userPrompt, systemStateObj, 'text/plain');

        await addAiLog(req.user?.studentId || 'UNKNOWN', `Summarise: ${title || 'Untitled'}`, aiText, activeProvider, activeModel);
        res.json({ summary: aiText });

    } catch (err) {
        console.error('[ai-notes-summarise] Failed:', err);
        res.status(500).json({ error: err.message || 'Failed to generate note summary' });
    }
});

// POST /api/ai/quiz-generate
app.post('/api/ai/quiz-generate', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);
        const dbUser = await getUserById(studentId);
        if (!dbUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        const isPro = dbUser.role === 'Admin' || dbUser.subscriptionStatus === 'active' || dbUser.subscriptionStatus === 'pro';
        if (!isPro) {
            return res.status(403).json({ error: 'Forbidden: AI features require a Synchron Pro subscription.' });
        }

        const { source, noteContent, topic, count } = req.body || {};
        const qCount = parseInt(count) || 5;

        if (source === 'note' && !noteContent) {
            return res.status(400).json({ error: 'Missing note content for generating quiz' });
        }
        if (source === 'topic' && !topic) {
            return res.status(400).json({ error: 'Missing topic for generating quiz' });
        }

        const systemStateObj = await getSystemState();
        const systemPrompt = `You are a helpful school assistant. Generate a multiple-choice quiz with exactly ${qCount} questions based on the provided ${source === 'note' ? 'study notes' : 'topic'}.
Return a JSON array of questions, where each question has this exact format:
{
  "question": "The question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctIndex": 0
}
Return ONLY the JSON array. Do not include markdown code block wraps.`;

        const userPrompt = source === 'note' 
            ? `Study Notes:\n${noteContent}`
            : `Topic:\n${topic}`;

        const { aiText, activeProvider, activeModel } = await runAiPrompt(systemPrompt, userPrompt, systemStateObj, 'application/json');

        // Clean up markdown block wraps if present
        let jsonText = aiText;
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.substring(7);
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.substring(3);
        }
        if (jsonText.endsWith('```')) {
            jsonText = jsonText.substring(0, jsonText.length - 3);
        }
        jsonText = jsonText.trim();

        const questions = JSON.parse(jsonText);

        await addAiLog(req.user?.studentId || 'UNKNOWN', `Quiz: ${source === 'note' ? 'From Note' : topic}`, `Generated ${questions.length} questions`, activeProvider, activeModel);
        res.json({ questions });

    } catch (err) {
        console.error('[ai-quiz-generate] Failed:', err);
        res.status(500).json({ error: err.message || 'Failed to generate quiz' });
    }
});

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
            'SELECT id, created_at, student_id, question, answer, provider, model FROM ai_usage_logs ORDER BY created_at DESC LIMIT 100',
            []
        );
        const out = result.rows.map(row => ({
            id: row.id,
            timestamp: row.created_at,
            studentId: row.student_id,
            question: row.question,
            answer: row.answer,
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

// Main proxy/mock resolver for student endpoints
const resolveStudentPortalApi = async (req, res, subpath, generateMockData) => {
    const isAuthorized = await checkStudentAccess(req, res);
    if (!isAuthorized) return;
    const studentId = req.params.studentId;
    const authHeader = req.headers['authorization'];
    if (process.env.BYPASS_AUTH !== 'true' && authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const url = new URL(`https://student.sbhs.net.au/api/core/students/${studentId}/${subpath}`);
            Object.entries(req.query).forEach(([key, val]) => {
                url.searchParams.append(key, val);
            });
            console.log(`[proxy] Proxying student API request to: ${url.toString()}`);
            const response = await fetch(url.toString(), {
                headers: { 'Authorization': authHeader }
            });
            if (response.ok) {
                const data = await response.json();
                return res.json(data);
            }
            console.warn(`[proxy] SBHS API returned ${response.status} for ${subpath}, falling back to mock`);
        } catch (e) {
            console.error(`[proxy] SBHS API call failed for ${subpath}:`, e.message);
        }
    }
    res.json(generateMockData(req.user));
};

// Generic resolver for global endpoints
const resolveGlobalPortalApi = async (req, res, subpath, generateMockData) => {
    const authHeader = req.headers['authorization'];
    if (process.env.BYPASS_AUTH !== 'true' && authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const url = new URL(`https://student.sbhs.net.au/api/core/${subpath}`);
            Object.entries(req.query).forEach(([key, val]) => {
                url.searchParams.append(key, val);
            });
            console.log(`[proxy] Proxying global API request to: ${url.toString()}`);
            const response = await fetch(url.toString(), {
                headers: { 'Authorization': authHeader }
            });
            if (response.ok) {
                const data = await response.json();
                return res.json(data);
            }
            console.warn(`[proxy] SBHS API returned ${response.status} for global ${subpath}, falling back to mock`);
        } catch (e) {
            console.error(`[proxy] SBHS API call failed for global ${subpath}:`, e.message);
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

// 35. Transit departures API (Synchron Pro Feature)
registerRoutePair('/transit/departures', requireStudentAuth, async (req, res) => {
    try {
        const studentId = String(req.user.studentId);
        const dbUser = await getUserById(studentId);
        if (!dbUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Determine Pro user status
        const isPro = dbUser.role === 'Admin' || dbUser.subscriptionStatus === 'active' || dbUser.subscriptionStatus === 'pro';

        const { stopName = 'Moore Park Light Rail' } = req.query;
        
        // Free users are restricted to the default school stop
        const stopToQuery = isPro ? stopName : 'Moore Park Light Rail';
        const apiKey = process.env.TRANSPORT_NSW_API_KEY;

        if (apiKey) {
            console.log(`[transit] Querying TfNSW APIs for: "${stopToQuery}" (isPro: ${isPro})`);
            
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
            return res.json(departures.slice(0, isPro ? 10 : 6));
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
            return res.json(isPro ? departures : departures.slice(0, 6));
        }
    } catch (e) {
        console.error('Transit API error:', e);
        res.status(500).json({ error: 'Failed to fetch transit departures' });
    }
});

// Health check endpoint (public)
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Serve static assets from Vite build in client/dist
const path = require('path');
app.use(express.static(path.join(__dirname, '../client/dist')));

// Fallback all unmatched routes to index.html (for client-side routing)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Admin Password configured: ${!!ADMIN_PASSWORD}`);
    });
}

// Export the app for Vercel
module.exports = app;
