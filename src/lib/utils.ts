export function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function uid(prefix = "id"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}초`;
  return `${m}분 ${s.toString().padStart(2, "0")}초`;
}

export function choiceLabel(index: number): string {
  return String(index + 1);
}

/**
 * cbt.json의 imageUrl을 실제 src로 변환한다.
 * - data:/blob:/http(s):/// 절대 경로는 그대로
 * - 그 외(상대 경로)는 BASE_URL을 prefix로 붙임 (정적 자산)
 */
export function resolveImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(data:|blob:|https?:|\/)/i.test(url)) return url;
  return `${import.meta.env.BASE_URL}${url}`;
}

const MAX_INLINE_IMAGE_BYTES = 1.5 * 1024 * 1024;

export async function readImageAsDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 업로드할 수 있어요.");
  }
  if (file.size > MAX_INLINE_IMAGE_BYTES) {
    throw new Error(
      `이미지가 너무 커요 (${(file.size / 1024 / 1024).toFixed(1)}MB). 1.5MB 이하로 줄여주세요.`,
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("이미지 읽기에 실패했어요."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("읽기 실패"));
    reader.readAsDataURL(file);
  });
}
