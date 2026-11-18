import { useLayoutEffect } from 'react';

const SeoShellCleanup = ({ children }) => {
    useLayoutEffect(() => {
        document.getElementById('seo-shell')?.remove();
    }, []);

    return children;
};

export default SeoShellCleanup;
