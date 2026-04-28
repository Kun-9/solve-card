export interface ExplanationNote {
  /** 보기 인덱스 매칭에 성공했을 때만 채워짐. */
  matchedIndex?: number;
  /** 노트 라인의 키 부분 (예: "동료 검토"). */
  label: string;
  /** 키를 제외한 부연 설명. 비어있을 수 있음. */
  body: string;
}

export interface ParsedExplanation {
  /** 정답에 대한 메인 설명. 줄바꿈을 포함할 수 있다. */
  summary: string;
  /** 오답/보기별 부연 노트. 없으면 빈 배열. */
  notes: ExplanationNote[];
}

const NOTE_HEADER = /^\s*오답\s*노트\s*$/;
const COLON_SPLIT = /[:：]/;

function normalize(text: string): string {
  return text
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function findMatchedIndex(label: string, choices: string[]): number | undefined {
  const target = normalize(label);
  if (!target) return undefined;
  for (let i = 0; i < choices.length; i += 1) {
    if (normalize(choices[i]) === target) return i;
  }
  for (let i = 0; i < choices.length; i += 1) {
    const c = normalize(choices[i]);
    if (c.startsWith(target) || target.startsWith(c)) return i;
  }
  return undefined;
}

function parseNoteLine(line: string, choices: string[]): ExplanationNote {
  const idx = line.search(COLON_SPLIT);
  if (idx === -1) {
    return { label: line.trim(), body: "" };
  }
  const label = line.slice(0, idx).trim();
  const body = line.slice(idx + 1).trim();
  return {
    label,
    body,
    matchedIndex: findMatchedIndex(label, choices),
  };
}

export function parseExplanation(
  text: string | undefined,
  choices: string[] = [],
): ParsedExplanation | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => NOTE_HEADER.test(l));

  if (headerIndex === -1) {
    return { summary: text.trim(), notes: [] };
  }

  const summary = lines.slice(0, headerIndex).join("\n").trim();
  const noteLines = lines
    .slice(headerIndex + 1)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return {
    summary,
    notes: noteLines.map((l) => parseNoteLine(l, choices)),
  };
}
