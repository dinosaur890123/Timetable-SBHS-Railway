// Tiny markdown for Sage's replies: **bold**, *italic*, `code`, lists, paragraphs.
// Everything is HTML-escaped first, so the model's text can't inject markup.
//
// Line-based on purpose: a list can start mid-paragraph ("Here's your day:\n- a\n- b")
// and still render — the old block parser required every line in a block to be a
// bullet, so mixed content silently fell back to literal "- " text.

const sageInline = (s) => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

const LIST_MARKER = /^\s*(?:(?:[-*+•◦‣·])|(?:\d{1,2}[.)]))\s+/;
const ORDERED_MARKER = /^\s*\d{1,2}[.)]\s+/;

export const sageMarkdown = (md) => {
    const html = [];
    let para = [];
    let list = null; // { tag, items: [] }

    const flushPara = () => {
        if (para.length) {
            html.push(`<p>${para.map(sageInline).join('<br>')}</p>`);
            para = [];
        }
    };
    const flushList = () => {
        if (list) {
            html.push(`<${list.tag}>${list.items.map(i => `<li>${i}</li>`).join('')}</${list.tag}>`);
            list = null;
        }
    };

    for (const raw of String(md || '').split('\n')) {
        const line = raw.trim();
        // A blank line ends a paragraph but not a list — models often separate
        // bullet items with blank lines, and those should stay one list.
        if (!line) { flushPara(); continue; }

        if (LIST_MARKER.test(line)) {
            flushPara();
            const tag = ORDERED_MARKER.test(line) ? 'ol' : 'ul';
            const item = sageInline(line.replace(LIST_MARKER, ''));
            if (!list || list.tag !== tag) {
                flushList();
                list = { tag, items: [] };
            }
            list.items.push(item);
        } else {
            flushList();
            para.push(sageInline(line));
        }
    }
    flushPara();
    flushList();
    return html.join('');
};
