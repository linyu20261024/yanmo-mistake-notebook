import { createWorker } from "tesseract.js";
import { SUBJECTS, Subject } from "../types";

export interface ExtractedMistakeResult {
  subject: Subject;
  questionType: string;
  knowledgePoint: string;
  questionText: string;
  studentWrongAnswer: string;
  errorReason: string;
  standardAnswer: string;
  correctionSteps: string;
  handwritingTemplate: string;
}

export interface ExtractResponse {
  mode: "ai" | "local-ocr";
  result: ExtractedMistakeResult;
}

function cleanOcrText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    // Remove spurious spaces between Chinese characters introduced by Tesseract
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2")
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2")
    // Normalize option prefixes onto clean lines
    .replace(/\s+([A-D][\.．、])\s*/g, "\n$1 ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferSubject(text: string, preferred: string): Subject {
  if (preferred !== "自动识别" && (SUBJECTS as readonly string[]).includes(preferred)) {
    return preferred as Subject;
  }
  const lower = text.toLowerCase();
  if (/[÷×=²³√∠△≌]/.test(text) || /算式|方程|函数|平方|长方形|面积|周长|至少需要/.test(text)) {
    return "数学";
  }
  if (/牛顿|加速度|电流|电阻|压强|速度|滑轮|摩擦力|电路/.test(text)) {
    return "物理";
  }
  if (/化学式|溶液|mol|反应|氧化|还原|气体|酸碱/.test(text)) {
    return "化学";
  }
  const englishChars = (lower.match(/[a-z]/g) || []).length;
  if (englishChars > text.length * 0.45) {
    return "英语";
  }
  if (/默写|古诗|阅读|作者|修辞|文言文|句子/.test(text)) {
    return "语文";
  }
  return "数学";
}

function inferQuestionType(text: string): string {
  if (/[A-D][\.．、]/.test(text)) return "选择题";
  if (/_{2,}|（\s*）|\(\s*\)/.test(text)) return "填空题";
  if (/求证|证明/.test(text)) return "证明题";
  return "解答题";
}

export function buildAnswerExampleTemplate(params: {
  subject: Subject;
  questionType: string;
  standardAnswer: string;
  correctionSteps: string;
  questionText?: string;
}): string {
  const { subject, questionType, standardAnswer, correctionSteps } = params;
  const ans = standardAnswer.trim();
  const steps = correctionSteps.trim();

  if (subject === "英语") {
    const parts = [ans, steps].filter(Boolean);
    return parts.join("\n") || "Answer / Model Writing:\nPlease enter the standard English answer here.";
  }

  if (questionType.includes("选择")) {
    const lines: string[] = [];
    lines.push(`答：本题选（ ${ans || "填写正确选项"} ）。`);
    if (steps) {
      lines.push("解析过程：");
      lines.push(steps);
    } else {
      lines.push("解析过程：");
      lines.push("1. 审清题意与关键条件；");
      lines.push("2. 逐项分析各选项并写出推导过程。");
    }
    return lines.join("\n");
  }

  if (questionType.includes("证明")) {
    const lines: string[] = ["证明："];
    if (steps) lines.push(steps);
    if (ans) lines.push(`结论：${ans}`);
    return lines.join("\n");
  }

  const lines: string[] = [];
  if (steps) {
    lines.push(steps.startsWith("解：") ? steps : `解：${steps}`);
  } else {
    lines.push("解：由题意得，");
  }
  if (ans) {
    lines.push(ans.startsWith("答：") ? ans : `答：${ans}`);
  } else {
    lines.push("答：");
  }
  return lines.join("\n");
}

async function runBrowserOcr(
  imageBase64: string,
  onProgress?: (label: string) => void
): Promise<string> {
  onProgress?.("正在初始化离线识图引擎...");
  const worker = await createWorker(["chi_sim", "eng"], 1, {
    logger: (m) => {
      if (m.status === "recognizing text") {
        const pct = Math.round((m.progress || 0) * 100);
        onProgress?.(`正在本地识图 ${pct}%...`);
      } else if (m.status && m.progress !== undefined) {
        const pct = Math.round(m.progress * 100);
        onProgress?.(`加载识图语言包 ${pct}%...`);
      }
    },
  });

  try {
    const {
      data: { text },
    } = await worker.recognize(imageBase64);
    return cleanOcrText(text || "");
  } finally {
    await worker.terminate();
  }
}

export async function extractMistakeFromImage(params: {
  imageBase64: string;
  mimeType?: string;
  preferredSubject?: string;
  studentGrade?: string;
  forceLocalOcr?: boolean;
  onProgress?: (label: string) => void;
}): Promise<ExtractResponse> {
  const {
    imageBase64,
    mimeType = "image/jpeg",
    preferredSubject = "自动识别",
    studentGrade = "",
    forceLocalOcr = false,
    onProgress,
  } = params;

  // Try server-side AI extraction first unless forced local OCR
  if (!forceLocalOcr) {
    try {
      onProgress?.("正在连接智能识题解析服务...");
      const resp = await fetch("/api/extract-mistake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mimeType,
          preferredSubject,
          studentGrade,
        }),
      });

      const contentType = resp.headers.get("content-type") || "";
      if (resp.ok && contentType.includes("application/json")) {
        const data = await resp.json();
        if (data?.result) {
          const r = data.result;
          const subj: Subject = (SUBJECTS as readonly string[]).includes(r.subject)
            ? (r.subject as Subject)
            : "数学";
          return {
            mode: "ai",
            result: {
              subject: subj,
              questionType: r.questionType || "解答题",
              knowledgePoint: r.knowledgePoint || "",
              questionText: r.questionText || "",
              studentWrongAnswer: r.studentWrongAnswer || "",
              errorReason: r.errorReason || "",
              standardAnswer: r.standardAnswer || "",
              correctionSteps: r.correctionSteps || "",
              handwritingTemplate:
                r.handwritingTemplate ||
                buildAnswerExampleTemplate({
                  subject: subj,
                  questionType: r.questionType || "解答题",
                  standardAnswer: r.standardAnswer || "",
                  correctionSteps: r.correctionSteps || "",
                }),
            },
          };
        }
      }
    } catch {
      // Network error or static hosting (GitHub Pages): fall back to browser OCR below
    }
  }

  // Fallback: 100% client-side Tesseract OCR (works on static GitHub Pages!)
  const recognizedText = await runBrowserOcr(imageBase64, onProgress);
  const subject = inferSubject(recognizedText, preferredSubject);
  const questionType = inferQuestionType(recognizedText);

  return {
    mode: "local-ocr",
    result: {
      subject,
      questionType,
      knowledgePoint: "",
      questionText: recognizedText,
      studentWrongAnswer: "",
      errorReason: "",
      standardAnswer: "",
      correctionSteps: "",
      handwritingTemplate: buildAnswerExampleTemplate({
        subject,
        questionType,
        standardAnswer: "",
        correctionSteps: "",
      }),
    },
  };
}
