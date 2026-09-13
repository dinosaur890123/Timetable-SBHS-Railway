import React, { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';
import { fetchSystemStatus } from '../services/api';
import { updateUiThemeConfig } from '../services/adminApi';
import { UI_THEMES, DEFAULT_UI_CONFIG, normalizeUiConfig } from '../theme/uiThemes';

// Admin control: which interface themes users can choose from, and which one they get by default.
const AdminUiThemeSettings = () => {
    const [saved, setSaved] = useState(null);
    const [enabled, setEnabled] = useState(DEFAULT_UI_CONFIG.enabled);
    const [defaultTheme, setDefaultTheme] = useState(DEFAULT_UI_CONFIG.default);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchSystemStatus().then(status => {
            const config = normalizeUiConfig(status?.uiThemes || DEFAULT_UI_CONFIG);
            setSaved(config);
            setEnabled(config.enabled);
            setDefaultTheme(config.default);
        });
    }, []);

    const toggleEnabled = (id) => {
        setEnabled(prev => {
            if (prev.includes(id)) {
                if (prev.length === 1) return prev; // at least one must stay available
                const next = prev.filter(t => t !== id);
                if (defaultTheme === id) setDefaultTheme(next[0]);
                return next;
            }
            return [...prev, id];
        });
    };

    const chooseDefault = (id) => {
        setDefaultTheme(id);
        setEnabled(prev => (prev.includes(id) ? prev : [...prev, id]));
    };

    const dirty = !saved
        || saved.default !== defaultTheme
        || saved.enabled.length !== enabled.length
        || saved.enabled.some(t => !enabled.includes(t));

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await updateUiThemeConfig(defaultTheme, enabled);
            const config = normalizeUiConfig(res.uiThemes);
            setSaved(config);
            setEnabled(config.enabled);
            setDefaultTheme(config.default);
            localStorage.setItem('ui_config', JSON.stringify(config));
            alert('Interface themes updated. Users pick this up within 30 seconds.');
        } catch (err) {
            alert('Failed to update interface themes.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                    <h4 className="text-sm font-medium text-zinc-900 dark:text-white flex items-center gap-2">
                        <Palette size={16} />
                        Interface Themes
                    </h4>
                    <p className="text-xs text-zinc-500 mt-1">
                        Choose which interfaces users can switch between in Settings, and which one everyone gets by default.
                        Users who never picked one follow the default. Enable just one to lock everyone to it.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !dirty}
                    className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black hover:opacity-90 font-semibold transition-opacity rounded-lg text-sm disabled:opacity-50 shrink-0"
                >
                    {saving ? 'Saving...' : 'Save'}
                </button>
            </div>

            <div className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                {Object.values(UI_THEMES).map(theme => {
                    const isEnabled = enabled.includes(theme.id);
                    const isDefault = defaultTheme === theme.id;
                    return (
                        <div key={theme.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-zinc-900 dark:text-white">{theme.name}</div>
                                <div className="text-xs text-zinc-500">{theme.description}</div>
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                                <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300">
                                    <input
                                        type="checkbox"
                                        checked={isEnabled}
                                        disabled={isEnabled && enabled.length === 1}
                                        onChange={() => toggleEnabled(theme.id)}
                                    />
                                    Available
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300">
                                    <input
                                        type="radio"
                                        name="ui-default-theme"
                                        checked={isDefault}
                                        onChange={() => chooseDefault(theme.id)}
                                    />
                                    Default
                                </label>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default AdminUiThemeSettings;
