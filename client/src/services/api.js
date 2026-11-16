import { format } from 'date-fns';
import { rememberSubjectColours } from '../utils/timetable';
import { clearPageCache, setServingCachedData } from '../utils/pageCache';
// The "Cached" topbar badge lives in pageCache so failed page refreshes can raise it too.
export { onCachedDataChange } from '../utils/pageCache';
import { normaliseList, normaliseIssuedAward, normaliseIssuedPrize, normaliseRollover, normaliseAward, normaliseHouse, normaliseNomination, normalisePrize } from '../utils/awardScheme';

// Environment variables
const CLIENT_ID = import.meta.env.VITE_SBHS_CLIENT_ID?.trim();
const REDIRECT_URI = import.meta.env.VITE_SBHS_REDIRECT_URI?.trim();

const AUTH_ENDPOINT = 'https://auth.sbhs.net.au/authorize';
const API_BASE_URL = 'https://student.sbhs.net.au/api';
// The app's own server. Sign-in goes through it so the SBHS client secret never
// reaches the browser.
const SYSTEM_API_URL = import.meta.env.VITE_ADMIN_API_URL || '/api';
const TOKEN_ENDPOINT = `${SYSTEM_API_URL}/auth/token`;

// Service worker caches holding the student's own data, emptied whenever the account changes.
const PRIVATE_CACHES = ['sbhs-data', 'app-data'];
const clearOfflineData = async () => {
    dayCache.clear();
    clearPageCache();
    try { localStorage.removeItem(SAVED_DAYS_KEY); } catch { /* storage unavailable */ }
    try {
        if (!('caches' in window)) return;
        await Promise.all(PRIVATE_CACHES.map(name => caches.delete(name)));
    } catch {
        // Caches unavailable (private mode): nothing was stored
    }
};

// fetch with a time limit, so a server that stops answering shows an error
// instead of a spinner that never ends. AI requests get longer.
const timedFetch = async (url, options = {}, timeoutMs) => {
    const limit = timeoutMs ?? (String(url).includes('/ai/') ? 60000 : 20000);
    // The service worker falls back to its offline copy when the network is too
    // slow, which can happen while the device still reports being online. In that
    // case give the network a couple more chances before settling for the copy.
    const CACHED_RETRIES = 2;
    const RETRY_DELAY = 3000;
    for (let attempt = 0; ; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), limit);
        let response;
        try {
            response = await fetch(url, { ...options, signal: controller.signal });
        } catch (error) {
            if (error?.name === 'AbortError') throw new Error(`Request timed out after ${Math.round(limit / 1000)}s`);
            throw error;
        } finally {
            clearTimeout(timer);
        }
        const servedFromCache = !!response.headers.get('X-Synchron-Cached');
        if (servedFromCache) setServingCachedData(true);
        else if (response.ok) setServingCachedData(false);
        if (!servedFromCache || !navigator.onLine || attempt >= CACHED_RETRIES) return response;
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
};

// Posts to the server's token endpoint, which adds the client secret for SBHS.
const requestToken = (params) => timedFetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
});

// ns.sbhs.au/r/student_app grants access to the Core API on api.sbhs.net.au (award scheme, clipboard).
export const SCOPES = 'all-ro openid profile email ns.sbhs.au/r/student_app';

export const getOauthConfig = () => ({
  clientId: CLIENT_ID || '(Not configured)',
  redirectUri: REDIRECT_URI || '(Not configured)',
});

// --- Authentication ---

export const performLogin = () => {
  if (!CLIENT_ID || !REDIRECT_URI) {
    alert("Configuration Error: Missing Client ID or Redirect URI in .env");
    return;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const state = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem('sbhs_auth_state', state);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state: state
  });

  window.location.href = `${AUTH_ENDPOINT}?${params.toString()}`;
};

// The sign-in redirect must carry the state this tab sent, or someone else
// started it (e.g. a link that signs the student into another account).
export const checkAuthState = (returnedState) => {
  const expected = sessionStorage.getItem('sbhs_auth_state');
  sessionStorage.removeItem('sbhs_auth_state');
  // Tabs that lost sessionStorage (e.g. the redirect opened elsewhere) have
  // nothing to compare; only a mismatch is rejected.
  return !expected || expected === returnedState;
};

