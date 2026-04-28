#!/usr/bin/env node
// cbtbank/data/{iz,ic}*.json -> public/data/index.json + public/data/rounds/{id}.json
// 회차(시험일) 단위로 회차별 파일을 출력하고, image_path가 있으면 public/data/cbt-images/<roundId>/ 로 복사한다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "cbtbank", "data");
const PUBLIC_DIR = path.join(ROOT, "public", "data");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.json");
const ROUNDS_DIR = path.join(PUBLIC_DIR, "rounds");
const IMG_OUT_DIR = path.join(PUBLIC_DIR, "cbt-images");
const LEGACY_BANK_FILE = path.join(PUBLIC_DIR, "cbt.json");

const FILES = [
  "iz20200606",
  "iz20200822",
  "iz20200926",
  "iz20210307",
  "iz20210515",
  "iz20210814",
  "iz20220305",
  "iz20220424",
  "ic20230617",
];

const TITLE_BY_PREFIX = {
  iz: "정보처리기사 필기",
  ic: "정보통신기사 필기",
};

function parseDateFromRoundId(roundId) {
  const m = roundId.match(/^[a-z]+(\d{4})(\d{2})(\d{2})$/);
  if (!m) return roundId;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function categoryFromRoundId(roundId) {
  const m = roundId.match(/^([a-z]+)/);
  return m ? m[1] : "rd";
}

function pickExplanation(explanations) {
  if (!Array.isArray(explanations) || explanations.length === 0) return undefined;
  const first = explanations.find(
    (e) =>
      e &&
      ((e.structured && typeof e.structured === "object") ||
        (typeof e.text === "string" && e.text.trim().length > 0)),
  );
  if (!first) return undefined;
  if (first.structured && typeof first.structured === "object") {
    const summary =
      typeof first.structured.summary === "string"
        ? first.structured.summary
        : "";
    const notes = Array.isArray(first.structured.notes)
      ? first.structured.notes
          .filter((n) => n && (n.label || n.body))
          .map((n) => ({
            ...(typeof n.choiceIndex === "number"
              ? { choiceIndex: n.choiceIndex }
              : {}),
            label: typeof n.label === "string" ? n.label : "",
            body: typeof n.body === "string" ? n.body : "",
          }))
      : [];
    return { summary, notes };
  }
  return { summary: first.text.trim(), notes: [] };
}

function clamp(n, min, max) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function copyImage(roundId, srcRelPath) {
  if (!srcRelPath) return undefined;
  const srcAbs = path.join(SRC_DIR, srcRelPath);
  if (!fs.existsSync(srcAbs)) {
    console.warn(`[build-cbt] missing image: ${srcRelPath} (round ${roundId})`);
    return undefined;
  }
  const filename = path.basename(srcAbs);
  const destDir = path.join(IMG_OUT_DIR, roundId);
  fs.mkdirSync(destDir, { recursive: true });
  const destAbs = path.join(destDir, filename);
  fs.copyFileSync(srcAbs, destAbs);
  return `data/cbt-images/${roundId}/${filename}`;
}

function convertFile(file) {
  const raw = fs.readFileSync(path.join(SRC_DIR, `${file}.json`), "utf8");
  const data = JSON.parse(raw);
  const dateLabel = parseDateFromRoundId(data.round_id);
  const prefix = data.round_id.slice(0, 2);
  const titleBase = TITLE_BY_PREFIX[prefix] ?? data.title ?? data.round_id;

  const questions = data.questions.map((q) => {
    const correctIndex =
      (typeof q.correct_index === "number" ? q.correct_index : 1) - 1;
    const choices = q.choices.map((c) => String(c.text ?? "").trim());
    const id = q.question_id ?? `${data.round_id}-${q.question_num}`;
    const imageUrl = q.image_path
      ? copyImage(data.round_id, q.image_path)
      : undefined;
    const choiceImageUrls = q.choices.map((c) =>
      c && c.image_path ? copyImage(data.round_id, c.image_path) : null,
    );
    const hasChoiceImage = choiceImageUrls.some((u) => u);
    return {
      id,
      prompt: String(q.question ?? "").trim(),
      choices,
      answerIndex: clamp(correctIndex, 0, Math.max(0, choices.length - 1)),
      explanation: pickExplanation(q.explanations),
      section: typeof q.section === "string" ? q.section.trim() : undefined,
      imageUrl,
      choiceImageUrls: hasChoiceImage ? choiceImageUrls : undefined,
    };
  });

  return {
    id: data.round_id,
    title: `${titleBase} · ${dateLabel}`,
    description: `${dateLabel} 회차 · ${questions.length}문항`,
    questions,
  };
}

function cleanImageOutput() {
  if (fs.existsSync(IMG_OUT_DIR)) {
    fs.rmSync(IMG_OUT_DIR, { recursive: true, force: true });
  }
}

function cleanRoundsOutput() {
  if (fs.existsSync(ROUNDS_DIR)) {
    fs.rmSync(ROUNDS_DIR, { recursive: true, force: true });
  }
}

function removeLegacyBundle() {
  if (fs.existsSync(LEGACY_BANK_FILE)) {
    fs.rmSync(LEGACY_BANK_FILE, { force: true });
  }
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    if (fs.existsSync(INDEX_FILE)) {
      console.log(
        `[build-cbt] source directory not found, keeping existing ${path.relative(ROOT, INDEX_FILE)}`,
      );
      return;
    }
    console.warn(
      `[build-cbt] source directory not found and no prebuilt data — skipping`,
    );
    return;
  }

  cleanImageOutput();
  cleanRoundsOutput();
  removeLegacyBundle();

  const rounds = FILES.map(convertFile);
  const updatedAt = new Date().toISOString();

  fs.mkdirSync(ROUNDS_DIR, { recursive: true });
  for (const round of rounds) {
    const file = path.join(ROUNDS_DIR, `${round.id}.json`);
    fs.writeFileSync(file, JSON.stringify(round));
  }

  const manifest = {
    rounds: rounds.map((r) => ({
      id: r.id,
      category: categoryFromRoundId(r.id),
      title: r.title,
      description: r.description,
      questionCount: r.questions.length,
    })),
    updatedAt,
  };
  fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true });
  fs.writeFileSync(INDEX_FILE, JSON.stringify(manifest));

  const totalQuestions = rounds.reduce((sum, r) => sum + r.questions.length, 0);
  const totalImages = rounds.reduce(
    (sum, r) => sum + r.questions.filter((q) => q.imageUrl).length,
    0,
  );
  const totalChoiceImages = rounds.reduce(
    (sum, r) =>
      sum +
      r.questions.reduce(
        (n, q) =>
          n + (Array.isArray(q.choiceImageUrls) ? q.choiceImageUrls.filter(Boolean).length : 0),
        0,
      ),
    0,
  );
  const indexKb = (fs.statSync(INDEX_FILE).size / 1024).toFixed(1);
  const roundsKb = rounds
    .reduce(
      (sum, r) =>
        sum +
        fs.statSync(path.join(ROUNDS_DIR, `${r.id}.json`)).size / 1024,
      0,
    )
    .toFixed(1);
  console.log(
    `[build-cbt] wrote ${rounds.length} rounds · ${totalQuestions} questions · ${totalImages} body img · ${totalChoiceImages} choice img · index ${indexKb} KB · rounds ${roundsKb} KB → ${path.relative(ROOT, PUBLIC_DIR)}`,
  );
}

main();
