// Neon Dodger — pure game logic, no DOM. Shared by the playable game
// (game.html) and the headless simulation (sim.mjs) so the video shows the
// real game, not staged footage. Day 1 is the game as first built; day 7 is
// the same game after a week of daily updates: same map, same start, same
// ship, visibly more going on.
//
// The two days share one base random stream (seed 1337) so the opening
// moments are identical; day 7 adds a second stream (seed 777) for its
// extras, so nothing about the original run changes underneath them.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WORLD = { w: 1080, h: 1920 };

// One config per day. Day 7 keeps every day-1 number and adds on top.
export const DAY_CONFIG = {
  1: {
    label: "DAY 1",
    asteroidEvery: 0.9, // seconds between spawns
    asteroidSpeed: 260, // px per second
    maxAsteroids: 7,
    stars: 70,
    nebula: 0,
    particles: false,
    powerups: false,
    combo: false,
    shield: false,
    speedLines: false,
  },
  7: {
    label: "DAY 7",
    asteroidEvery: 0.45,
    asteroidSpeed: 380,
    maxAsteroids: 16,
    stars: 130,
    nebula: 5,
    particles: true,
    powerups: true,
    combo: true,
    shield: true,
    speedLines: true,
  },
};

export function createGame(day, seed = 1337) {
  const cfg = DAY_CONFIG[day];
  const base = mulberry32(seed);
  const extra = mulberry32(seed + 64000);
  // Decoration has its own stream: the base stream feeds ONLY the shared
  // asteroid spawns, so day 1 and day 7 open identically.
  const decor = mulberry32(seed + 11);
  const stars = [];
  for (let i = 0; i < cfg.stars; i++) {
    stars.push({
      x: decor() * WORLD.w,
      y: decor() * WORLD.h,
      r: 1 + decor() * 2.2,
      tw: decor() * Math.PI * 2,
    });
  }
  const nebula = [];
  for (let i = 0; i < cfg.nebula; i++) {
    nebula.push({
      x: decor() * WORLD.w,
      y: decor() * WORLD.h,
      r: 180 + decor() * 260,
      hue: 265 + decor() * 60,
    });
  }
  return {
    day,
    cfg,
    base,
    extra,
    t: 0,
    score: 0,
    combo: 1,
    comboTimer: 0,
    nearMisses: 0,
    ship: { x: WORLD.w / 2, y: WORLD.h - 320, vx: 0, vy: 0, r: 26, shield: 0 },
    asteroids: [],
    particles: [],
    powerups: [],
    stars,
    nebula,
    spawnIn: 0.4,
    extraSpawnIn: 0.2,
    powerupIn: 6,
    over: false,
    dodged: 0,
  };
}

function spawnAsteroid(g, rng, speed) {
  const r = 26 + rng() * 42;
  // Always draw the kind roll, on both days, so the shared stream stays
  // in step between day 1 and day 7.
  const kindRoll = rng();
  const kind = g.day === 7 && kindRoll < 0.25 ? "spiky" : "rock";
  g.asteroids.push({
    x: 60 + rng() * (WORLD.w - 120),
    y: -80,
    r,
    vy: speed * (0.85 + rng() * 0.5),
    vx: (rng() - 0.5) * 60,
    rot: rng() * Math.PI * 2,
    spin: (rng() - 0.5) * 2.4,
    kind,
  });
}

function spawnPowerup(g) {
  const kind = g.extra() < 0.5 ? "star" : "shield";
  g.powerups.push({
    x: 90 + g.extra() * (WORLD.w - 180),
    y: -40,
    r: 22,
    vy: 200,
    kind,
    pulse: 0,
  });
}

function burst(g, x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = g.extra() * Math.PI * 2;
    const sp = 60 + g.extra() * 220;
    g.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.5 + g.extra() * 0.5,
      max: 1,
      r: 2 + g.extra() * 3,
      color,
    });
  }
}

