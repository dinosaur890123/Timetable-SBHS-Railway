import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Calendar, Clock, Shield, Award, LayoutDashboard, AlertOctagon, X } from 'lucide-react';
import { performLogin, getOauthConfig } from '../services/api';

const LandingPage = ({ authError, clearAuthError }) => {
  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-zinc-800">
      
      {authError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-black border-2 border-white w-full max-w-2xl p-6 text-left transition-all">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3 text-white">
                <AlertOctagon className="text-white shrink-0" size={24} />
                <h3 className="text-lg font-black uppercase tracking-wider">Authentication Failure</h3>
              </div>
              <button 
                onClick={clearAuthError}
                className="p-1 hover:bg-zinc-900 text-zinc-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="mb-6 p-4 bg-zinc-950 border border-zinc-800 text-zinc-300 font-mono text-sm break-all">
              <span className="font-bold text-white uppercase block mb-1 text-xs">Error Message:</span>
              {authError}
            </div>

            <div className="space-y-4 mb-6">
              <h4 className="font-bold text-white uppercase tracking-wider text-xs border-b border-zinc-900 pb-1">Troubleshooting Checklist:</h4>
              <ul className="text-zinc-400 text-sm list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-zinc-200">Redirect URI Mismatch:</strong> The redirect URL defined in SBHS developer portal must match <code className="bg-zinc-950 px-1.5 py-0.5 border border-zinc-900 font-mono text-white text-xs">{getOauthConfig().redirectUri}</code> exactly.
                </li>
                <li>
                  <strong className="text-zinc-200">Client Secret:</strong> The developer portal client secret must match the one provided in settings.
                </li>
                <li>
                  <strong className="text-zinc-200">Re-deploy Client:</strong> Vite builds client config at <span className="underline text-white">build time</span>. If you recently changed environment variables in Railway, you <strong className="text-white">MUST trigger a new deployment</strong> of the frontend service.
                </li>
              </ul>
            </div>

            <div className="space-y-3 bg-zinc-950 p-4 border border-zinc-900 font-mono text-xs">
              <div className="font-bold text-white uppercase tracking-wider mb-2 text-[10px] text-zinc-500">Compiled Client Build Configuration:</div>
              <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                <span className="text-zinc-500">Client ID</span>
                <span className="text-zinc-300">{getOauthConfig().clientId}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                <span className="text-zinc-500">Redirect URI</span>
                <span className="text-zinc-300">{getOauthConfig().redirectUri}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Client Secret Status</span>
                <span className={getOauthConfig().hasClientSecret ? "text-green-400 font-bold" : "text-yellow-500 font-bold"}>
                  {getOauthConfig().hasClientSecret ? `Present (Length: ${getOauthConfig().clientSecretLength})` : "Not Present"}
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
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
                className="px-6 py-2 bg-white text-black font-extrabold border border-white hover:bg-black hover:text-white transition-all"
              >
                Retry Login
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ultra-minimal Header */}
      <nav className="flex items-center justify-between px-6 py-8 max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
             <div className="w-6 h-6 bg-white flex items-center justify-center">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" fill="black"/>
                    <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                 </svg>
             </div>
             <span className="font-extrabold text-sm tracking-wide text-white uppercase">Synchron v2</span>
          </div>
          <button 
             onClick={performLogin}
             className="text-sm font-bold text-zinc-400 hover:text-white transition-colors uppercase tracking-wider"
          >
             Log in
          </button>
      </nav>

      <main className="max-w-5xl mx-auto px-6 pt-32 pb-24">
        
        {/* Typography-First Hero Section */}
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
            
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
               className="flex flex-col items-center"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 border border-zinc-700 bg-zinc-900 text-zinc-300 text-xs font-bold tracking-widest uppercase mb-10">
                 Synchron for SBHS
              </div>
              
              <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-8 tracking-tight leading-tight uppercase">
                Your student portal, <br />
                <span className="text-zinc-650">renewed.</span>
              </h1>
              
              <p className="text-lg md:text-xl text-zinc-400 mb-12 leading-relaxed max-w-2xl font-light">
                Manage your timetable, read daily notices, and track your progress. A fast, focused interface designed exclusively for Sydney Boys High School.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-6">
                  <button
                    onClick={performLogin}
                    className="group flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-black text-sm font-bold border-2 border-white hover:bg-black hover:text-white transition-all w-full sm:w-auto"
                  >
                    Continue with SBHS
                    <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                  </button>
                  <p className="text-xs text-zinc-600 uppercase font-semibold tracking-wider">
                      Requires an active SBHS portal account.
                  </p>
              </div>
            </motion.div>
        </div>

        {/* Minimalist Feature Grid */}
        <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mt-40 pt-20 border-t border-zinc-900"
        >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-16">
                
                {/* Feature 1 */}
                <div className="flex flex-col">
                    <div className="w-10 h-10 rounded-full border border-zinc-800 flex items-center justify-center mb-6 text-zinc-400">
                        <Clock size={18} />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-3">Live Timetable</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                        A real-time timeline of your day. Instantly see your current class, room changes, and teacher substitutions, modernised.
                    </p>
                </div>

                {/* Feature 2 */}
                <div className="flex flex-col">
                    <div className="w-10 h-10 rounded-full border border-zinc-800 flex items-center justify-center mb-6 text-zinc-400">
                        <Shield size={18} />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-3">Targeted Notices</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                        Read the daily briefings that actually matter to you. Notices are automatically filtered for your specific year group and cohort.
                    </p>
                </div>

                {/* Feature 3 */}
                <div className="flex flex-col">
                    <div className="w-10 h-10 rounded-full border border-zinc-800 flex items-center justify-center mb-6 text-zinc-400">
                        <Calendar size={18} />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-3">Calendar Sync</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                        Seamlessly integrates with the school calendar to keep you informed about upcoming events, assessments, and public holidays.
                    </p>
                </div>

                {/* Feature 4 */}
                <div className="flex flex-col">
                    <div className="w-10 h-10 rounded-full border border-zinc-800 flex items-center justify-center mb-6 text-zinc-400">
                        <Award size={18} />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-3">Award Scheme</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                        Track your award scheme points and participation automatically, giving you a clear view of your progress throughout the year.
                    </p>
                </div>

                {/* Feature 5 */}
                <div className="flex flex-col">
                    <div className="w-10 h-10 rounded-full border border-zinc-800 flex items-center justify-center mb-6 text-zinc-400">
                        <LayoutDashboard size={18} />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-3">Fast Dashboard</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                        Built for speed. The dashboard loads instantly, presenting all your critical daily information on a single, clean screen.
                    </p>
                </div>

            </div>
        </motion.div>

        {/* Minimal Footer */}
        <div className="mt-40 pt-8 border-t border-zinc-900 flex flex-col md:flex-row items-center justify-between text-xs text-zinc-600">
            <p>© {new Date().getFullYear()} Synchron. Unofficially the official client for SBHS.</p>
            <div className="flex gap-4 mt-4 md:mt-0">
                <a href="#" className="hover:text-zinc-400 transition-colors">Privacy</a>
                <a href="#" className="hover:text-zinc-400 transition-colors">Terms</a>
            </div>
        </div>

      </main>
    </div>
  );
};

export default LandingPage;