export const exchangeToken = async (code) => {
  try {
    const response = await requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Token exchange error:", errorData);
        throw new Error(errorData.error_description || `Token exchange failed: ${response.statusText}`);
    }

    const data = await response.json();
    // A new sign-in may be a different student on this device: drop the last one's offline copy.
    await clearOfflineData();
    storeTokens(data);
    localStorage.setItem('sbhs_token_scope', SCOPES);
    return data;
  } catch (error) {
    console.error("Auth Error:", error);
    throw error;
  }
};

const getAccessToken = () => localStorage.getItem('sbhs_access_token');

const storeTokens = (data) => {
    localStorage.setItem('sbhs_access_token', data.access_token);
    if (data.refresh_token) localStorage.setItem('sbhs_refresh_token', data.refresh_token);
    localStorage.setItem('sbhs_token_expiry', String(Date.now() + data.expires_in * 1000));
};

const clearTokens = () => {
    ['sbhs_access_token', 'sbhs_refresh_token', 'sbhs_token_expiry', 'sbhs_token_scope'].forEach(key => localStorage.removeItem(key));
};

// Refreshed tokens keep the scopes of the original sign-in, so a session from before
// SCOPES changed stays missing them until the student signs in again. That no longer
// signs them out: isScopeOutdated() drives a re-sign-in banner, and the Core API
// answers 403 for the features the old scopes can't reach.

// Check if scopes are outdated without clearing tokens (for UI banner)
export const isScopeOutdated = () => {
    const currentScope = localStorage.getItem('sbhs_token_scope');
    const hasSession = !!localStorage.getItem('sbhs_access_token') || !!localStorage.getItem('sbhs_refresh_token');
    return hasSession && currentScope !== SCOPES;
};

// Treat a token as expired a minute early so it can't lapse mid-request.
const hasFreshToken = () => {
    const expiry = parseInt(localStorage.getItem('sbhs_token_expiry'), 10);
    return !!getAccessToken() && Date.now() < expiry - 60 * 1000;
};

// SBHS access tokens last an hour; the 90-day refresh token gets a new pair.
// Refresh tokens are single-use, so concurrent callers share one refresh — within
// this tab through refreshInFlight, and across tabs (and the installed app) through
// a Web Lock. Without the lock, two tabs waking together both spend the same token,
// and the loser used to clear the winner's fresh pair and sign every tab out.
let refreshInFlight = null;
const REFRESH_LOCK = 'sbhs-token-refresh';

// Run `task` while holding the cross-tab refresh lock, where the browser has one.
const withRefreshLock = (task) => (typeof navigator !== 'undefined' && navigator.locks?.request
    ? navigator.locks.request(REFRESH_LOCK, task)
    : task());

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// One refresh against SBHS. `forced` refreshes even if the stored token looks fresh,
// for when the API has just turned the stored token away.
const runRefresh = async (forced) => {
    const refreshToken = localStorage.getItem('sbhs_refresh_token');
    if (!refreshToken || !CLIENT_ID) return null;
    try {
        const response = await requestToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
        if (!response.ok) {
            // A tab without Web Locks may have spent this token first: give it a moment
            // to store its pair, and use that instead of signing everyone out.
            if (response.status === 400 || response.status === 401) {
                for (let i = 0; i < 3; i++) {
                    if (localStorage.getItem('sbhs_refresh_token') !== refreshToken) return getAccessToken();
                    await sleep(500);
                }
                // Still our token after waiting: SBHS has genuinely rejected it.
                if (localStorage.getItem('sbhs_refresh_token') === refreshToken) clearTokens();
                else return getAccessToken();
            }
            return null;
        }
        const data = await response.json();
        storeTokens(data);
        return data.access_token;
    } catch (error) {
        // Offline or SBHS unreachable: keep the tokens and try again next time.
        console.error('Token refresh failed:', error);
        return null;
    }
};

