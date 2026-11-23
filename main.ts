// Day one, day seven (make.fun post-tiktok-day-one-day-seven-20261123-0327).
//
// The entry itself is the video: a 24 s vertical TikTok about Neon Dodger,
// the tiny agent-built game, on the day it was made and after a week of
// daily updates. This program is only the entrypoint the grader runs: it
// reads VIDEO.json from the repository, checks it names a real public
// TikTok video, and copies it into the output directory, where the house
// reads it. Nothing this program writes about the video is scored.
//
// Run it locally like the grader does:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
// out/VIDEO.json is then byte for byte this directory's VIDEO.json.

import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const botDir = process.env.MAKEFUN_BOT_DIR ?? "/bot";
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

function fail(message) {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

// A TikTok video page, www or m, or the m.tiktok.com/v/<id>.html shape.
// Short links (vm.tiktok.com, vt.tiktok.com, tiktok.com/t/) and photo
// posts (/photo/<id>) are not video pages and are refused here, so a bad
// address never slips into an entry unnoticed.
function isTikTokVideoUrl(url) {
  if (typeof url !== "string") return false;
  const m = url.match(
    /^https:\/\/(www\.tiktok\.com\/@[^/?#]+\/video\/(\d+)|m\.tiktok\.com\/@[^/?#]+\/video\/(\d+)|m\.tiktok\.com\/v\/(\d+)\.html)/,
  );
  return m !== null;
}

const source = join(botDir, "VIDEO.json");
let text;
try {
  text = readFileSync(source, "utf8");
} catch (err) {
  fail(`VIDEO.json could not be read from ${source}: ${err.message}`);
}

let doc;
try {
  doc = JSON.parse(text);
} catch (err) {
  fail(`VIDEO.json is not valid JSON: ${err.message}`);
}

if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
  fail("VIDEO.json must be a JSON object like {\"url\": \"...\"}");
}
if (!isTikTokVideoUrl(doc.url)) {
  fail(
    "VIDEO.json has no TikTok video url: expected " +
      "https://www.tiktok.com/@<handle>/video/<id>",
  );
}

mkdirSync(outputDir, { recursive: true });
const target = join(outputDir, "VIDEO.json");
try {
  copyFileSync(source, target);
} catch (err) {
  fail(`VIDEO.json could not be copied to ${target}: ${err.message}`);
}
console.log(`VIDEO.json copied to ${target} (${doc.url})`);
