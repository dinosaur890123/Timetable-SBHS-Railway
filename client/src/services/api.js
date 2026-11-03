import { format } from 'date-fns';
import { rememberSubjectColours } from '../utils/timetable';

// Environment variables
const CLIENT_ID = import.meta.env.VITE_SBHS_CLIENT_ID?.trim();
const CLIENT_SECRET = import.meta.env.VITE_SBHS_CLIENT_SECRET?.trim();
const REDIRECT_URI = import.meta.env.VITE_SBHS_REDIRECT_URI?.trim();

const AUTH_ENDPOINT = 'https://auth.sbhs.net.au/authorize';
const TOKEN_ENDPOINT = 'https://auth.sbhs.net.au/token';
const API_BASE_URL = 'https://student.sbhs.net.au/api';

// ns.sbhs.au/r/student_app grants access to the Core API on api.sbhs.net.au (award scheme, clipboard).
export const SCOPES = 'all-ro openid profile email ns.sbhs.au/r/student_app';

export const getOauthConfig = () => ({
  clientId: CLIENT_ID || '(Not configured)',
  redirectUri: REDIRECT_URI || '(Not configured)',
  hasClientSecret: !!CLIENT_SECRET,
  clientSecretLength: CLIENT_SECRET ? CLIENT_SECRET.length : 0
});

// --- Authentication ---

export const performLogin = () => {
  if (!CLIENT_ID || !REDIRECT_URI) {
    alert("Configuration Error: Missing Client ID or Redirect URI in .env");
    return;
  }
  const state = Math.random().toString(36).substring(7);
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

export const exchangeToken = async (code) => {
  const formBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI
  });

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Token exchange error:", errorData);
        throw new Error(errorData.error_description || `Token exchange failed: ${response.statusText}`);
    }

    const data = await response.json();
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
            const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLIENT_ID });
            if (CLIENT_SECRET) body.set('client_secret', CLIENT_SECRET);
            const response = await fetch(TOKEN_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body
            });
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
export const getValidAccessToken = async () => (hasFreshToken() ? getAccessToken() : refreshAccessToken());

export const logout = (redirectToLogin = false) => {
    const theme = localStorage.getItem('theme');
    localStorage.clear();
    if (theme) localStorage.setItem('theme', theme);
    if (redirectToLogin === true) {
        performLogin();
    } else {
        window.location.href = '/';
    }
};

// Signed in if the access token is still good, or can be renewed with the refresh token.
export const isAuthenticated = () => hasCurrentScopes() && (hasFreshToken() || (!!getAccessToken() && !!localStorage.getItem('sbhs_refresh_token')));

// --- API Client ---

