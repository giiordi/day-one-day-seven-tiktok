#!/usr/bin/env python3
"""Render the Day 1 vs Day 7 video frames from the headless game sim.

Reads frames.json (sim.mjs output) and draws every frame of the 24 s clip
at 1080x1920, 30 fps, with PIL. Timeline:

  0.0- 8.0 s  DAY 1 gameplay (sim day1 frames 0-239)
               hook text over the first 2 s: "DAY 1" / "I built this game
               in one prompt."
  8.0- 9.5 s  transition: day 1 crossfades into day 7,
               "7 DAYS OF UPDATES LATER..."
  9.5-21.5 s  DAY 7 gameplay (sim day7 frames 0-359): the same start,
               visibly more going on. Close text over the last 3 s:
               "DAY 7. SAME GAME." / "Start yours at make.fun"
 21.5-24.0 s  held last frame; the referral end card is laid over this
               stretch by ffmpeg afterwards (see assemble step).

The brand badge and the end card are NOT drawn here: ffmpeg overlays the
press pack's own files, unmodified, in the assemble step.

Usage: python3 render.py <frames.json> <out-dir>
"""

import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
FPS = 30
TOTAL_SECONDS = 24
TOTAL_FRAMES = TOTAL_SECONDS * FPS

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

INK = (11, 11, 30)
WHITE = (255, 255, 255)
CYAN = (55, 230, 255)
PINK = (255, 93, 143)
GOLD = (255, 209, 102)
PURPLE = (138, 92, 255)
GREY = (91, 84, 112)


def font(path, size):
    return ImageFont.truetype(path, size)


def text_center(draw, cx, y, s, fnt, fill, stroke=0, stroke_fill=(0, 0, 0)):
    bbox = draw.textbbox((0, 0), s, font=fnt)
    w = bbox[2] - bbox[0]
    draw.text((cx - w / 2 - bbox[0], y - bbox[1]), s, font=fnt, fill=fill,
              stroke_width=stroke, stroke_fill=stroke_fill)


def wrap_text(draw, s, fnt, max_w):
    """Greedy word wrap; returns list of lines that fit max_w."""
    words = s.split()
    lines, cur = [], ""
    for word in words:
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def fade_in(t, start, dur):
    return max(0.0, min(1.0, (t - start) / dur))


def ease_out(t):
    return 1 - (1 - t) * (1 - t)


def draw_nebula_bg(day_frame):
    """Static backdrop for one day: ink + nebula blobs + (stars drawn per frame)."""
    img = Image.new("RGB", (W, H), INK)
    if day_frame["nebula"]:
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        for n in day_frame["nebula"]:
            hue = n["hue"]
            # Approximate a radial glow with nested translucent discs.
            base = (int(120 + 60 * math.sin(hue)), 70, 200)
            for k in range(5, 0, -1):
                r = n["r"] * k / 5
                alpha = 14 + 10 * (5 - k)
                ld.ellipse([n["x"] - r, n["y"] - r, n["x"] + r, n["y"] + r],
                           fill=base + (alpha,))
        img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
    return img


def draw_gameplay(img, frame, t):
    d = ImageDraw.Draw(img, "RGBA")
    # Twinkling stars.
    for st in frame["stars"]:
        a = 0.35 + 0.65 * abs(math.sin(t * 2 + st["tw"]))
        v = int(255 * a)
        d.ellipse([st["x"] - st["r"], st["y"] - st["r"],
                   st["x"] + st["r"], st["y"] + st["r"]], fill=(v, v, v, 255))
    # Speed lines on day 7.
    if frame["day"] == 7:
        for i in range(12):
            x = (i * 173 + t * 900) % 1080
            y = (i * 311) % 1920
            d.line([x, y, x, y + 90], fill=(120, 220, 255, 64), width=3)
    # Power-ups.
    for p in frame["powerups"]:
        pulse = 1 + 0.15 * math.sin(p["pulse"])
        r = p["r"] * pulse
        col = GOLD if p["kind"] == "star" else CYAN
        d.ellipse([p["x"] - r, p["y"] - r, p["x"] + r, p["y"] + r], fill=col + (255,))
        d.text((p["x"], p["y"]), "+" if p["kind"] == "star" else "S",
               font=font(FONT_BOLD, 26), fill=INK + (255,), anchor="mm")
    # Asteroids: spiky or rocky polygons, rotated.
    for a in frame["asteroids"]:
        spikes = 9 if a["kind"] == "spiky" else 7
        pts = []
        for i in range(spikes * 2 + 1):
            ang = a["rot"] + (i / (spikes * 2)) * math.pi * 2
            rr = a["r"] * (1 if i % 2 == 0 else 0.72)
            pts.append((a["x"] + math.cos(ang) * rr, a["y"] + math.sin(ang) * rr))
        col = PURPLE if a["kind"] == "spiky" else GREY
        d.polygon(pts, fill=col + (255,))
        d.ellipse([a["x"] - a["r"] * 0.6, a["y"] - a["r"] * 0.65,
                   a["x"] + a["r"] * 0.1, a["y"] - a["r"] * 0.05],
                  fill=(255, 255, 255, 46))
    # Particles.
    for p in frame["particles"]:
        col = tuple(int(p["color"][i:i + 2], 16) for i in (1, 3, 5))
        d.ellipse([p["x"] - p["r"], p["y"] - p["r"],
                   p["x"] + p["r"], p["y"] + p["r"]],
                  fill=col + (int(255 * p["life"]),))
    # Ship: neon dart, shield ring when shielded.
    sh = frame["ship"]
    if sh["shield"]:
        d.ellipse([sh["x"] - 52, sh["y"] - 52, sh["x"] + 52, sh["y"] + 52],
                  outline=CYAN + (220,), width=5)
    d.polygon([(sh["x"], sh["y"] - 38), (sh["x"] + 26, sh["y"] + 26),
               (sh["x"], sh["y"] + 12), (sh["x"] - 26, sh["y"] + 26)],
              fill=CYAN + (255,))
    d.ellipse([sh["x"] - 9, sh["y"] - 15, sh["x"] + 9, sh["y"] + 3],
              fill=PINK + (255,))
    # HUD: day label left, score right, combo under the score.
    d.rectangle([0, 0, W, 150], fill=INK + (140,))
    f_day = font(FONT_BOLD, 64)
    f_score = font(FONT_BOLD, 64)
    d.text((48, 96), f"DAY {frame['day']}", font=f_day, fill=WHITE + (255,),
           anchor="lm")
    d.text((W - 48, 96), str(frame["score"]), font=f_score, fill=WHITE + (255,),
           anchor="rm")
    if frame["day"] == 7:
        d.text((W - 48, 140), f"COMBO x{frame['combo']:.1f}",
               font=font(FONT_BOLD, 34), fill=GOLD + (255,), anchor="rm")
    if frame["over"]:
        d.rectangle([0, 0, W, H], fill=INK + (184,))
        text_center(d, W / 2, 900, "GAME OVER", font(FONT_BOLD, 96), WHITE)
        text_center(d, W / 2, 1020,
                    f"Score {frame['score']}  ·  Dodged {frame['dodged']}",
                    font(FONT_BOLD, 48), WHITE)
    return d


