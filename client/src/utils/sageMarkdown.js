// Tiny markdown for Sage's replies: **bold**, *italic*, `code`, lists, paragraphs.
// Everything is HTML-escaped first, so the model's text can't inject markup.
const sageInline = (s) => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

export const sageMarkdown = (md) => {
    if (!md.trim()) return '';
    return md.split(/\n{2,}/).map((block) => {
        const lines = block.split('\n').filter(l => l.trim());
        if (lines.length && lines.every(l => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l))) {
            const tag = /^\s*\d/.test(lines[0]) ? 'ol' : 'ul';
            return `<${tag}>${lines.map(l => `<li>${sageInline(l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''))}</li>`).join('')}</${tag}>`;
        }
        return `<p>${lines.map(sageInline).join('<br>')}</p>`;
    }).join('');
};
