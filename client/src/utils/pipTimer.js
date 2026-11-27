/**
 * Floating Picture-in-Picture (PiP) timer utility.
 * Uses the Document Picture-in-Picture API when available, falling back
 * to a compact popup window so the countdown stays visible across tabs.
 */

export const isDocumentPipSupported = () =>
    typeof window !== 'undefined' && 'documentPictureInPicture' in window;

export const openPipWindow = async ({ onClose } = {}) => {
    const width = 260;
    const height = 124;
    let pipWin = null;
    if (isDocumentPipSupported()) {
        try {
            pipWin = await window.documentPictureInPicture.requestWindow({
                width,
                height,
            });
        } catch {
            pipWin = null;
        }
    }

    if (!pipWin && typeof window !== 'undefined') {
        const left = Math.max(0, (window.screen?.availWidth || 1280) - width - 20);
        const top = Math.max(0, (window.screen?.availHeight || 720) - height - 20);
        pipWin = window.open(
            '',
            'sbhs-pip-timer',
            `popup=yes,width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
        );
    }

    if (!pipWin) return null;

    if (onClose) {
        const handleClose = () => onClose();
        pipWin.addEventListener('pagehide', handleClose, { once: true });
        pipWin.addEventListener('beforeunload', handleClose, { once: true });
    }

    return pipWin;
};

const ensurePipShell = (doc) => {
    if (doc.getElementById('pip-root')) return;
    doc.title = 'Bell Countdown';
    doc.head.innerHTML = `
        <meta charset="utf-8" />
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            html, body {
                height: 100%;
                font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
                -webkit-font-smoothing: antialiased;
                overflow: hidden;
            }
            body {
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                padding: 12px 14px;
                background: var(--bg, #ffffff);
                color: var(--fg, #18181b);
                transition: background-color 150ms ease, color 150ms ease;
            }
            body[data-dark="true"] {
                --bg: #09090b;
                --fg: #fafafa;
                --muted: #a1a1aa;
                --track: rgba(255, 255, 255, 0.07);
                --border: rgba(255, 255, 255, 0.08);
            }
            body[data-dark="false"] {
                --bg: #ffffff;
                --fg: #18181b;
                --muted: #71717a;
                --track: rgba(24, 24, 27, 0.06);
                --border: rgba(24, 24, 27, 0.07);
            }
            #pip-root {
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                height: 100%;
            }
            .top {
                display: flex;
                align-items: center;
                gap: 8px;
                min-width: 0;
            }
            .dot {
                width: 8px;
                height: 8px;
                border-radius: 9999px;
                flex-shrink: 0;
                background: var(--accent, #3b82f6);
            }
            .title {
                font-size: 14px;
                font-weight: 600;
                letter-spacing: -0.01em;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                color: var(--fg);
            }
            .time-row {
                display: flex;
                align-items: baseline;
                gap: 8px;
                margin-top: 8px;
            }
            .countdown {
                font-size: 26px;
                line-height: 1;
                font-weight: 500;
                letter-spacing: -0.02em;
                font-variant-numeric: tabular-nums;
            }
            .caption {
                font-size: 12px;
                color: var(--muted);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .progress-track {
                height: 3px;
                border-radius: 9999px;
                background: var(--track);
                overflow: hidden;
                margin-top: 10px;
            }
            .progress-fill {
                height: 100%;
                border-radius: 9999px;
                background: var(--accent, #3b82f6);
                transition: width 1000ms linear;
            }
            .next { display: none; }
        </style>
    `;
    doc.body.innerHTML = `
        <div id="pip-root">
            <div class="top">
                <span class="dot" id="pip-dot"></span>
                <span class="title" id="pip-title"></span>
            </div>
            <div class="time-row">
                <span class="countdown" id="pip-countdown"></span>
                <span class="caption" id="pip-caption"></span>
            </div>
            <div class="progress-track" id="pip-track">
                <div class="progress-fill" id="pip-fill"></div>
            </div>
            <div class="next" id="pip-next"></div>
        </div>
    `;
};

export const renderPipTimer = (pipWin, data) => {
    if (!pipWin || pipWin.closed || !data) return;
    const doc = pipWin.document;
    ensurePipShell(doc);

    doc.body.setAttribute('data-dark', data.isDark ? 'true' : 'false');
    doc.body.style.setProperty('--accent', data.colour || '#3b82f6');

    const titleEl = doc.getElementById('pip-title');
    const countdownEl = doc.getElementById('pip-countdown');
    const captionEl = doc.getElementById('pip-caption');
    const trackEl = doc.getElementById('pip-track');
    const fillEl = doc.getElementById('pip-fill');
    const nextEl = doc.getElementById('pip-next');

    if (titleEl) titleEl.textContent = data.title || data.label || 'Bell Countdown';
    if (countdownEl) countdownEl.textContent = data.countdown || '';
    if (captionEl) captionEl.textContent = data.caption || '';
    if (trackEl) trackEl.style.display = typeof data.progress === 'number' ? 'block' : 'none';
    if (fillEl && typeof data.progress === 'number') {
        fillEl.style.width = `${Math.min(100, Math.max(0, data.progress))}%`;
    }
    if (nextEl) {
        nextEl.textContent = data.nextLine || '';
        nextEl.style.display = data.nextLine ? 'block' : 'none';
    }
};