// Steer toward the safest reachable slot. Deterministic: the same inputs
// replay the same run on both days, so the opening moments match. For each
// candidate x, score the worst clearance against every asteroid that will
// reach the ship's height soon, then prefer the safest slot near the ship.
export function autopilot(g) {
  const ship = g.ship;
  let bestX = WORLD.w / 2;
  let bestScore = -Infinity;
  for (let tx = 60; tx <= WORLD.w - 60; tx += 30) {
    let worst = Infinity;
    for (const a of g.asteroids) {
      if (a.vy <= 0) continue;
      const tHit = (ship.y - a.y) / a.vy;
      if (tHit < 0 || tHit > 2.5) continue;
      const px = a.x + a.vx * tHit;
      // Where the ship will actually be when the rock arrives: it moves
      // toward tx but cannot teleport there.
      const reach = 1100 * tHit;
      const sx =
        tx > ship.x
          ? Math.min(tx, ship.x + reach)
          : Math.max(tx, ship.x - reach);
      const clearance = Math.abs(px - sx) - (a.r * 0.82 + ship.r * 0.82);
      // A rock seconds away is a soft warning, not a veto: the autopilot
      // re-plans every frame, so only the next second is hard. Discount
      // clearance by arrival time so distant rocks cannot veto every slot.
      worst = Math.min(worst, clearance + 150 * tHit);
    }
    // Prefer the safest slot; among safe slots, stay near the ship and
    // near the middle, so the ship never camps against a wall.
    const score = worst - Math.abs(tx - ship.x) * 0.15 - Math.abs(tx - WORLD.w / 2) * 0.2;
    if (score > bestScore) {
      bestScore = score;
      bestX = tx;
    }
  }
  return {
    left: bestX < ship.x - 14,
    right: bestX > ship.x + 14,
    up: false,
    down: false,
  };
}

