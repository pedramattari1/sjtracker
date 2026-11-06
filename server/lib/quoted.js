// Split a reply body into the new content vs. the quoted history beneath it, so
// a message bubble can show only what the person actually wrote and collapse the
// quoted thread behind a "show quoted text" expander.
//
// Pure + DB-free (node-testable). Heuristics, in order of reliability:
//   HTML:  cut at Gmail's quote container (<div class="gmail_quote">),
//          <blockquote>, or an Outlook divider.
//   TEXT:  cut at the first "quote boundary" line — an attribution like
//          "On <date>, <name> wrote:", an "-----Original Message-----" divider,
//          or the first of a run of ">"-quoted lines.
//
// Conservative: if no boundary is found, everything is "visible" and quoted="".

const ATTRIBUTION_RES = [
  // "On Tue, Nov 4, 2026 at 3:21 PM Jane Doe <jane@x.com> wrote:"
  /^On\b.*\bwrote:\s*$/i,
  // localized/variant: "El ... escribió:", "Le ... a écrit :" — keep ASCII-safe common ones
  /^-{2,}\s*Original Message\s*-{2,}\s*$/i,
  /^_{5,}\s*$/, // Outlook underscore divider
  /^From:\s.+\bSent:\s/i, // Outlook header block on one line (rare)
];

function isQuoteStart(line) {
  const t = line.trimEnd();
  if (ATTRIBUTION_RES.some((re) => re.test(t))) return true;
  return false;
}

/** Split plain text. Returns { visible, quoted }. */
function splitText(text) {
  if (!text) return { visible: '', quoted: '' };
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  let cut = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isQuoteStart(lines[i])) { cut = i; break; }
    // A run of ">"-quoted lines also marks the start of quoted history, but only
    // if we're not on the very first line (some people prefix with a stray ">").
    if (i > 0 && /^>\s?/.test(lines[i]) && /^>\s?/.test(lines[i + 1] || '>')) {
      cut = i; break;
    }
  }
  if (cut === -1) return { visible: text.trim(), quoted: '' };

  const visible = lines.slice(0, cut).join('\n').trimEnd();
  const quoted = lines.slice(cut).join('\n').trim();
  return { visible, quoted };
}

/** Split HTML at the first quote container. Returns { visible, quoted } (both HTML). */
function splitHtml(html) {
  if (!html) return { visible: '', quoted: '' };
  const markers = [
    /<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>/i,
    /<blockquote[^>]*>/i,
    /<div[^>]*id="[^"]*(?:divRplyFwdMsg|appendonsend)[^"]*"[^>]*>/i, // Outlook
    /<hr[^>]*id="[^"]*stopSpelling[^"]*"[^>]*>/i,
  ];
  let idx = -1;
  for (const re of markers) {
    const m = html.match(re);
    if (m && (idx === -1 || m.index < idx)) idx = m.index;
  }
  if (idx === -1) return { visible: html, quoted: '' };
  return { visible: html.slice(0, idx).trim(), quoted: html.slice(idx).trim() };
}

/**
 * Split a message. Prefers text for the boundary decision (more reliable),
 * returns both the visible/quoted text and, when present, the html split.
 */
function splitQuoted(text, html) {
  const t = splitText(text || '');
  const h = splitHtml(html || '');
  return {
    visible: t.visible,
    quoted: t.quoted,
    visibleHtml: h.visible,
    quotedHtml: h.quoted,
    hasQuoted: Boolean(t.quoted || h.quoted),
  };
}

module.exports = { splitQuoted, splitText, splitHtml };
