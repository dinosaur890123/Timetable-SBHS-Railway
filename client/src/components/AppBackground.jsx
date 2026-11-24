import React, { useRef, useEffect } from 'react';

/**
 * AppBackground
 * Renders a full-bleed image or looping video behind the entire app.
 *
 * Props:
 *   bg: { type: 'image' | 'video', src: string } | null
 *   opacity: number  (0–1, default 1 — the overlay controls readability)
 */
const AppBackground = ({ bg, opacity = 1 }) => {
    const videoRef = useRef(null);

    // When the src changes, reload the video element so it picks up the new source.
    useEffect(() => {
        if (bg?.type === 'video' && videoRef.current) {
            videoRef.current.load();
        }
    }, [bg?.src]);

    if (!bg?.src) return null;

    const sharedStyle = {
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        zIndex: -20,
        opacity,
        pointerEvents: 'none',
        userSelect: 'none',
    };

    return (
        <>
            {bg.type === 'image' ? (
                <img
                    src={bg.src}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    style={sharedStyle}
                />
            ) : (
                <video
                    ref={videoRef}
                    autoPlay
                    loop
                    muted
                    playsInline
                    aria-hidden="true"
                    style={sharedStyle}
                >
                    <source src={bg.src} />
                </video>
            )}
            {/* Darkening overlay for contrast & readability without glass blur */}
            <div
                aria-hidden="true"
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: -19,
                    pointerEvents: 'none',
                    background: 'rgb(0 0 0 / 0.35)',
                }}
            />
        </>
    );
};

export default AppBackground;
