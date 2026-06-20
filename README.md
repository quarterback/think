# Thinking Weapons

A single-page static site for **Thinking Weapons**, the participatory design
studio of Ron Bronson - a selected list of exhibitions, events, and hands-on
work since 2014.

It is a retrofit of the original post-brutalist "Think" scaffold: the exposed
ruled frames and giant display type are kept, but recoloured into the
ronbronson.dev / ronbronson.design house register - a Bell Labs / IBM
technical-memorandum lens with monospace metadata labels and a serif display
face. Semantic HTML, visible focus styles, skip navigation, and reduced-motion
support are retained.

## Palette

Five fixed pigments, role-mapped and WCAG-audited by `palette.js`, exposed as
two themes via the **THEME** dock (bottom-right) and remembered in
`localStorage`:

| Pigment        | Hex       | Role                              |
| -------------- | --------- | --------------------------------- |
| Snow           | `#fff9fb` | light paper ground                |
| Alabaster Grey | `#d3d4d9` | panel surface / secondary on dark |
| Air Force Blue | `#4b88a2` | decorative hairline / mid surface |
| Blush Rose     | `#d55672` | signal - fills, borders, display  |
| Night Bordeaux | `#481620` | ink ground / dark ground          |

Open the console and call `TWPalette.audit()` to read the contrast ratios each
scheme lands on.

## Files

- `index.html` - single page: masthead, capabilities, about (with photo), and the selected exhibitions/events list.
- `404.html` - studio-styled not-found page.
- `styles.css` - recoloured post-brutalist layout, responsive type, a11y states.
- `palette.js` - WCAG-mapped palette engine + theme dock (runs before paint).

Type is Fontshare-hosted (Zodiak display, Switzer body) - no Google Fonts, in
keeping with the original scaffold; labels and years fall through to the system
monospace stack.

## Deploy

A static site - deploy from GitHub to Vercel or Netlify with no build command.
Use the project root as the publish directory.

## Customize

Edit the studio name, intro, and the `.event` list items in `index.html`. The
list is reverse-chronological (newest first); each entry is a year, a title,
an optional place/context line, and an optional reference link.
