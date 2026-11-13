import { AppState } from "../types";
import sampleMathPaperImg from "../assets/images/sample_math_paper_1794562316307.jpg";
import sampleEnglishPaperImg from "../assets/images/sample_english_paper_1794562316343.jpg";

export const SAMPLE_MATH_PAPER_URL = sampleMathPaperImg;
export const SAMPLE_ENGLISH_PAPER_URL = sampleEnglishPaperImg;

export const INITIAL_APP_STATE: AppState = {
  students: [],
  activeStudentId: "",
  mistakes: [],
  examDraft: {
    title: "阶段错题巩固重组训练卷",
    subtitle: "针对性查漏补缺 · 规范书写专项",
    durationMinutes: 45,
    includeImages: true,
    includeAnswerKey: true,
    blankLinesPerQuestion: 5,
    mistakeIds: [],
  },
};
