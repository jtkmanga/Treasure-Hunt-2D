#!/usr/bin/env python3
"""Build Forest V8 as one real playable HTML file for file:// mobile browsers.
Uses the original source modules unchanged; no external network, payments or CDN.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "forest-v8"
DST = ROOT / "build" / "Treasure-Hunt-2D-Forest-V8-Playable.html"

modules = ("scenic-details.mjs", "pixel-art.mjs", "cohesive-world.mjs", "forest-engine.mjs")

def transform(source):
    def imports(match):
        names, filename = match.groups()
        if "/" in filename.replace("./", "") or filename not in ["./"+m for m in modules]:
            raise ValueError("Unexpected source module: " + filename)
        return "const {" + re.sub(r"\\s+as\\s+", ": ", names) + '} = __forestV8Modules["' + filename + '"];'
    source, count = re.subn(r'^\s*import\s*\{([^}]+)\}\s*from\s*["\']([^"\']+)["\'];\s*$',
                            imports, source, flags=re.M)
    if re.search(r"(?m)^\s*import\b", source):
        raise ValueError("Unbundled import remains")
    names = re.findall(r"(?m)^\s*export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$]\w*)", source)
    source = re.sub(r"(?m)^(\s*)export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)", r"\1", source)
    if re.search(r"(?m)^\s*export\b", source):
        raise ValueError("Unbundled export remains")
    return source, names

parts = ['"use strict";','const __forestV8Modules = Object.create(null);']
for module in modules:
    js, exports = transform((SRC / module).read_text(encoding="utf8"))
    if not exports:
        raise ValueError("No named exports in " + module)
    parts.append('__forestV8Modules["./' + module + '"]=(function(){\n'
                 + js + '\nreturn {' + ",".join(exports) + '};\n})();')
main, exports = transform((SRC / "main.mjs").read_text(encoding="utf8"))
if exports:
    raise ValueError("Unexpected main export")
parts.append(main)
bundle = "\n".join(parts)
if re.search(r"\bimport\s+.*\bfrom\b", bundle):
    raise ValueError("Import left in offline bundle")
# Check in case source ever acquires closing script marker.
bundle = re.sub(r"</script", r"<\\/script", bundle, flags=re.I)
html = (SRC / "index.html").read_text(encoding="utf8")
needle = '<script type="module" src="./main.mjs"></script>'
if html.count(needle) != 1:
    raise ValueError("Expected one module script")
html = html.replace(needle, "<script>\n" + bundle + "\n</script>")
DST.parent.mkdir(parents=True, exist_ok=True)
DST.write_text(html, encoding="utf8")
(ROOT / "build" / "forest-v8-bundle-check.js").write_text(bundle, encoding="utf8")
print("Prepared", DST, DST.stat().st_size, "bytes; inline JS", len(bundle), "bytes")
