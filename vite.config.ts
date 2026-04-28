import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const base = process.env.DEPLOY_BASE ?? "/";

const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const PUBLIC_DATA = path.join(PUBLIC_DIR, "data");
const INDEX_FILE = path.join(PUBLIC_DATA, "index.json");
const ROUNDS_DIR = path.join(PUBLIC_DATA, "rounds");
const LEGACY_BANK_FILE = path.join(PUBLIC_DATA, "cbt.json");
const IMG_DIR = path.join(PUBLIC_DATA, "cbt-images");
const MAX_BODY = 60 * 1024 * 1024;

const DATAURL_RE = /^data:([^;,]+);base64,(.+)$/i;

function extFromMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "image/bmp":
      return "bmp";
    case "image/avif":
      return "avif";
    default:
      return "bin";
  }
}

function safeRoundId(id: unknown): string {
  if (typeof id !== "string" || id.length === 0) return "manage";
  return id.replace(/[^a-zA-Z0-9_-]/g, "_") || "manage";
}

async function externalizeDataUrl(
  roundId: string,
  dataUrl: string,
): Promise<string> {
  const m = DATAURL_RE.exec(dataUrl);
  if (!m) return dataUrl;
  const [, mime, base64] = m;
  const buf = Buffer.from(base64, "base64");
  const ext = extFromMime(mime);
  const hash = crypto
    .createHash("sha256")
    .update(buf)
    .digest("hex")
    .slice(0, 12);
  const round = safeRoundId(roundId);
  const relPath = `data/cbt-images/${round}/${hash}.${ext}`;
  const absPath = path.join(IMG_DIR, round, `${hash}.${ext}`);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, buf);
  return relPath;
}

interface MaybeRound {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  questions?: Array<{
    imageUrl?: unknown;
    choiceImageUrls?: unknown;
  }>;
}
interface MaybeBank {
  rounds?: MaybeRound[];
  updatedAt?: unknown;
}

function categoryFromRoundId(id: string): string {
  const m = id.match(/^([a-z]+)/);
  return m ? m[1] : "rd";
}

function hashRoundPayload(payload: unknown): string {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 12);
}

const SUBJECT_RE = /^(\d+과목)/;

interface SubjectAgg {
  key: string;
  fullLabel: string;
  count: number;
}

function aggregateSubjects(
  payloads: Array<{ questions: Array<{ section?: unknown }> }>,
): SubjectAgg[] {
  const map = new Map<string, SubjectAgg>();
  for (const p of payloads) {
    for (const q of p.questions) {
      const section = typeof q?.section === "string" ? q.section : "";
      if (!section) continue;
      const m = section.match(SUBJECT_RE);
      if (!m) continue;
      const key = m[1];
      const entry = map.get(key) ?? { key, fullLabel: section, count: 0 };
      entry.count += 1;
      map.set(key, entry);
    }
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key, "ko"));
}

async function externalizeBank(bank: MaybeBank): Promise<void> {
  if (!bank || !Array.isArray(bank.rounds)) return;
  for (const round of bank.rounds) {
    if (!round || !Array.isArray(round.questions)) continue;
    const roundId = safeRoundId(round.id);
    for (const q of round.questions) {
      if (!q) continue;
      if (typeof q.imageUrl === "string" && q.imageUrl.startsWith("data:")) {
        q.imageUrl = await externalizeDataUrl(roundId, q.imageUrl);
      }
      if (Array.isArray(q.choiceImageUrls)) {
        const next: Array<string | null | undefined> = [];
        for (const u of q.choiceImageUrls) {
          if (typeof u === "string" && u.startsWith("data:")) {
            next.push(await externalizeDataUrl(roundId, u));
          } else if (typeof u === "string" || u == null) {
            next.push(u as string | null | undefined);
          } else {
            next.push(undefined);
          }
        }
        q.choiceImageUrls = next;
      }
    }
  }
}

async function writeBankSplit(bank: MaybeBank): Promise<void> {
  await fs.mkdir(ROUNDS_DIR, { recursive: true });
  const rounds = Array.isArray(bank.rounds) ? bank.rounds : [];
  const validIds = new Set<string>();
  const manifestEntries: Array<{
    id: string;
    category: string;
    title?: string;
    description?: string;
    questionCount: number;
    version: string;
  }> = [];
  const payloads: Array<{ questions: Array<{ section?: unknown }> }> = [];

  for (const round of rounds) {
    if (!round) continue;
    const safeId = safeRoundId(round.id);
    validIds.add(safeId);
    const title = typeof round.title === "string" ? round.title : "";
    const description =
      typeof round.description === "string" ? round.description : undefined;
    const questions = Array.isArray(round.questions) ? round.questions : [];
    const payload = {
      id: safeId,
      title,
      description,
      questions,
    };
    const file = path.join(ROUNDS_DIR, `${safeId}.json`);
    await fs.writeFile(file, JSON.stringify(payload, null, 2) + "\n", "utf-8");
    manifestEntries.push({
      id: safeId,
      category: categoryFromRoundId(safeId),
      title,
      description,
      questionCount: questions.length,
      version: hashRoundPayload(payload),
    });
    payloads.push({ questions: questions as Array<{ section?: unknown }> });
  }

  // 새 bank에 없는 회차 파일은 정리
  const existing = await fs.readdir(ROUNDS_DIR).catch(() => [] as string[]);
  for (const name of existing) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    if (!validIds.has(id)) {
      await fs
        .rm(path.join(ROUNDS_DIR, name), { force: true })
        .catch(() => undefined);
    }
  }

  const updatedAt =
    typeof bank.updatedAt === "string" && bank.updatedAt
      ? bank.updatedAt
      : new Date().toISOString();
  const manifest = {
    rounds: manifestEntries,
    subjects: aggregateSubjects(payloads),
    updatedAt,
  };
  await fs.mkdir(path.dirname(INDEX_FILE), { recursive: true });
  await fs.writeFile(
    INDEX_FILE,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
  );

  // 레거시 단일 번들 잔존 시 정리
  await fs.rm(LEGACY_BANK_FILE, { force: true }).catch(() => undefined);
}

function saveBankPlugin(): Plugin {
  return {
    name: "solve-card:save-bank",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__save-bank", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        let aborted = false;

        req.on("data", (chunk: Buffer) => {
          if (aborted) return;
          total += chunk.length;
          if (total > MAX_BODY) {
            aborted = true;
            res.statusCode = 413;
            res.end(JSON.stringify({ ok: false, error: "payload too large" }));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });

        req.on("end", async () => {
          if (aborted) return;
          try {
            const body = Buffer.concat(chunks).toString("utf-8");
            const json = JSON.parse(body);
            if (!json || !Array.isArray(json.rounds)) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: false, error: "invalid bank shape" }));
              return;
            }
            await externalizeBank(json);
            await writeBankSplit(json);
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({ ok: true, path: "public/data/" }),
            );
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        });

        req.on("error", (err) => {
          if (aborted) return;
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: err.message }));
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), saveBankPlugin()],
  base,
  server: {
    host: true,
    port: 5173,
  },
});
