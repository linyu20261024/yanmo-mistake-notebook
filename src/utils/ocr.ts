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

const OCR_CACHE_NAME = "yanmo-ocr-tessdata-v1";

function getBaseHref(): string {
  const base = import.meta.env.BASE_URL || "/";
  return new URL(base, window.location.origin).href.replace(/\/?$/, "/");
}

async function resolveWorkerAndCorePaths(): Promise<{
  workerPath: string;
  corePath: string;
}> {
  const baseHref = getBaseHref();
  const localWorker = `${baseHref}tesseract/worker.min.js`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const resp = await fetch(localWorker, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timer);
    const ct = resp.headers.get("content-type") || "";
    if (resp.ok && (ct.includes("javascript") || ct.includes("ecmascript"))) {
      return {
        workerPath: localWorker,
        corePath: `${baseHref}tesseract`,
      };
    }
  } catch {
    // Fallback to China npmmirror CDN
  }
  return {
    workerPath:
      "https://cdn.npmmirror.com/packages/tesseract.js/7.0.0/files/dist/worker.min.js",
    corePath:
      "https://cdn.npmmirror.com/packages/tesseract.js-core/7.0.0/files",
  };
}

function isValidGzipHeader(buf: Uint8Array): boolean {
  return buf.length > 64 && buf[0] === 0x1f && buf[1] === 0x8b;
}

async function fetchWithProgressAndTimeout(
  url: string,
  label: string,
  timeoutMs: number,
  onProgress?: (msg: string) => void
): Promise<Uint8Array | null> {
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return null;

    const totalBytes = Number(resp.headers.get("content-length") || 0);
    const reader = resp.body?.getReader();

    if (!reader) {
      const ab = await resp.arrayBuffer();
      const bytes = new Uint8Array(ab);
      return isValidGzipHeader(bytes) ? bytes : null;
    }

    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), timeoutMs);

      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        if (totalBytes > 0) {
          const pct = Math.min(99, Math.round((loaded / totalBytes) * 100));
          const mbLoaded = (loaded / 1048576).toFixed(1);
          const mbTotal = (totalBytes / 1048576).toFixed(1);
          onProgress?.(`${label} ${pct}% (${mbLoaded}/${mbTotal} MB)`);
        } else {
          const mbLoaded = (loaded / 1048576).toFixed(1);
          onProgress?.(`${label} (${mbLoaded} MB)...`);
        }
      }
    }

    const merged = new Uint8Array(loaded);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }

    return isValidGzipHeader(merged) ? merged : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loadLangBinary(
  lang: "chi_sim" | "eng",
  displayLabel: string,
  onProgress?: (msg: string) => void
): Promise<{ code: string; data: Uint8Array }> {
  const cacheKey = `https://yanmo.local/tessdata/4.0.0_best_int/${lang}.traineddata.gz`;

  // 1. Check CacheStorage first
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(OCR_CACHE_NAME);
      const cached = await cache.match(cacheKey);
      if (cached) {
        const bytes = new Uint8Array(await cached.arrayBuffer());
        if (isValidGzipHeader(bytes)) {
          onProgress?.(`已从本地缓存读取${displayLabel}`);
          return { code: lang, data: bytes };
        }
      }
    } catch {
      // Ignore CacheStorage restriction
    }
  }

  // 2. Try same-origin hosted tessdata first, then China-friendly mirrors
  const baseHref = getBaseHref();
  const candidates = [
    `${baseHref}tessdata/${lang}.traineddata.gz`,
    `https://cdn.npmmirror.com/packages/%40tesseract.js-data/${lang}/1.0.0/files/4.0.0_best_int/${lang}.traineddata.gz`,
    `https://fastly.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
    `https://unpkg.com/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
    `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
  ];

  for (let i = 0; i < candidates.length; i++) {
    const url = candidates[i];
    const isLocal = i === 0;
    const timeoutMs = isLocal ? 6000 : 12000;
    if (i > 0) {
      onProgress?.(`正在连接镜像源下载${displayLabel} (${i}/${candidates.length - 1})...`);
    } else {
      onProgress?.(`正在加载${displayLabel}...`);
    }

    const bytes = await fetchWithProgressAndTimeout(
      url,
      `下载${displayLabel}`,
      timeoutMs,
      onProgress
    );

    if (bytes) {
      if (typeof caches !== "undefined") {
        try {
          const cache = await caches.open(OCR_CACHE_NAME);
          const copy = bytes.slice().buffer;
          await cache.put(
            cacheKey,
            new Response(copy, {
              headers: { "Content-Type": "application/gzip" },
            })
          );
        } catch {
          // Ignore cache write errors
        }
      }
      return { code: lang, data: bytes };
    }
  }

  throw new Error(
    `无法下载${displayLabel}（当前网络访问外部语言包受限）。您可直接手工输入题干保存，或检查网络后重试。`
  );
}

async function preprocessForOcr(imageBase64: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const targetWidth = Math.max(img.width, 1200);
      const scale = targetWidth / img.width;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(imageBase64);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(imageBase64);
    img.src = imageBase64;
  });
}

function cleanOcrText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2")
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2")
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
  if (
    /[÷×=²³√∠△≌]/.test(text) ||
    /算式|方程|函数|平方|长方形|面积|周长|至少需要/.test(text)
  ) {
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
    return (
      parts.join("\n") ||
      "Answer / Model Writing:\nPlease enter the standard English answer here."
    );
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
  onProgress?.("正在准备识图核心引擎...");
  const { workerPath, corePath } = await resolveWorkerAndCorePaths();

  const chiData = await loadLangBinary("chi_sim", "中文识图模型", onProgress);
  const engData = await loadLangBinary("eng", "英文数字模型", onProgress);

  onProgress?.("正在启动本地识图引擎...");
  const worker = await createWorker([chiData, engData], 1, {
    workerPath,
    corePath,
    cacheMethod: "none",
    logger: (m) => {
      if (m.status === "recognizing text") {
        const pct = Math.round((m.progress || 0) * 100);
        onProgress?.(`正在识别题目文字 ${pct}%...`);
      }
    },
  });

  try {
    const processedImg = await preprocessForOcr(imageBase64);
    const {
      data: { text },
    } = await worker.recognize(processedImg);
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

  if (!forceLocalOcr) {
    try {
      onProgress?.("正在连接智能识题服务...");
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
      // Fall back to client-side OCR
    }
  }

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
