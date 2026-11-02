import React, { useState, useEffect } from 'react';
import {
    fetchStudentClipboardAttendance,
    fetchStudentPreExplainedAbsences,
    fetchStudentClipboardSessions,
    fetchStudentClipboardTeams,
    fetchGlobalActivities,
    invalidateClipboardCache
} from '../services/api';
import { Tick, useNoteFlowFonts } from './study/noteflow';
import { SessionSheet } from './clipboard/sessions';
import ClipboardCalendar from './clipboard/ClipboardCalendar';
import { RefreshCw } from 'lucide-react';

const TABS = [
    { id: 'calendar', label: 'Calendar' },
    { id: 'teams', label: 'Teams' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'absences', label: 'Absences' }
];

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Clipboard, drawn in NoteFlow's language. The calendar is the main tab; any session
// pops out with its location, opponent and notes.
const ClipboardView = ({ user }) => {
    useNoteFlowFonts();
    const [activeTab, setActiveTab] = useState('calendar');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [openSession, setOpenSession] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const [attendance, setAttendance] = useState([]);
    const [preExplained, setPreExplained] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [teams, setTeams] = useState([]);
    const [globalActivities, setGlobalActivities] = useState([]);

    useEffect(() => {
        const loadData = async () => {
            if (!user?.studentId) {
                setLoading(false);
                return;
            }
            setLoading(true);
            setError(null);
            try {
                const [attData, preExpData, sessData, teamsData, actData] = await Promise.all([
                    fetchStudentClipboardAttendance(user.studentId).catch(() => []),
                    fetchStudentPreExplainedAbsences(user.studentId).catch(() => []),
                    fetchStudentClipboardSessions(user.studentId).catch(() => []),
                    fetchStudentClipboardTeams(user.studentId).catch(() => []),
                    fetchGlobalActivities().catch(() => [])
                ]);

                setAttendance(attData);
                setPreExplained(preExpData);
                setSessions(sessData);
                setTeams(teamsData);
                setGlobalActivities(actData);
            } catch (err) {
                console.error("Failed to load Clipboard details", err);
                setError("Clipboard couldn't be reached. Check your connection and try again.");
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        };

        loadData();
    }, [user?.studentId]);

    const handleRefresh = () => {
        setRefreshing(true);
        invalidateClipboardCache();
        // Trigger reload by changing a dummy state or calling loadData directly
        const loadData = async () => {
            if (!user?.studentId) {
                setRefreshing(false);
                return;
            }
            setError(null);
            try {
                const [attData, preExpData, sessData, teamsData, actData] = await Promise.all([
                    fetchStudentClipboardAttendance(user.studentId).catch(() => []),
                    fetchStudentPreExplainedAbsences(user.studentId).catch(() => []),
                    fetchStudentClipboardSessions(user.studentId).catch(() => []),
                    fetchStudentClipboardTeams(user.studentId).catch(() => []),
                    fetchGlobalActivities().catch(() => [])
                ]);

                setAttendance(attData);
                setPreExplained(preExpData);
                setSessions(sessData);
                setTeams(teamsData);
                setGlobalActivities(actData);
            } catch (err) {
                console.error("Failed to load Clipboard details", err);
                setError("Clipboard couldn't be reached. Check your connection and try again.");
            } finally {
                setRefreshing(false);
            }
        };
        loadData();
    };

    if (loading) {
        return <div className="nf nf-cb nf-cb-state"><p className="nf-meta">Loading Clipboard…</p></div>;
    }

    if (error) {
        return (
            <div className="nf nf-cb nf-cb-state">
                <p style={{ fontWeight: 600 }}>Clipboard didn't load</p>
                <p className="nf-meta">{error}</p>
            </div>
        );
    }

    return (
        <div className="nf nf-cb">
            <div className="nf-cb-bar">
                <div className="nf-cb-tabs" role="tablist" aria-label="Clipboard">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            data-no-press
                            aria-selected={activeTab === tab.id}
                            className="nf-cb-tab rounded-none"
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="nf-cb-bar__right">
                    <button
                        type="button"
                        className="nf-cb-btn nf-cb-btn--bare"
                        onClick={handleRefresh}
                        disabled={refreshing}
                        aria-label="Refresh"
                        title="Refresh data"
                    >
                        <RefreshCw size={16} strokeWidth={1.75} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                    <span className="nf-meta nf-cb-tally">
                        {plural(teams.length, 'team')} · {plural(sessions.length, 'session')}
                    </span>
                </div>
            </div>

            <div className="nf-cb-body">
                {activeTab === 'calendar' && (
                    <ClipboardCalendar sessions={sessions} onOpen={setOpenSession} />
                )}

                {activeTab === 'teams' && (
                    <>
                        {teams.length > 0 ? (
                            <ul className="nf-cb-rows">
                                {teams.map(team => (
                                    <li key={team.id}>
                                        <div className="nf-cb-rows__main">
                                            <b>{team.name}</b>
                                            <div className="nf-meta">
                                                {[team.sportOrActivity, team.category].filter(Boolean).join(' Â· ')}
                                            </div>
                                        </div>
                                        {team.season && <span className="nf-meta tnum">{team.season}</span>}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="nf-cb-empty">You're not in any Clipboard teams yet.</p>
                        )}

                        {globalActivities.length > 0 && (
                            <>
                                <h2 className="nf-head">Everything on Clipboard</h2>
                                <div className="nf-cb-catalogue">
                                    {globalActivities.map(act => (
                                        <div key={act.id}>
                                            <b>{act.name}</b>
                                            {act.department && <span className="nf-meta">{act.department}</span>}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}

                {activeTab === 'attendance' && (
                    attendance.length > 0 ? (
                        <ul className="nf-cb-rows">
                            {attendance.map(att => (
                                <li key={att.id}>
                                    <div className="nf-cb-rows__main">
                                        <b>{att.activity}</b>
                                        <div className="nf-meta">
                                            {[att.date, att.recordedBy && `Marked by ${att.recordedBy}`].filter(Boolean).join(' Â· ')}
                                        </div>
                                    </div>
                                    <span className={`nf-cb-status ${att.status === 'Present' ? 'nf-cb-status--ok' : ''}`}>
                                        {att.status === 'Present' && <Tick size={15} />}
                                        {att.status}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="nf-cb-empty">No attendance marked on Clipboard yet.</p>
                    )
                )}

                {activeTab === 'absences' && (
                    <>
                        <p className="nf-cb-note">
                            Explain sport or debating absences at least 48 hours before the session. Your
                            department coordinator approves each one.
                        </p>
                        {preExplained.length > 0 ? (
                            <ul className="nf-cb-rows">
                                {preExplained.map(pea => (
                                    <li key={pea.id}>
                                        <div className="nf-cb-rows__main">
                                            <b>{pea.reason}</b>
                                            <div className="nf-meta tnum">
                                                {pea.startDate === pea.endDate ? pea.startDate : `${pea.startDate} to ${pea.endDate}`}
                                            </div>
                                        </div>
                                        <span className={`nf-cb-status ${pea.status === 'Approved' ? 'nf-cb-status--ok' : ''}`}>
                                            {pea.status === 'Approved' && <Tick size={15} />}
                                            {pea.status}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="nf-cb-empty">No absences explained in advance.</p>
                        )}
                    </>
                )}
            </div>

            <SessionSheet session={openSession} onClose={() => setOpenSession(null)} />
        </div>
    );
};

export default ClipboardView;
