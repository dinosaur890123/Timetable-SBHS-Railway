import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowRight, 
  Calendar, 
  Clock, 
  Shield, 
  Award, 
  LayoutDashboard, 
  AlertOctagon, 
  X,
  Terminal,
  Activity,
  Cpu,
  Lock,
  Heart
} from 'lucide-react';
import { performLogin, getOauthConfig } from '../services/api';

const LandingPage = ({ authError, clearAuthError, supporters }) => {
  // State for mock timetable widget interaction
  const [mockActiveTab, setMockActiveTab] = useState('timetable');
  const [currentTime, setCurrentTime] = useState('');
  
  // Easter egg state for icon toggle
  const [iconClickCount, setIconClickCount] = useState(0);
  const [useOriginalIcon, setUseOriginalIcon] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toTimeString().split(' ')[0]);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleIconClick = () => {
    setIconClickCount(prev => {
      const newCount = prev + 1;
      if (newCount >= 3) {
        setUseOriginalIcon(true);
        return 0;
      }
      return newCount;
    });
  };

  const mockPeriods = [
    { name: 'English', time: '09:00 - 10:00', room: 'Room 203', teacher: 'Mrs. B', status: 'Normal' },
    { name: 'Design and Technology', time: '10:05 - 11:05', room: 'Room 502', teacher: 'Mr. G', status: 'Room Change', oldRoom: 'Room 102' },
    { name: 'Physics', time: '11:25 - 12:25', room: 'Room 307', teacher: 'Mr. H', status: 'Substitution', oldTeacher: 'Mrs. S' },
    { name: 'Mathematics Ext. 2', time: '12:30 - 13:30', room: 'Room 105', teacher: 'Mr. J', status: 'Normal' },
    { name: 'History', time: '14:10 - 15:10', room: 'Room 205', teacher: 'Ms. R', status: 'Normal' }
  ];

  const mockNotices = [
    { title: 'Chess Club Championship', group: 'All Years', body: 'Round 3 begins today at lunchtime in Room 102. Please check pairings on the tournament board.' },
    { title: 'Year 11 Peer Support Meeting', group: 'Year 11', body: 'Mandatory briefing in the Great Hall at the start of Period 3 today.' }
  ];

  return (
    <div className="min-h-screen bg-[rgb(10_10_12)] text-zinc-100 font-sans selection:bg-white selection:text-black relative overflow-x-hidden">
      {/* Modern theme background with subtle dot grid */}
      <div className="absolute inset-0 m-dots pointer-events-none z-0" />
      
      {authError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[rgb(21_21_25)] border border-[rgb(255_255_255/0.07)] w-full max-w-2xl p-8 text-left transition-all relative rounded-2xl m-shadow-lg">
            <div className="absolute top-0 left-0 bg-white/10 text-white font-mono text-xs px-3 py-1.5 uppercase font-bold rounded-tl-2xl">
              SYSTEM_ALERT
            </div>
            <div className="flex justify-between items-start mb-6 mt-4">
              <div className="flex items-center gap-3 text-white">
                <AlertOctagon className="text-white shrink-0" size={24} />
                <h3 className="text-xl font-semibold uppercase tracking-wide">Authentication Failure</h3>
              </div>
              <button
                onClick={clearAuthError}
                className="p-1.5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-6 p-4 bg-[rgb(15_15_18)] border border-[rgb(255_255_255/0.07)] text-zinc-400 font-mono text-sm break-all rounded-xl">
              <span className="font-semibold text-white uppercase block mb-1 text-xs">// Error Details:</span>
              {authError}
            </div>

            <div className="space-y-4 mb-6">
              <h4 className="font-semibold text-white uppercase tracking-wide text-xs border-b border-[rgb(255_255_255/0.07)] pb-2 font-mono">Troubleshooting Checklist:</h4>
              <ul className="text-zinc-400 text-sm list-none space-y-3 font-mono">
                <li className="flex items-start gap-2">
                  <span className="text-zinc-500 font-semibold shrink-0">[1]</span>
                  <div>
                    <strong className="text-zinc-200">Redirect URI Mismatch:</strong> The redirect URL defined in SBHS developer portal must match <code className="bg-[rgb(15_15_18)] px-1.5 py-0.5 border border-[rgb(255_255_255/0.07)] font-mono text-white text-xs rounded">{getOauthConfig().redirectUri}</code> exactly.
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-zinc-500 font-semibold shrink-0">[2]</span>
                  <div>
                    <strong className="text-zinc-200">Client Secret:</strong> The developer portal client secret must match the one provided in settings.
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-zinc-500 font-semibold shrink-0">[3]</span>
                  <div>
                    <strong className="text-zinc-200">Re-deploy Client:</strong> Vite builds client config at <span className="underline text-white font-semibold">build time</span>. If you recently changed environment variables in Railway, you <strong className="text-white">MUST trigger a new deployment</strong> of the frontend service.
                  </div>
                </li>
              </ul>
            </div>

            <div className="space-y-3 bg-[rgb(15_15_18)] p-4 border border-[rgb(255_255_255/0.07)] font-mono text-xs rounded-xl">
              <div className="font-semibold text-zinc-500 uppercase tracking-wide mb-2 text-[11px]">Compiled Client Build Configuration:</div>
              <div className="flex justify-between border-b border-[rgb(255_255_255/0.07)] pb-1.5">
                <span className="text-zinc-500">Client ID</span>
                <span className="text-zinc-300 font-semibold">{getOauthConfig().clientId}</span>
              </div>
              <div className="flex justify-between border-b border-[rgb(255_255_255/0.07)] pb-1.5">
                <span className="text-zinc-500">Redirect URI</span>
                <span className="text-zinc-300 font-semibold">{getOauthConfig().redirectUri}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Client Secret Status</span>
                <span className={getOauthConfig().hasClientSecret ? "text-white font-semibold" : "text-zinc-500 font-semibold"}>
                  {getOauthConfig().hasClientSecret ? `Present (Length: ${getOauthConfig().clientSecretLength})` : "Not Present"}
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 font-mono">
              <button
                onClick={clearAuthError}
                className="px-6 py-2.5 border border-[rgb(255_255_255/0.1)] text-zinc-300 font-medium hover:border-white/20 hover:text-white transition-colors rounded-xl"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  clearAuthError();
                  performLogin();
                }}
                className="px-6 py-2.5 bg-white text-black font-semibold border border-white hover:bg-zinc-100 transition-all rounded-xl"
              >
                Retry Login
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modern Header */}
      <nav className="sticky top-0 z-30 border-b border-[rgb(255_255_255/0.07)] bg-black/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              {/* Modern logo with easter egg */}
              {useOriginalIcon ? (
                <div className="grid grid-cols-2 gap-0.5 p-1.5 bg-white/10 rounded-lg cursor-pointer" onClick={handleIconClick}>
                  <div className="w-2.5 h-2.5 bg-white rounded-sm" />
                  <div className="w-2.5 h-2.5 bg-white rounded-sm" />
                  <div className="w-2.5 h-2.5 bg-white rounded-sm" />
                  <div className="w-2.5 h-2.5 bg-white rounded-sm animate-pulse" />
                </div>
              ) : (
                <img 
                  src="/icon-1500x1500.png" 
                  alt="Synchron Logo" 
                  className="w-10 h-10 rounded-lg cursor-pointer hover:scale-105 transition-transform"
                  onClick={handleIconClick}
                />
              )}
              <span className="font-semibold text-base tracking-wide text-white uppercase">
                <span className="underline decoration-white/50 decoration-2 underline-offset-4 font-semibold">synchron</span>
              </span>
            </div>

            {/* System Status Indicators */}
            <div className="hidden sm:flex items-center gap-4 text-[11px] font-mono text-zinc-500 border-l border-[rgb(255_255_255/0.07)] pl-6">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-white/60 animate-pulse rounded-full" />
                API: ONLINE
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-white/60 animate-pulse rounded-full" />
                DB: CONNECTED
              </span>
              <span className="text-zinc-500">V2.4.0</span>
            </div>
          </div>

          <button
             onClick={performLogin}
             className="relative text-xs font-medium text-black bg-white px-4 py-2 border border-white hover:bg-zinc-100 transition-all duration-200 rounded-xl"
          >
             LOG_IN // AUTH
          </button>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-20 md:pt-28 pb-24">
        
        {/* Hero Grid Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center mb-40">
            
            {/* Left Hero Text Column */}
            <div className="lg:col-span-7 flex flex-col text-left">
              <motion.div
                 initial={{ opacity: 0, y: 15 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ duration: 0.6 }}
              >
                <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-[rgb(255_255_255/0.1)] bg-[rgb(15_15_18)] text-zinc-400 text-xs font-mono tracking-wide uppercase mb-8 rounded-lg">
                   <Activity size={12} className="text-white/60 animate-pulse" />
                   SYSTEM STATUS: OK // FOR_SBHS
                </div>

                <h1 className="text-4xl sm:text-6xl md:text-7xl font-semibold text-white mb-6 tracking-tight leading-[1.08]">
                  <span className="underline decoration-white/30 decoration-2 underline-offset-8 font-semibold">Synchron</span>ise <br />
                  <span className="text-zinc-400">your Timetable.</span>
                </h1>

                <p className="text-base md:text-lg text-zinc-400 mb-10 leading-relaxed max-w-xl font-normal">
                  Ditch the lag. Access your live timetable, classroom shifts, substitute notifications, and filtered school notices in a screamingly fast, modular layout custom-engineered for SBHS.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mt-2">
                    <button
                      onClick={performLogin}
                      className="group relative flex items-center justify-center gap-3 px-8 py-4 bg-white text-black text-sm font-semibold uppercase tracking-wide border border-white hover:bg-zinc-100 transition-all duration-200 rounded-xl sm:w-auto"
                    >
                      Authenticate with SBHS
                      <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </button>

                    <div className="flex items-center gap-2.5 text-xs font-mono text-zinc-500">
                      <Lock size={12} className="text-zinc-500" />
                      <span>SECURE DELEGATED LOGIN</span>
                    </div>
                </div>

                <div className="mt-6 p-4 rounded-xl bg-[rgb(15_15_18)] border border-[rgb(255_255_255/0.07)] max-w-xl">
                    <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
                            <AlertOctagon size={16} />
                        </div>
                        <div className="flex-1">
                            <h4 className="text-sm font-semibold text-white mb-1">Important: Local Network Permission</h4>
                            <p className="text-xs text-zinc-400 leading-relaxed">
                                When signing in, your browser may ask for <strong className="text-zinc-200">Local network</strong> permission.
                                Please <strong className="text-zinc-200">click "Allow"</strong> to ensure the app functions correctly.
                                This permission is required for proper data synchronization.
                            </p>
                        </div>
                    </div>
                </div>
              </motion.div>
            </div>

            {/* Right Interactive Dashboard Console Preview */}
            <div className="lg:col-span-5 relative w-full font-sans">
              <motion.div
                 initial={{ opacity: 0, scale: 0.98 }}
                 animate={{ opacity: 1, scale: 1 }}
                 transition={{ duration: 0.8, delay: 0.1 }}
                 className="relative z-10 w-full bg-[rgb(15_15_18)] border border-[rgb(255_255_255/0.1)] backdrop-blur-xl rounded-2xl m-shadow-lg"
              >
                 {/* Top Terminal Bar */}
                 <div className="flex items-center justify-between px-4 py-3 border-b border-[rgb(255_255_255/0.07)] bg-[rgb(21_21_25)] rounded-t-2xl">
                   <div className="flex items-center gap-2">
                     <Terminal size={14} className="text-zinc-400" />
                     <span className="font-mono text-xs font-semibold text-white">CONSOLE // PREVIEW_PANEL</span>
                   </div>

                   <div className="flex items-center gap-4">
                     <span className="font-mono text-[11px] text-zinc-400 tracking-wide">TIME: {currentTime || "00:00:00"}</span>
                     <div className="flex gap-1.5">
                       <span className="w-2.5 h-2.5 border border-white/20 bg-black rounded-sm" />
                       <span className="w-2.5 h-2.5 border border-white/20 bg-white/60 rounded-sm animate-pulse" />
                     </div>
                   </div>
                 </div>

                 {/* Console Tabs */}
                 <div className="flex border-b border-[rgb(255_255_255/0.07)] text-xs font-mono bg-[rgb(15_15_18)]">
                   <button
                     onClick={() => setMockActiveTab('timetable')}
                     className={`flex-1 py-3 text-center border-r border-[rgb(255_255_255/0.07)] transition-colors uppercase tracking-wide font-semibold
                       ${mockActiveTab === 'timetable' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                   >
                     Live_Timetable
                   </button>
                   <button
                     onClick={() => setMockActiveTab('notices')}
                     className={`flex-1 py-3 text-center transition-colors uppercase tracking-wide font-semibold
                       ${mockActiveTab === 'notices' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                   >
                     Daily_Notices
                   </button>
                 </div>

                 {/* Console Body */}
                 <div className="p-5 min-h-[300px] flex flex-col justify-between">
                   {mockActiveTab === 'timetable' && (
                     <div className="space-y-4">
                       <div className="flex justify-between items-center text-xs font-mono text-zinc-400 uppercase pb-2 border-b border-[rgb(255_255_255/0.07)]">
                         <span>Period Sequence</span>
                         <span className="text-zinc-400 text-[11px] bg-[rgb(15_15_18)] px-2 py-0.5 border border-[rgb(255_255_255/0.07)] rounded">A-DAY // TODAY</span>
                       </div>

                       <div className="space-y-2.5">
                         {mockPeriods.map((period, idx) => (
                           <div key={idx} className={`border border-[rgb(255_255_255/0.07)] p-3 flex flex-col transition-all hover:border-white/20 hover:bg-[rgb(21_21_25)] rounded-xl ${period.status !== 'Normal' ? 'bg-[rgb(21_21_25)/80]' : ''}`}>
                             <div className="flex justify-between items-start">
                               <div className="flex items-center gap-2">
                                 <span className="font-mono text-xs text-zinc-500">P{idx+1}</span>
                                 <span className="font-semibold text-sm text-white uppercase">{period.name}</span>
                               </div>
                               <span className="font-mono text-[11px] text-zinc-400">{period.time}</span>
                             </div>

                             <div className="flex justify-between items-center mt-2 pt-2 border-t border-[rgb(255_255_255/0.05)] text-xs font-mono">
                               <div className="flex items-center gap-1.5 text-zinc-400">
                                 <span>{period.room}</span>
                                 {period.oldRoom && (
                                   <span className="text-[11px] text-zinc-500 line-through">({period.oldRoom})</span>
                                 )}
                               </div>
                               <div className="flex items-center gap-2">
                                 {period.status !== 'Normal' && (
                                   <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 border rounded bg-white/10 text-white border-white/20">
                                     {period.status}
                                   </span>
                                 )}
                                 <span className="text-zinc-400">{period.teacher}</span>
                               </div>
                             </div>
                           </div>
                         ))}
                       </div>
                     </div>
                   )}

                   {mockActiveTab === 'notices' && (
                     <div className="space-y-4">
                       <div className="flex justify-between items-center text-xs font-mono text-zinc-400 uppercase pb-2 border-b border-[rgb(255_255_255/0.07)]">
                         <span>Latest Bulletins</span>
                         <span>2 NOTICES</span>
                       </div>

                       <div className="space-y-3">
                         {mockNotices.map((notice, idx) => (
                           <div key={idx} className="border border-[rgb(255_255_255/0.07)] p-3 hover:border-white/20 bg-[rgb(15_15_18)] transition-all rounded-xl">
                             <div className="flex justify-between items-center mb-1.5">
                               <h4 className="text-sm font-semibold text-white uppercase">{notice.title}</h4>
                               <span className="font-mono text-[10px] font-semibold text-white bg-white/10 border border-white/20 px-1.5 py-0.5 uppercase tracking-wide rounded">
                                 {notice.group}
                               </span>
                             </div>
                             <p className="text-xs text-zinc-400 leading-relaxed font-light">{notice.body}</p>
                           </div>
                         ))}
                       </div>
                     </div>
                   )}

                   {/* Console Telemetry Row */}
                   <div className="mt-6 pt-3 border-t border-[rgb(255_255_255/0.07)] flex justify-between items-center text-[11px] font-mono text-zinc-400 uppercase">
                     <span className="flex items-center gap-1">
                       <span className="w-1.5 h-1.5 bg-white/60 animate-ping rounded-full" />
                       REAL_TIME DATA SIMULATION
                     </span>
                     <span className="text-zinc-500">ID: SBHS_SIM_001</span>
                   </div>
                 </div>
              </motion.div>
            </div>
        </div>

        {/* Modern Features Section */}
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-36"
        >
            <div className="flex flex-col mb-12">
              <span className="font-mono text-xs text-zinc-500 uppercase tracking-wide mb-2">// CAPABILITIES</span>
              <h2 className="text-3xl font-semibold uppercase text-white tracking-tight">ENGINEERED FOR EFFICIENCY</h2>
            </div>

            {/* Modern grid system */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {/* Feature 1 */}
                <div className="relative-tile-wrapper p-6 bg-[rgb(15_15_18)] border border-[rgb(255_255_255/0.07)] rounded-2xl group hover:bg-[rgb(21_21_25)] transition-all duration-300">
                    <span className="absolute top-4 right-6 font-mono text-xs text-zinc-500 group-hover:text-zinc-400 font-semibold transition-colors">[ 01 ]</span>
                    <div className="w-11 h-11 border border-[rgb(255_255_255/0.1)] flex items-center justify-center mb-6 bg-[rgb(21_21_25)] text-zinc-400 group-hover:border-white/20 group-hover:bg-[rgb(28_28_33)] group-hover:text-white transition-all duration-300 rounded-xl">
                        <Clock size={18} />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-3 uppercase group-hover:text-white transition-colors">Live Timetable</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed font-light group-hover:text-zinc-300 transition-colors">
                        Instantly see room adjustments, teacher subs, and schedule changes. Features a relative duration progress bar to tell you exactly how long is left in each class.
                    </p>
                </div>

                {/* Feature 2 */}
                <div className="relative-tile-wrapper p-6 bg-[rgb(15_15_18)] border border-[rgb(255_255_255/0.07)] rounded-2xl group hover:bg-[rgb(21_21_25)] transition-all duration-300">
                    <span className="absolute top-4 right-6 font-mono text-xs text-zinc-500 group-hover:text-zinc-400 font-semibold transition-colors">[ 02 ]</span>
                    <div className="w-11 h-11 border border-[rgb(255_255_255/0.1)] flex items-center justify-center mb-6 bg-[rgb(21_21_25)] text-zinc-400 group-hover:border-white/20 group-hover:bg-[rgb(28_28_33)] group-hover:text-white transition-all duration-300 rounded-xl">
                        <Shield size={18} />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-3 uppercase group-hover:text-white transition-colors">Targeted Notices</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed font-light group-hover:text-zinc-300 transition-colors">
                        Say goodbye to noise. Notices are dynamically grouped and filtered, highlighting announcements specific to your cohort, year group, and extracurriculars.
                    </p>
                </div>

                {/* Feature 3 */}
                <div className="relative-tile-wrapper p-6 bg-[rgb(15_15_18)] border border-[rgb(255_255_255/0.07)] rounded-2xl group hover:bg-[rgb(21_21_25)] transition-all duration-300">
                    <span className="absolute top-4 right-6 font-mono text-xs text-zinc-500 group-hover:text-zinc-400 font-semibold transition-colors">[ 03 ]</span>
                    <div className="w-11 h-11 border border-[rgb(255_255_255/0.1)] flex items-center justify-center mb-6 bg-[rgb(21_21_25)] text-zinc-400 group-hover:border-white/20 group-hover:bg-[rgb(28_28_33)] group-hover:text-white transition-all duration-300 rounded-xl">
                        <Calendar size={18} />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-3 uppercase group-hover:text-white transition-colors">Calendar Sync</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed font-light group-hover:text-zinc-300 transition-colors">
                        Consolidates standard, exam, and extracurricular schedules into a unified dashboard view. Never miss an assessment deadline or a timetable shift.
                    </p>
                </div>

                {/* Feature 4 */}
                <div className="relative-tile-wrapper p-6 bg-[rgb(15_15_18)] border border-[rgb(255_255_255/0.07)] rounded-2xl group hover:bg-[rgb(21_21_25)] transition-all duration-300">
                    <span className="absolute top-4 right-6 font-mono text-xs text-zinc-500 group-hover:text-zinc-400 font-semibold transition-colors">[ 04 ]</span>
                    <div className="w-11 h-11 border border-[rgb(255_255_255/0.1)] flex items-center justify-center mb-6 bg-[rgb(21_21_25)] text-zinc-400 group-hover:border-white/20 group-hover:bg-[rgb(28_28_33)] group-hover:text-white transition-all duration-300 rounded-xl">
                        <Award size={18} />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-3 uppercase group-hover:text-white transition-colors">Award Scheme</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed font-light group-hover:text-zinc-300 transition-colors">
                        Track your progress in the Sydney Boys High School Award Scheme. Input and view your accumulated points, tasks, and certification levels.
                    </p>
                </div>

                {/* Feature 5 */}
                <div className="relative-tile-wrapper p-6 bg-[rgb(15_15_18)] border border-[rgb(255_255_255/0.07)] rounded-2xl group hover:bg-[rgb(21_21_25)] transition-all duration-300">
                    <span className="absolute top-4 right-6 font-mono text-xs text-zinc-500 group-hover:text-zinc-400 font-semibold transition-colors">[ 05 ]</span>
                    <div className="w-11 h-11 border border-[rgb(255_255_255/0.1)] flex items-center justify-center mb-6 bg-[rgb(21_21_25)] text-zinc-400 group-hover:border-white/20 group-hover:bg-[rgb(28_28_33)] group-hover:text-white transition-all duration-300 rounded-xl">
                        <LayoutDashboard size={18} />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-3 uppercase group-hover:text-white transition-colors">Fast Dashboard</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed font-light group-hover:text-zinc-300 transition-colors">
                        Optimized asset delivery. Synchron bypasses heavy portal shells to load critical timetables and notices instantly, even on weak school cell coverage.
                    </p>
                </div>

                {/* Feature 6 */}
                <div className="relative-tile-wrapper p-6 bg-[rgb(15_15_18)] border border-[rgb(255_255_255/0.07)] rounded-2xl group hover:bg-[rgb(21_21_25)] transition-all duration-300">
                    <span className="absolute top-4 right-6 font-mono text-xs text-zinc-500 group-hover:text-zinc-400 font-semibold transition-colors">[ 06 ]</span>
                    <div className="w-11 h-11 border border-[rgb(255_255_255/0.1)] flex items-center justify-center mb-6 bg-[rgb(21_21_25)] text-zinc-400 group-hover:border-white/20 group-hover:bg-[rgb(28_28_33)] group-hover:text-white transition-all duration-300 rounded-xl">
                        <Cpu size={18} />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-3 uppercase group-hover:text-white transition-colors">Built for You</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed font-light group-hover:text-zinc-300 transition-colors">
                        Built by students, for students. Synchron integrates directly with official SBHS APIs while still being independently managed, even fitted with an inbuilt alert system.
                    </p>
                </div>

            </div>
        </motion.div>

        {/* Supporters Wall Section */}
        {supporters && supporters.length > 0 && (
            <div className="mt-32 border border-[rgb(255_255_255/0.07)] p-8 bg-[rgb(15_15_18)] relative animate-in fade-in duration-500 rounded-2xl">
                <div className="absolute top-0 left-0 bg-white/10 text-white font-mono text-xs px-3 py-1.5 uppercase font-semibold flex items-center gap-1.5 select-none rounded-tl-2xl">
                    <Heart size={10} className="fill-white text-white" />
                    Our Supporters
                </div>
                <div className="mt-4 space-y-3 text-left">
                    <h3 className="text-xl font-semibold uppercase tracking-tight text-white">To our Synchron Pro supporters...</h3>
                    <p className="text-sm text-zinc-400 max-w-xl font-light leading-relaxed">
                        Kudos to you, the amazing individuals who support the development and hosting of Synchron.
                    </p>
                </div>
            </div>
        )}

        {/* Technical Footer */}
        <div className="mt-40 pt-10 border-t border-[rgb(255_255_255/0.07)] flex flex-col md:flex-row items-center justify-between text-xs font-mono text-zinc-400">
            <div className="flex flex-col gap-1.5 text-center md:text-left">
              <p>© {new Date().getFullYear()} SYNCHRON. UNOFFICIALLY THE OFFICIAL CLIENT FOR SYDNEY BOYS HIGH SCHOOL.</p>
              <p className="text-zinc-500">Built independently, but its your Synchrotron.</p>
            </div>

            <div className="flex items-center gap-6 mt-6 md:mt-0">
                <div className="hidden lg:flex items-center gap-4 text-zinc-500 text-[11px] uppercase">
                  <span>LOC_ENV: PRODUCTION</span>
                  <span>BUILD_TAG: A01_DEV</span>
                </div>
                <div className="flex gap-4">
                  <a href="#" className="hover:text-white transition-colors uppercase">Privacy</a>
                  <span className="text-zinc-600">/</span>
                  <a href="#" className="hover:text-white transition-colors uppercase">Terms</a>
                </div>
            </div>
        </div>

      </main>
    </div>
  );
};

export default LandingPage;
