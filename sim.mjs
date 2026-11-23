// Headless run of Neon Dodger: replays the real game logic (game.js) with
// the autopilot, one fixed timestep, and writes every frame's state to
// frames.json for the renderer. Day 1 and day 7 run the same seed and the
// same inputs, so the opening moments are identical; day 7 only adds more.
//
// Usage: node sim.mjs <out.json>
// Writes: { day1: [...frames], day7: [...frames] } at 30 fps.

import { writeFileSync } from "node:fs";
import { createGame, step, autopilot, snapshot } from "./game.js";

const FPS = 30;
const DT = 1 / FPS;
// Gameplay windows the video cuts between. Both days start at t = 0.
const DAY1_SECONDS = 8; // hook (2 s) + day-1 play (6 s)
const DAY7_SECONDS = 12; // day-7 play, same start replayed with more in it

function run(day, seconds) {
  const g = createGame(day);
  const frames = [];
  const total = Math.round(seconds * FPS);
  for (let i = 0; i < total; i++) {
    step(g, autopilot(g), DT);
    frames.push(snapshot(g));
    if (g.over) break;
  }
  return frames;
}

const out = process.argv[2] ?? "frames.json";
const day1 = run(1, DAY1_SECONDS);
const day7 = run(7, DAY7_SECONDS);
writeFileSync(out, JSON.stringify({ fps: FPS, day1, day7 }));

const last1 = day1[day1.length - 1];
const last7 = day7[day7.length - 1];
console.log(
  `day1: ${day1.length} frames, score ${last1.score}, dodged ${last1.dodged}, over=${last1.over}`,
);
console.log(
  `day7: ${day7.length} frames, score ${last7.score}, dodged ${last7.dodged}, ` +
    `nearMisses ${last7.nearMisses}, over=${last7.over}`,
);
console.log(`wrote ${out}`);
