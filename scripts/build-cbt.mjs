#!/usr/bin/env node
// cbtbank/data/iz*.json -> public/data/cbt.json
// 회차(시험일) 단위 라운드로 합치되, 각 문제에 과목(section) 메타를 보존합니다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "cbtbank", "data");
const OUT_FILE = path.join(ROOT, "public", "data", "cbt.json");

const FILES = [
  "iz20200606",
  "iz20200822",
  "iz20200926",
  "iz20210307",
  "iz20210515",
  "iz20210814",
  "iz20220305",
  "iz20220424",
];

function parseDateFromRoundId(roundId) {
  const m = roundId.match(/^iz(\d{4})(\d{2})(\d{2})$/);
  if (!m) return roundId;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function pickExplanation(explanations) {
  if (!Array.isArray(explanations) || explanations.length === 0) return undefined;
  const first = explanations.find(
    (e) => e && typeof e.text === "string" && e.text.trim().length > 0,
  );
  if (!first) return undefined;
  return first.text.trim();
}

function clamp(n, min, max) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function convertFile(file) {
  const raw = fs.readFileSync(path.join(SRC_DIR, `${file}.json`), "utf8");
  const data = JSON.parse(raw);
  const dateLabel = parseDateFromRoundId(data.round_id);

  const questions = data.questions.map((q) => {
    const correctIndex =
      (typeof q.correct_index === "number" ? q.correct_index : 1) - 1;
    const choices = q.choices.map((c) => String(c.text ?? "").trim());
    return {
      id: q.question_id,
      prompt: String(q.question ?? "").trim(),
      choices,
      answerIndex: clamp(correctIndex, 0, Math.max(0, choices.length - 1)),
      explanation: pickExplanation(q.explanations),
      section: typeof q.section === "string" ? q.section.trim() : undefined,
    };
  });

  return {
    id: data.round_id,
    title: `정보처리기사 필기 · ${dateLabel}`,
    description: `${dateLabel} 회차 · ${questions.length}문항`,
    questions,
  };
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    if (fs.existsSync(OUT_FILE)) {
      console.log(
        `[build-cbt] source directory not found, keeping existing ${path.relative(ROOT, OUT_FILE)}`,
      );
      return;
    }
    console.warn(
      `[build-cbt] source directory not found and no prebuilt data — skipping`,
    );
    return;
  }

  const rounds = FILES.map(convertFile);
  const bank = { rounds, updatedAt: new Date().toISOString() };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(bank));

  const totalQuestions = rounds.reduce((sum, r) => sum + r.questions.length, 0);
  const sizeKb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(
    `[build-cbt] wrote ${rounds.length} rounds · ${totalQuestions} questions · ${sizeKb} KB → ${path.relative(ROOT, OUT_FILE)}`,
  );
}

main();