export const refreshAccessToken = ({ forced = true } = {}) => {
    if (refreshInFlight) return refreshInFlight;
    if (!localStorage.getItem('sbhs_refresh_token') || !CLIENT_ID) return Promise.resolve(null);

    const startingToken = localStorage.getItem('sbhs_access_token');
    refreshInFlight = withRefreshLock(async () => {
        // While this tab waited for the lock, another may have refreshed already.
        const accessNow = localStorage.getItem('sbhs_access_token');
        if (accessNow && accessNow !== startingToken && hasFreshToken()) return accessNow;
        if (!forced && hasFreshToken()) return accessNow;
        return runRefresh(forced);
    }).finally(() => {
        refreshInFlight = null;
    });
    return refreshInFlight;
};

// Signed out for good: SBHS rejected the refresh token, so there's nothing left to renew with.
// A failed refresh for any other reason (offline, SBHS slow) keeps the session.
const sessionLapsed = () => !localStorage.getItem('sbhs_refresh_token');

// The current access token, refreshed first if it has expired. Null when signed out.
export const getValidAccessToken = async () => {
    if (hasFreshToken()) return getAccessToken();
    const fresh = await refreshAccessToken({ forced: false });
    // Offline the token can't be renewed, but the expired one still opens the offline copy.
    if (!fresh && !navigator.onLine) return getAccessToken();
    return fresh;
};

export const logout = (redirectToLogin = false) => {
    const theme = localStorage.getItem('theme');
    localStorage.clear();
    if (theme) localStorage.setItem('theme', theme);
    // The offline copy belongs to this student, so it goes too (before leaving the page).
    clearOfflineData().finally(() => {
        if (redirectToLogin === true) {
            performLogin();
        } else {
            window.location.href = '/';
        }
    });
};

// Signed in if the access token is still good, or can be renewed with the refresh token.
// Scope mismatches don't sign the student out; they only raise the re-sign-in banner.
export const isAuthenticated = () => hasFreshToken() || (!!getAccessToken() && !!localStorage.getItem('sbhs_refresh_token'));

// --- API Client ---

async function fetchWithAuth(endpoint) {
    const token = await getValidAccessToken();
    if (!token) throw new Error("No access token");

    const send = (bearer) => timedFetch(`${API_BASE_URL}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${bearer}` }
    });
    let response = await send(token);
    if (response.status === 401) {
        const fresh = await refreshAccessToken();
        if (fresh) response = await send(fresh);
    }

    if (!response.ok) {
        // Only sign out once SBHS has rejected the refresh token too. A 401 with a
        // refresh token still in hand (offline, SBHS slow, one endpoint refusing)
        // just fails this request.
        if (response.status === 401 && sessionLapsed()) logout();
        throw new Error(`API Error ${response.status}: ${endpoint}`);
    }
    return response.json();
}

// --- Endpoints ---

// 1. Timetable
// Days fetched this session, and days on their way, so moving between days is instant and no day is
// asked for twice. A day is trusted for five minutes, after which it's fetched again for late changes.
const DAY_TTL = 5 * 60 * 1000;
const DAY_CACHE_LIMIT = 120;
const dayCache = new Map();
const dayInFlight = new Map();
const dayKey = (date) => format(date || new Date(), 'yyyy-MM-dd');

// The day as last fetched, however old, or null. For showing something at once while it refreshes.
export const peekDayTimetable = (date) => dayCache.get(dayKey(date))?.data ?? null;

export const fetchDayTimetable = (date, { fresh = false } = {}) => {
    const key = dayKey(date);
    const hit = dayCache.get(key);
    if (!fresh && hit && Date.now() - hit.at < DAY_TTL) return Promise.resolve(hit.data);
    if (dayInFlight.has(key)) return dayInFlight.get(key);

    const request = fetchWithAuth(`/timetable/daytimetable.json?date=${key}`)
        .then(data => rememberDay(key, data))
        .finally(() => dayInFlight.delete(key));
    dayInFlight.set(key, request);
    return request;
};

const rememberDay = (key, data) => {
    rememberSubjectColours(data);
    dayCache.delete(key);
    dayCache.set(key, { data, at: Date.now() });
    if (dayCache.size > DAY_CACHE_LIMIT) dayCache.delete(dayCache.keys().next().value);
    saveDaysSoon();
    return data;
};

