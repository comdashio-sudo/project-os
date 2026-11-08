"""Outline the "Dashio" wordmark of design direction A into one SVG path (D-37).

The brand SVGs in client/public/brand must not depend on a font, so the word is
shaped once with HarfBuzz (kerning on) from Inter Variable at wght 650 with
-0.02em tracking, exactly as client/src/components/ds/Logo.tsx sets it, and the
glyph outlines are written as path data. Run only when the wordmark changes:

  python3 -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools brotli uharfbuzz
  /tmp/ft/bin/python scripts/brand/wordmark-paths.py \
      node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2

With a second argument (client/public/brand) it writes logo-horizontal.svg and
logo-horizontal-on-dark.svg there; without it, it prints the path as JSON.
Layout (designer brief, D-37): the 40x40 symbol, a gap of 0.35 x its height, then
"Dashio" alone at font-size 0.62 x the symbol, its cap height centred on the symbol.
Colours are literal because a standalone SVG cannot read the CSS variables; they
are the direction A values of client/src/design/directions.css.
"""
import io, json, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import uharfbuzz as hb

WORD, WEIGHT, TRACKING_EM = "Dashio", 650, -0.02

font = TTFont(sys.argv[1])
font.flavor = None
instantiateVariableFont(font, {"wght": WEIGHT}, inplace=True)
buf = io.BytesIO(); font.save(buf); data = buf.getvalue()

upem = font["head"].unitsPerEm
face = hb.Face(data); hbfont = hb.Font(face)
b = hb.Buffer(); b.add_str(WORD); b.guess_segment_properties()
hb.shape(hbfont, b, {"kern": True, "liga": True})

glyphs = font.getGlyphSet(); order = font.getGlyphOrder()
pen = SVGPathPen(glyphs, ntos=lambda v: ("%.2f" % v).rstrip("0").rstrip("."))
x = 0.0; track = TRACKING_EM * upem; scale = 1000 / upem
for info, pos in zip(b.glyph_infos, b.glyph_positions):
    name = order[info.codepoint]
    # flip y (font units go up, SVG goes down) and scale to 1000 units per em
    glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, (x + pos.x_offset) * scale, -pos.y_offset * scale)))
    x += pos.x_advance + track
width = (x - track) * scale  # no tracking after the last letter
if len(sys.argv) < 3: print(json.dumps({"d": pen.getCommands(), "width": round(width, 2), "capHeight": font["OS/2"].sCapHeight * scale}))

SYMBOL = (
    '<rect width="40" height="40" rx="10" fill="{primary}"/>'
    '<path d="M13 11v18" stroke="{fg}" stroke-width="4.2" stroke-linecap="round"/>'
    '<path d="M13 11h5.5a9 9 0 0 1 0 18H13" fill="none" stroke="{fg}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>'
    '<rect x="22" y="23" width="9" height="3.6" rx="1.8" fill="{secondary}"/>'
)
THEMES = {
    "logo-horizontal.svg": dict(primary="#4338ca", fg="#ffffff", secondary="#2ed3c6", word="#0c1023"),
    "logo-horizontal-on-dark.svg": dict(primary="#9a97f7", fg="#0a0e1e", secondary="#2ed3c6", word="#e6eaf6"),
}
if len(sys.argv) > 2:
    size, gap = 40, 0.35 * 40
    s_ = 0.62 * size / 1000
    cap = font["OS/2"].sCapHeight * scale * s_
    baseline = size / 2 + cap / 2
    total = round(size + gap + width * s_, 2)
    for file, c in THEMES.items():
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total:g} {size}" width="{total:g}" height="{size}" role="img" aria-label="Dashio">'
               f'<title>Dashio</title>{SYMBOL.format(**c)}'
               f'<path transform="translate({size + gap:g} {baseline:.2f}) scale({s_:g})" fill="{c["word"]}" d="{pen.getCommands()}"/></svg>\n')
        open(f"{sys.argv[2]}/{file}", "w").write(svg)
