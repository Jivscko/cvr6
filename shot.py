#!/usr/bin/env python3
"""Cover Snap screenshot + end-to-end test rig.

Serves app/ with python3 -m http.server, drives the real UI in headless
Chromium (Playwright): loads the sample photos through the file input, edits
the caption, drags/zooms a panel, switches layouts and sizes, and captures the
actual exported PNGs via the download link. Writes 4 screenshots into
screenshots/ (first by name = the exported cover) and enforces the dossier
limits with Pillow: <= 262144 bytes each, long side <= 1280, short side >= 480.
Also asserts the app stays offline: every request must hit the local server.

Run: python3 shot.py
"""

import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
APP = ROOT / "app"
SHOTS = ROOT / "screenshots"
CHROME = Path("/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome")
PORT = 8765
MAX_BYTES = 262144
MAX_LONG = 1280
MIN_SHORT = 480


def wait_for_server(port: int, timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("http.server did not come up")


def stop_server(server: subprocess.Popen) -> None:
    server.terminate()
    try:
        server.wait(timeout=5)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait(timeout=5)


def canvas_fingerprint(page) -> str:
    return page.evaluate("document.getElementById('preview-canvas').toDataURL()")


def enforce_limits(path: Path) -> tuple[int, int, int]:
    """Resize/recompress a PNG until it fits the dossier caps; return (w, h, bytes)."""
    image = Image.open(path).convert("RGB")
    long_side = max(image.size)
    if long_side > MAX_LONG:
        ratio = MAX_LONG / long_side
        image = image.resize((round(image.width * ratio), round(image.height * ratio)), Image.Resampling.LANCZOS)
    if min(image.size) < MIN_SHORT:
        raise RuntimeError(f"{path.name}: short side {min(image.size)} < {MIN_SHORT}")

    attempts = [(1.0, None), (1.0, 256), (1.0, 128), (0.9, 256), (0.85, 192), (0.8, 128)]
    for scale, colors in attempts:
        candidate = image
        if scale != 1.0:
            candidate = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
            if min(candidate.size) < MIN_SHORT:
                continue
        if colors is not None:
            candidate = candidate.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
        candidate.save(path, format="PNG", optimize=True)
        size = path.stat().st_size
        if size <= MAX_BYTES:
            return candidate.width, candidate.height, size
    raise RuntimeError(f"{path.name}: cannot fit under {MAX_BYTES} bytes")


def main() -> int:
    SHOTS.mkdir(exist_ok=True)
    for old in SHOTS.iterdir():
        if old.is_file():
            old.unlink()

    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1", "--directory", str(APP)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    console_errors: list[str] = []
    offsite_requests: list[str] = []
    checks: list[str] = []
    local_origin = f"http://127.0.0.1:{PORT}"

    def check(name: str, ok: bool) -> None:
        checks.append(f"{'PASS' if ok else 'FAIL'}  {name}")
        if not ok:
            raise AssertionError(name)

    def on_request(request) -> None:
        url = request.url
        if url.startswith(("http://", "https://")) and not url.startswith(local_origin):
            offsite_requests.append(url)

    try:
        wait_for_server(PORT)
        with tempfile.TemporaryDirectory() as tmp:
            raw_wide = Path(tmp) / "wide.png"
            raw_portrait = Path(tmp) / "portrait.png"
            with sync_playwright() as pw:
                launch_args = ["--force-color-profile=srgb", "--disable-lcd-text", "--font-render-hinting=none"]
                if CHROME.is_file():
                    browser = pw.chromium.launch(executable_path=str(CHROME), headless=True, args=launch_args)
                else:
                    browser = pw.chromium.launch(headless=True, args=launch_args)
                page = browser.new_page(
                    viewport={"width": 1280, "height": 800},
                    device_scale_factor=1,
                    accept_downloads=True,
                )
                page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
                page.on("pageerror", lambda err: console_errors.append(str(err)))
                page.on("request", on_request)

                page.goto(f"{local_origin}/", wait_until="load")
                page.wait_for_function("window.__coverSnapReady === true", timeout=15000)
                check("page boots with fonts ready", True)

                # Load both sample photos through the real file input.
                page.set_input_files(
                    "#photo-input",
                    [str(APP / "samples" / "boulevard.jpg"), str(APP / "samples" / "pier.jpg")],
                )
                page.wait_for_function("document.querySelectorAll('#photo-library .photo-item').length === 2")
                page.click("#spread-photos")
                page.wait_for_timeout(300)
                check("samples load via file input and spread across panels", True)
                check("preview canvas rendered", len(canvas_fingerprint(page)) > 20000)

                # UI screenshot: grid layout, default caption, photos loaded.
                page.screenshot(path=str(SHOTS / "2-editor.png"))

                # Drag panel 1 to reposition, then wheel-zoom it.
                box = page.locator("#preview-canvas").bounding_box()
                assert box is not None, "preview canvas has no bounding box"
                before_drag = canvas_fingerprint(page)
                px, py = box["x"] + box["width"] * 0.25, box["y"] + box["height"] * 0.25
                page.mouse.move(px, py)
                page.mouse.down()
                page.mouse.move(px + 40, py + 25, steps=8)
                page.mouse.up()
                page.wait_for_timeout(150)
                check("drag repositions a panel", canvas_fingerprint(page) != before_drag)

                page.mouse.move(px, py)
                page.mouse.wheel(0, -240)
                page.wait_for_timeout(150)
                zoom_text = page.text_content("#zoom-value")
                check("wheel zooms the panel", zoom_text != "100%")
                page.click("#reset-panel")
                page.wait_for_timeout(100)
                check("reset framing restores 100%", page.text_content("#zoom-value") == "100%")

                # Live caption edit changes the render.
                before_caption = canvas_fingerprint(page)
                page.fill("#caption-input", "SUNSET HEIST")
                page.wait_for_timeout(150)
                check("caption edits render live", canvas_fingerprint(page) != before_caption)

                # Portrait export: strips layout, 1080x1350.
                page.click('[data-layout="strips"]')
                page.click('[data-size="portrait"]')
                page.wait_for_timeout(200)
                with page.expect_download() as download_info:
                    page.click("#export-button")
                download_info.value.save_as(str(raw_portrait))
                check(
                    "portrait download named cover-snap-*.png",
                    download_info.value.suggested_filename.startswith("cover-snap-")
                    and download_info.value.suggested_filename.endswith(".png"),
                )
                with Image.open(raw_portrait) as im:
                    check("portrait export is 1080x1350 PNG", im.size == (1080, 1350) and im.format == "PNG")
                check("download link offered", page.locator("#download-link").is_visible())

                # Second UI screenshot: hero layout, square, new caption.
                page.click('[data-layout="hero"]')
                page.click('[data-size="square"]')
                page.fill("#caption-input", "NEON HEAT")
                page.wait_for_timeout(250)
                page.screenshot(path=str(SHOTS / "4-editor-hero.png"))

                # Wide export for the cover: grid layout, 1920x1080, VICE NIGHTS.
                page.click('[data-layout="grid"]')
                page.click('[data-size="wide"]')
                page.fill("#caption-input", "VICE NIGHTS")
                page.wait_for_timeout(250)
                with page.expect_download() as download_info:
                    page.click("#export-button")
                download_info.value.save_as(str(raw_wide))
                with Image.open(raw_wide) as im:
                    check("wide export is 1920x1080 PNG", im.size == (1920, 1080) and im.format == "PNG")

                check("no console or page errors", not console_errors)
                check("app stayed offline (all requests local)", not offsite_requests)
                browser.close()

            # The cover: the real 1920x1080 export, scaled to 1280x720.
            with Image.open(raw_wide) as im:
                im.resize((1280, 720), Image.Resampling.LANCZOS).save(SHOTS / "1-cover.png", format="PNG", optimize=True)
            with Image.open(raw_portrait) as im:
                im.resize((1024, 1280), Image.Resampling.LANCZOS).save(SHOTS / "3-cover-portrait.png", format="PNG", optimize=True)
    finally:
        stop_server(server)

    print("End-to-end checks:")
    for line in checks:
        print(" ", line)
    if console_errors:
        print("Console errors:")
        for line in console_errors:
            print("  ", line)
    if offsite_requests:
        print("Off-site requests:")
        for line in offsite_requests:
            print("  ", line)

    print("Screenshots:")
    ok = True
    for path in sorted(SHOTS.iterdir()):
        width, height, size = enforce_limits(path)
        fits = size <= MAX_BYTES and max(width, height) <= MAX_LONG and min(width, height) >= MIN_SHORT
        ok = ok and fits
        print(f"  {path.name}: {width}x{height}, {size} bytes {'OK' if fits else 'OVER LIMIT'}")
    return 0 if ok and not console_errors and not offsite_requests else 1


if __name__ == "__main__":
    sys.exit(main())
