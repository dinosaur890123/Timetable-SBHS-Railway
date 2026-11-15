import { useLayoutEffect } from 'react';

// Removes the prerendered SEO shell as soon as React has committed, before paint,
// so no-JS visitors keep the static content while JS visitors get the real app
// without duplicates or a visible swap.
const SeoShellCleanup = ({ children }) => {
    useLayoutEffect(() => {
        document.getElementById('seo-shell')?.remove();
    }, []);

    return children;
};

export default SeoShellCleanup;