export function step(g, input, dt) {
  if (g.over) return;
  g.t += dt;
  const ship = g.ship;

  // Ship: snappy thrust with drag, clamped to the playfield.
  const thrust = 2600;
  if (input.left) ship.vx -= thrust * dt;
  if (input.right) ship.vx += thrust * dt;
  if (input.up) ship.vy -= thrust * dt;
  if (input.down) ship.vy += thrust * dt;
  ship.vx *= Math.pow(0.12, dt);
  ship.vy *= Math.pow(0.12, dt);
  ship.x = Math.max(40, Math.min(WORLD.w - 40, ship.x + ship.vx * dt));
  ship.y = Math.max(240, Math.min(WORLD.h - 140, ship.y + ship.vy * dt));
  if (ship.shield > 0) ship.shield -= dt;

  // Engine trail on day 7.
  if (g.cfg.particles && g.extra() < 0.7) {
    g.particles.push({
      x: ship.x + (g.extra() - 0.5) * 14,
      y: ship.y + 30,
      vx: (g.extra() - 0.5) * 40,
      vy: 160 + g.extra() * 120,
      life: 0.4,
      max: 0.4,
      r: 2 + g.extra() * 3,
      color: "#37e6ff",
    });
  }

  // Shared spawns: fixed 0.9 s cadence, drawn from the base stream, so the
  // opening moments are identical on both days. Day 7 adds extra spawns
  // from its own stream in between, never touching the shared ones.
  g.spawnIn -= dt;
  if (g.spawnIn <= 0 && g.asteroids.length < g.cfg.maxAsteroids) {
    // Shared rocks fall at day-1 speed on both days: identical opening.
    spawnAsteroid(g, g.base, 260);
    g.spawnIn = 0.9;
  }
  if (g.day === 7) {
    g.extraSpawnIn -= dt;
    if (g.extraSpawnIn <= 0 && g.asteroids.length < g.cfg.maxAsteroids) {
      // Day-7 extras: faster, spikier, from their own stream.
      spawnAsteroid(g, g.extra, g.cfg.asteroidSpeed);
      g.extraSpawnIn = g.cfg.asteroidEvery;
    }
  }
  if (g.cfg.powerups) {
    g.powerupIn -= dt;
    if (g.powerupIn <= 0) {
      spawnPowerup(g);
      g.powerupIn = 5 + g.extra() * 3;
    }
  }

  // Move everything, count dodges, resolve hits.
  for (const a of g.asteroids) {
    a.y += a.vy * dt;
    a.x += a.vx * dt;
    a.rot += a.spin * dt;
  }
  const before = g.asteroids.length;
  g.asteroids = g.asteroids.filter((a) => a.y - a.r < WORLD.h + 90);
  const cleared = before - g.asteroids.length;
  g.dodged += cleared;
  if (g.cfg.combo && cleared > 0) {
    g.combo = Math.min(5, g.combo + 0.5 * cleared);
    g.comboTimer = 3;
  }
  if (g.comboTimer > 0) {
    g.comboTimer -= dt;
    if (g.comboTimer <= 0) g.combo = 1;
  }

  for (const p of g.powerups) {
    p.y += p.vy * dt;
    p.pulse += dt * 6;
    const dx = p.x - ship.x;
    const dy = p.y - ship.y;
    if (dx * dx + dy * dy < (p.r + ship.r) * (p.r + ship.r)) {
      p.taken = true;
      if (p.kind === "star") {
        g.score += 50;
        if (g.cfg.particles) burst(g, p.x, p.y, "#ffd166", 22);
      } else {
        ship.shield = 4;
        if (g.cfg.particles) burst(g, p.x, p.y, "#37e6ff", 22);
      }
    }
  }
  g.powerups = g.powerups.filter((p) => !p.taken && p.y < WORLD.h + 60);

  for (const pt of g.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
  }
  g.particles = g.particles.filter((pt) => pt.life > 0);

  // Collisions: a shield eats one hit, otherwise the run ends.
  for (const a of g.asteroids) {
    const dx = a.x - ship.x;
    const dy = a.y - ship.y;
    const rr = a.r * 0.82 + ship.r * 0.82;
    if (dx * dx + dy * dy < rr * rr) {
      if (ship.shield > 0) {
        ship.shield = 0;
        a.dead = true;
        if (g.cfg.particles) burst(g, a.x, a.y, "#37e6ff", 26);
      } else {
        g.over = true;
        if (g.cfg.particles) burst(g, ship.x, ship.y, "#ff5d8f", 40);
      }
      break;
    }
    // Near miss: close pass, no touch — the combo fuel on day 7.
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (!a.counted && a.y > ship.y + 10 && dist < a.r + ship.r + 46) {
      a.counted = true;
      g.nearMisses += 1;
      if (g.cfg.combo) g.combo = Math.min(5, g.combo + 0.25);
    }
  }
  g.asteroids = g.asteroids.filter((a) => !a.dead);

  // Score ticks with survival; day 7 multiplies by the combo.
  g.score += dt * 10 * (g.cfg.combo ? g.combo : 1);
}

// Snapshot only what the renderer needs. Plain data, no functions.
export function snapshot(g) {
  return {
    t: +g.t.toFixed(3),
    day: g.day,
    score: Math.floor(g.score),
    combo: +g.combo.toFixed(2),
    dodged: g.dodged,
    nearMisses: g.nearMisses,
    over: g.over,
    ship: { x: +g.ship.x.toFixed(1), y: +g.ship.y.toFixed(1), shield: g.ship.shield > 0 },
    asteroids: g.asteroids.map((a) => ({
      x: +a.x.toFixed(1),
      y: +a.y.toFixed(1),
      r: +a.r.toFixed(1),
      rot: +a.rot.toFixed(2),
      kind: a.kind,
    })),
    particles: g.particles.map((p) => ({
      x: +p.x.toFixed(1),
      y: +p.y.toFixed(1),
      r: +p.r.toFixed(1),
      life: +Math.max(0, p.life / p.max).toFixed(2),
      color: p.color,
    })),
    powerups: g.powerups.map((p) => ({
      x: +p.x.toFixed(1),
      y: +p.y.toFixed(1),
      r: p.r,
      kind: p.kind,
      pulse: +p.pulse.toFixed(2),
    })),
    stars: g.stars,
    nebula: g.nebula,
  };
}