// Days near today are also saved on the device, so reopening the app shows the timetable at once
// (the saved copy is refreshed in the background, as any day older than five minutes is).
const SAVED_DAYS_KEY = 'day_cache:v1';
const savedDayWindow = () => [dayKey(new Date(Date.now() - 7 * 864e5)), dayKey(new Date(Date.now() + 28 * 864e5))];
let saveDaysTimer = null;
const saveDaysSoon = () => {
    clearTimeout(saveDaysTimer);
    // Days arrive in bursts (the week is fetched at once), so they're written together.
    saveDaysTimer = setTimeout(() => {
        const [from, to] = savedDayWindow();
        const saved = {};
        [...dayCache.keys()].filter(k => k >= from && k <= to).sort().forEach(k => { saved[k] = dayCache.get(k); });
        try {
            localStorage.setItem(SAVED_DAYS_KEY, JSON.stringify(saved));
        } catch {
            // Storage full or blocked: the days are still kept for this session
        }
    }, 1000);
};
const loadSavedDays = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(SAVED_DAYS_KEY) || '{}');
        const [from, to] = savedDayWindow();
        Object.entries(saved).forEach(([k, entry]) => {
            if (k >= from && k <= to && entry?.data && !dayCache.has(k)) dayCache.set(k, { data: entry.data, at: Number(entry.at) || 0 });
        });
    } catch {
        // Nothing saved, or storage unavailable
    }
};
loadSavedDays();

