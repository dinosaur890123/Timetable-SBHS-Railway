// Interface themes ("UI styles"). Separate from light/dark mode and accent colour:
// a UI theme changes the app shell, typography, radii and surfaces.
export const UI_THEMES = {
    modern: {
        id: 'modern',
        name: 'Modern',
        description: 'Soft surfaces, rounded cards, sidebar navigation and a command palette.'
    },
    classic: {
        id: 'classic',
        name: 'Classic',
        description: 'The original sharp-edged, high-contrast brutalist look.'
    }
};

export const DEFAULT_UI_CONFIG = { default: 'modern', enabled: ['modern', 'classic'] };

export const normalizeUiConfig = (config) => {
    const enabled = (config?.enabled || []).filter(id => UI_THEMES[id]);
    if (enabled.length === 0) return DEFAULT_UI_CONFIG;
    return { default: enabled.includes(config.default) ? config.default : enabled[0], enabled };
};

// The user's own pick wins, but only while an admin still offers it.
export const resolveUiTheme = (preference, config) => {
    const { default: def, enabled } = normalizeUiConfig(config);
    return preference && enabled.includes(preference) ? preference : def;
};

export const readCachedUiConfig = () => {
    try {
        const cached = localStorage.getItem('ui_config');
        return cached ? normalizeUiConfig(JSON.parse(cached)) : DEFAULT_UI_CONFIG;
    } catch {
        return DEFAULT_UI_CONFIG;
    }
};

export const readUiThemePreference = () => {
    try {
        return localStorage.getItem('ui_theme') || null;
    } catch {
        return null;
    }
};
