import type { QuestionBank } from "../types";

export const SEED_BANK: QuestionBank = {
  updatedAt: new Date("2026-04-28T00:00:00Z").toISOString(),
  rounds: [
    {
      id: "round-01",
      title: "1회차 · 워밍업",
      description: "기본 상식과 가벼운 추론 문제로 감을 잡아보세요.",
      questions: [
        {
          id: "q1-1",
          prompt: "대한민국의 수도는 어디일까요?",
          choices: ["부산", "서울", "인천", "대전"],
          answerIndex: 1,
          explanation: { summary: "대한민국의 수도는 서울특별시입니다.", notes: [] },
        },
        {
          id: "q1-2",
          prompt: "다음 중 HTML의 정식 명칭은 무엇일까요?",
          choices: [
            "Hyper Trainer Marking Language",
            "HyperText Markup Language",
            "HighText Machine Language",
            "Hyperlink and Text Markup Language",
          ],
          answerIndex: 1,
          explanation: { summary: "HTML은 HyperText Markup Language의 약자입니다.", notes: [] },
        },
        {
          id: "q1-3",
          prompt: "1킬로미터는 몇 미터일까요?",
          choices: ["100m", "1,000m", "10,000m", "100,000m"],
          answerIndex: 1,
        },
        {
          id: "q1-4",
          prompt: "JavaScript에서 배열의 길이를 반환하는 속성은?",
          choices: [".size", ".count()", ".length", ".len"],
          answerIndex: 2,
          explanation: { summary: "JavaScript 배열은 length 속성으로 원소 개수를 표시합니다.", notes: [] },
        },
        {
          id: "q1-5",
          prompt: "태양계에서 가장 큰 행성은?",
          choices: ["지구", "토성", "목성", "해왕성"],
          answerIndex: 2,
          explanation: { summary: "목성은 태양계 행성 중 가장 큽니다.", notes: [] },
        },
      ],
    },
    {
      id: "round-02",
      title: "2회차 · 프론트엔드 기초",
      description: "HTML/CSS/JS의 기초 개념을 점검합니다.",
      questions: [
        {
          id: "q2-1",
          prompt: "CSS에서 색상을 지정할 때 16진수 표기법으로 옳은 것은?",
          choices: ["#GGFFAA", "#1c1c1c", "rgba(255)", "color: 1c1c1c"],
          answerIndex: 1,
          explanation: { summary: "16진수 색상은 0–9, A–F만 사용하며 #으로 시작합니다.", notes: [] },
        },
        {
          id: "q2-2",
          prompt: "다음 중 React에서 컴포넌트 상태를 다루는 훅은?",
          choices: ["useEffect", "useMemo", "useState", "useRef"],
          answerIndex: 2,
        },
        {
          id: "q2-3",
          prompt: "브라우저에 데이터를 영구 저장할 수 있는 API는?",
          choices: ["sessionStorage", "localStorage", "memoryStorage", "tempStorage"],
          answerIndex: 1,
          explanation: { summary: "localStorage는 브라우저를 닫아도 데이터를 유지합니다.", notes: [] },
        },
        {
          id: "q2-4",
          prompt: "flexbox에서 주축 방향으로 정렬하는 속성은?",
          choices: [
            "align-items",
            "justify-content",
            "align-content",
            "place-content",
          ],
          answerIndex: 1,
        },
      ],
    },
  ],
};
