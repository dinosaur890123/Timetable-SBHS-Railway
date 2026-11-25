import React, { useState } from 'react';
import { useCachedLoad } from '../utils/pageCache';
import { clipboardPage } from '../services/pageData';
import { Tick, useNoteFlowFonts } from './study/noteflow';
import { SessionSheet } from './clipboard/sessions';
import ClipboardCalendar from './clipboard/ClipboardCalendar';

const TABS = [
    { id: 'calendar', label: 'Calendar' },
    { id: 'teams', label: 'Teams' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'absences', label: 'Absences' }
];

const ClipboardSkeleton = () => (
    <div className="nf nf-cb animate-pulse-subtle" aria-busy="true" aria-label="Loading Clipboard">
        <div className="nf-cb-bar">
            <div className="nf-cb-skel-tabs">
                {TABS.map(tab => <span key={tab.id} className="nf-cb-skel-tab" />)}
            </div>
        </div>
        <div className="nf-cb-body">
            <div className="nf-cb-skel-head">
                <span className="nf-cb-skel-month" />
                <span className="nf-cb-skel-nav"><i /><i /><i /></span>
            </div>
            <div className="nf-sheet nf-cal__sheet">
                <div className="nf-cb-skel-grid">
                    <div className="nf-cb-skel-week">
                        {Array.from({ length: 7 }, (_, i) => <div key={i} className="nf-cb-skel-dow" />)}
                    </div>
                    {Array.from({ length: 6 }, (_, w) => (
                        <div key={w} className="nf-cb-skel-week">
                            {Array.from({ length: 7 }, (_, d) => (
                                <div key={d} className="nf-cb-skel-day"><span className="nf-cb-skel-num" /></div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
);

const ClipboardView = ({ user }) => {
    useNoteFlowFonts();
    const [activeTab, setActiveTab] = useState('calendar');
    const [openSession, setOpenSession] = useState(null);

    const page = user?.studentId ? clipboardPage(user.studentId) : null;
    const { data, loading, error } = useCachedLoad(page?.key ?? null, page?.load);
    const { attendance = [], preExplained = [], sessions = [], teams = [] } = data || {};
    const userTeamIds = new Set(teams.map(team => String(team.teamId)).filter(Boolean));
    const sessionsForStudent = sessions.map(session => ({
        ...session,
        team: session.teamIds?.find(id => userTeamIds.has(String(id)))
            ? (session.rawTeams || []).find(team => String(team.id) === String(session.teamIds.find(id => userTeamIds.has(String(id)))))?.name || ''
            : session.team || ''
    }));
    const selectedSession = openSession
        ? sessionsForStudent.find(session => String(session.id) === String(openSession.id)) || openSession
        : null;
    if (loading) {
        return <ClipboardSkeleton />;
    }

    if (error) {
        return (
            <div className="nf nf-cb nf-cb-state">
                <p style={{ fontWeight: 600 }}>Clipboard didn't load</p>
                <p className="nf-meta">Clipboard couldn't be reached. Check your connection and try again.</p>
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
            </div>

            <div className="nf-cb-body">
                {activeTab === 'calendar' && (
                    <ClipboardCalendar sessions={sessionsForStudent} onOpen={setOpenSession} />
                )}

                {activeTab === 'teams' && (
                    teams.length > 0 ? (
                            <ul className="nf-cb-rows">
                                {teams.map(team => (
                                    <li key={team.id}>
                                        <div className="nf-cb-rows__main">
                                            <b>{team.name}</b>
                                            <div className="nf-meta">{[team.sportOrActivity, team.category].filter(Boolean).join(' / ')}</div>
                                        </div>
                                        {team.season && <span className="nf-meta tnum">{team.season}</span>}
                                    </li>
                                ))}
                            </ul>
                    ) : <p className="nf-cb-empty">You're not in any Clipboard teams yet.</p>
                )}
                {activeTab === 'attendance' && (
                    attendance.length > 0 ? (
                        <ul className="nf-cb-rows">
                            {attendance.map(att => (
                                <li key={att.id}>
                                    <div className="nf-cb-rows__main">
                                        <b>{att.activity}</b>
                                        <div className="nf-meta">
                                            {[att.date, att.markedBy && `Marked by ${att.markedBy}`].filter(Boolean).join(' · ')}
                                            {att.arrivalTime && (
                                                <div className="nf-meta">
                                                    Arrival {att.arrivalTime}
                                                </div>
                                            )}
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

            <SessionSheet session={selectedSession} onClose={() => setOpenSession(null)} />
        </div>
    );
};

export default ClipboardView;