def overlay_text_block(img, lines, y0, size, fill, gap=12, alpha=255,
                       stroke=6):
    d = ImageDraw.Draw(img, "RGBA")
    fnt = font(FONT_BOLD, size)
    y = y0
    for line in lines:
        bbox = d.textbbox((0, 0), line, font=fnt)
        w = bbox[2] - bbox[0]
        d.text((W / 2 - w / 2 - bbox[0], y - bbox[1]), line, font=fnt,
               fill=fill + (alpha,), stroke_width=stroke,
               stroke_fill=(0, 0, 0, alpha))
        y += (bbox[3] - bbox[1]) + gap
    return d


def main():
    frames_path, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    with open(frames_path) as fh:
        data = json.load(fh)
    day1, day7 = data["day1"], data["day7"]
    fps = data["fps"]

    bg1 = draw_nebula_bg(day1[0])
    bg7 = draw_nebula_bg(day7[0])
    f_big = font(FONT_BOLD, 210)
    f_med = font(FONT_BOLD, 84)
    f_sub = font(FONT_BOLD, 62)

    for i in range(TOTAL_FRAMES):
        t = i / fps
        if t < 8.0:
            frame = day1[min(i, len(day1) - 1)]
            img = bg1.copy()
            draw_gameplay(img, frame, t)
            if t < 2.0:
                a = fade_in(t, 0.05, 0.25)
                rise = (1 - ease_out(a)) * 120
                overlay_text_block(img, ["DAY 1"], 620 + rise, 210, WHITE,
                                   alpha=int(255 * a))
                sub = wrap_text(ImageDraw.Draw(img), "I built this game in one prompt.",
                                f_sub, W - 120)
                overlay_text_block(img, sub, 900 + rise, 62, GOLD,
                                   alpha=int(255 * a))
        elif t < 9.5:
            # Transition: dip to black so the two ships never ghost over
            # each other, then rise into day 7.
            k = (t - 8.0) / 1.5
            f1, f7 = day1[-1], day7[0]
            img1 = bg1.copy()
            draw_gameplay(img1, f1, 8.0)
            img7 = bg7.copy()
            draw_gameplay(img7, f7, 0.0)
            black = Image.new("RGB", (W, H), (0, 0, 0))
            if k < 0.5:
                img = Image.blend(img1, black, ease_out(k * 2))
            else:
                img = Image.blend(black, img7, ease_out((k - 0.5) * 2))
            a = fade_in(t, 8.15, 0.3)
            overlay_text_block(img, ["7 DAYS OF", "UPDATES LATER..."], 780, 84,
                               WHITE, alpha=int(255 * a))
        else:
            j = min(int((t - 9.5) * fps), len(day7) - 1)
            frame = day7[j]
            img = bg7.copy()
            draw_gameplay(img, frame, t)
            if t >= 18.5:
                a = fade_in(t, 18.5, 0.3)
                rise = (1 - ease_out(a)) * 100
                overlay_text_block(img, ["DAY 7.", "SAME GAME."], 560 + rise, 110,
                                   WHITE, alpha=int(255 * a))
                overlay_text_block(img, ["Start yours at make.fun"], 980 + rise,
                                   62, CYAN, alpha=int(255 * a))
        img.save(os.path.join(out_dir, f"f{i:04d}.png"))
        if i % 120 == 0:
            print(f"frame {i}/{TOTAL_FRAMES}", flush=True)
    print(f"rendered {TOTAL_FRAMES} frames to {out_dir}")


if __name__ == "__main__":
    main()
