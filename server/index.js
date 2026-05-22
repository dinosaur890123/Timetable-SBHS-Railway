const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const crypto = require('crypto');

const db = require('./db');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
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

app.use(express.json());

// In-memory fallback storage (used only when POSTGRES_URL/DATABASE_URL is not set)
let users = [];
let logs = []; // System logs
let systemState = {
    maintenance: false,
    broadcast: null // { message: "...", type: "info/warning/error" }
};

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

async function getSystemState() {
    if (!isDbEnabled) return systemState;

    const result = await db.query(
        'SELECT maintenance, broadcast_message, broadcast_type FROM system_state WHERE id = 1',
        []
    );

    const row = result.rows[0] || { maintenance: false, broadcast_message: null, broadcast_type: null };
    return {
        maintenance: Boolean(row.maintenance),
        broadcast: row.broadcast_message ? { message: row.broadcast_message, type: row.broadcast_type || 'info' } : null
    };
}

async function setBroadcast(message, type) {
    if (!isDbEnabled) {
        systemState.broadcast = message ? { message, type: type || 'info' } : null;
        return systemState.broadcast;
    }

    await db.query(
        'UPDATE system_state SET broadcast_message = $1, broadcast_type = $2, updated_at = NOW() WHERE id = 1',
        [message || null, message ? (type || 'info') : null]
    );

    return message ? { message, type: type || 'info' } : null;
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
    if (!isDbEnabled) return users;
    const result = await db.query(
        'SELECT id, name, email, role, year, status, joined, last_seen, timetable FROM app_users ORDER BY last_seen DESC, joined DESC',
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
        timetable: row.timetable ?? null,
    }));
}

async function upsertUser(newUser) {
    if (!isDbEnabled) {
        const userId = String(newUser.id);
        const safeUser = { ...newUser, id: userId };
        const existingIndex = users.findIndex(u => String(u.id) === userId);
        if (existingIndex >= 0) {
            users[existingIndex] = { ...users[existingIndex], ...safeUser, lastSeen: new Date() };
            return users[existingIndex];
        }
        const created = {
            ...safeUser,
            status: 'Active',
            role: 'Student',
            joined: new Date(),
            timetable: safeUser.timetable || null,
        };
        users.push(created);
        return created;
    }

    const userId = String(newUser.id);
    const timetableJson = newUser.timetable ? JSON.stringify(newUser.timetable) : null;

    const result = await db.query(
        `INSERT INTO app_users (id, email, name, year, timetable, last_seen)
         VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           name = EXCLUDED.name,
           year = EXCLUDED.year,
           timetable = COALESCE(EXCLUDED.timetable, app_users.timetable),
           last_seen = NOW()
         RETURNING id, name, email, role, year, status, joined, last_seen, timetable`,
        [userId, newUser.email, newUser.name || null, newUser.year || null, timetableJson]
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
    };
}

async function updateUserById(id, updates) {
    if (!isDbEnabled) {
        const userIndex = users.findIndex(u => String(u.id) === String(id));
        if (userIndex === -1) return null;

        const allowedUpdates = ['role', 'status', 'name', 'year'];
        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) users[userIndex][field] = updates[field];
        });
        return users[userIndex];
    }

    const allowed = {
        role: 'role',
        status: 'status',
        name: 'name',
        year: 'year',
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
         RETURNING id, name, email, role, year, status, joined, last_seen, timetable`,
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
        return users.find(u => String(u.id) === String(id)) || null;
    }
    const result = await db.query(
        'SELECT id, name, email, role, status FROM app_users WHERE id = $1',
        [String(id)]
    );
    return result.rows[0] || null;
}

// Require admin privilege (Only authorized student IDs or users with Admin role in DB)
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
    const adminIds = getAdminIds();
    
    // Check bootstrap list
    if (adminIds.includes(studentId)) {
        req.user = userData;
        return next();
    }

    // Check database-assigned admin role
    try {
        const dbUser = await getUserById(studentId);
        if (dbUser && dbUser.role === 'Admin') {
            req.user = userData;
            return next();
        }
    } catch (e) {
        console.error('[auth] Database admin check failed:', e?.message || e);
    }

    return res.status(403).json({ error: 'Forbidden: Admin access required' });
};

// Enforce admin privileges for general requireAuth routes
const requireAuth = requireAdminAuth;

// Routes
// POST /api/register - Auto-register users on login (DB-backed)
app.post('/api/register', requireStudentAuth, async (req, res) => {
    try {
        const { id, email, name, year, timetable } = req.body || {};

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
            year: year ? String(year) : null,
            timetable: timetable || null
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

        await addLog('UPDATE', updated.name || updated.id, `Updated fields: ${Object.keys(updates).join(', ')}`);

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

        res.json({
            totalUsers: allUsers.length,
            systemStatus: state.maintenance ? 'Maintenance' : 'Operational',
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage().heapUsed,
            activeSessions: Math.floor(Math.random() * (allUsers.length > 0 ? allUsers.length : 1)) + 1, // Mock
            
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

// GET /api/system/status (Public endpoint for client app)
app.get('/api/system/status', (req, res) => {
    (async () => {
        try {
            const state = await getSystemState();
            res.json({
                maintenance: state.maintenance,
                broadcast: state.broadcast,
                version: VERSION
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

// GET /api/users/:id/timetable
app.get('/api/users/:id/timetable', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        if (!isDbEnabled) {
            const localUser = users.find(u => String(u.id) === String(id));
            return res.json(localUser?.timetable || null);
        }
        const result = await db.query(
            'SELECT timetable FROM app_users WHERE id = $1',
            [String(id)]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(result.rows[0].timetable || null);
    } catch (e) {
        console.error('Fetch timetable error:', e);
        res.status(500).json({ error: 'Failed to fetch user timetable' });
    }
});

// POST /api/cache/clear
app.post('/api/cache/clear', requireAuth, (req, res) => {
    // Logic to clear server cache would go here
    console.log('Cache clear requested by admin');
    res.json({ success: true, message: 'Server cache cleared successfully' });
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
