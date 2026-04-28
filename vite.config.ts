import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const base = process.env.DEPLOY_BASE ?? "/";

const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const BANK_FILE = path.join(PUBLIC_DIR, "data/cbt.json");
const IMG_DIR = path.join(PUBLIC_DIR, "data/cbt-images");
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

interface MaybeBank {
  rounds?: Array<{
    id?: unknown;
    questions?: Array<{
      imageUrl?: unknown;
      choiceImageUrls?: unknown;
    }>;
  }>;
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
            await fs.mkdir(path.dirname(BANK_FILE), { recursive: true });
            await fs.writeFile(
              BANK_FILE,
              JSON.stringify(json, null, 2) + "\n",
              "utf-8",
            );
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({ ok: true, path: "public/data/cbt.json" }),
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
