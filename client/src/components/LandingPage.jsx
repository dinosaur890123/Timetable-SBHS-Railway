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

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toTimeString().split(' ')[0]);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const mockPeriods = [
    { name: 'English', time: '09:00 - 10:00', room: 'Room 203', teacher: 'Mrs. B', status: 'Normal', color: 'border-zinc-800' },
    { name: 'Design and Technology', time: '10:05 - 11:05', room: 'Room 502', teacher: 'Mr. G', status: 'Room Change', oldRoom: 'Room 102', color: 'border-orange-500/50' },
    { name: 'Physics', time: '11:25 - 12:25', room: 'Room 307', teacher: 'Mr. H', status: 'Substitution', oldTeacher: 'Mrs. S', color: 'border-blue-500/50' },
    { name: 'Mathematics Ext. 2', time: '12:30 - 13:30', room: 'Room 105', teacher: 'Mr. J', status: 'Normal', color: 'border-zinc-800' },
    { name: 'History', time: '14:10 - 15:10', room: 'Room 205', teacher: 'Ms. R', status: 'Normal', color: 'border-zinc-800' }
  ];

  const mockNotices = [
    { title: 'Chess Club Championship', group: 'All Years', body: 'Round 3 begins today at lunchtime in Room 102. Please check pairings on the tournament board.' },
    { title: 'Year 11 Peer Support Meeting', group: 'Year 11', body: 'Mandatory briefing in the Great Hall at the start of Period 3 today.' }
  ];

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-white selection:text-black relative overflow-hidden bg-grid">
      {/* Radial glow background mask */}
      <div className="absolute inset-0 bg-grid-glow-bw pointer-events-none z-0" />
      
      {authError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
          <div className="bg-black border-2 border-white w-full max-w-2xl p-8 text-left transition-all relative">
            <div className="absolute top-0 left-0 bg-white text-black font-mono text-xs px-2.5 py-1 uppercase font-bold">
              SYSTEM_ALERT
            </div>
            <div className="flex justify-between items-start mb-6 mt-4">
              <div className="flex items-center gap-3 text-white">
                <AlertOctagon className="text-white shrink-0" size={24} />
                <h3 className="text-xl font-bold uppercase tracking-wider font-space">Authentication Failure</h3>
              </div>
              <button 
                onClick={clearAuthError}
                className="p-1 hover:bg-zinc-900 text-zinc-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="mb-6 p-4 bg-black border border-zinc-800 text-zinc-350 font-mono text-sm break-all">
              <span className="font-bold text-white uppercase block mb-1 text-xs">// Error Details:</span>
              {authError}
            </div>

            <div className="space-y-4 mb-6">
              <h4 className="font-bold text-white uppercase tracking-wider text-xs border-b border-zinc-900 pb-1 font-mono">Troubleshooting Checklist:</h4>
              <ul className="text-zinc-400 text-sm list-none space-y-2 font-mono">
                <li className="flex items-start gap-2">
                  <span className="text-zinc-500 font-bold shrink-0">[1]</span>
                  <div>
                    <strong className="text-zinc-200">Redirect URI Mismatch:</strong> The redirect URL defined in SBHS developer portal must match <code className="bg-zinc-900 px-1.5 py-0.5 border border-zinc-800 font-mono text-white text-xs">{getOauthConfig().redirectUri}</code> exactly.
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-zinc-500 font-bold shrink-0">[2]</span>
                  <div>
                    <strong className="text-zinc-200">Client Secret:</strong> The developer portal client secret must match the one provided in settings.
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-zinc-500 font-bold shrink-0">[3]</span>
                  <div>
                    <strong className="text-zinc-200">Re-deploy Client:</strong> Vite builds client config at <span className="underline text-white font-semibold">build time</span>. If you recently changed environment variables in Railway, you <strong className="text-white">MUST trigger a new deployment</strong> of the frontend service.
                  </div>
                </li>
              </ul>
            </div>

            <div className="space-y-3 bg-zinc-950 p-4 border border-zinc-900 font-mono text-xs">
              <div className="font-bold text-zinc-500 uppercase tracking-wider mb-2 text-[10px]">Compiled Client Build Configuration:</div>
              <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                <span className="text-zinc-500">Client ID</span>
                <span className="text-zinc-350 font-semibold">{getOauthConfig().clientId}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                <span className="text-zinc-500">Redirect URI</span>
                <span className="text-zinc-350 font-semibold">{getOauthConfig().redirectUri}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Client Secret Status</span>
                <span className={getOauthConfig().hasClientSecret ? "text-white font-bold" : "text-zinc-500 font-bold"}>
                  {getOauthConfig().hasClientSecret ? `Present (Length: ${getOauthConfig().clientSecretLength})` : "Not Present"}
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 font-mono">
              <button 
                onClick={clearAuthError}
                className="px-6 py-2 border border-zinc-700 text-zinc-300 font-bold hover:border-white hover:text-white transition-colors"
              >
                Dismiss
              </button>
              <button 
                onClick={() => {
                  clearAuthError();
                  performLogin();
                }}
                className="px-6 py-2 bg-white text-black font-extrabold border border-white hover:bg-black hover:text-white transition-all shadow-[4px_4px_0px_0px_#71717a] hover:shadow-none"
              >
                Retry Login
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Styled Modular Header */}
      <nav className="relative z-10 border-b border-zinc-900 bg-black/60 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              {/* Modernized high-tech modular logo */}
              <div className="grid grid-cols-2 gap-0.5 p-1 bg-white">
                <div className="w-2.5 h-2.5 bg-black" />
                <div className="w-2.5 h-2.5 bg-black" />
                <div className="w-2.5 h-2.5 bg-black" />
                <div className="w-2.5 h-2.5 bg-black animate-pulse" />
              </div>
              <span className="font-bold text-base tracking-widest text-white uppercase font-space">
                <span className="underline decoration-white decoration-2 underline-offset-4 font-black">synchron</span>
              </span>
            </div>
            
            {/* System Status Indicators */}
            <div className="hidden sm:flex items-center gap-4 text-[10px] font-mono text-zinc-500 border-l border-zinc-800 pl-6">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-white animate-pulse" />
                API: ONLINE
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-white animate-pulse" />
                DB: CONNECTED
              </span>
              <span className="text-zinc-650">V2.4.0</span>
            </div>
          </div>
          
          <button 
             onClick={performLogin}
             className="relative text-xs font-mono text-black bg-white px-4 py-2 border border-white hover:bg-black hover:text-white transition-all duration-200 active:translate-y-0.5 hover:shadow-[3px_3px_0px_0px_#ffffff]"
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
                <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-zinc-800 bg-zinc-950/80 text-zinc-400 text-xs font-mono tracking-wider uppercase mb-8">
                   <Activity size={12} className="text-white animate-pulse" />
                   SYSTEM STATUS: OK // FOR_SBHS
                </div>
                
                <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-white mb-6 tracking-tight leading-[1.08] font-space">
                  <span className="underline decoration-white decoration-[5px] underline-offset-8">Synchron</span>ise <br />
                  <span className="text-zinc-550">your Timetable.</span>
                </h1>
                
                <p className="text-base md:text-lg text-zinc-400 mb-10 leading-relaxed max-w-xl font-normal">
                  Ditch the lag. Access your live timetable, classroom shifts, substitute notifications, and filtered school notices in a screamingly fast, modular layout custom-engineered for SBHS.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-6 mt-2">
                    <button
                      onClick={performLogin}
                      className="group relative flex items-center justify-center gap-3 px-8 py-4 bg-white text-black text-sm font-black uppercase tracking-wider border-2 border-white hover:-translate-x-1 hover:-translate-y-1 transition-all duration-200 active:translate-x-0 active:translate-y-0 shadow-[4px_4px_0px_0px_#71717a] hover:shadow-[6px_6px_0px_0px_#ffffff] sm:w-auto"
                    >
                      Authenticate with SBHS
                      <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                    
                    <div className="flex items-center gap-2.5 text-xs font-mono text-zinc-550">
                      <Lock size={12} className="text-zinc-550" />
                      <span>SECURE DELEGATED LOGIN</span>
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
                 className="relative z-10 w-full bg-black border-2 border-white backdrop-blur-md shadow-[6px_6px_0px_0px_rgba(255,255,255,0.15)]"
              >
                 {/* Top Terminal Bar */}
                 <div className="flex items-center justify-between px-4 py-3 border-b-2 border-white bg-zinc-950">
                   <div className="flex items-center gap-2">
                     <Terminal size={14} className="text-zinc-350" />
                     <span className="font-mono text-xs font-bold text-white">CONSOLE // PREVIEW_PANEL</span>
                   </div>
                   
                   <div className="flex items-center gap-4">
                     <span className="font-mono text-[10px] text-zinc-400 tracking-wider">TIME: {currentTime || "00:00:00"}</span>
                     <div className="flex gap-1.5">
                       <span className="w-2.5 h-2.5 border border-white bg-black" />
                       <span className="w-2.5 h-2.5 border border-white bg-white animate-pulse" />
                     </div>
                   </div>
                 </div>

                 {/* Console Tabs */}
                 <div className="flex border-b-2 border-white text-xs font-mono bg-black">
                   <button 
                     onClick={() => setMockActiveTab('timetable')}
                     className={`flex-1 py-3 text-center border-r-2 border-white transition-colors uppercase tracking-wider font-black
                       ${mockActiveTab === 'timetable' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'}`}
                   >
                     Live_Timetable
                   </button>
                   <button 
                     onClick={() => setMockActiveTab('notices')}
                     className={`flex-1 py-3 text-center transition-colors uppercase tracking-wider font-black
                       ${mockActiveTab === 'notices' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'}`}
                   >
                     Daily_Notices
                   </button>
                 </div>

                 {/* Console Body */}
                 <div className="p-5 min-h-[300px] flex flex-col justify-between">
                   {mockActiveTab === 'timetable' && (
                     <div className="space-y-4">
                       <div className="flex justify-between items-center text-xs font-mono text-zinc-400 uppercase pb-1 border-b border-zinc-800">
                         <span>Period Sequence</span>
                         <span className="text-zinc-400 text-[10px] bg-zinc-900 px-2 py-0.5 border border-zinc-800">A-DAY // TODAY</span>
                       </div>

                       <div className="space-y-2.5">
                         {mockPeriods.map((period, idx) => (
                           <div key={idx} className={`border border-zinc-800 p-3 flex flex-col transition-all hover:border-white hover:bg-zinc-950 ${period.status !== 'Normal' ? 'bg-zinc-950/60' : ''}`}>
                             <div className="flex justify-between items-start">
                               <div className="flex items-center gap-2">
                                 <span className="font-mono text-xs text-zinc-500">P{idx+1}</span>
                                 <span className="font-bold text-sm text-white font-space uppercase">{period.name}</span>
                               </div>
                               <span className="font-mono text-[10px] text-zinc-400">{period.time}</span>
                             </div>

                             <div className="flex justify-between items-center mt-2 pt-2 border-t border-zinc-900/40 text-xs font-mono">
                               <div className="flex items-center gap-1.5 text-zinc-450">
                                 <span>{period.room}</span>
                                 {period.oldRoom && (
                                   <span className="text-[10px] text-zinc-500 line-through">({period.oldRoom})</span>
                                 )}
                               </div>
                               <div className="flex items-center gap-2">
                                 {period.status !== 'Normal' && (
                                   <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 border-2 
                                     ${period.status === 'Room Change' ? 'bg-black text-white border-white' : 'bg-white text-black border-white'}`}>
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
                       <div className="flex justify-between items-center text-xs font-mono text-zinc-400 uppercase pb-1 border-b border-zinc-800">
                         <span>Latest Bulletins</span>
                         <span>2 NOTICES</span>
                       </div>

                       <div className="space-y-3">
                         {mockNotices.map((notice, idx) => (
                           <div key={idx} className="border border-zinc-800 p-3 hover:border-white bg-zinc-950 transition-all">
                             <div className="flex justify-between items-center mb-1.5">
                               <h4 className="text-sm font-bold text-white uppercase font-space">{notice.title}</h4>
                               <span className="font-mono text-[9px] font-bold text-black bg-white border border-white px-1.5 py-0.5 uppercase tracking-wide">
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
                   <div className="mt-6 pt-3 border-t-2 border-white flex justify-between items-center text-[10px] font-mono text-zinc-400 uppercase">
                     <span className="flex items-center gap-1">
                       <span className="w-1.5 h-1.5 bg-white animate-ping" />
                       REAL_TIME DATA SIMULATION
                     </span>
                     <span className="text-zinc-500">ID: SBHS_SIM_001</span>
                   </div>
                 </div>
              </motion.div>

              {/* Behind Widget Decorative Brutalist Elements */}
              <div className="absolute -bottom-4 -right-4 w-full h-full border border-white/20 border-dashed pointer-events-none z-0" />
              <div className="absolute -top-4 -left-4 w-8 h-8 border-t-2 border-l-2 border-white pointer-events-none" />
              <div className="absolute -bottom-4 -right-4 w-8 h-8 border-b-2 border-r-2 border-white pointer-events-none" />
            </div>
        </div>

        {/* Modular Grid Features Section */}
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-36"
        >
            <div className="flex flex-col mb-12">
              <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-2">// CAPABILITIES</span>
              <h2 className="text-3xl font-black uppercase font-space text-white tracking-tighter">ENGINEERED FOR EFFICIENCY</h2>
            </div>

            {/* Modular border-layout grid system */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-t border-l border-zinc-800 bg-black">
                
                {/* Feature 1 */}
                <div className="border-r border-b border-zinc-800 p-8 group hover:bg-white transition-all duration-300 relative bg-black">
                    <span className="absolute top-4 right-6 font-mono text-xs text-zinc-600 group-hover:text-black font-bold transition-colors">[ 01 ]</span>
                    <div className="w-11 h-11 border border-zinc-800 flex items-center justify-center mb-6 bg-zinc-950 text-zinc-400 group-hover:border-black group-hover:bg-black group-hover:text-white transition-all duration-300">
                        <Clock size={18} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-3 uppercase font-space group-hover:text-black transition-colors">Live Timetable</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed font-light group-hover:text-zinc-800 transition-colors">
                        Instantly see room adjustments, teacher subs, and schedule changes. Features a relative duration progress bar to tell you exactly how long is left in each class.
                    </p>
                </div>

                {/* Feature 2 */}
                <div className="border-r border-b border-zinc-800 p-8 group hover:bg-white transition-all duration-300 relative bg-black">
                    <span className="absolute top-4 right-6 font-mono text-xs text-zinc-600 group-hover:text-black font-bold transition-colors">[ 02 ]</span>
                    <div className="w-11 h-11 border border-zinc-800 flex items-center justify-center mb-6 bg-zinc-950 text-zinc-400 group-hover:border-black group-hover:bg-black group-hover:text-white transition-all duration-300">
                        <Shield size={18} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-3 uppercase font-space group-hover:text-black transition-colors">Targeted Notices</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed font-light group-hover:text-zinc-800 transition-colors">
                        Say goodbye to noise. Notices are dynamically grouped and filtered, highlighting announcements specific to your cohort, year group, and extracurriculars.
                    </p>
                </div>

                {/* Feature 3 */}
                <div className="border-r border-b border-zinc-800 p-8 group hover:bg-white transition-all duration-300 relative bg-black">
                    <span className="absolute top-4 right-6 font-mono text-xs text-zinc-600 group-hover:text-black font-bold transition-colors">[ 03 ]</span>
                    <div className="w-11 h-11 border border-zinc-800 flex items-center justify-center mb-6 bg-zinc-950 text-zinc-400 group-hover:border-black group-hover:bg-black group-hover:text-white transition-all duration-300">
                        <Calendar size={18} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-3 uppercase font-space group-hover:text-black transition-colors">Calendar Sync</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed font-light group-hover:text-zinc-800 transition-colors">
                        Consolidates standard, exam, and extracurricular schedules into a unified dashboard view. Never miss an assessment deadline or a timetable shift.
                    </p>
                </div>

                {/* Feature 4 */}
                <div className="border-r border-b border-zinc-800 p-8 group hover:bg-white transition-all duration-300 relative bg-black">
                    <span className="absolute top-4 right-6 font-mono text-xs text-zinc-600 group-hover:text-black font-bold transition-colors">[ 04 ]</span>
                    <div className="w-11 h-11 border border-zinc-800 flex items-center justify-center mb-6 bg-zinc-950 text-zinc-400 group-hover:border-black group-hover:bg-black group-hover:text-white transition-all duration-300">
                        <Award size={18} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-3 uppercase font-space group-hover:text-black transition-colors">Award Scheme</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed font-light group-hover:text-zinc-800 transition-colors">
                        Track your progress in the Sydney Boys High School Award Scheme. Input and view your accumulated points, tasks, and certification levels.
                    </p>
                </div>

                {/* Feature 5 */}
                <div className="border-r border-b border-zinc-800 p-8 group hover:bg-white transition-all duration-300 relative bg-black">
                    <span className="absolute top-4 right-6 font-mono text-xs text-zinc-600 group-hover:text-black font-bold transition-colors">[ 05 ]</span>
                    <div className="w-11 h-11 border border-zinc-800 flex items-center justify-center mb-6 bg-zinc-950 text-zinc-400 group-hover:border-black group-hover:bg-black group-hover:text-white transition-all duration-300">
                        <LayoutDashboard size={18} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-3 uppercase font-space group-hover:text-black transition-colors">Fast Dashboard</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed font-light group-hover:text-zinc-800 transition-colors">
                        Optimized asset delivery. Synchron bypasses heavy portal shells to load critical timetables and notices instantly, even on weak school cell coverage.
                    </p>
                </div>

                {/* Feature 6 */}
                <div className="border-r border-b border-zinc-800 p-8 group hover:bg-white transition-all duration-300 relative bg-black">
                    <span className="absolute top-4 right-6 font-mono text-xs text-zinc-600 group-hover:text-black font-bold transition-colors">[ 06 ]</span>
                    <div className="w-11 h-11 border border-zinc-800 flex items-center justify-center mb-6 bg-zinc-950 text-zinc-400 group-hover:border-black group-hover:bg-black group-hover:text-white transition-all duration-300">
                        <Cpu size={18} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-3 uppercase font-space group-hover:text-black transition-colors">Built for You</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed font-light group-hover:text-zinc-800 transition-colors">
                        Built by students, for students. Synchron integrates directly with official SBHS APIs while still being independently managed, even fitted with an inbuilt alert system. 
                    </p>
                </div>

            </div>
        </motion.div>

        {/* Supporters Wall Section */}
        {supporters && supporters.length > 0 && (
            <div className="mt-32 border-2 border-white p-8 bg-zinc-950/60 relative animate-in fade-in duration-500">
                <div className="absolute top-0 left-0 bg-white text-black font-mono text-xs px-2.5 py-1 uppercase font-bold flex items-center gap-1.5 select-none">
                    <Heart size={10} className="fill-black text-black" />
                    Our Supporters
                </div>
                <div className="mt-4 space-y-3 text-left">
                    <h3 className="text-xl font-bold uppercase tracking-tight text-white font-space">Synchron Pro Supporters</h3>
                    <p className="text-sm text-zinc-400 max-w-xl font-light leading-relaxed">
                        Special thanks to the amazing individuals who support the development and hosting of Synchron:
                    </p>
                    <div className="flex flex-wrap gap-2 pt-3">
                        {supporters.map((supporter, idx) => (
                            <span key={idx} className="inline-flex items-center px-3 py-1 font-mono text-xs text-white border border-zinc-800 bg-black hover:border-white transition-colors select-none">
                                {supporter}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* Technical Footer */}
        <div className="mt-40 pt-10 border-t-2 border-white flex flex-col md:flex-row items-center justify-between text-xs font-mono text-zinc-400">
            <div className="flex flex-col gap-1.5 text-center md:text-left">
              <p>© {new Date().getFullYear()} SYNCHRON. UNOFFICIALLY THE OFFICIAL CLIENT FOR SYDNEY BOYS HIGH SCHOOL.</p>
              <p className="text-zinc-500">BUILT INDEPENDENTLY. ALL DATA SYNCHRONISED DIRECTLY VIA OFFICIAL STUDENT APIS.</p>
            </div>
            
            <div className="flex items-center gap-6 mt-6 md:mt-0">
                <div className="hidden lg:flex items-center gap-4 text-zinc-500 text-[10px] uppercase">
                  <span>LOC_ENV: PRODUCTION</span>
                  <span>BUILD_TAG: A01_DEV</span>
                </div>
                <div className="flex gap-4">
                  <a href="#" className="hover:text-white transition-colors uppercase">Privacy</a>
                  <span className="text-zinc-700">/</span>
                  <a href="#" className="hover:text-white transition-colors uppercase">Terms</a>
                </div>
            </div>
        </div>

      </main>
    </div>
  );
};

export default LandingPage;
