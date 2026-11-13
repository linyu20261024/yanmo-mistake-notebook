export const SUBJECTS = [
  "数学",
  "语文",
  "英语",
  "物理",
  "化学",
  "生物",
  "历史",
  "地理",
  "道德与法治",
] as const;

export type Subject = (typeof SUBJECTS)[number];

export type MasteryStatus = "pending" | "practicing" | "mastered";

export interface Student {
  id: string;
  name: string;
  grade: string;
  className: string;
  note?: string;
  createdAt: string;
}

export interface MistakeItem {
  id: string;
  studentId: string;
  subject: Subject;
  questionType: string;
  knowledgePoint: string;
  questionText: string;
  croppedImageUrl?: string;
  studentWrongAnswer: string;
  errorReason: string;
  standardAnswer: string;
  correctionSteps: string;
  handwritingTemplate: string;
  masteryStatus: MasteryStatus;
  handwritingPracticeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExamPaperConfig {
  id: string;
  studentId: string;
  title: string;
  subtitle: string;
  durationMinutes: number;
  includeImages: boolean;
  includeAnswerKey: boolean;
  blankLinesPerQuestion: number;
  mistakeIds: string[];
  createdAt: string;
}

export type GridType = "lined" | "tianzige" | "mizige" | "english_4line" | "square";

export type TraceColor = "slate" | "vermilion" | "indigo";

export type FontStyle = "kaiti" | "serif" | "english_neat";

export type PracticeMode = "full_trace" | "alternating_copy" | "split_column";

export interface TracingConfig {
  title: string;
  subject: Subject;
  content: string;
  gridType: GridType;
  traceColor: TraceColor;
  traceOpacity: number; // 15 to 45 (%)
  fontSize: number; // 16 to 32 (px)
  lineHeight: number; // 1.8 to 2.8
  fontStyle: FontStyle;
  practiceMode: PracticeMode;
  showMarginGuide: boolean;
}

export interface AppState {
  students: Student[];
  activeStudentId: string;
  mistakes: MistakeItem[];
  examDraft: {
    title: string;
    subtitle: string;
    durationMinutes: number;
    includeImages: boolean;
    includeAnswerKey: boolean;
    blankLinesPerQuestion: number;
    mistakeIds: string[];
  };
}
