/* ──────────────────────────────────────────────────────────
   Thinking Weapons - palette engine, WCAG-mapped.

   Five fixed pigments wired into the site's role tokens, in the
   same considered register as ronbronson.dev / ronbronson.design.
   Every role assignment below was chosen against measured
   contrast, and the audit still runs - open the console and call
   TWPalette.audit() to read the ratios the schemes land on.

     Snow           #fff9fb   paper ground / light ink
     Alabaster Grey #d3d4d9   surface - panels, secondary on dark
     Air Force Blue #4b88a2   mid surface / decorative rule
     Blush Rose     #d55672   signal - fills, borders, large display
     Night Bordeaux #481620   ink ground / dark ink

   Role rules (enforced by the values, verified by audit):
     · body ink ↔ ground is AAA in both schemes (Bordeaux/Snow).
     · Blush Rose clears AA-large in both schemes; it is used for
       fills, borders, and large display, never as small body text.
     · Air Force Blue fails AA as small text on Snow, so the soft
       slot there is the same hue nudged toward Bordeaux until it
       clears AA; pure Air Force Blue stays a decorative hairline.
     · Essential structure (the grid frame) is drawn in --ink (the
       AAA pair), so it always clears the 3:1 non-text minimum.
   ────────────────────────────────────────────────────────── */
(function () {
  /* ── contrast math (audit only) ───────────────────── */
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const lin = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  function luminance(rgb) {
    return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  }
  function contrast(a, b) {
    const la = luminance(hexToRgb(a)), lb = luminance(hexToRgb(b));
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  /* ── the five pigments ────────────────────────────── */
  const PIG = {
    snow:     '#fff9fb',
    alabaster:'#d3d4d9',
    airforce: '#4b88a2',
    rose:     '#d55672',
    bordeaux: '#481620',
  };

  /* ── role-mapped schemes ──────────────────────────── */
  function build(label, m) {
    return {
      label,
      bg:     m.bg,
      deeper: m.deeper, /* panel / media ground */
      ink:    m.ink,
      soft:   m.soft,   /* small secondary text */
      rule:   m.rule,   /* decorative hairline */
      accent: m.accent,
      _audit: {
        'body ink / bg':  +contrast(m.ink, m.bg).toFixed(2),
        'soft / bg':      +contrast(m.soft, m.bg).toFixed(2),
        'accent / bg':    +contrast(m.accent, m.bg).toFixed(2),
        'ink on deeper':  +contrast(m.ink, m.deeper).toFixed(2),
      },
    };
  }

  const PALETTES = {
    snow: build('Snow', {
      bg:     PIG.snow,
      deeper: PIG.alabaster,
      ink:    PIG.bordeaux,
      // Air Force Blue lands ~3.8 on Snow - under AA for body text.
      // This is the same hue nudged toward Bordeaux until it clears
      // AA (~4.9); pure Air Force Blue stays the decorative rule.
      soft:   '#40748a',
      rule:   PIG.airforce,
      accent: PIG.rose,
    }),
    bordeaux: build('Bordeaux', {
      bg:     PIG.bordeaux,
      deeper: PIG.airforce,
      ink:    PIG.snow,
      soft:   PIG.alabaster,
      rule:   PIG.airforce,
      accent: PIG.rose,
    }),
  };

  const DEFAULT = 'snow';

  /* ── application ──────────────────────────────────── */
  function setVars(p) {
    const r = document.documentElement.style;
    r.setProperty('--bg',        p.bg);
    r.setProperty('--bg-deeper', p.deeper);
    r.setProperty('--ink',       p.ink);
    r.setProperty('--ink-soft',  p.soft);
    r.setProperty('--rule',      p.rule);
    r.setProperty('--accent',    p.accent);
  }

  function syncSwatchState(key) {
    document.querySelectorAll('.palette-swatch').forEach((el) => {
      el.setAttribute('aria-pressed', el.dataset.palette === key ? 'true' : 'false');
    });
  }

  function apply(key, persist) {
    const resolved = key in PALETTES ? key : DEFAULT;
    setVars(PALETTES[resolved]);
    document.documentElement.dataset.palette = resolved;
    syncSwatchState(resolved);
    if (persist) {
      try { localStorage.setItem('tw-palette', resolved); } catch (_) {}
    }
  }

  let saved;
  try { saved = localStorage.getItem('tw-palette'); } catch (_) {}
  apply(saved || DEFAULT, false);

  function injectUI() {
    if (document.querySelector('.palette-dock')) return;
    const dock = document.createElement('div');
    dock.className = 'palette-dock';
    dock.setAttribute('role', 'group');
    dock.setAttribute('aria-label', 'Theme');

    const tag = document.createElement('span');
    tag.className = 'palette-dock__tag';
    tag.textContent = 'THEME';
    dock.appendChild(tag);

    for (const [key, p] of Object.entries(PALETTES)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-swatch';
      btn.dataset.palette = key;
      btn.setAttribute('aria-label', p.label + ' theme');
      btn.title = p.label;
      btn.style.setProperty('--sw-bg', p.bg);
      btn.style.setProperty('--sw-accent', p.accent);
      btn.addEventListener('click', () => apply(key, true));
      dock.appendChild(btn);
    }
    document.body.appendChild(dock);
    syncSwatchState(document.documentElement.dataset.palette || DEFAULT);
  }

  /* ── Email deobfuscation ──────────────────────────────
     The address is never in the markup as plain text - it is
     assembled here from data-user / data-domain so harvesters
     scraping static HTML never see it. No-JS shows the
     "[at] / [dot]" fallback baked into the link. */
  function setupEmails() {
    document.querySelectorAll('a.email-link').forEach((a) => {
      const user = a.dataset.user;
      const domain = a.dataset.domain;
      if (!user || !domain) return;
      const addr = user + '@' + domain;
      a.href = 'mailto:' + addr;
      a.textContent = addr;
    });
  }

  /* ── Rotating digression ──────────────────────────────
     Same trick as the ronbronson.dev / .design colophon: one aside
     shown at random per load, never the same one twice in a row.
     Edit / add lines in DIGRESSIONS. */
  function setupDigression() {
    const el = document.getElementById('digression');
    if (!el) return;
    const DIGRESSIONS = [
      'Inexplicably, a Green Bay Packers shareholder.',
      'A longtime tea sommelier. Ask for loose-leaf recs.',
      'Has coached high school tennis for ten years across three states.',
      'Last time he went fishing? 1994.',
      'Once a bar trivia host in Bloomington.',
    ];
    let last = -1;
    try { last = parseInt(sessionStorage.getItem('tw-digression'), 10); } catch (_) {}
    let i = Math.floor(Math.random() * DIGRESSIONS.length);
    while (DIGRESSIONS.length > 1 && i === last) i = Math.floor(Math.random() * DIGRESSIONS.length);
    try { sessionStorage.setItem('tw-digression', i); } catch (_) {}
    el.textContent = DIGRESSIONS[i];
  }

  function onReady() {
    injectUI();
    setupEmails();
    setupDigression();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

  window.TWPalette = {
    apply: (k) => apply(k, true),
    palettes: PALETTES,
    pigments: PIG,
    current: () => document.documentElement.dataset.palette || DEFAULT,
    audit() {
      const rows = {};
      for (const [k, p] of Object.entries(PALETTES)) rows[k] = p._audit;
      if (console.table) console.table(rows);
      return rows;
    },
  };
})();
