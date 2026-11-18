const crypto = require('crypto');

const isProduction = () => process.env.NODE_ENV === 'production'
    || Boolean(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT)
    || process.env.VERCEL === '1';

const guardBypassAuth = () => {
    if (process.env.BYPASS_AUTH === 'true' && isProduction()) {
        console.error('[security] BYPASS_AUTH=true is ignored in production. Remove it from the environment.');
        delete process.env.BYPASS_AUTH;
    }
};

const securityHeaders = (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
};

const corsOptionsDelegate = (configuredOrigins) => (req, callback) => {
    const origin = req.headers.origin;
    let allowed = !origin || configuredOrigins.includes(origin);
    if (!allowed) {
        try {
            allowed = new URL(origin).host === req.headers.host;
        } catch {
            allowed = false;
        }
    }
    callback(null, {
        origin: allowed,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token'],
        maxAge: 600
    });
};

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

const rateLimit = (limiters, keyFn, message) => (req, res, next) => {
    const key = keyFn(req);
    if (limiters.every(limit => limit(key))) return next();
    res.status(429).json({ error: 'rate_limited', message });
};

const createTokenVerifier = ({ fetchUserInfo, ttlMs = 5 * 60 * 1000, maxEntries = 10000 }) => {
    const cache = new Map();
    const inFlight = new Map();
    const lastSeen = new Map();

    const verify = async (token) => {
        if (!token) return null;
        const key = crypto.createHash('sha256').update(token).digest('hex');
        const hit = cache.get(key);
        const now = Date.now();
        if (hit && now - hit.at < ttlMs) {
            if (hit.user?.studentId) lastSeen.set(String(hit.user.studentId), now);
            return hit.user;
        }
        if (inFlight.has(key)) return inFlight.get(key);

        const pending = (async () => {
            try {
                const user = await fetchUserInfo(token);
                if (user) {
                    cache.delete(key);
                    cache.set(key, { user, at: Date.now() });
                    if (cache.size > maxEntries) cache.delete(cache.keys().next().value);
                    if (user.studentId) lastSeen.set(String(user.studentId), Date.now());
                }
                return user;
            } finally {
                inFlight.delete(key);
            }
        })();
        inFlight.set(key, pending);
        return pending;
    };

    const activeCount = (windowMs = 5 * 60 * 1000) => {
        const now = Date.now();
        let count = 0;
        for (const [id, at] of lastSeen) {
            if (now - at < windowMs) count += 1;
            else lastSeen.delete(id);
        }
        return count;
    };

    return { verify, activeCount };
};

module.exports = {
    isProduction,
    guardBypassAuth,
    securityHeaders,
    corsOptionsDelegate,
    makeLimiter,
    rateLimit,
    createTokenVerifier
};
