import React, { useEffect, useState, useRef } from 'react';
import Navigation from './components/Navigation';
import ThemeToggle from './components/ThemeToggle';
import Timetable from './components/Timetable';
import CalendarView from './components/CalendarView';
import DailyNotices from './components/DailyNotices';
import AdminPanel from './components/AdminPanel';
import LandingPage from './components/LandingPage';
import Home from './components/Home';
import { 
  fetchDayTimetable, 
  fetchDailyNews, 
  fetchUserInfo, 
  isAuthenticated, 
  exchangeToken, 
  logout,
  fetchSystemStatus,
  fetchCompleteTimetable,
  fetchAiBriefing
} from './services/api';
import { registerUser } from './services/adminApi';
import { format, addDays, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Info, AlertTriangle, XCircle, AlertOctagon } from 'lucide-react';

function App() {
  // State
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [aiDisabled, setAiDisabled] = useState(() => localStorage.getItem('ai_disabled') === 'true');
  const [currentView, setCurrentView] = useState('home');
  const [viewDate, setViewDate] = useState(new Date());

  useEffect(() => {
    localStorage.setItem('ai_disabled', aiDisabled ? 'true' : 'false');
  }, [aiDisabled]);

  useEffect(() => {
    // Check if user is navigating exactly to /admin
    if (window.location.pathname === '/admin') {
        setCurrentView('admin');
    }
  }, []);
  
  const [timetable, setTimetable] = useState(null);
  const [notices, setNotices] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [aiBriefing, setAiBriefing] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  
  // System State
  const [broadcast, setBroadcast] = useState(null);
  const [maintenance, setMaintenance] = useState(false);
  const hasSyncedTimetable = useRef(false);

  // Poll System Status
  useEffect(() => {
    const pollStatus = async () => {
        try {
            const systemData = await fetchSystemStatus();
            if (systemData) {
                const dismissedId = localStorage.getItem('dismissedUpdateId');
                if (systemData.broadcast?.type === 'update' && String(systemData.broadcast.id) === dismissedId) {
                    setBroadcast(null);
                } else {
                    setBroadcast(systemData.broadcast);
                }
                setMaintenance(systemData.maintenance);
            }
        } catch (e) {
            console.error("Failed to poll system status", e);
        }
    };
    
    // Poll every 30 seconds
    const interval = setInterval(pollStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Theme Config
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  // Auth & Initial Data
  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      
      if (code) {
        window.history.replaceState({}, document.title, "/");
        try {
          await exchangeToken(code);
        } catch (err) {
            console.error(err);
            setAuthError(err.message || "Failed to authenticate.");
            setLoading(false); 
            return;
        }
      }

      if (!isAuthenticated()) {
        setLoading(false);
        return;
      }

      try {
        const [noticesData, userData, systemData, completeTimetableData] = await Promise.all([
          fetchDailyNews(),
          fetchUserInfo(),
          fetchSystemStatus(),
          fetchCompleteTimetable().catch(e => {
              console.warn("Failed to fetch complete timetable", e);
              return null;
          })
        ]);
        setNotices(noticesData);
        setUser(userData);
        
        if (systemData) {
            const dismissedId = localStorage.getItem('dismissedUpdateId');
            if (systemData.broadcast?.type === 'update' && String(systemData.broadcast.id) === dismissedId) {
                setBroadcast(null);
            } else {
                setBroadcast(systemData.broadcast);
            }
            setMaintenance(systemData.maintenance);
        }
        
        // Attempt to register/update user in Admin Panel in background with complete timetable
        if (userData && userData.studentId) {
            registerUser({
                id: userData.studentId,
                name: `${userData.givenName} ${userData.surname}`,
                email: userData.email, // SBHS API usually provides this in ID token, checking availability helps
                year: userData.yearGroup,
                timetable: completeTimetableData || undefined
            }).then(dbSync => {
                if (dbSync && dbSync.user && dbSync.user.role) {
                    setUser(prev => {
                        if (prev && prev.role !== dbSync.user.role) {
                            return { ...prev, role: dbSync.user.role };
                        }
                        return prev;
                    });
                }
            }).catch(e => console.log("Init sync failed silently", e));
        }

      } catch (error) {
         console.error(error);
         if (error.message?.includes("401")) logout();
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Fetch Timetable when date changes
  useEffect(() => {
    if (!isAuthenticated()) return;
    
    // Reset timetable while loading to show feedback if needed
    // or just let it update smoothly. 
    const loadTimetable = async () => {
        try {
            const data = await fetchDayTimetable(viewDate);
            setTimetable(data);
        } catch (err) {
            console.error("Failed to fetch timetable", err);
        }
    };
    loadTimetable();
  }, [viewDate, user]); 

  // Fetch AI Briefing in background once notices are loaded
  useEffect(() => {
    if (!user || !notices || !notices.notices || notices.notices.length === 0) return;
    
    const getAiData = async () => {
        setAiLoading(true);
        try {
            const data = await fetchAiBriefing(notices.notices);
            setAiBriefing(data);
        } catch (err) {
            console.error("Failed to load AI briefing:", err);
        } finally {
            setAiLoading(false);
        }
    };
    getAiData();
  }, [notices, user]);

  // Date Navigation Helpers
  const nextDay = () => setViewDate(d => addDays(d, 1));
  const prevDay = () => setViewDate(d => addDays(d, -1));
  const resetToday = () => setViewDate(new Date());

  if (maintenance && currentView !== 'admin') {
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-8 text-center">
            <div className="bg-red-900/20 p-6 rounded-full border border-red-500/20 mb-6 animate-pulse">
                <AlertOctagon size={64} className="text-red-500" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">System Maintenance</h1>
            <p className="text-zinc-400 max-w-md">Synchron is currently undergoing scheduled maintenance. Please check back later.</p>
            {user?.role === 'Admin' && (
                <button onClick={() => setCurrentView('admin')} className="mt-8 text-xs text-zinc-600 hover:text-white underline">
                    Admin Bypass
                </button>
            )}
        </div>
      );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center transition-colors">
        <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
            <p className="text-zinc-400 text-sm">Loading Synchron...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
        <div className="transition-colors bg-white dark:bg-zinc-950">
            <LandingPage authError={authError} clearAuthError={() => setAuthError(null)} />
        </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
      <Navigation currentView={currentView} setView={setCurrentView} user={user} />

      <main className="flex-1 overflow-x-hidden overflow-y-auto">
         {/* Top Header */}
         <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-900">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white capitalize">
                {currentView}
            </h1>
            
            <div className="flex items-center gap-4">
               <div className="hidden md:flex flex-col items-end">
                   <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{user?.givenName} {user?.surname}</span>
                   <span className="text-xs text-zinc-500">{user?.studentId || 'Staff'}</span>
               </div>
               <ThemeToggle isDark={theme === 'dark'} toggleTheme={toggleTheme} />
            </div>
         </header>
         
         {broadcast && (
            <div className={`mx-4 md:mx-8 mt-6 -mb-2 px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-medium border
                ${broadcast.type === 'error' ? 'bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-500/20 dark:text-red-400' : 
                  broadcast.type === 'warning' ? 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-400' : 
                  broadcast.type === 'update' ? 'bg-green-500/10 text-green-700 border-green-500/20 dark:bg-green-500/20 dark:text-green-400' :
                  'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400'}`}>
                <Info size={18} className="shrink-0" />
                <span className="flex-1">{broadcast.message}</span>
                
                {broadcast.type === 'update' && (
                    <button 
                        onClick={() => {
                            if (broadcast.id) {
                                localStorage.setItem('dismissedUpdateId', String(broadcast.id));
                            }
                            logout();
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm ml-auto shrink-0"
                    >
                        Sign Out & Update
                    </button>
                )}
            </div>
         )}

         <div className="p-4 md:p-8 max-w-7xl mx-auto">
            
            {/* HOME VIEW */}
            {currentView === 'home' && (
                <Home 
                    user={user} 
                    timetableData={timetable} 
                    notices={notices} 
                    setView={setCurrentView} 
                    aiBriefing={aiBriefing} 
                    aiLoading={aiLoading} 
                    theme={theme}
                    toggleTheme={toggleTheme}
                    aiDisabled={aiDisabled}
                />
            )}

            {/* TIMETABLE VIEW */}
            {currentView === 'timetable' && (
                <div className="space-y-6">
                    {/* Date Controls */}
                    <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                             <button onClick={prevDay} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-600 dark:text-zinc-400">
                                <ChevronLeft size={20} />
                             </button>
                             <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-3">
                                <span className="text-lg font-bold text-zinc-900 dark:text-white min-w-[140px] text-center">
                                    {format(viewDate, 'EEEE')}
                                </span>
                                <span className="text-sm text-zinc-500 font-medium">
                                    {format(viewDate, 'd MMMM yyyy')}
                                </span>
                             </div>
                             <button onClick={nextDay} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-600 dark:text-zinc-400">
                                <ChevronRight size={20} />
                             </button>
                        </div>
                        
                        {!isSameDay(viewDate, new Date()) && (
                            <button onClick={resetToday} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                                <CalendarIcon size={16} />
                                Return to Today
                            </button>
                        )}
                    </div>

                    <Timetable timetableData={timetable} aiDisabled={aiDisabled} />
                </div>
            )}

            {/* CALENDAR VIEW */}
            {currentView === 'calendar' && <CalendarView />}

            {/* NOTICES VIEW */}
            {currentView === 'notices' && (
                <div className="max-w-3xl mx-auto">
                    <DailyNotices notices={notices} aiBriefing={aiBriefing} />
                </div>
            )}
             
            {/* ADMIN VIEW */}
            {currentView === 'admin' && <AdminPanel user={user} />}

            {/* PROFILE VIEW (Simple placeholder) */}
            {currentView === 'profile' && (
                <div className="max-w-md mx-auto bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 text-center space-y-6 mt-10">
                    <div className="w-24 h-24 bg-blue-500 rounded-full mx-auto flex items-center justify-center text-3xl font-bold text-white shadow-xl shadow-blue-500/20">
                        {user?.givenName?.[0]}{user?.surname?.[0]}
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">{user?.givenName} {user?.surname}</h2>
                        <p className="text-zinc-500 mt-1">{user?.email}</p>
                    </div>
                    
                    {/* AI Toggle Option */}
                    <div className="border border-zinc-200 dark:border-zinc-800 p-4 text-left space-y-2 bg-zinc-50 dark:bg-zinc-950/20 select-none">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-zinc-900 dark:text-white">AI Features</span>
                            <button 
                                onClick={() => setAiDisabled(prev => !prev)}
                                className={`px-3 py-1.5 text-xs font-extrabold uppercase border transition ${
                                    aiDisabled 
                                        ? 'bg-zinc-200 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 text-zinc-650 dark:text-zinc-400' 
                                        : 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white'
                                }`}
                            >
                                {aiDisabled ? 'Disabled' : 'Enabled'}
                            </button>
                        </div>
                        <p className="text-[11px] text-zinc-500">Enable or disable daily briefings and AI Q&A assistants across your schedule.</p>
                    </div>

                    <button 
                        onClick={logout}
                        className="w-full py-3 font-medium text-red-500 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-xl transition-colors"
                    >
                        Sign Out
                    </button>
                </div>
            )}

         </div>
      </main>
    </div>
  );
}

export default App;
