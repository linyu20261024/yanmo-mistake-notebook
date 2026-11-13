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

const OCR_CACHE_NAME = "yanmo-ocr-assets-v2";
const TESSERACT_JS_VERSION = "7.0.0";
const TESSERACT_CORE_VERSION = "7.0.0";

function getBaseHref(): string {
  const base = import.meta.env.BASE_URL || "/";
  return new URL(base, window.location.origin).href.replace(/\/?$/, "/");
}

function isGitHubPagesHost(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.hostname.endsWith(".github.io")
  );
}

async function detectOptimalCoreFilename(): Promise<string> {
  try {
    // Exact byte probes matching wasm-feature-detect for relaxedSimd & simd
    const relaxedSimdSupported =
      typeof WebAssembly !== "undefined" &&
      WebAssembly.validate(
        new Uint8Array([
          0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 15,
          1, 13, 0, 65, 1, 253, 15, 65, 2, 253, 15, 253, 128, 2, 11,
        ])
      );
    if (relaxedSimdSupported) {
      return "tesseract-core-relaxedsimd-lstm.wasm.js";
    }

    const simdSupported =
      typeof WebAssembly !== "undefined" &&
      WebAssembly.validate(
        new Uint8Array([
          0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10,
          1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
        ])
      );
    if (simdSupported) {
      return "tesseract-core-simd-lstm.wasm.js";
    }
  } catch {
    // Fallback to baseline LSTM core
  }
  return "tesseract-core-lstm.wasm.js";
}

function isValidGzipHeader(buf: Uint8Array): boolean {
  return buf.length > 64 && buf[0] === 0x1f && buf[1] === 0x8b;
}

function isValidJsAsset(buf: Uint8Array, minBytes: number): boolean {
  if (buf.length < minBytes) return false;
  // Reject HTML 404/fallback pages
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(buf.subarray(0, 64))
    .trimStart()
    .toLowerCase();
  if (head.startsWith("<html") || head.startsWith("<!doctype") || head.startsWith("<")) {
    return false;
  }
  return true;
}

async function fetchWithProgressAndTimeout(
  url: string,
  label: string,
  timeoutMs: number,
  validator: (buf: Uint8Array) => boolean,
  onProgress?: (msg: string) => void
): Promise<Uint8Array | null> {
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return null;

    const ct = (resp.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html")) return null;

    const totalBytes = Number(resp.headers.get("content-length") || 0);
    const reader = resp.body?.getReader();

    if (!reader) {
      const ab = await resp.arrayBuffer();
      const bytes = new Uint8Array(ab);
      return validator(bytes) ? bytes : null;
    }

    const chunks: Uint8Array[] = [];
    let loaded = 0;
    let lastReportAt = 0;

    while (true) {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), timeoutMs);

      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        const now = Date.now();
        if (now - lastReportAt > 120 || loaded === totalBytes) {
          lastReportAt = now;
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
    }

    const merged = new Uint8Array(loaded);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }

    return validator(merged) ? merged : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loadAssetWithCacheAndMirrors(params: {
  cacheKey: string;
  mimeType: string;
  displayLabel: string;
  urls: string[];
  validator: (buf: Uint8Array) => boolean;
  onProgress?: (msg: string) => void;
}): Promise<Uint8Array> {
  const { cacheKey, mimeType, displayLabel, urls, validator, onProgress } = params;

  // 1. Try CacheStorage first
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(OCR_CACHE_NAME);
      const cached = await cache.match(cacheKey);
      if (cached) {
        const bytes = new Uint8Array(await cached.arrayBuffer());
        if (validator(bytes)) {
          onProgress?.(`已从本地缓存读取${displayLabel}`);
          return bytes;
        }
      }
    } catch {
      // Ignore CacheStorage restriction (e.g. private browsing)
    }
  }

  // 2. Try ordered URLs with per-chunk stall timeout
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const isSameOrigin = url.startsWith(window.location.origin);
    const timeoutMs = isSameOrigin && !isGitHubPagesHost() ? 5000 : 8000;

    if (i === 0) {
      onProgress?.(`正在加载${displayLabel}...`);
    } else {
      onProgress?.(`切换备用源加载${displayLabel} (${i}/${urls.length - 1})...`);
    }

    const bytes = await fetchWithProgressAndTimeout(
      url,
      `下载${displayLabel}`,
      timeoutMs,
      validator,
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
              headers: { "Content-Type": mimeType },
            })
          );
        } catch {
          // Ignore cache write errors
        }
      }
      return bytes;
    }
  }

  throw new Error(
    `无法下载${displayLabel}（当前网络访问外部识图资源受限）。您可直接手工输入题干保存，或检查网络后重试。`
  );
}

