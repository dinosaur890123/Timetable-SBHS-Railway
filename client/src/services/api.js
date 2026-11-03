import { format } from 'date-fns';
import { rememberSubjectColours } from '../utils/timetable';
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

// Whether the data on screen came from the offline copy. The service worker answers from its cache
// when the network fails and marks those responses (see offlineMarker in vite.config.js); the next
// real response clears it. Subscribers hear only actual changes.
let servingCachedData = false;
const cachedDataListeners = new Set();
const setServingCachedData = (value) => {
    if (servingCachedData === value) return;
    servingCachedData = value;
    cachedDataListeners.forEach(listener => listener(value));
};
export const onCachedDataChange = (listener) => {
    cachedDataListeners.add(listener);
    listener(servingCachedData);
    return () => cachedDataListeners.delete(listener);
};

// Service worker caches holding the student's own data, emptied whenever the account changes.
const PRIVATE_CACHES = ['sbhs-data', 'app-data'];
const clearOfflineData = async () => {
    dayCache.clear();
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limit);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (response.headers.get('X-Synchron-Cached')) setServingCachedData(true);
        else if (response.ok) setServingCachedData(false);
        return response;
    } catch (error) {
        if (error?.name === 'AbortError') throw new Error(`Request timed out after ${Math.round(limit / 1000)}s`);
        throw error;
    } finally {
        clearTimeout(timer);
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
// SCOPES changed has to sign in again to reach the Core API.
const hasCurrentScopes = () => {
    if (!getAccessToken() || localStorage.getItem('sbhs_token_scope') === SCOPES) return true;
    clearTokens();
    return false;
};

// Check if scopes are outdated without clearing tokens (for UI banner)
export const isScopeOutdated = () => {
    const currentScope = localStorage.getItem('sbhs_token_scope');
    const accessToken = localStorage.getItem('sbhs_access_token');
    return !!accessToken && currentScope !== SCOPES;
};

// Treat a token as expired a minute early so it can't lapse mid-request.
const hasFreshToken = () => {
    const expiry = parseInt(localStorage.getItem('sbhs_token_expiry'), 10);
    return !!getAccessToken() && Date.now() < expiry - 60 * 1000;
};

// SBHS access tokens last an hour; the 90-day refresh token gets a new pair.
// Refresh tokens are single-use, so concurrent callers share one refresh.
let refreshInFlight = null;

export const refreshAccessToken = () => {
    if (refreshInFlight) return refreshInFlight;
    const refreshToken = localStorage.getItem('sbhs_refresh_token');
    if (!refreshToken || !CLIENT_ID) return Promise.resolve(null);

    refreshInFlight = (async () => {
        try {
            const response = await requestToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
            if (!response.ok) {
                // Another tab may have spent this refresh token first; use the pair it stored.
                if (localStorage.getItem('sbhs_refresh_token') !== refreshToken && hasFreshToken()) return getAccessToken();
                if (response.status === 400 || response.status === 401) clearTokens();
                return null;
            }
            const data = await response.json();
            storeTokens(data);
            return data.access_token;
        } catch (error) {
            // Offline or SBHS unreachable: keep the tokens and try again next time.
            console.error('Token refresh failed:', error);
            return null;
        } finally {
            refreshInFlight = null;
        }
    })();
    return refreshInFlight;
};

// The current access token, refreshed first if it has expired. Null when signed out.
export const getValidAccessToken = async () => {
    if (hasFreshToken()) return getAccessToken();
    const fresh = await refreshAccessToken();
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
export const isAuthenticated = () => hasCurrentScopes() && (hasFreshToken() || (!!getAccessToken() && !!localStorage.getItem('sbhs_refresh_token')));

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
        if (response.status === 401) logout();
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
    return data;
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

export const fetchStudentClipboardAttendance = (studentId) => 
    fetchFromBackend(`/students/${studentId}/clipboard/attendance`)
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
    fetchFromBackend(`/students/${studentId}/clipboard/pre-explained-absences`)
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

export const fetchStudentClipboardSessions = (studentId) => 
    fetchFromBackend(`/students/${studentId}/clipboard/sessions`)
    .then(data => {
        const parseSessions = (items) => {
            return items.map(item => ({
                id: item.id || Math.random(),
                activity: item.activity?.name || item.title || 'Session',
                title: item.title && item.title !== item.activity?.name ? item.title : '',
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
        if (data && data.member && Array.isArray(data.member)) {
            return parseSessions(data.member);
        }
        if (Array.isArray(data)) {
            return parseSessions(data);
        }
        return [];
    });

export const fetchStudentClipboardTeams = (studentId) => 
    fetchFromBackend(`/students/${studentId}/clipboard/teams`)
    .then(data => {
        const parseTeams = (items) => {
            return items.map(item => ({
                id: item.id || Math.random(),
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
        throw error;
    }
    return data;
};

// { links: [{ className, canvasUrl }], canvasHost, schoolYear }
export const fetchCanvasLinks = () => canvasRequest('');

// Saves one class's link. With classKey, a Canvas course link is also shared with
// classmates. Resolves with { link, shared, community }.
export const saveCanvasLink = (className, url, classKey) =>
    canvasRequest(`/${encodeURIComponent(className)}`, { method: 'PUT', body: { url, classKey } });

export const deleteCanvasLink = (className) =>
    canvasRequest(`/${encodeURIComponent(className)}`, { method: 'DELETE' });

// Adds links saved on this device by older versions, without replacing any.
export const importCanvasLinks = (links) => canvasRequest('/import', { method: 'POST', body: { links } });

// { classes: { [classKey]: { link, suggestions } } } for the student's classes.
export const fetchCommunityCanvasLinks = (classKeys = []) =>
    canvasRequest(`/community?classes=${encodeURIComponent(classKeys.join(','))}`);

// vote: 1 = correct, -1 = wrong, 0 = clear. Resolves with { classKey, community }.
export const voteCanvasLink = (id, vote) =>
    canvasRequest(`/community/${encodeURIComponent(id)}/vote`, { method: 'POST', body: { vote } });

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



