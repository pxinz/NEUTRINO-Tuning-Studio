#!/usr/bin/env python3
"""Package a macOS .app into a zip that preserves symlinks and executable bits.

Usage: package-macos-zip.py <app-path> <output.zip> [extra-files...]
"""
import os
import stat
import sys
import time
import zipfile


def add(zf: zipfile.ZipFile, src: str, arcname: str, force_mode: int | None = None) -> None:
    st = os.lstat(src)
    arcname = arcname.replace(os.sep, "/")
    if stat.S_ISLNK(st.st_mode):
        zi = zipfile.ZipInfo(arcname)
        zi.create_system = 3
        zi.external_attr = (stat.S_IFLNK | 0o777) << 16
        zi.date_time = time.localtime(st.st_mtime)[:6]
        zf.writestr(zi, os.readlink(src))
    elif stat.S_ISDIR(st.st_mode):
        zi = zipfile.ZipInfo(arcname.rstrip("/") + "/")
        zi.create_system = 3
        zi.external_attr = (st.st_mode & 0xFFFF) << 16
        zi.date_time = time.localtime(st.st_mtime)[:6]
        zf.writestr(zi, b"")
    elif stat.S_ISREG(st.st_mode):
        zi = zipfile.ZipInfo(arcname)
        zi.create_system = 3
        mode = force_mode if force_mode is not None else (st.st_mode & 0xFFFF)
        zi.external_attr = mode << 16
        zi.date_time = time.localtime(st.st_mtime)[:6]
        zi.compress_type = zipfile.ZIP_DEFLATED
        with open(src, "rb") as fh:
            zf.writestr(zi, fh.read())


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("usage: package-macos-zip.py <app> <out.zip> [extra ...]")
    app = sys.argv[1].rstrip("/")
    out = sys.argv[2]
    extras = sys.argv[3:]
    app_name = os.path.basename(app)
    with zipfile.ZipFile(out, "w", allowZip64=True) as zf:
        for root, dirs, files in os.walk(app):
            dirs.sort()
            rel = os.path.relpath(root, os.path.dirname(app))
            add(zf, root, rel)
            for name in sorted(dirs):
                src = os.path.join(root, name)
                # os.walk doesn't descend into symlinked dirs, but the dir
                # symlinks themselves are part of a macOS framework bundle.
                if os.path.islink(src):
                    add(zf, src, os.path.join(rel, name))
            for name in sorted(files):
                src = os.path.join(root, name)
                add(zf, src, os.path.join(rel, name))
        for extra in extras:
            arcname = os.path.basename(extra)
            mode = 0o755 if extra.endswith(".command") else None
            add(zf, extra, arcname, force_mode=mode)
    print(f"{out} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main()