function orderUrlsForEnvironment(sameOriginUrl: string, mirrorUrls: string[]): string[] {
  // On GitHub Pages in China, Alibaba npmmirror CDN is significantly faster than github.io for multi-MB assets
  if (isGitHubPagesHost()) {
    return [mirrorUrls[0], sameOriginUrl, ...mirrorUrls.slice(1)];
  }
  return [sameOriginUrl, ...mirrorUrls];
}

async function loadLangBinary(
  lang: "chi_sim" | "eng",
  displayLabel: string,
  onProgress?: (msg: string) => void
): Promise<Uint8Array> {
  const baseHref = getBaseHref();
  const sameOriginUrl = `${baseHref}tessdata/${lang}.traineddata.gz`;
  const mirrorUrls = [
    `https://cdn.npmmirror.com/packages/%40tesseract.js-data/${lang}/1.0.0/files/4.0.0_best_int/${lang}.traineddata.gz`,
    `https://fastly.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
    `https://unpkg.com/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
    `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
  ];

  return loadAssetWithCacheAndMirrors({
    cacheKey: `https://yanmo.local/tessdata/4.0.0_best_int/${lang}.traineddata.gz`,
    mimeType: "application/gzip",
    displayLabel,
    urls: orderUrlsForEnvironment(sameOriginUrl, mirrorUrls),
    validator: isValidGzipHeader,
    onProgress,
  });
}

async function loadWorkerBinary(onProgress?: (msg: string) => void): Promise<Uint8Array> {
  const baseHref = getBaseHref();
  const sameOriginUrl = `${baseHref}tesseract/worker.min.js`;
  const mirrorUrls = [
    `https://cdn.npmmirror.com/packages/tesseract.js/${TESSERACT_JS_VERSION}/files/dist/worker.min.js`,
    `https://fastly.jsdelivr.net/npm/tesseract.js@${TESSERACT_JS_VERSION}/dist/worker.min.js`,
    `https://unpkg.com/tesseract.js@${TESSERACT_JS_VERSION}/dist/worker.min.js`,
    `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_JS_VERSION}/dist/worker.min.js`,
  ];

  return loadAssetWithCacheAndMirrors({
    cacheKey: `https://yanmo.local/tesseract/${TESSERACT_JS_VERSION}/worker.min.js`,
    mimeType: "application/javascript",
    displayLabel: "识图调度脚本",
    urls: orderUrlsForEnvironment(sameOriginUrl, mirrorUrls),
    validator: (buf) => isValidJsAsset(buf, 20000),
    onProgress,
  });
}

