#!/usr/bin/env node
/**
 * cbtbank/data/{id}.structured.json 의 question_id별 structured 객체를
 * 같은 id의 cbtbank/data/{id}.json 의 explanations[0].structured 필드로 머지한다.
 *
 *   node scripts/merge-structured.mjs iz20200606
 */
import fs from "node:fs";
import path from "node:path";

const [, , roundId] = process.argv;
if (!roundId) {
  console.error("Usage: merge-structured.mjs <roundId>");
  process.exit(1);
}

const SRC = path.join("cbtbank", "data", `${roundId}.json`);
const PATCH = path.join("cbtbank", "data", `${roundId}.structured.json`);

if (!fs.existsSync(SRC)) {
  console.error(`source not found: ${SRC}`);
  process.exit(1);
}
if (!fs.existsSync(PATCH)) {
  console.error(`patch not found: ${PATCH}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(SRC, "utf8"));
const patch = JSON.parse(fs.readFileSync(PATCH, "utf8"));

let merged = 0;
let missing = 0;
for (const q of data.questions) {
  const s = patch[q.question_id];
  if (!s) {
    missing++;
    continue;
  }
  if (!Array.isArray(q.explanations) || q.explanations.length === 0) {
    q.explanations = [{ author: null, text: "", blinded: false, classes: [] }];
  }
  q.explanations[0].structured = s;
  merged++;
}

fs.writeFileSync(SRC, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(
  `[merge] ${roundId}: ${merged} merged, ${missing} missing (no patch entry)`,
);