const minutesOf = (time) => {
    const [h, m] = String(time || '').split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

// The day to open on, worked out from saved days without waiting for the network: today until its
// last bell, then the next saved school day. Null when nothing suitable is saved.
// fetchNextSchoolDay gives the authoritative answer once it arrives.
export const peekNextSchoolDay = () => {
    const now = new Date();
    const today = dayKey(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    for (const key of [...dayCache.keys()].filter(k => k >= today).sort()) {
        const data = dayCache.get(key)?.data;
        // SBHS answers a day without school with the next school day; that one is saved under its own date.
        if (!data || (data.date && data.date !== key)) continue;
        const inner = data.timetable?.timetable || data.timetable;
        if (!inner?.periods || Object.keys(inner.periods).length === 0 || !Array.isArray(data.bells) || data.bells.length === 0) continue;
        if (key === today) {
            const lastBell = Math.max(...data.bells.map(b => minutesOf(b.endTime) ?? minutesOf(b.time) ?? -1));
            if (nowMinutes >= lastBell) continue;
        }
        return new Date(`${key}T00:00`);
    }
    return null;
};

// The school day the app should open on: today until its last bell, then the next school day.
// SBHS works this out itself when no date is given, so it's one request however long the holidays
// are. Resolves with { date, data }; `data` is null when the answer is an offline copy from an
// earlier day, so the caller fetches today instead. Callers at start-up share one request.
let nextSchoolDayRequest = null;
export const fetchNextSchoolDay = () => {
    if (nextSchoolDayRequest) return nextSchoolDayRequest;
    nextSchoolDayRequest = fetchWithAuth('/timetable/daytimetable.json')
        .then(data => {
            const today = dayKey(new Date());
            const served = /^\d{4}-\d{2}-\d{2}$/.test(data?.date || '') ? data.date : today;
            if (served < today) return { date: new Date(), data: null };
            return { date: new Date(`${served}T00:00`), data: rememberDay(served, data) };
        })
        .finally(() => { setTimeout(() => { nextSchoolDayRequest = null; }, 30 * 1000); });
    return nextSchoolDayRequest;
};

export const fetchCompleteTimetable = async () => {
    return fetchWithAuth('/timetable/timetable.json');
};

// 2. Daily News
export const fetchDailyNews = async (date) => {
    const dateStr = date ? `?date=${format(date, 'yyyy-MM-dd')}` : '';
    return fetchWithAuth(`/dailynews/list.json${dateStr}`);
};

// 3. User Info
export const fetchUserInfo = async () => fetchWithAuth('/details/userinfo.json');

// 4. Calendar Events (New)
export const fetchCalendarEvents = async (from, to) => {
    const params = new URLSearchParams();
    if (from) params.append('from', format(from, 'yyyy-MM-dd'));
    if (to) params.append('to', format(to, 'yyyy-MM-dd'));
    return fetchWithAuth(`/diarycalendar/events.json?${params.toString()}`);
};

// 5. School Terms / Days info (New)
export const fetchDateInfo = async (date) => {
    const dateStr = date ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
    return fetchWithAuth(`/calendar/days.json?from=${dateStr}&to=${dateStr}`);
};

// The school year's term boundaries, public holidays and staff development days.
export const fetchTerms = async (year) => {
    return fetchWithAuth(`/calendar/terms.json${year ? `?year=${year}` : ''}`);
};

// --- System API (Public) ---

export const fetchSystemStatus = async () => {
    try {
        const response = await timedFetch(`${SYSTEM_API_URL}/system/status`, {
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
};

export const fetchAiBriefing = async (notices) => {
    const token = await getValidAccessToken();
    const response = await timedFetch(`${SYSTEM_API_URL}/ai/briefing`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ notices })
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch AI briefing: ${response.status}`);
    }
    return response.json();
};

export const fetchTimetableQa = async (question, timetable, currentMinutes, completeTimetable) => {
    const token = await getValidAccessToken();
    const response = await timedFetch(`${SYSTEM_API_URL}/ai/timetable-qa`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ question, timetable, currentMinutes, completeTimetable })
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch Timetable Q&A: ${response.status}`);
    }
    return response.json();
};

async function fetchFromBackend(endpoint) {
    const token = await getValidAccessToken();
    const headers = {};
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await timedFetch(`${SYSTEM_API_URL}${endpoint}`, { headers });
    if (!response.ok) {
        throw new Error(`Backend API Error ${response.status}: ${endpoint}`);
    }
    return response.json();
}

// --- New Award Scheme & Clipboard APIs ---

// Student-specific APIs
// Award scheme. The normalisers in utils/awardScheme.js keep the fields the Awards
// page needs (dates, categories and groups, nominations, prizes).
export const fetchStudentAwards = (studentId) =>
    fetchFromBackend(`/students/${studentId}/award-scheme/awards`).then(data => normaliseList(data, normaliseIssuedAward));
// Scan-in detail is keyed by the school date (YYYY-MM-DD). A 404 means no scan
// has been recorded for that date; other failures should stay unknown in the UI.
export const fetchStudentAttendanceScanIn = async (studentId, date) => {
    try {
        return await fetchFromBackend(`/students/${studentId}/attendance/scan-ins/${encodeURIComponent(date)}`);
    } catch (error) {
        if (String(error?.message || '').includes('Backend API Error 404')) return null;
        throw error;
    }
};
export const fetchStudentBadges = (studentId) =>
    fetchFromBackend(`/students/${studentId}/award-scheme/badges`).then(data => normaliseList(data, normaliseIssuedAward));
export const fetchStudentDecorations = (studentId) =>
    fetchFromBackend(`/students/${studentId}/award-scheme/decorations`).then(data => normaliseList(data, normaliseIssuedAward));
export const fetchStudentPrizes = (studentId) =>
    fetchFromBackend(`/students/${studentId}/award-scheme/prizes`).then(data => normaliseList(data, normaliseIssuedPrize));
// Nominations carried over from last year, counting towards a prize.
export const fetchStudentRollover = (studentId) =>
    fetchFromBackend(`/students/${studentId}/award-scheme/rollover`).then(normaliseRollover);

const formatDay = (iso) => (iso ? format(new Date(iso), 'EEE d MMM yyyy') : '');
const formatTimeRange = (start, end) => (start ? `${format(new Date(start), 'h:mm a')}${end ? ` – ${format(new Date(end), 'h:mm a')}` : ''}` : '');

// Clipboard staff come back as UserLink objects ({ firstName, lastName, sisId })
// or plain names; IRIs to user resources carry no display name, so they're skipped.
const clipboardStaffName = (member) => {
    if (!member) return '';
    if (typeof member === 'string') {
        return member.includes('://') || member.startsWith('/') ? '' : member;
    }
    return [member.firstName, member.lastName].filter(Boolean).join(' ')
        || member.name || member.displayName || '';
};
// An activity's hexColour, as "#rrggbb". The API may omit the "#", send a short
// "#rgb", or send null; anything that isn't a hex colour is dropped.
const clipboardColour = (hex) => {
    const m = typeof hex === 'string' && hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    return m ? `#${m[1].toLowerCase()}` : null;
};

const clipboardStaffList = (staff) => (Array.isArray(staff) ? staff : staff ? [staff] : [])
    .map(clipboardStaffName)
    .filter(Boolean);

export const fetchStudentClipboardAttendance = (studentId) => 
    fetchFromBackend(`/students/${studentId}/clipboard/attendance?_itemsPerPage=300`)
    .then(data => {
        const parseAttendance = (items) => {
            return items.map(item => ({
                id: item.id || Math.random(),
                activity: item.session?.activity?.name || item.session?.title || 'Activity',
                date: formatDay(item.session?.startDateTime),
                recordedBy: item.roll?.markedByUser || item.updatedByUser || '',
                status: item.absent ? (item.explained ? 'Explained' : 'Absent') : 'Present'
            }));
        };
        if (data && data.member && Array.isArray(data.member)) {
            return parseAttendance(data.member);
        }
        if (Array.isArray(data)) {
            return parseAttendance(data);
        }
        return [];
    });

export const fetchStudentPreExplainedAbsences = (studentId) => 
    fetchFromBackend(`/students/${studentId}/clipboard/pre-explained-absences?_itemsPerPage=100`)
    .then(data => {
        const parsePreExplained = (items) => {
            return items.map(item => ({
                id: item.id || Math.random(),
                reason: item.reason || 'Absence',
                startDate: formatDay(item.startDateTime),
                endDate: formatDay(item.endDateTime),
                status: item.isExplained ? 'Approved' : 'Pending'
            }));
        };
        if (data && data.member && Array.isArray(data.member)) {
            return parsePreExplained(data.member);
        }
        if (Array.isArray(data)) {
            return parsePreExplained(data);
        }
        return [];
    });

export const fetchStudentClipboardSessions = async (studentId, options = {}) => {
    const currentYear = options.year || new Date().getFullYear();
    const lastYear = options.year ? currentYear : currentYear + 1;
    const params = new URLSearchParams();
    params.set('date[after]', options.startDate || `${currentYear}-01-01`);
    // Keep next year's sessions available when the timetable is navigated forward.
    params.set('date[before]', options.endDate || `${lastYear}-12-31`);
    params.set('_itemsPerPage', String(options.itemsPerPage || 300));
    if (options.page) params.set('_page', String(options.page));
    if (options.context) params.set('context', String(options.context));

    const parseSessions = (items) => {
        return items.map(item => ({
            id: item.id || Math.random(),
            activity: item.activity?.name || item.title || 'Session',
            title: item.title && item.title !== item.activity?.name ? item.title : '',
            colour: clipboardColour(item.activity?.hexColour),
            date: formatDay(item.startDateTime),
            time: formatTimeRange(item.startDateTime, item.endDateTime),
            start: item.startDateTime || null,
            end: item.endDateTime || null,
            // A LocationLink: name, address and coordinates.
            location: item.location ? {
                name: item.location.name || '',
                address: item.location.address || '',
                latitude: item.location.latitude ?? null,
                longitude: item.location.longitude ?? null
            } : null,
            opponent: item.opponent?.name || (typeof item.opponent === 'string' ? item.opponent : ''),
            team: item.team?.name || item.teams?.[0]?.team?.name || item.teams?.[0]?.name || '',
            teamMembers: Array.isArray(item.team?.members) ? item.team.members.map(member => member.student?.name || member.name || member.studentName).filter(Boolean) : [],
            staff: clipboardStaffList(item.staff),
            round: item.roundName || '',
            notes: item.studentParentNotes || item.notes || '',
            cancelled: !!item.cancelled,
            result: item.scored ? {
                outcome: item.result || '',
                us: item.organisationScore ?? null,
                them: item.opponentScore ?? null
            } : null
        })).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    };

    const extractItems = (data) => {
        if (data && data.member && Array.isArray(data.member)) return data.member;
        if (Array.isArray(data)) return data;
        return [];
    };

    try {
        const firstData = await fetchFromBackend(`/students/${studentId}/clipboard/sessions?${params.toString()}`);
        const items = extractItems(firstData);

        // If the first page hit the 300 item ceiling and caller did not request a single specific page,
        // paginate to retrieve all remaining sessions.
        if (!options.page && items.length >= 300) {
            let pageNum = 1;
            while (pageNum < 10) {
                pageNum++;
                params.set('_page', String(pageNum));
                try {
                    const nextPageData = await fetchFromBackend(`/students/${studentId}/clipboard/sessions?${params.toString()}`);
                    const nextItems = extractItems(nextPageData);
                    if (!nextItems.length) break;
                    items.push(...nextItems);
                    if (nextItems.length < 300) break;
                } catch {
                    break;
                }
            }
        }

        return parseSessions(items);
    } catch (err) {
        // Throw rather than return []: an empty list is saved as "no sessions" over the
        // copy on the device, which is how an SBHS hiccup blanked the whole calendar.
        console.error('Failed to fetch clipboard sessions:', err);
        throw err;
    }
};

export const fetchStudentClipboardTeams = (studentId) => 
    fetchFromBackend(`/students/${studentId}/clipboard/teams?_itemsPerPage=100`)
    .then(data => {
        const parseTeams = (items) => {
            return items.map(item => ({
                id: item.id || Math.random(),
                teamId: item.team?.id || item.teamId || '',
                name: item.team?.name || 'Team',
                season: item.startDateTime ? String(new Date(item.startDateTime).getFullYear()) : '',
                sportOrActivity: item.team?.activity?.name || '',
                category: item.team?.category || ''
            }));
        };
        if (data && data.member && Array.isArray(data.member)) {
            return parseTeams(data.member);
        }
        if (Array.isArray(data)) {
            return parseTeams(data);
        }
        return [];
    });

export const fetchClipboardTeamDetails = (teamId) =>
    fetchFromBackend(`/clipboard/teams/${encodeURIComponent(teamId)}`).then(data => {
        const team = data?.team || data;
        const rawMembers = team?.members || team?.member || team?.students || [];
        const members = (Array.isArray(rawMembers) ? rawMembers : []).map(entry => {
            const student = entry.student || entry.user || entry;
            return {
                id: student.id || entry.id || '',
                name: student.name || [student.givenName, student.familyName].filter(Boolean).join(' ') || student.displayName || ''
            };
        }).filter(member => member.name);
        return { id: team?.id || teamId, name: team?.name || 'Team', members };
    });

// Global APIs
export const fetchGlobalAwards = () =>
    fetchFromBackend('/award-scheme/awards').then(data => normaliseList(data, normaliseAward));
// This year's standings (the API's `context` is the year). Without it, SBHS returns every
// context at once, so that's only the fallback.
export const fetchGlobalHousePoints = async () => {
    const thisYear = await fetchFromBackend(`/award-scheme/house-points?context=${new Date().getFullYear()}`)
        .then(data => normaliseList(data, normaliseHouse))
        .catch(() => []);
    if (thisYear.length > 0) return thisYear;
    return fetchFromBackend('/award-scheme/house-points').then(data => normaliseList(data, normaliseHouse));
};
export const fetchGlobalNominations = () =>
    fetchFromBackend('/award-scheme/nominations').then(data => normaliseList(data, normaliseNomination));
export const fetchGlobalPrizes = () =>
    fetchFromBackend('/award-scheme/prizes').then(data => normaliseList(data, normalisePrize));
export const fetchGlobalActivities = () => 
    fetchFromBackend('/clipboard/activities')
    .then(data => {
        const parseActivities = (items) => {
            return items.map(item => ({
                id: item.id || Math.random(),
                name: item.name || '',
                department: item.department?.name || ''
            }));
        };
        if (data && data.member && Array.isArray(data.member)) {
            return parseActivities(data.member);
        }
        if (Array.isArray(data)) {
            return parseActivities(data);
        }
        return [];
    });

export const fetchAssignments = () => fetchFromBackend('/assignments');

// User Preferences API
export const fetchUserPreferences = async (studentId) => {
    const token = await getValidAccessToken();
    const headers = {};
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await timedFetch(`${SYSTEM_API_URL}/users/${studentId}/preferences`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to fetch preferences: ${response.status}`);
    }
    return response.json();
};

export const saveUserPreferences = async (studentId, preferences) => {
    const token = await getValidAccessToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await timedFetch(`${SYSTEM_API_URL}/users/${studentId}/preferences`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ preferences })
    });
    if (!response.ok) {
        throw new Error(`Failed to save preferences: ${response.status}`);
    }
    return response.json();
};

// Data deletion requests (Privacy page). The server notifies admins, who
// fulfil the request from the admin panel.
export const fetchDeletionRequest = async () => {
    const token = await getValidAccessToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await timedFetch(`${SYSTEM_API_URL}/privacy/deletion-request`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to fetch deletion request: ${response.status}`);
    }
    return response.json();
};

export const requestDataDeletion = async () => {
    const token = await getValidAccessToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await timedFetch(`${SYSTEM_API_URL}/privacy/deletion-request`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || `Failed to request data deletion: ${response.status}`);
    }
    return data;
};

