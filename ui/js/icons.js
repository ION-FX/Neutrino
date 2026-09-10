'use strict';
// Inline SVG icon set — no external assets, no icon font, no dependencies.
(function () {
  const I = {
    back:    '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fwd:     '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    reload:  '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 10.6 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20 4v7h-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stop:    '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    search:  '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    shield:  '<svg viewBox="0 0 24 24"><path d="M12 2l8 3.5v5.7c0 5-3.4 8.6-8 10.8-4.6-2.2-8-5.8-8-10.8V5.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    plus:    '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    close:   '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    min:     '<svg viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    max:     '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    restore: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 6H8a2 2 0 00-2 2v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    gear:    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1 1.55V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1.1-1.55 1.7 1.7 0 00-1.88.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.55-1H3a2 2 0 110-4h.09a1.7 1.7 0 001.55-1.1 1.7 1.7 0 00-.34-1.88l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34h0a1.7 1.7 0 001-1.55V3a2 2 0 114 0v.09a1.7 1.7 0 001 1.55h0a1.7 1.7 0 001.88-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.88v0a1.7 1.7 0 001.55 1H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.55 1z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
    puzzle:  '<svg viewBox="0 0 24 24"><path d="M10 3a2 2 0 014 0v1h3a1 1 0 011 1v3h1a2 2 0 010 4h-1v3a1 1 0 01-1 1h-3v1a2 2 0 01-4 0v-1H6a1 1 0 01-1-1v-3H4a2 2 0 010-4h1V5a1 1 0 011-1h3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    moon:    '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    zap:     '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    trash:   '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m3 0v12a2 2 0 01-2 2H8a2 2 0 01-2-2V7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevD:   '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    globe:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    clock:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    cmd:     '<svg viewBox="0 0 24 24"><path d="M9 9h6v6H9zM9 9V7a2.5 2.5 0 10-2.5 2.5H9zm6 0V7a2.5 2.5 0 112.5 2.5H15zM9 15v2a2.5 2.5 0 11-2.5-2.5H9zm6 0v2a2.5 2.5 0 102.5-2.5H15z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    dots:    '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="19" cy="12" r="1.7" fill="currentColor"/></svg>',
    folder:  '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    ext:     '<svg viewBox="0 0 24 24"><path d="M14 3h7v7m0-7L10 14M9 5H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    alert:   '<svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.5v.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    volume:  '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 010 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    check:   '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    star:    '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" fill="currentColor"/><path d="M19 15l.9 3.1L23 19l-3.1.9L19 23l-.9-3.1L15 19l3.1-.9z" fill="currentColor" opacity=".7"/></svg>',
    history: '<svg viewBox="0 0 24 24"><path d="M3.5 12a8.5 8.5 0 108.5-8.5A8.4 8.4 0 005.6 6.5M3.5 3v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 8v4.3l3 1.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    tab:     '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 9h9l2-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    lock:    '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    zoom:    '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5L21 21M8 10.5h5M10.5 8v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    keyboard:'<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 12.5h.01M9.5 12.5h.01M13 12.5h.01M16.5 12.5h.01M8 15.2h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    bot:     '<svg viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8V4M9.5 13.5h.01M14.5 13.5h.01M2.5 12.5h1.5M20 12.5h1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="3.5" r="1.3" fill="currentColor"/></svg>',
  };

  const logo = `
  <svg viewBox="0 0 24 24" class="logo-svg">
    <ellipse cx="12" cy="12" rx="9.5" ry="4" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".5" transform="rotate(-24 12 12)"/>
    <ellipse cx="12" cy="12" rx="9.5" ry="4" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".5" transform="rotate(52 12 12)"/>
    <circle cx="12" cy="12" r="2.4" fill="currentColor"/>
    <circle cx="19.4" cy="8.2" r="1.5" fill="var(--accent, #7aa2ff)"/>
  </svg>`;

  function icon(name, cls) {
    return `<span class="ic${cls ? ' ' + cls : ''}">${I[name] || I.globe}</span>`;
  }

  window.NTICONS = { icons: I, icon, logo };
})();