async function fetchWithAuth(endpoint) {
    const token = await getValidAccessToken();
    if (!token) throw new Error("No access token");

    const send = (bearer) => fetch(`${API_BASE_URL}${endpoint}`, {
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
export const fetchDayTimetable = async (date) => {
    const dateStr = date ? `?date=${format(date, 'yyyy-MM-dd')}` : '';
    const data = await fetchWithAuth(`/timetable/daytimetable.json${dateStr}`);
    rememberSubjectColours(data);
    return data;
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
const SYSTEM_API_URL = import.meta.env.VITE_ADMIN_API_URL || '/api';

export const fetchSystemStatus = async () => {
    try {
        const response = await fetch(`${SYSTEM_API_URL}/system/status`, {
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
    const response = await fetch(`${SYSTEM_API_URL}/ai/briefing`, {
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
    const response = await fetch(`${SYSTEM_API_URL}/ai/timetable-qa`, {
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

export const fetchAiNotesSummarise = async (content, title) => {
    const token = await getValidAccessToken();
    const response = await fetch(`${SYSTEM_API_URL}/ai/notes-summarise`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ content, title })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Failed to generate AI note summary: ${response.status}`);
    }
    return response.json();
};

export const fetchAiQuizGenerate = async (payload) => {
    const token = await getValidAccessToken();
    const response = await fetch(`${SYSTEM_API_URL}/ai/quiz-generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Failed to generate AI quiz: ${response.status}`);
    }
    return response.json();
};

async function fetchFromBackend(endpoint) {
    const token = await getValidAccessToken();
    const headers = {};
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${SYSTEM_API_URL}${endpoint}`, { headers });
    if (!response.ok) {
        throw new Error(`Backend API Error ${response.status}: ${endpoint}`);
    }
    return response.json();
}

// --- New Award Scheme & Clipboard APIs ---

// Student-specific APIs
export const fetchStudentAbsences = (studentId) => fetchFromBackend(`/students/${studentId}/attendance/absences`);
export const fetchStudentAbsenceDetail = (studentId, id) => fetchFromBackend(`/students/${studentId}/attendance/absences/${id}`);
export const fetchStudentScanIns = (studentId) => fetchFromBackend(`/students/${studentId}/attendance/scan-ins`);
export const fetchStudentScanInDetail = (studentId, dateId) => fetchFromBackend(`/students/${studentId}/attendance/scan-ins/${dateId}`);
export const fetchStudentAwards = (studentId) => 
    fetchFromBackend(`/students/${studentId}/award-scheme/awards`)
    .then(data => {
        const parseAwards = (items) => {
            return items.map(item => {
                if (item && item.title && item.points !== undefined) {
                    return item;
                }
                return {
                    id: item.id || Math.random(),
                    title: item.award?.name || item.title || 'Unknown Award',
                    description: item.nomination?.name || item.award?.category?.name || item.description || 'Issued Award',
                    dateIssued: item.date ? new Date(item.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : (item.dateIssued || ''),
                    points: item.award?.points !== undefined ? item.award.points : (item.points || 0),
                    category: item.award?.category?.name || item.category || ''
                };
            });
        };
        if (data && data.member && Array.isArray(data.member)) {
            return parseAwards(data.member);
        }
        if (Array.isArray(data)) {
            return parseAwards(data);
        }
        return [];
    });

export const fetchStudentBadges = (studentId) => 
    fetchFromBackend(`/students/${studentId}/award-scheme/badges`)
    .then(data => {
        const parseBadges = (items) => {
            return items.map(item => {
                if (item && item.title && item.category !== undefined) {
                    return item;
                }
                return {
                    id: item.id || Math.random(),
                    title: item.award?.name || item.title || 'Unknown Badge',
                    category: item.award?.category?.name || item.category || 'Badge',
                    dateIssued: item.date ? new Date(item.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : (item.dateIssued || '')
                };
            });
        };
        if (data && data.member && Array.isArray(data.member)) {
            return parseBadges(data.member);
        }
        if (Array.isArray(data)) {
            return parseBadges(data);
        }
        return [];
    });

export const fetchStudentDecorations = (studentId) => 
    fetchFromBackend(`/students/${studentId}/award-scheme/decorations`)
    .then(data => {
        const parseDecorations = (items) => {
            return items.map(item => {
                if (item && item.title && item.presentationNight !== undefined) {
                    return item;
                }
                return {
                    id: item.id || Math.random(),
                    title: item.award?.name || item.title || 'Unknown Decoration',
                    presentationNight: item.presentationNight || item.award?.metadata?.find(m => m.name === 'presentationNight')?.value || 'Presentation Night',
                    year: item.year || (item.date ? new Date(item.date).getFullYear() : (item.year || ''))
                };
            });
        };
        if (data && data.member && Array.isArray(data.member)) {
            return parseDecorations(data.member);
        }
        if (Array.isArray(data)) {
            return parseDecorations(data);
        }
        return [];
    });

export const fetchStudentPrizes = (studentId) => 
    fetchFromBackend(`/students/${studentId}/award-scheme/prizes`)
    .then(data => {
        const parsePrizes = (items) => {
            return items.map(item => {
                if (item && item.title && item.description !== undefined) {
                    return item;
                }
                return {
                    id: item.id || Math.random(),
                    title: item.prize?.name || item.award?.name || item.title || 'Unknown Prize',
                    description: item.prize?.tier ? `Tier ${item.prize.tier} prize` : (item.description || ''),
                    year: item.year || (item.date ? new Date(item.date).getFullYear() : (item.year || ''))
                };
            });
        };
        if (data && data.member && Array.isArray(data.member)) {
            return parsePrizes(data.member);
        }
        if (Array.isArray(data)) {
            return parsePrizes(data);
        }
        return [];
    });

export const fetchStudentRollover = (studentId) => 
    fetchFromBackend(`/students/${studentId}/award-scheme/rollover`)
    .then(data => {
        if (!data) return null;
        const rollover = Array.isArray(data.member) ? data.member[0] : data;
        if (!rollover) return null;
        // Nominations carried over from last year, counting towards the next prize.
        return {
            nominationCount: rollover.nominationCount || 0,
            prizeName: rollover.prize?.name || ''
        };
    });

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

export const fetchStudentClipboardTeamDetail = (studentId, teamId) => fetchFromBackend(`/students/${studentId}/clipboard/teams/${teamId}`);
export const fetchStudentEnrolments = (studentId) => fetchFromBackend(`/students/${studentId}/enrolments`);
export const fetchStudentEnrolmentDetail = (studentId, schoolYear) => fetchFromBackend(`/students/${studentId}/enrolments/${schoolYear}`);
export const fetchStudentTimetable = (studentId) => fetchFromBackend(`/students/${studentId}/timetable`);
export const fetchStudentTimetableClasses = (studentId) => fetchFromBackend(`/students/${studentId}/timetable/classes`);
export const fetchStudentTimetableDates = (studentId) => fetchFromBackend(`/students/${studentId}/timetable/dates`);
export const fetchStudentTimetableDateDetail = (studentId, date) => fetchFromBackend(`/students/${studentId}/timetable/dates/${date}`);

// Global APIs
export const fetchGlobalAwards = () => 
    fetchFromBackend('/award-scheme/awards')
    .then(data => {
        const parseGlobalAwards = (items) => {
            return items.filter(item => item && !item.archived).map(item => ({
                id: item.id || Math.random(),
                name: item.name || '',
                points: item.points || 0,
                description: item.category?.name || ''
            }));
        };
        if (data && data.member && Array.isArray(data.member)) {
            return parseGlobalAwards(data.member);
        }
        if (Array.isArray(data)) {
            return parseGlobalAwards(data);
        }
        return [];
    });

export const fetchGlobalAwardDetail = (id) => fetchFromBackend(`/award-scheme/awards/${id}`);

export const fetchGlobalCategories = () => 
    fetchFromBackend('/award-scheme/categories')
    .then(data => {
        const parseCategories = (items) => {
            return items.filter(item => item && !item.archived).map(item => ({
                id: item.id || Math.random(),
                name: item.name || '',
                type: item.type || ''
            }));
        };
        if (data && data.member && Array.isArray(data.member)) {
            return parseCategories(data.member);
        }
        if (Array.isArray(data)) {
            return parseCategories(data);
        }
        return [];
    });

export const fetchGlobalCategoryDetail = (id) => fetchFromBackend(`/award-scheme/categories/${id}`);

export const fetchGlobalHousePoints = () => 
    fetchFromBackend('/award-scheme/house-points')
    .then(data => {
        const parseHousePoints = (items) => {
            return items.map(item => ({
                house: item.name || item.house || '',
                colour: item.color || null,
                points: item.points || 0
            })).sort((a, b) => b.points - a.points);
        };
        if (data && data.member && Array.isArray(data.member)) {
            return parseHousePoints(data.member);
        }
        if (Array.isArray(data)) {
            return parseHousePoints(data);
        }
        return [];
    });

export const fetchGlobalNominations = () => 
    fetchFromBackend('/award-scheme/nominations')
    .then(data => {
        const parseNominations = (items) => {
            return items.map(item => ({
                id: item.id || Math.random(),
                name: item.name || '',
                pointsRequired: item.pointsRequired || 0,
                tier: item.tier || null
            })).sort((a, b) => a.pointsRequired - b.pointsRequired);
        };
        if (data && data.member && Array.isArray(data.member)) {
            return parseNominations(data.member);
        }
        if (Array.isArray(data)) {
            return parseNominations(data);
        }
        return [];
    });

export const fetchGlobalNominationDetail = (id) => fetchFromBackend(`/award-scheme/nominations/${id}`);
export const fetchGlobalPrizes = () => fetchFromBackend('/award-scheme/prizes');
export const fetchGlobalPrizeDetail = (id) => fetchFromBackend(`/award-scheme/prizes/${id}`);

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

export const fetchGlobalActivityDetail = (id) => fetchFromBackend(`/clipboard/activities/${id}`);

export const fetchGlobalDepartments = () => 
    fetchFromBackend('/clipboard/departments')
    .then(data => {
        const parseDepartments = (items) => {
            return items.map(item => {
                if (item && item.name !== undefined) {
                    return item;
                }
                return {
                    id: item.id || Math.random(),
                    name: item.name || ''
                };
            });
        };
        if (data && data.member && Array.isArray(data.member)) {
            return parseDepartments(data.member);
        }
        if (Array.isArray(data)) {
            return parseDepartments(data);
        }
        return [];
    });

export const fetchGlobalDepartmentDetail = (id) => fetchFromBackend(`/clipboard/departments/${id}`);
export const fetchGlobalTeamDetail = (id) => fetchFromBackend(`/clipboard/teams/${id}`);

export const fetchTransitDepartures = (stopName) => 
    fetchFromBackend(`/transit/departures?stopName=${encodeURIComponent(stopName || 'Moore Park Light Rail')}`);

export const fetchAssignments = () => fetchFromBackend('/assignments');

export const saveAssignment = async (assignment) => {
    const token = await getValidAccessToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${SYSTEM_API_URL}/assignments`, {
        method: 'POST',
        headers,
        body: JSON.stringify(assignment)
    });
    if (!response.ok) {
        throw new Error(`Failed to save assignment: ${response.status}`);
    }
    return response.json();
};

export const deleteAssignment = async (id) => {
    const token = await getValidAccessToken();
    const headers = {};
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${SYSTEM_API_URL}/assignments/${id}`, {
        method: 'DELETE',
        headers
    });
    if (!response.ok) {
        throw new Error(`Failed to delete assignment: ${response.status}`);
    }
    return response.json();
};

// User Preferences API
export const fetchUserPreferences = async (studentId) => {
    const token = await getValidAccessToken();
    const headers = {};
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${SYSTEM_API_URL}/users/${studentId}/preferences`, { headers });
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
    const response = await fetch(`${SYSTEM_API_URL}/users/${studentId}/preferences`, {
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
    const response = await fetch(`${SYSTEM_API_URL}/canvas-links${path}`, {
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
        const response = await fetch(`${SYSTEM_API_URL}/build-notes`);
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



