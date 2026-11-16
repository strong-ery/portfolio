"""Shrinks the site's images for the web. Run from the repo root:

    python tools/optimize_images.py            # do it
    python tools/optimize_images.py --dry-run  # just report what it would do

What it does to everything under resources/ (except resources/footer, which has its own tool):
  * GIF  -> animated WebP at 25 fps. A 55 MB GIF becomes about 4 MB and looks the same.
  * PNG over 400 KB -> WebP (high quality; lossless if it uses transparency).
  * JPG / WebP over 400 KB or wider than 2200 px -> resized and recompressed in place.
References in the manifests, HTML, JS and CSS are rewritten to the new file names.
Originals are moved (not deleted) into ../portfolio-originals/ next to the repo, so nothing is lost.
Needs Pillow (pip install pillow) and ffmpeg on the PATH for the GIFs.
"""
import os
import shutil
import subprocess
import sys

from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUP = os.path.join(os.path.dirname(ROOT), "portfolio-originals")
BIG = 400 * 1024
MAX_EDGE = 2200
TEXT_EXT = {".html", ".json", ".js", ".css", ".md"}
DRY = "--dry-run" in sys.argv


def posix(path):
    return path.replace(os.sep, "/")


def backup(path):
    dest = os.path.join(BACKUP, os.path.relpath(path, ROOT))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy2(path, dest)


def gif_to_webp(path, out):
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path, "-vf", "fps=25",
           "-c:v", "libwebp_anim", "-lossless", "0", "-quality", "68", "-compression_level", "6",
           "-loop", "0", "-an", out]
    subprocess.run(cmd, check=True)


def png_to_webp(path, out):
    with Image.open(path) as im:
        has_alpha = im.mode in ("RGBA", "LA") and im.getchannel("A").getextrema()[0] < 255
        if im.width > MAX_EDGE or im.height > MAX_EDGE:
            im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
        if has_alpha:
            im.save(out, "WEBP", lossless=True, quality=90, method=6)
        else:
            im.convert("RGB").save(out, "WEBP", quality=90, method=6)


def recompress(path):
    """Resize/recompress in place. Returns the bytes saved (0 if it wasn't worth it)."""
    before = os.path.getsize(path)
    ext = os.path.splitext(path)[1].lower()
    with Image.open(path) as im:
        im.load()
        resized = im.width > MAX_EDGE or im.height > MAX_EDGE
        if resized:
            im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
        tmp = path + ".tmp"
        if ext in (".jpg", ".jpeg"):
            im.convert("RGB").save(tmp, "JPEG", quality=84, optimize=True, progressive=True)
        else:
            im.save(tmp, "WEBP", quality=82, method=6)
    after = os.path.getsize(tmp)
    if after < before * 0.85 or resized:
        os.replace(tmp, path)
        return before - after
    os.remove(tmp)
    return 0


def main():
    os.chdir(ROOT)
    renames = {}
    saved = 0
    for folder, _, files in os.walk("resources"):
        if "footer" in folder.replace("\\", "/").split("/"):
            continue
        for name in files:
            path = os.path.join(folder, name)
            stem, ext = os.path.splitext(name)
            ext = ext.lower()
            size = os.path.getsize(path)
            if ext == ".gif":
                out = os.path.join(folder, stem + ".webp")
                if os.path.exists(out):
                    print(f"skip (target exists): {path}")
                    continue
                print(f"gif -> webp  {path}  {size / 1e6:.1f} MB")
                if not DRY:
                    gif_to_webp(path, out)
                    saved += size - os.path.getsize(out)
                    backup(path)
                    os.remove(path)
                    renames[posix(path)] = posix(out)
            elif ext == ".png" and size > BIG:
                out = os.path.join(folder, stem + ".webp")
                if os.path.exists(out):
                    print(f"skip (target exists): {path}")
                    continue
                print(f"png -> webp  {path}  {size / 1e6:.1f} MB")
                if not DRY:
                    png_to_webp(path, out)
                    saved += size - os.path.getsize(out)
                    backup(path)
                    os.remove(path)
                    renames[posix(path)] = posix(out)
            elif ext in (".jpg", ".jpeg", ".webp"):
                try:
                    with Image.open(path) as im:
                        wide = max(im.size) > MAX_EDGE
                except Exception:
                    continue
                if size > BIG or wide:
                    print(f"recompress   {path}  {size / 1e6:.2f} MB")
                    if not DRY:
                        backup(path)
                        saved += recompress(path)

    if renames:
        for folder, _, files in os.walk("."):
            parts = posix(folder).split("/")
            if any(p in (".git", "temp", "node_modules", "resources") for p in parts):
                continue
            for name in files:
                if os.path.splitext(name)[1].lower() not in TEXT_EXT:
                    continue
                path = os.path.join(folder, name)
                with open(path, encoding="utf-8") as f:
                    text = f.read()
                new = text
                for old, to in renames.items():
                    new = new.replace(old, to)
                if new != text:
                    with open(path, "w", encoding="utf-8") as f:
                        f.write(new)
                    print(f"updated references in {posix(path)}")

    print(f"saved about {saved / 1e6:.0f} MB" + (" (dry run, nothing changed)" if DRY else ""))
    if not DRY:
        print("Now run: python tools/footer_thumbs.py")


if __name__ == "__main__":
    main()
