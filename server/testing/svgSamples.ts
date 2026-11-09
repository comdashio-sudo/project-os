// Synthetic SVG samples for the logo check (server/projectProfile.ts svgIsUnsafe), shared by the unit test and the database test.
/** The bypasses found in the reviews of #223 and #227, and the shapes the strict rule refuses by construction. */
export const UNSAFE_SVGS: ReadonlyArray<readonly [string, string]> = [
  ["a namespace-prefixed script (SVG namespace)", '<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script></svg>'],
  ["svg:script", '<svg xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"><svg:script>alert(1)</svg:script></svg>'],
  ["an XHTML script", '<svg xmlns="http://www.w3.org/2000/svg"><h:script xmlns:h="http://www.w3.org/1999/xhtml">alert(1)</h:script></svg>'],
  ["a prefixed foreignObject", '<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg"><s:foreignObject width="1" height="1"/></svg>'],
  ["javascript: split by a TAB", '<svg xmlns="http://www.w3.org/2000/svg"><a href="java\tscript:alert(1)"><rect width="1" height="1"/></a></svg>'],
  ["javascript: split by a LF", '<svg xmlns="http://www.w3.org/2000/svg"><a href="java\nscript:alert(1)"><rect width="1" height="1"/></a></svg>'],
  ["javascript: split by a CR", '<svg xmlns="http://www.w3.org/2000/svg"><a href="java\rscript:alert(1)"><rect width="1" height="1"/></a></svg>'],
  ["an animate value with a TAB", '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" values="java\tscript:alert(1)"/></svg>'],
  ["a DOCTYPE with an internal subset and no ENTITY", '<?xml version="1.0"?><!DOCTYPE svg [<!ATTLIST svg x CDATA "y">]><svg xmlns="http://www.w3.org/2000/svg"/>'],
  ["an external PUBLIC DOCTYPE", '<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg"/>'],
  ["an event handler after a newline", '<svg xmlns="http://www.w3.org/2000/svg"\nonload="alert(1)"/>'],
  ["a data: link with spaces", '<svg xmlns="http://www.w3.org/2000/svg"><a href=" da ta:text/html,x"><rect width="1" height="1"/></a></svg>'],
  ["vbscript:", '<svg xmlns="http://www.w3.org/2000/svg"><a href="vb script:x"><rect width="1" height="1"/></a></svg>'],
  ["an unknown prefixed attribute", '<svg xmlns="http://www.w3.org/2000/svg" xmlns:ev="http://www.w3.org/2001/xml-events" ev:event="load"/>'],
  ["an xml-stylesheet processing instruction", '<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="https://evil.example.test/x.xsl"?><svg xmlns="http://www.w3.org/2000/svg"/>'],
  ["an xml-stylesheet as the first line", '<?xml-stylesheet type="text/xsl" href="x.xsl"?><svg xmlns="http://www.w3.org/2000/svg"/>'],
  ["a default namespace that is not SVG (XHTML)", '<svg xmlns="http://www.w3.org/2000/svg"><g xmlns="http://www.w3.org/1999/xhtml"><meta http-equiv="refresh" content="0;url=https://evil.example.test"/><form><input type="password"/></form></g></svg>'],
  ["a set animation of an event attribute", '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"><set attributeName="onclick" to="alert(1)"/></rect></svg>'],
  ["an object element", '<svg xmlns="http://www.w3.org/2000/svg"><object data="x"/></svg>'],
];
/** A plain logo: gradient with objectBoundingBox, a use with xlink:href to a local id, xml:space, the xlink declaration, text and a path. */
export const CLEAN_SVG = '<?xml version="1.0" encoding="UTF-8"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 120 40" width="120" height="40">\n  <defs><linearGradient id="g" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a7"/><stop offset="1" stop-color="#075"/></linearGradient><path id="mark" d="M0 0h20v20H0z"/></defs>\n  <use xlink:href="#mark" fill="url(#g)"/>\n  <text x="28" y="26" xml:space="preserve" font-family="sans-serif" font-size="18">Example</text>\n</svg>';