// Canvas Links API

// Sends a request to the Canvas links endpoints. Rejects with an Error whose
// message is the server's explanation, and whose status is the HTTP status.
const canvasRequest = async (path, { method = 'GET', body } = {}) => {
    const token = await getValidAccessToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await timedFetch(`${SYSTEM_API_URL}/canvas-links${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data.message || data.error || `Canvas links request failed (${response.status})`);
        error.status = response.status;
        error.data = data;
        throw error;
    }
    return data;
};

// { links: [{ className, canvasUrl }], canvasHost, schoolYear }
export const fetchCanvasLinks = () => canvasRequest('');

// Saves one class's link. With classKey, a Canvas course link is also shared with
// classmates. confirmDuplicate retries past the server's duplicate-course warning.
// Resolves with { link, shared, community }.
export const saveCanvasLink = (className, url, classKey, confirmDuplicate = false) =>
    canvasRequest(`/${encodeURIComponent(className)}`, { method: 'PUT', body: { url, classKey, confirmDuplicate } });

export const deleteCanvasLink = (className) =>
    canvasRequest(`/${encodeURIComponent(className)}`, { method: 'DELETE' });

// Removes all of the student's saved links for this school year.
export const deleteAllCanvasLinks = () => canvasRequest('', { method: 'DELETE' });

// Adds links saved on this device by older versions, without replacing any.
export const importCanvasLinks = (links) => canvasRequest('/import', { method: 'POST', body: { links } });

// { classes: { [classKey]: { link, suggestions } } } for the student's classes.
export const fetchCommunityCanvasLinks = (classKeys = []) =>
    canvasRequest(`/community?classes=${encodeURIComponent(classKeys.join(','))}`);

// vote: 1 = correct, -1 = wrong, 0 = clear. Resolves with { classKey, community }.
export const voteCanvasLink = (id, vote) =>
    canvasRequest(`/community/${encodeURIComponent(id)}/vote`, { method: 'POST', body: { vote } });

// Unread server notifications, e.g. a class link that was just approved:
// { notifications: [{ id, type, title, message, actionUrl, createdAt }] }
export const fetchLinkNotifications = () => canvasRequest('/notifications');

// Marks every server notification read.
export const markLinkNotificationsRead = () => canvasRequest('/notifications/read', { method: 'POST' });

// Admin "notification" broadcasts pushed to the bell panel — only ones this
// student hasn't dismissed. { notifications: [{ id, message, createdAt }] }
export const fetchBroadcastNotifications = async () => {
    try {
        const token = await getValidAccessToken();
        const response = await timedFetch(`${SYSTEM_API_URL}/broadcast/notifications`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data?.notifications || [];
    } catch {
        return [];
    }
};

// Permanently dismisses an admin broadcast notification for this student.
export const dismissBroadcastNotification = async (id) => {
    const token = await getValidAccessToken();
    const response = await timedFetch(`${SYSTEM_API_URL}/broadcast/notifications/${encodeURIComponent(id)}/dismiss`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) {
        throw new Error(`Failed to dismiss notification: ${response.status}`);
    }
};

// Build Notes API
export const fetchBuildNotes = async () => {
    try {
        const response = await timedFetch(`${SYSTEM_API_URL}/build-notes`);
        if (!response.ok) {
            throw new Error(`Failed to fetch build notes: ${response.status}`);
        }
        const data = await response.json();
        return data?.notes || [];
    } catch (e) {
        console.error('fetchBuildNotes error:', e);
        return [];
    }
};



