import { format } from 'date-fns';

// Environment variables
const CLIENT_ID = import.meta.env.VITE_SBHS_CLIENT_ID?.trim();
const CLIENT_SECRET = import.meta.env.VITE_SBHS_CLIENT_SECRET?.trim();
const REDIRECT_URI = import.meta.env.VITE_SBHS_REDIRECT_URI?.trim();

const AUTH_ENDPOINT = 'https://auth.sbhs.net.au/authorize';
const TOKEN_ENDPOINT = 'https://auth.sbhs.net.au/token';
const API_BASE_URL = 'https://student.sbhs.net.au/api';

const SCOPES = 'all-ro openid profile email';

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
    
    localStorage.setItem('sbhs_access_token', data.access_token);
    if(data.refresh_token) localStorage.setItem('sbhs_refresh_token', data.refresh_token);
    localStorage.setItem('sbhs_token_expiry', new Date().getTime() + (data.expires_in * 1000));
    
    return data;
  } catch (error) {
    console.error("Auth Error:", error);
    throw error;
  }
};

const getAccessToken = () => localStorage.getItem('sbhs_access_token');

export const logout = (redirectToLogin = false) => {
    const theme = localStorage.getItem('theme');
    const appVersion = localStorage.getItem('app_version');
    localStorage.clear();
    if (theme) localStorage.setItem('theme', theme);
    if (appVersion) localStorage.setItem('app_version', appVersion);
    if (redirectToLogin === true) {
        performLogin();
    } else {
        window.location.href = '/';
    }
};

export const isAuthenticated = () => {
    const token = getAccessToken();
    const expiry = localStorage.getItem('sbhs_token_expiry');
    return token && expiry && new Date().getTime() < parseInt(expiry);
};

// --- API Client ---

async function fetchWithAuth(endpoint) {
    const token = getAccessToken();
    if (!token) throw new Error("No access token");

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

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
    return fetchWithAuth(`/timetable/daytimetable.json${dateStr}`);
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
        const response = await fetch(`${SYSTEM_API_URL}/system/status`);
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
};

export const fetchAiBriefing = async (notices) => {
    const token = getAccessToken();
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
    const token = getAccessToken();
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
    const token = getAccessToken();
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
    const token = getAccessToken();
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
    const token = getAccessToken();
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
                    title: item.award?.name || item.title || 'Unknown Prize',
                    description: item.award?.description || item.description || '',
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
        if (data.member && Array.isArray(data.member) && data.member.length > 0) {
            return data.member[0];
        }
        return data;
    });

export const fetchStudentClipboardAttendance = (studentId) => 
    fetchFromBackend(`/students/${studentId}/clipboard/attendance`)
    .then(data => {
        const parseAttendance = (items) => {
            return items.map(item => {
                if (item && item.activity && item.status !== undefined) {
                    return item;
                }
                return {
                    id: item.id || Math.random(),
                    activity: item.activity || item.session?.activity || 'Activity',
                    date: item.date || item.session?.date || '',
                    recordedBy: item.recordedBy || '',
                    status: item.status || 'Present'
                };
            });
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
            return items.map(item => {
                if (item && item.reason && item.status !== undefined) {
                    return item;
                }
                return {
                    id: item.id || Math.random(),
                    reason: item.reason || '',
                    startDate: item.startDate || item.start || '',
                    endDate: item.endDate || item.end || '',
                    status: item.status || 'Pending'
                };
            });
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
            return items.map(item => {
                if (item && item.activity && item.location !== undefined) {
                    return item;
                }
                return {
                    id: item.id || Math.random(),
                    activity: item.activity || '',
                    date: item.date || '',
                    time: item.time || '',
                    location: item.location || ''
                };
            });
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
            return items.map(item => {
                if (item && item.name && item.sportOrActivity !== undefined) {
                    return item;
                }
                return {
                    id: item.id || Math.random(),
                    name: item.name || '',
                    season: item.season || '',
                    sportOrActivity: item.sportOrActivity || item.activity || '',
                    coach: item.coach || ''
                };
            });
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
            return items.map(item => {
                if (item && item.name && item.pointsRequired !== undefined) {
                    return item;
                }
                return {
                    id: item.id || Math.random(),
                    name: item.name || item.award?.name || '',
                    pointsRequired: item.pointsRequired || item.points || 0,
                    description: item.description || ''
                };
            });
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
            return items.map(item => {
                if (item && item.name && item.weight !== undefined) {
                    return item;
                }
                return {
                    id: item.id || Math.random(),
                    name: item.name || '',
                    weight: item.weight || 1
                };
            });
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
            return items.map(item => {
                if (item && item.house && item.points !== undefined) {
                    return item;
                }
                return {
                    house: item.house || '',
                    points: item.points || 0
                };
            });
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
            return items.map(item => {
                if (item && item.nomineeName && item.status !== undefined) {
                    return item;
                }
                return {
                    id: item.id || Math.random(),
                    nomineeName: item.nomineeName || '',
                    nomineeId: item.nomineeId || '',
                    awardId: item.awardId || '',
                    nominatedBy: item.nominatedBy || '',
                    date: item.date ? new Date(item.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
                    status: item.status || 'Pending'
                };
            });
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
            return items.map(item => {
                if (item && item.name && item.type !== undefined) {
                    return item;
                }
                return {
                    id: item.id || Math.random(),
                    name: item.name || '',
                    type: item.type || '',
                    term: item.term || 1
                };
            });
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
    const token = getAccessToken();
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
    const token = getAccessToken();
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
    const token = getAccessToken();
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
    const token = getAccessToken();
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
export const fetchCanvasLinks = async () => {
    const token = getAccessToken();
    const headers = {};
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${SYSTEM_API_URL}/canvas-links`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to fetch canvas links: ${response.status}`);
    }
    return response.json();
};

export const saveCanvasLinks = async (links) => {
    const token = getAccessToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${SYSTEM_API_URL}/canvas-links`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ links })
    });
    if (!response.ok) {
        throw new Error(`Failed to save canvas links: ${response.status}`);
    }
    return response.json();
};

export const fetchSharedCanvasLink = async (className) => {
    const token = getAccessToken();
    const headers = {};
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${SYSTEM_API_URL}/canvas-links/shared/${encodeURIComponent(className)}`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to fetch shared canvas link: ${response.status}`);
    }
    return response.json();
};



