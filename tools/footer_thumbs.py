"""Makes small copies of the images the footer breaks into tiles, so visitors don't download
the full-size originals (hundreds of MB) just to see a 40px square.

Run from the repo root whenever you add project images or footer covers:

    python tools/footer_thumbs.py

It reads projects/manifest.json and resources/footer/fragments.json, writes
resources/footer/thumbs/*.jpg and resources/footer/thumbs.json. Needs Pillow (pip install pillow).
The site works without it, but then the footer downloads the originals.
"""
import hashlib
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOOTER = "resources/footer"
THUMBS = f"{FOOTER}/thumbs"
EDGE = 320
QUALITY = 82


def project_images(manifest):
    projects = manifest if isinstance(manifest, list) else manifest.get("projects", [])
    found = []
    for p in projects:
        if p.get("thumb"):
            found.append(p["thumb"])
        for m in p.get("media", []) or []:
            if m.get("type") == "image" and m.get("src"):
                found.append(m["src"])
            if m.get("type") == "group":
                found += [i["src"] for i in m.get("images", []) if i.get("src")]
    return found


def main():
    os.chdir(ROOT)
    with open("projects/manifest.json", encoding="utf-8") as f:
        sources = project_images(json.load(f))
    fragments_path = f"{FOOTER}/fragments.json"
    if os.path.exists(fragments_path):
        with open(fragments_path, encoding="utf-8") as f:
            frag = json.load(f)
        sources += [f"{FOOTER}/{name}" for name in frag.get("images", [])]

    os.makedirs(THUMBS, exist_ok=True)
    mapping, made, kept, missing = {}, 0, 0, []
    for src in dict.fromkeys(sources):
        path = os.path.normpath(src)
        if not os.path.exists(path):
            missing.append(src)
            continue
        name = hashlib.sha1(src.encode("utf-8")).hexdigest()[:12] + ".jpg"
        out = f"{THUMBS}/{name}"
        if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(path):
            kept += 1
        else:
            try:
                with Image.open(path) as im:
                    im = im.convert("RGBA")
                    flat = Image.new("RGB", im.size, (20, 22, 27))
                    flat.paste(im, mask=im.getchannel("A"))
                    flat.thumbnail((EDGE, EDGE), Image.LANCZOS)
                    flat.save(out, "JPEG", quality=QUALITY, optimize=True, progressive=True)
                made += 1
            except Exception as err:  # a broken image shouldn't stop the rest
                print(f"skipped {src}: {err}")
                continue
        mapping[src] = out

    with open(f"{FOOTER}/thumbs.json", "w", encoding="utf-8") as f:
        json.dump(mapping, f, indent=0)

    size = sum(os.path.getsize(v) for v in mapping.values()) / 1e6
    print(f"{len(mapping)} thumbnails ({made} new, {kept} unchanged), {size:.1f} MB total")
    for m in missing:
        print(f"missing: {m}")


if __name__ == "__main__":
    sys.exit(main())
