import React, { useState, useEffect } from 'react';
import { Award, Shield, Compass, Sparkles, TrendingUp, Trophy, ListCollapse, Star, User, History } from 'lucide-react';
import { 
    fetchStudentAwards,
    fetchStudentBadges,
    fetchStudentDecorations,
    fetchStudentPrizes,
    fetchStudentRollover,
    fetchGlobalAwards,
    fetchGlobalCategories,
    fetchGlobalHousePoints,
    fetchGlobalNominations
} from '../services/api';

const AwardSchemeView = ({ user }) => {
    const [activeTab, setActiveTab] = useState('my-awards');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Data states
    const [awards, setAwards] = useState([]);
    const [badges, setBadges] = useState([]);
    const [decorations, setDecorations] = useState([]);
    const [prizes, setPrizes] = useState([]);
    const [rollover, setRollover] = useState(null);
    const [globalAwards, setGlobalAwards] = useState([]);
    const [categories, setCategories] = useState([]);
    const [housePoints, setHousePoints] = useState([]);
    const [nominations, setNominations] = useState([]);

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
                    awardsData,
                    badgesData,
                    decorationsData,
                    prizesData,
                    rolloverData,
                    globalAwardsData,
                    categoriesData,
                    housePointsData,
                    nominationsData
                ] = await Promise.all([
                    fetchStudentAwards(user.studentId).catch(() => []),
                    fetchStudentBadges(user.studentId).catch(() => []),
                    fetchStudentDecorations(user.studentId).catch(() => []),
                    fetchStudentPrizes(user.studentId).catch(() => []),
                    fetchStudentRollover(user.studentId).catch(() => null),
                    fetchGlobalAwards().catch(() => []),
                    fetchGlobalCategories().catch(() => []),
                    fetchGlobalHousePoints().catch(() => []),
                    fetchGlobalNominations().catch(() => [])
                ]);

                setAwards(awardsData);
                setBadges(badgesData);
                setDecorations(decorationsData);
                setPrizes(prizesData);
                setRollover(rolloverData);
                setGlobalAwards(globalAwardsData);
                setCategories(categoriesData);
                setHousePoints(housePointsData);
                setNominations(nominationsData);
            } catch (err) {
                console.error("Failed to load Award Scheme details", err);
                setError("Failed to retrieve award scheme resources. Please try again later.");
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
                <p className="text-zinc-500 dark:text-zinc-400 font-bold text-sm">Synchronising Award Scheme Data...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 border border-red-500/20 bg-red-500/10 rounded-2xl text-center space-y-4 max-w-lg mx-auto mt-10">
                <Trophy size={48} className="text-red-500 mx-auto opacity-70 animate-bounce" />
                <h3 className="text-lg font-extrabold text-red-500">Retrieval Error</h3>
                <p className="text-zinc-650 dark:text-zinc-400 text-sm">{error}</p>
            </div>
        );
    }

    const totalMeritPoints = awards.reduce((sum, a) => sum + (a.points || 0), 0);

    return (
        <div className="space-y-8 pb-20">
            {/* Top Dashboard Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 flex items-center gap-4 relative overflow-hidden group select-none">
                    <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                        <Trophy size={80} />
                    </div>
                    <div className="w-12 h-12 flex items-center justify-center bg-accent text-accent-contrast border border-accent shrink-0">
                        <Trophy size={22} />
                    </div>
                    <div>
                        <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Total Merit Points</span>
                        <h4 className="text-3xl font-extrabold text-zinc-900 dark:text-white leading-none mt-1">{totalMeritPoints} Points</h4>
                    </div>
                </div>

                <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 flex items-center gap-4 relative overflow-hidden group select-none">
                    <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                        <Shield size={80} />
                    </div>
                    <div className="w-12 h-12 flex items-center justify-center bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 shrink-0">
                        <Shield size={22} />
                    </div>
                    <div>
                        <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Authorised Badges</span>
                        <h4 className="text-3xl font-extrabold text-zinc-900 dark:text-white leading-none mt-1">{badges.length} active</h4>
                    </div>
                </div>

                <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 flex items-center gap-4 relative overflow-hidden group select-none">
                    <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                        <TrendingUp size={80} />
                    </div>
                    <div className="w-12 h-12 flex items-center justify-center bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 shrink-0">
                        <TrendingUp size={22} />
                    </div>
                    <div>
                        <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Rollover Points</span>
                        <h4 className="text-3xl font-extrabold text-zinc-900 dark:text-white leading-none mt-1">
                            {rollover ? `${rollover.rolloverPoints} pts` : '0 pts'}
                        </h4>
                    </div>
                </div>
            </div>

            {/* Tab navigation */}
            <div className="flex border-b border-zinc-200 dark:border-zinc-900 overflow-x-auto select-none">
                {[
                    { id: 'my-awards', label: 'My Achievements', icon: Star },
                    { id: 'available-awards', label: 'Awards Catalog', icon: ListCollapse },
                    { id: 'house-leaderboard', label: 'House Leaderboard', icon: Trophy },
                    { id: 'nominations', label: 'Nominations', icon: User }
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

            {/* TAB CONTENT */}

            {/* My Achievements */}
            {activeTab === 'my-awards' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Issued Awards list */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                                <Award size={18} className="text-accent" />
                                Merit Certificates & Awards
                            </h3>
                            <div className="space-y-3">
                                {awards.length > 0 ? awards.map(a => (
                                    <div key={a.id} className="bg-white dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-850 shadow-sm flex items-start justify-between">
                                        <div>
                                            <h4 className="font-extrabold text-zinc-900 dark:text-white text-base">{a.title}</h4>
                                            <p className="text-zinc-550 text-xs mt-1.5 leading-relaxed">{a.description}</p>
                                            <span className="text-[11px] font-semibold text-zinc-400 mt-2 block">{a.dateIssued}</span>
                                        </div>
                                        <div className="px-2.5 py-1 bg-accent/15 text-accent border border-accent/25 text-xs font-black uppercase tracking-wider shrink-0">
                                            +{a.points} Pts
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center py-10 bg-zinc-50 dark:bg-zinc-900/10 border border-dashed border-zinc-200 dark:border-zinc-850 text-zinc-500 text-sm">
                                        No merit awards recorded for this year.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Blazer Badges & Decorations */}
                        <div className="space-y-6">
                            {/* Badges */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                                    <Shield size={18} className="text-accent" />
                                    Blazer Badges
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {badges.length > 0 ? badges.map(b => (
                                        <div key={b.id} className="bg-white dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-850 shadow-sm flex items-center gap-3">
                                            <div className="w-10 h-10 flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-accent">
                                                <Shield size={18} />
                                            </div>
                                            <div>
                                                <h4 className="font-extrabold text-sm text-zinc-900 dark:text-white">{b.title}</h4>
                                                <span className="text-[11px] font-bold text-zinc-400 block mt-1 uppercase tracking-wider">{b.category}</span>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="col-span-2 text-center py-6 bg-zinc-50 dark:bg-zinc-900/10 border border-dashed border-zinc-200 dark:border-zinc-850 text-zinc-500 text-sm">
                                            No blazer badges authorised yet.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Decorations & Pockets */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                                    <Compass size={18} className="text-accent" />
                                    Presentation Night Decorations
                                </h3>
                                <div className="space-y-3">
                                    {decorations.length > 0 ? decorations.map(d => (
                                        <div key={d.id} className="bg-white dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-850 shadow-sm flex justify-between items-center">
                                            <div>
                                                <h4 className="font-extrabold text-sm text-zinc-900 dark:text-white">{d.title}</h4>
                                                <p className="text-[11px] text-zinc-400 font-semibold mt-1">{d.presentationNight}</p>
                                            </div>
                                            <div className="text-xs font-black uppercase text-accent tracking-widest bg-accent/5 px-2 py-0.5 border border-accent/10">
                                                {d.year}
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="text-center py-6 bg-zinc-50 dark:bg-zinc-900/10 border border-dashed border-zinc-200 dark:border-zinc-850 text-zinc-500 text-sm">
                                            No special presentations or decorative awards recorded.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Prizes section */}
                    {prizes.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                                <Trophy size={18} className="text-accent" />
                                Major Academic Prizes
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {prizes.map(p => (
                                    <div key={p.id} className="bg-gradient-to-br from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-900 p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-start gap-4">
                                        <div className="w-10 h-10 flex items-center justify-center bg-accent text-accent-contrast border border-accent shrink-0">
                                            <Trophy size={18} />
                                        </div>
                                        <div>
                                            <h4 className="font-extrabold text-zinc-900 dark:text-white text-base leading-tight">{p.title}</h4>
                                            <p className="text-zinc-550 text-xs mt-1.5 leading-relaxed">{p.description}</p>
                                            <span className="text-[11px] font-black uppercase tracking-wider text-accent mt-3 block">{p.year} Award</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Awards Catalog */}
            {activeTab === 'available-awards' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 max-w-3xl">
                        <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white mb-2 flex items-center gap-2">
                            <Sparkles size={18} className="text-accent" />
                            How the Award Scheme Works
                        </h3>
                        <p className="text-zinc-550 text-sm leading-relaxed">
                            Merit points are accumulated throughout the year across sports, academic, and service activities. Once you reach thresholds, you qualify for official Certificates (Bronze, Silver, Gold). Blazer Badges are awarded based on exceptional commitment to specific activities or leadership roles, and require department approval.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {globalAwards.map(ga => (
                            <div key={ga.id} className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 shadow-sm flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="font-extrabold text-lg text-zinc-900 dark:text-white">{ga.name}</h4>
                                        <span className="text-[11px] font-black uppercase bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 px-2 py-0.5 text-zinc-550 shrink-0">
                                            {ga.pointsRequired} Pts Required
                                        </span>
                                    </div>
                                    <p className="text-zinc-550 text-xs leading-relaxed">{ga.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                            Categories and Weights
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {categories.map(c => (
                                <div key={c.id} className="bg-white dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-850 shadow-sm">
                                    <h4 className="font-bold text-sm text-zinc-900 dark:text-white">{c.name}</h4>
                                    <span className="text-xs text-zinc-400 font-medium block mt-1">Multiplier: {c.weight}x</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* House Leaderboard */}
            {activeTab === 'house-leaderboard' && (
                <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
                    <div className="text-center space-y-2">
                        <Trophy size={48} className="mx-auto text-accent opacity-80" />
                        <h3 className="text-2xl font-extrabold text-zinc-900 dark:text-white">Inter-House Championship</h3>
                        <p className="text-zinc-550 text-sm">Aggregated merit points of all students by House group.</p>
                    </div>

                    <div className="bg-white dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-850 shadow-sm divide-y divide-zinc-200 dark:divide-zinc-900">
                        {housePoints.map((hp, idx) => {
                            const medals = ["bg-amber-400 text-black", "bg-zinc-350 text-black", "bg-amber-600 text-white"];
                            return (
                                <div key={hp.house} className="flex items-center justify-between py-4 px-2 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/10 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-8 h-8 flex items-center justify-center font-bold text-xs border ${
                                            idx < 3 ? medals[idx] : 'border-zinc-300 dark:border-zinc-700 text-zinc-555'
                                        }`}>
                                            {idx + 1}
                                        </div>
                                        <span className="font-extrabold text-zinc-900 dark:text-white text-base">{hp.house} House</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-lg text-zinc-900 dark:text-white">{hp.points}</span>
                                        <span className="text-[11px] text-zinc-400 font-extrabold uppercase">Points</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Nominations */}
            {activeTab === 'nominations' && (
                <div className="space-y-6 max-w-3xl mx-auto animate-in fade-in duration-300">
                    <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-900 pb-4">
                        <div>
                            <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white">Award Nominations</h3>
                            <p className="text-zinc-550 text-xs mt-1">Pending and approved nominations from class teachers and activity coordinators.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {nominations.length > 0 ? nominations.map(nom => (
                            <div key={nom.id} className="bg-white dark:bg-zinc-950 p-5 border border-zinc-200 dark:border-zinc-850 shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-extrabold text-zinc-950 dark:text-white text-base">{nom.nomineeName}</span>
                                        <span className="text-xs text-zinc-400 font-medium">({nom.nomineeId})</span>
                                        <span className="text-[11px] font-black uppercase text-accent border border-accent/20 bg-accent/5 px-2 py-0.5 leading-none">
                                            {nom.awardId.replace('-', ' ')}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs font-semibold text-zinc-500">
                                        <span className="flex items-center gap-1"><User size={14} /> By {nom.nominatedBy}</span>
                                        <span className="flex items-center gap-1"><History size={14} /> {nom.date}</span>
                                    </div>
                                </div>
                                <div className={`px-3 py-1 border text-xs font-black uppercase tracking-wider self-start sm:self-auto ${
                                    nom.status === 'Approved'
                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                        : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                                }`}>
                                    {nom.status}
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-900/10 border border-dashed border-zinc-200 dark:border-zinc-850 text-zinc-500 text-sm">
                                No nominations filed.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AwardSchemeView;