async function loadCoreBinary(
  coreFilename: string,
  onProgress?: (msg: string) => void
): Promise<Uint8Array> {
  const baseHref = getBaseHref();
  const sameOriginUrl = `${baseHref}tesseract/${coreFilename}`;
  const mirrorUrls = [
    `https://cdn.npmmirror.com/packages/tesseract.js-core/${TESSERACT_CORE_VERSION}/files/${coreFilename}`,
    `https://fastly.jsdelivr.net/npm/tesseract.js-core@${TESSERACT_CORE_VERSION}/${coreFilename}`,
    `https://unpkg.com/tesseract.js-core@${TESSERACT_CORE_VERSION}/${coreFilename}`,
    `https://cdn.jsdelivr.net/npm/tesseract.js-core@${TESSERACT_CORE_VERSION}/${coreFilename}`,
  ];

  return loadAssetWithCacheAndMirrors({
    cacheKey: `https://yanmo.local/tesseract-core/${TESSERACT_CORE_VERSION}/${coreFilename}`,
    mimeType: "application/javascript",
    displayLabel: "识图引擎核心",
    urls: orderUrlsForEnvironment(sameOriginUrl, mirrorUrls),
    validator: (buf) => isValidJsAsset(buf, 500000),
    onProgress,
  });
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
  const baseHref = getBaseHref();
  const coreFilename = await detectOptimalCoreFilename();

  // Pre-fetch & CacheStorage-persist ALL 4 assets on main thread with live MB/% progress
  const workerBytes = await loadWorkerBinary(onProgress);
  const coreBytes = await loadCoreBinary(coreFilename, onProgress);
  const chiBytes = await loadLangBinary("chi_sim", "中文识图模型", onProgress);
  const engBytes = await loadLangBinary("eng", "英文数字模型", onProgress);

  let currentStage = "创建内存识图通道";
  onProgress?.("正在启动本地识图引擎...");

  const coreBlobUrl = URL.createObjectURL(
    new Blob([coreBytes.slice().buffer], { type: "application/javascript" })
  );
  const chiBlobUrl = URL.createObjectURL(
    new Blob([chiBytes.slice().buffer], { type: "application/gzip" })
  );
  const engBlobUrl = URL.createObjectURL(
    new Blob([engBytes.slice().buffer], { type: "application/gzip" })
  );

  // Intercept importScripts and fetch inside the worker so all 4 assets load from RAM Blob URLs
  // with zero worker-side network stalls and zero IndexedDB lock dependencies
  const workerShim = `
const __origImportScripts = self.importScripts.bind(self);
self.importScripts = function(...urls) {
  const mapped = urls.map((u) => String(u).includes("tesseract-core") ? ${JSON.stringify(coreBlobUrl)} : u);
  return __origImportScripts.apply(self, mapped);
};
const __origFetch = self.fetch.bind(self);
self.fetch = function(input, init) {
  const u = typeof input === "string" ? input : (input && typeof input === "object" && "url" in input ? input.url : String(input));
  if (u.includes("chi_sim.traineddata")) {
    return __origFetch(${JSON.stringify(chiBlobUrl)}, init).catch(() => __origFetch(input, init));
  }
  if (u.includes("eng.traineddata")) {
    return __origFetch(${JSON.stringify(engBlobUrl)}, init).catch(() => __origFetch(input, init));
  }
  return __origFetch(input, init);
};
;\n`;

  const workerBlobUrl = URL.createObjectURL(
    new Blob([workerShim, workerBytes.slice().buffer], {
      type: "application/javascript",
    })
  );

  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let startupTimer: ReturnType<typeof setTimeout> | null = null;
  let recogTimer: ReturnType<typeof setTimeout> | null = null;

  try {
    let rejectWorkerError: ((err: Error) => void) | null = null;
    const workerErrorPromise = new Promise<never>((_, reject) => {
      rejectWorkerError = reject;
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      startupTimer = setTimeout(() => {
        reject(
          new Error(
            `本地识图引擎在「${currentStage}」阶段超时，请刷新页面后重试或直接手工输入题干。`
          )
        );
      }, 35000);
    });

    const createPromise = createWorker("chi_sim+eng", 1, {
      workerPath: workerBlobUrl,
      workerBlobURL: false,
      corePath: `${baseHref}tesseract/${coreFilename}`,
      langPath: `${baseHref}tessdata`,
      cacheMethod: "none",
      errorHandler: (err) => {
        rejectWorkerError?.(
          new Error(typeof err === "string" ? err : "识图引擎内部初始化失败")
        );
      },
      logger: (m) => {
        if (m.status === "loading tesseract core") {
          currentStage = "加载 WASM 核心";
          onProgress?.("正在加载识图 WASM 核心...");
        } else if (m.status === "initializing tesseract") {
          currentStage = "编译 WASM 核心";
          onProgress?.("正在初始化识图内核...");
        } else if (m.status === "loading language traineddata") {
          const pct = Math.round((m.progress || 0) * 100);
          currentStage = `解压语言模型 ${pct}%`;
          onProgress?.(`正在解压语言模型 ${pct}%...`);
        } else if (m.status === "initializing api") {
          currentStage = "初始化识别引擎";
          onProgress?.("正在初始化文字识别引擎...");
        } else if (m.status === "recognizing text") {
          const pct = Math.round((m.progress || 0) * 100);
          currentStage = `识别文字 ${pct}%`;
          onProgress?.(`正在识别题目文字 ${pct}%...`);
        }
      },
    });

    worker = await Promise.race([createPromise, workerErrorPromise, timeoutPromise]);
    if (startupTimer) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }

    onProgress?.("正在优化图片并识别文字...");
    const processedImg = await preprocessForOcr(imageBase64);

    const {
      data: { text },
    } = await Promise.race([
      worker.recognize(processedImg),
      new Promise<never>((_, reject) => {
        recogTimer = setTimeout(
          () => reject(new Error("文字识别超时，请适当缩小框选范围后重试。")),
          30000
        );
      }),
    ]);

    if (recogTimer) {
      clearTimeout(recogTimer);
      recogTimer = null;
    }

    return cleanOcrText(text || "");
  } finally {
    if (startupTimer) clearTimeout(startupTimer);
    if (recogTimer) clearTimeout(recogTimer);
    if (worker) {
      await worker.terminate().catch(() => {});
    }
    URL.revokeObjectURL(workerBlobUrl);
    URL.revokeObjectURL(coreBlobUrl);
    URL.revokeObjectURL(chiBlobUrl);
    URL.revokeObjectURL(engBlobUrl);
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
