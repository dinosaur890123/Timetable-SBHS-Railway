import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, X } from 'lucide-react';
import { format } from 'date-fns';
import { EASE_OUT, Ring, useNoteFlowFonts } from '../study/noteflow';
import '../study/noteflow.css';
import './clipboard.css';

// Clipboard sessions, drawn in NoteFlow's language. Shared by the Clipboard page's
// calendar and the single line a session gets on the day's timetable.

export const startOf = (session) => (session?.start ? new Date(session.start) : null);
export const endOf = (session) => (session?.end ? new Date(session.end) : null);
export const dayKeyOf = (session) => {
    const start = startOf(session);
    return start ? format(start, 'yyyy-MM-dd') : null;
};

// "3:30 pm", the way the rest of NoteFlow writes times.
export const clockTime = (date) => (date ? `${format(date, 'h:mm')} ${format(date, 'a').toLowerCase()}` : '');

export const sessionName = (session) => session.title || session.activity;

// The activity's own colour on its dot, through a CSS variable so the cancelled
// style (a hollow ring) still wins. Falls back to Clipboard violet.
export const sessionInk = (session) => (session?.colour ? { '--cb-colour': session.colour } : undefined);

const hasCoords = (location) => Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude))
    && !(Number(location.latitude) === 0 && Number(location.longitude) === 0);

const mapsUrl = (location) => {
    if (hasCoords(location)) return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
    const query = location?.address || '';
    return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
};

const mapEmbedUrl = (location) => {
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    const pad = 0.006;
    const bbox = [lng - pad, lat - pad * 0.6, lng + pad, lat + pad * 0.6].join(',');
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
};

const Row = ({ label, children }) => (
    <div>
        <dt>{label}</dt>
        <dd>{children}</dd>
    </div>
);

const SheetBody = ({ session, onClose, still }) => {
    const start = startOf(session);
    const end = endOf(session);
    const { location, result } = session;
    const maps = location && (hasCoords(location) || location.address) ? mapsUrl(location) : null;
    const when = start
        ? `${format(start, 'EEEE d MMMM')}, ${clockTime(start)}${end ? ` to ${clockTime(end)}` : ''}`
        : [session.date, session.time].filter(Boolean).join(', ');

    return (
        <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={sessionName(session)}
            className={`nf nf-sheet nf-pop ${session.cancelled ? 'is-cancelled' : ''}`}
            initial={still ? false : { opacity: 0, y: 10, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.12 } }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
            onClick={(e) => e.stopPropagation()}
        >
            <button type="button" className="nf-cb-btn nf-cb-btn--bare nf-pop__close" onClick={onClose} aria-label="Close">
                <X size={16} strokeWidth={1.75} />
            </button>
            <span className="nf-meta nf-pop__meta">
                <span className="nf-cb-dot" aria-hidden="true" style={sessionInk(session)} />
                {session.cancelled ? `${session.activity}, cancelled` : session.title ? session.activity : 'Clipboard'}
            </span>
            <h2 className="nf-pop__title">{sessionName(session)}</h2>

            <dl className="nf-pop__rows">
                <Row label="When"><span className="tnum">{when}</span></Row>
                <Row label="Where">
                    {location?.name || location?.address ? (
                        <>
                            {location.name || location.address}
                            {location.name && location.address && <small>{location.address}</small>}
                        </>
                    ) : (
                        <span style={{ color: 'var(--ink-3)' }}>Not on Clipboard yet</span>
                    )}
                    {hasCoords(location) && (
                        <iframe
                            className="nf-pop__map"
                            title={`Map of ${location.name || 'the venue'}`}
                            src={mapEmbedUrl(location)}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                        />
                    )}
                    {maps && (
                        <a className={`nf-pop__link${hasCoords(location) ? '' : ' is-next-line'}`} href={maps} target="_blank" rel="noopener noreferrer">
                            Open in Maps <ArrowUpRight size={14} strokeWidth={1.75} />
                        </a>
                    )}
                </Row>
                {session.opponent && (
                    <Row label="Against">
                        {session.opponent}
                        {session.round && <small>{session.round}</small>}
                    </Row>
                )}
                {session.staff?.length > 0 && (
                    <Row label="Staff">{session.staff.join(', ')}</Row>
                )}
                {session.notes && <Row label="Notes"><span className="nf-pop__notes">{session.notes}</span></Row>}
            </dl>

            {/* The red pen marks results only. */}
            {result && (result.us !== null || result.outcome) && (
                <div className="nf-pop__result">
                    {result.us !== null && (
                        <span className="nf-score tnum">
                            {result.us}<small>–{result.them ?? 0}</small>
                            <Ring delay={0.35} still={still} />
                        </span>
                    )}
                    {result.outcome && <span className="nf-meta">{result.outcome}</span>}
                </div>
            )}
        </motion.div>
    );
};

// A session popped out over the page: when, where (with a map), who against, and notes.
export const SessionSheet = ({ session, onClose }) => {
    const still = useReducedMotion();
    useNoteFlowFonts(!!session);

    useEffect(() => {
        if (!session) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [session, onClose]);

    return createPortal(
        <AnimatePresence>
            {session && (
                <motion.div
                    key="scrim"
                    className="nf-pop-scrim"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={onClose}
                >
                    <SheetBody session={session} onClose={onClose} still={still} />
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

// One quiet line in the day's timetable, laid out like a break row. Opens the sheet.
export const SessionLine = ({ session, onOpen }) => (
    <button
        type="button"
        data-no-press
        className={`nf nf-cb-line rounded-md ${session.cancelled ? 'is-cancelled' : ''}`}
        onClick={() => onOpen(session)}
        aria-label={`${sessionName(session)}${session.cancelled ? ', cancelled' : ''}. Show details`}
    >
        <span className="nf-cb-dot" aria-hidden="true" style={sessionInk(session)} />
        <span className="nf-cb-line__name">{sessionName(session)}</span>
        <span className="nf-cb-line__rule" aria-hidden="true" />
        <span className="nf-cb-line__where">{session.cancelled ? 'Cancelled' : session.location?.name || 'Clipboard'}</span>
    </button>
);
