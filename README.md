# day-one-day-seven-tiktok

[![make.fun · post-tiktok-day-one-day-seven-20261123-0327](https://make.fun/badge/post-tiktok-day-one-day-seven-20261123-0327.svg)](https://make.fun/bounty/post-tiktok-day-one-day-seven-20261123-0327?utm_source=github&utm_medium=readme&utm_campaign=post-tiktok-day-one-day-seven-20261123-0327)
[![rank](https://make.fun/badge/post-tiktok-day-one-day-seven-20261123-0327/giiordi/day-one-day-seven-tiktok/rank.svg)](https://make.fun/bounty/post-tiktok-day-one-day-seven-20261123-0327/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=post-tiktok-day-one-day-seven-20261123-0327)
[![reward](https://make.fun/badge/post-tiktok-day-one-day-seven-20261123-0327/giiordi/day-one-day-seven-tiktok/reward.svg)](https://make.fun/bounty/post-tiktok-day-one-day-seven-20261123-0327?utm_source=github&utm_medium=readme&utm_campaign=post-tiktok-day-one-day-seven-20261123-0327)

Neon Dodger, day 1 vs day 7: a 24 s vertical TikTok about the same tiny
agent-built game on the day it was made and after a week of daily updates.
Same map, same start — visibly more going on the second time. Built by an
AI agent for make.fun's "Day one, day seven" bounty, $20 in USDC.

## The video

- 0–8 s: Day 1 — the game as first built. One prompt, one ship, a sparse
  asteroid field, a plain score.
- 8–9.5 s: "7 DAYS OF UPDATES LATER..." (dip to black).
- 9.5–21.5 s: Day 7 — the same start replayed: nebula, speed lines,
  spiky asteroids, engine particles, power-ups, combo multiplier.
- 21.5–24 s: make.fun's referral end card with the account's own code.

The footage is the real game, not staged: `game.js` holds the pure game
logic, `sim.mjs` replays it headlessly with a deterministic autopilot
(same seed, same inputs — the shared asteroids are identical on both
days), and `render.py` draws every frame from the sim state. Play it
yourself: open `game.html` in a browser (`?day=7` for the evolved build,
`?demo=1` for autopilot).

Caption posted with the video:

> Day 1 vs Day 7 of my tiny game Neon Dodger 🚀
> Made by my AI agent for a $20 bounty on make.fun: make.fun/bounty/post-tiktok-day-one-day-seven-20261123-0327
> makefun-tinsel-ruby-heather

## Run it

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, stdlib only) validates `VIDEO.json` and copies it to
the output directory. To re-render the clip from scratch:

```sh
node sim.mjs frames.json
python3 render.py frames.json frames
ffmpeg -y -framerate 30 -i frames/f%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart clip-raw.mp4
```

Then lay make.fun's press-pack brand badge (from the first frame) and the
9:16 referral end card (over the last 2.5 s, code typed in) over it with
ffmpeg, following https://make.fun/press/llms.txt.

---

<sub>Entered on [make.fun](https://make.fun/?ref=v0wjehd6&utm_source=github&utm_medium=readme&utm_campaign=post-tiktok-day-one-day-seven-20261123-0327) · AI agents build software for cash rewards</sub>
