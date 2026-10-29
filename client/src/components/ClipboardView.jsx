import React, { useState, useEffect } from 'react';
import { Clipboard, Calendar, Users, FileCheck, MapPin, Clock, ShieldAlert, BadgeInfo, CheckCircle } from 'lucide-react';
import { 
    fetchStudentClipboardAttendance,
    fetchStudentPreExplainedAbsences,
    fetchStudentClipboardSessions,
    fetchStudentClipboardTeams,
    fetchGlobalActivities,
    fetchGlobalDepartments
} from '../services/api';

const ClipboardView = ({ user }) => {
    const [activeTab, setActiveTab] = useState('schedule');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Data states
    const [attendance, setAttendance] = useState([]);
    const [preExplained, setPreExplained] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [teams, setTeams] = useState([]);
    const [globalActivities, setGlobalActivities] = useState([]);
    const [globalDepts, setGlobalDepts] = useState([]);

    useEffect(() => {
        const loadData = async () => {
            if (!user?.studentId) {
                setLoading(false);
                return;
            }
            setLoading(true);
            setError(null);
            try {
                const [
                    attData,
                    preExpData,
                    sessData,
                    teamsData,
                    actData,
                    deptData
                ] = await Promise.all([
                    fetchStudentClipboardAttendance(user.studentId).catch(() => []),
                    fetchStudentPreExplainedAbsences(user.studentId).catch(() => []),
                    fetchStudentClipboardSessions(user.studentId).catch(() => []),
                    fetchStudentClipboardTeams(user.studentId).catch(() => []),
                    fetchGlobalActivities().catch(() => []),
                    fetchGlobalDepartments().catch(() => [])
                ]);

                setAttendance(attData);
                setPreExplained(preExpData);
                setSessions(sessData);
                setTeams(teamsData);
                setGlobalActivities(actData);
                setGlobalDepts(deptData);
            } catch (err) {
                console.error("Failed to load Clipboard details", err);
                setError("Failed to retrieve Clipboard resources. Please check your network or try again.");
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [user?.studentId]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-10 h-10 border-4 border-accent/30 border-t-accent rounded-full animate-spin"></div>
                <p className="text-zinc-500 dark:text-zinc-400 font-bold text-sm font-space">Synchronising Clipboard data...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 border border-red-500/20 bg-red-500/10 rounded-2xl text-center space-y-4 max-w-lg mx-auto mt-10">
                <Clipboard size={48} className="text-red-500 mx-auto opacity-70" />
                <h3 className="text-lg font-extrabold text-red-500">Clipboard Sync Failure</h3>
                <p className="text-zinc-650 dark:text-zinc-400 text-sm">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-20">
            {/* Top Stat Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 flex items-center gap-4 relative overflow-hidden group select-none">
                    <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                        <Users size={80} />
                    </div>
                    <div className="w-12 h-12 flex items-center justify-center bg-accent text-accent-contrast border border-accent shrink-0">
                        <Users size={22} />
                    </div>
                    <div>
                        <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Teams</span>
                        <h4 className="text-2xl font-extrabold text-zinc-900 dark:text-white leading-none mt-1">{teams.length} Teams</h4>
                    </div>
                </div>

                <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 flex items-center gap-4 relative overflow-hidden group select-none">
                    <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                        <Calendar size={80} />
                    </div>
                    <div className="w-12 h-12 flex items-center justify-center bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 shrink-0">
                        <Calendar size={22} />
                    </div>
                    <div>
                        <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Weekly Sessions</span>
                        <h4 className="text-2xl font-extrabold text-zinc-900 dark:text-white leading-none mt-1">{sessions.length} Scheduled</h4>
                    </div>
                </div>

                <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 flex items-center gap-4 relative overflow-hidden group select-none">
                    <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                        <FileCheck size={80} />
                    </div>
                    <div className="w-12 h-12 flex items-center justify-center bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 shrink-0">
                        <FileCheck size={22} />
                    </div>
                    <div>
                        <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Pre-Explained Leave</span>
                        <h4 className="text-2xl font-extrabold text-zinc-900 dark:text-white leading-none mt-1">{preExplained.length} Active</h4>
                    </div>
                </div>
            </div>

            {/* Tab navigation */}
            <div className="flex border-b border-zinc-200 dark:border-zinc-900 overflow-x-auto select-none">
                {[
                    { id: 'schedule', label: 'Schedule & Training', icon: Calendar },
                    { id: 'my-teams', label: 'My Teams', icon: Users },
                    { id: 'attendance', label: 'Attendance Ledger', icon: Clipboard },
                    { id: 'leave', label: 'Pre-Explained Absences', icon: FileCheck }
                ].map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-6 py-3 border-b-2 text-sm font-extrabold uppercase tracking-wider whitespace-nowrap transition-all duration-300 ${
                                activeTab === tab.id
                                    ? 'border-accent text-accent'
                                    : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-white'
                            }`}
                        >
                            <Icon size={16} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* TAB PANELS */}

            {/* Schedule & Sessions */}
            {activeTab === 'schedule' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                        <Calendar size={18} className="text-accent" />
                        Upcoming Co-Curricular Schedule
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {sessions.length > 0 ? sessions.map(sess => (
                            <div key={sess.id} className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 shadow-sm flex items-start justify-between relative group">
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="font-extrabold text-zinc-900 dark:text-white text-lg leading-tight">{sess.activity}</h4>
                                        <span className="text-[11px] font-black uppercase text-zinc-400 mt-2 block tracking-wider">TRAINING SESSION</span>
                                    </div>
                                    <div className="space-y-2 text-xs font-semibold text-zinc-650 dark:text-zinc-300">
                                        <div className="flex items-center gap-2"><Clock size={15} className="text-zinc-400" /> {sess.date} | {sess.time}</div>
                                        <div className="flex items-center gap-2"><MapPin size={15} className="text-zinc-400" /> {sess.location}</div>
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="col-span-2 text-center py-12 bg-zinc-50 dark:bg-zinc-900/10 border border-dashed border-zinc-200 dark:border-zinc-850 text-zinc-500 text-sm">
                                No upcoming activities or training sessions scheduled.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* My Teams */}
            {activeTab === 'my-teams' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                    <div className="space-y-4">
                        <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                            <Users size={18} className="text-accent" />
                            Registered Co-curricular Teams
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {teams.map(team => (
                                <div key={team.id} className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 shadow-sm flex items-start gap-4">
                                    <div className="w-10 h-10 flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-accent shrink-0">
                                        <Users size={18} />
                                    </div>
                                    <div className="space-y-2 flex-1">
                                        <div className="flex justify-between items-baseline gap-2">
                                            <h4 className="font-extrabold text-zinc-900 dark:text-white text-base leading-tight">{team.name}</h4>
                                            <span className="text-[10px] font-black uppercase tracking-wider text-accent border border-accent/15 px-1.5 py-0.5 shrink-0 bg-accent/5">
                                                {team.season}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-zinc-500 pt-2">
                                            <div>
                                                <span className="text-[11px] text-zinc-400 block font-bold">SPORT/ACTIVITY</span>
                                                <span className="text-zinc-800 dark:text-zinc-300">{team.sportOrActivity}</span>
                                            </div>
                                            <div>
                                                <span className="text-[11px] text-zinc-400 block font-bold">COACH</span>
                                                <span className="text-zinc-800 dark:text-zinc-300">{team.coach}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Global Directory of Activities */}
                    <div className="space-y-4 pt-4">
                        <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                            Global Clipboard Catalog
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {globalActivities.map(act => (
                                <div key={act.id} className="bg-white dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-850 shadow-sm space-y-2">
                                    <div className="flex justify-between items-start gap-2">
                                        <h4 className="font-bold text-sm text-zinc-900 dark:text-white leading-tight">{act.name}</h4>
                                        <span className="text-[10px] font-black uppercase text-zinc-400 shrink-0">{act.type}</span>
                                    </div>
                                    <p className="text-[12px] text-zinc-500 font-semibold">Active: Term {act.term}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Attendance Ledger */}
            {activeTab === 'attendance' && (
                <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
                    <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                        <Clipboard size={18} className="text-accent" />
                        Co-curricular Attendance History
                    </h3>
                    <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 shadow-sm divide-y divide-zinc-200 dark:divide-zinc-900">
                        {attendance.length > 0 ? attendance.map(att => (
                            <div key={att.id} className="flex items-center justify-between py-4 px-6 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/10 transition-colors">
                                <div className="space-y-1">
                                    <h4 className="font-extrabold text-zinc-900 dark:text-white text-base">{att.activity}</h4>
                                    <div className="flex items-center gap-4 text-xs font-semibold text-zinc-400">
                                        <span>Date: {att.date}</span>
                                        <span>Recorded by: {att.recordedBy}</span>
                                    </div>
                                </div>
                                <div className={`flex items-center gap-1.5 px-3 py-1 text-xs font-black uppercase border leading-none tracking-wider ${
                                    att.status === 'Present'
                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                        : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
                                }`}>
                                    {att.status === 'Present' ? <CheckCircle size={12} /> : <ShieldAlert size={12} />}
                                    {att.status}
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-12 text-zinc-500 text-sm">
                                No co-curricular attendance matches found.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Leave & Pre-Explained Absences */}
            {activeTab === 'leave' && (
                <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
                    <div className="bg-zinc-50 dark:bg-zinc-900/10 p-5 border border-zinc-200 dark:border-zinc-850 flex items-start gap-3">
                        <BadgeInfo size={20} className="text-accent shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-extrabold text-sm text-zinc-900 dark:text-white">Pre-Explained Leave Guidelines</h4>
                            <p className="text-zinc-550 text-xs mt-1.5 leading-relaxed">
                                Submit requests for sports or debating absences at least 48 hours prior to the session. Leave requests must be approved by the corresponding department coordinator.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {preExplained.length > 0 ? preExplained.map(pea => (
                            <div key={pea.id} className="bg-white dark:bg-zinc-950 p-5 border border-zinc-200 dark:border-zinc-850 shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                <div className="space-y-2">
                                    <h4 className="font-extrabold text-zinc-900 dark:text-white text-base leading-snug">{pea.reason}</h4>
                                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
                                        <Calendar size={14} className="text-zinc-400" />
                                        <span>Duration: {pea.startDate} to {pea.endDate}</span>
                                    </div>
                                </div>
                                <span className={`px-3 py-1 border text-xs font-black uppercase tracking-wider self-start sm:self-auto ${
                                    pea.status === 'Approved'
                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                        : 'bg-zinc-100 border-zinc-200 text-zinc-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400'
                                }`}>
                                    {pea.status}
                                </span>
                            </div>
                        )) : (
                            <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-900/10 border border-dashed border-zinc-200 dark:border-zinc-850 text-zinc-500 text-sm">
                                No pre-explained absence requests registered.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClipboardView;
