import { createWorker, PSM } from "tesseract.js";
import { SUBJECTS, Subject } from "../types";

export interface ExtractedMistakeResult {
  subject: Subject;
  questionType: string;
  knowledgePoint: string;
  questionText: string;
  rawQuestionText?: string;
  correctionNotes?: string[];
  uncertainSpots?: string[];
  studentWrongAnswer: string;
  errorReason: string;
  standardAnswer: string;
  correctionSteps: string;
  handwritingTemplate: string;
}

export interface LogicalCorrectionResult {
  correctedText: string;
  appliedFixes: string[];
  uncertainSpots: string[];
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
      const targetWidth = Math.min(2600, Math.max(img.width * 1.4, 1600));
      const scale = Math.max(1, targetWidth / img.width);
      const drawW = Math.round(img.width * scale);
      const drawH = Math.round(img.height * scale);
      const pad = 28;

      const canvas = document.createElement("canvas");
      canvas.width = drawW + pad * 2;
      canvas.height = drawH + pad * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(imageBase64);
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, pad, pad, drawW, drawH);

      // Clean paper background, boost black printed ink, and remove red pen marks
      const imgData = ctx.getImageData(pad, pad, drawW, drawH);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];

        // Suppress red teacher annotations / checkmarks that scramble nearby characters
        if (r > 125 && r - g > 28 && r - b > 28) {
          d[i] = 255;
          d[i + 1] = 255;
          d[i + 2] = 255;
          continue;
        }

        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        let out: number;
        if (lum >= 188) {
          out = 255;
        } else if (lum <= 95) {
          out = Math.max(0, Math.round(lum * 0.45));
        } else {
          // Smooth contrast curve preserving thin punctuation & math symbols
          const t = (lum - 95) / (188 - 95);
          out = Math.round(42 + Math.pow(t, 1.35) * 213);
        }
        d[i] = out;
        d[i + 1] = out;
        d[i + 2] = out;
      }
      ctx.putImageData(imgData, pad, pad);

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

const KNOWN_EN_ACRONYMS = new Set([
  "DNA", "RNA", "ATP", "USA", "RMB", "CPU", "GPU", "HTTP", "HTML",
  "WIFI", "CCTV", "KG", "CM", "MM", "KM", "ML", "PH", "LED", "LCD",
]);

export function correctOcrTextByLogic(rawText: string): LogicalCorrectionResult {
  const input = cleanOcrText(rawText);
  if (!input) {
    return { correctedText: "", appliedFixes: [], uncertainSpots: [] };
  }

  const cjkCount = (input.match(/[\u4e00-\u9fff]/g) || []).length;
  // Keep pure English passages mostly intact, only normalizing spacing
  if (cjkCount < 5 && cjkCount < input.length * 0.1) {
    return { correctedText: input, appliedFixes: [], uncertainSpots: [] };
  }

  const fixes = new Set<string>();
  const uncertainSpots: string[] = [];

  let text = input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u00a0/g, " ");

  // 1. Fix broken decimal spaces (e.g. "2. 5" -> "2.5", "0. 4" -> "0.4")
  const beforeDec = text;
  text = text.replace(/(\d)\s*\.\s*(\d)/g, "$1.$2");
  if (text !== beforeDec) fixes.add("合并小数点异常空格");

  // 2. Fix CJK inter-character spaces & spaces before Chinese punctuation
  text = text
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2")
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2")
    .replace(/([\u4e00-\u9fff0-9A-Za-z）\)”"』])\s+([，。？！；：、])/g, "$1$2")
    .replace(/([，。？！；：、])\s*([，。？！；：、])/g, "$1");

  // 3. Math expression & symbol repairs
  const beforeMath = text;
  // Colon used as decimal point after 0 or inside equations (e.g., "0:4" -> "0.4")
  text = text.replace(/(?<![:\d])0[:：](\d+)/g, "0.$1");
  // "二" misrecognized for "÷" between numbers inside arithmetic expressions
  text = text.replace(
    /(\d+(?:\.\d+)?)\s*二\s*(\d+(?:\.\d+)?)/g,
    (match, a, b, offset) => {
      const sliceAfter = text.slice(offset + match.length, offset + match.length + 12);
      const sliceBefore = text.slice(Math.max(0, offset - 16), offset);
      if (
        /[<≈=~～]/.test(sliceAfter) ||
        /算式|分装|平均|最多|至少|除以/.test(sliceBefore + text)
      ) {
        return `${a} ÷ ${b}`;
      }
      return match;
    }
  );
  // "<7" or "~7" at the end of a division expression inside "算式" -> "≈ 7"
  text = text.replace(
    /(\d+(?:\.\d+)?)\s*[÷/]\s*(\d+(?:\.\d+)?)\s*[<~～]\s*(\d+(?:\.\d+)?)/g,
    "$1 ÷ $2 ≈ $3"
  );
  // Unit OCR confusions: k8 -> kg, 0.4n -> 0.4 m
  text = text.replace(/(\d+(?:\.\d+)?)\s*k8\b/gi, "$1 kg");
  if (/长|宽|米|彩带|绳|长方形|正方形/.test(text)) {
    text = text.replace(/(\d+(?:\.\d+)?)\s*n(?=[\s，,。？?\u4e00-\u9fff]|$)/g, "$1 m");
  }
  if (/面积/.test(text) && /\bm\b|米/.test(text)) {
    text = text.replace(
      /面积是\s*(\d+(?:\.\d+)?)\s*(?:m2|m²|平方米)?\s*的(长方形|正方形|三角形|平行四边形|梯形)/g,
      "面积是 $1 m² 的$2"
    );
  }
  if (text !== beforeMath) fixes.add("修正算式符号、小数点与单位（如 ÷、≈、kg、m、m²）");

  // 4. Common Chinese exam OCR glyph-confusion fixes
  const glyphReplacements: Array<[RegExp, string, string]> = [
    [/登个/g, "每个", "修正形近错字"],
    [/每介/g, "每个", "修正形近错字"],
    [/频子/g, "瓶子", "修正形近错字"],
    [/彩迟/g, "彩带", "修正形近错字"],
    [/去笑超市/g, "去逛超市", "修正形近错字"],
    [/笑超市/g, "逛超市", "修正形近错字"],
    [/招市/g, "超市", "修正形近错字"],
    [/华果/g, "苹果", "修正形近错字"],
    [/长方开/g, "长方形", "修正形近错字"],
    [/正方开/g, "正方形", "修正形近错字"],
    [/(买[了]?\s*[\d.]+\s*(?:kg|千克|斤|克)\s*)桨/gi, "$1梨", "修正形近错字"],
    [/桨(的质量|的重|有多少|比)/g, "梨$1", "修正形近错字"],
    [/多少条\s*[7?？]/g, "多少倍？", "按语义修正“多少条→多少倍”"],
    [/多少条/g, "多少倍", "按语义修正“多少条→多少倍”"],
  ];

  for (const [pattern, rep, label] of glyphReplacements) {
    const prev = text;
    text = text.replace(pattern, rep);
    if (text !== prev) fixes.add(label);
  }

  // 5. Line-by-line option sequence & cross-line number anchor logic
  let lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Detect dominant decimal/number anchors appearing in >= 2 lines
  const numberCounts = new Map<string, number>();
  for (const line of lines) {
    const matches = new Set(line.match(/\b\d+\.\d+\b/g) || []);
    for (const num of matches) {
      numberCounts.set(num, (numberCounts.get(num) || 0) + 1);
    }
  }
  const anchorNumbers = [...numberCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([num]) => num);

  // Clean option headers & detect sequence (A -> B -> C -> D)
  const optionLetters = lines.map((line) => {
    const m = line.match(/^([A-Da-d])(?:[\s\.．、,，]+|$)/);
    return m ? m[1].toUpperCase() : "";
  });

  lines = lines.map((line, idx) => {
    let cur = line;

    // Repair misread option numbers like "8，" between A and C -> "B. "
    if (!optionLetters[idx]) {
      const prevOpt = idx > 0 ? optionLetters[idx - 1] : "";
      const nextOpt = idx + 1 < lines.length ? optionLetters[idx + 1] : "";
      if ((prevOpt === "A" || nextOpt === "C") && /^[836][，,.\s]+/.test(cur)) {
        cur = cur.replace(/^[836][，,.\s]+/, "B. ");
        optionLetters[idx] = "B";
        fixes.add("按 A-B-C-D 顺序逻辑修正选项序号");
      } else if ((prevOpt === "C" || nextOpt === "") && prevOpt === "C" && /^[0O][，,.\s]+/.test(cur)) {
        cur = cur.replace(/^[0O][，,.\s]+/, "D. ");
        optionLetters[idx] = "D";
        fixes.add("按 A-B-C-D 顺序逻辑修正选项序号");
      }
    } else {
      cur = cur.replace(/^([A-Da-d])[\s\.．、,，]+/, (_, ch: string) => `${ch.toUpperCase()}. `);
    }

    // Cross-line number anchor consistency (e.g. "BA 5 升" -> "2.5 升", "0.477" -> "0.4 升")
    for (const anchor of anchorNumbers) {
      const parts = anchor.split(".");
      if (parts.length === 2) {
        const tail = parts[1];
        // Broken first digit before decimal tail + unit, e.g. "BA 5 升" when "2.5" is shared across lines
        const brokenHeadRe = new RegExp(
          `([A-D]\\.\\s*|需要|共有|买了|有)\\s*[A-Za-z]{1,3}\\s*${tail}\\s*([升米克个]|kg|cm|m\\b)`,
          "g"
        );
        const beforeAnchor = cur;
        cur = cur.replace(brokenHeadRe, `$1${anchor} $2`);
        if (cur !== beforeAnchor) {
          fixes.add(`依据上下文一致数值「${anchor}」修复破损数字`);
        }

        // Extra trailing "7"/"升" noise on anchor decimal like "0.477." near "瓶子/装"
        if (anchor.startsWith("0.") && tail.length === 1) {
          const brokenTailRe = new RegExp(
            `(最多能装|每[个条张].*?分|宽是|高是|重)\\s*0\\.${tail}7+\\.?`,
            "g"
          );
          const beforeTail = cur;
          cur = cur.replace(brokenTailRe, (_, prefix: string) =>
            /装|油|水|瓶|升/.test(cur) ? `${prefix} ${anchor} 升。` : `${prefix} ${anchor}`
          );
          if (cur !== beforeTail) {
            fixes.add(`依据上下文一致数值「${anchor}」清理末尾杂音`);
          }
        }
      }
    }

    // Clean trailing stroke debris from red ticks (e.g. " a A-", " -")
    cur = cur
      .replace(/\s+[a-zA-Z]\s+[A-Z][-—]?\s*$/, "")
      .replace(/\s+[-—_·]+\s*$/, "")
      .trim();

    // Fix trailing "?" misread as "7", "儿", "1" in Chinese interrogative lines
    if (/多少|几个|几[条只名辆天倍]|什么|哪[个道条种]|怎么|为什么|是否|能否/.test(cur)) {
      const beforeQ = cur;
      cur = cur
        .replace(/([多少几倍米克升个元人只条])\s*[71儿?]\s*\.?\s*$/, "$1？")
        .replace(/\s+7\s*$/, "？");
      if (cur !== beforeQ) fixes.add("修正疑问句末尾误识别的“？”号");
    }

    // Stem parenthesis cleanup (e.g. `“2.5 ÷ 0.4 ≈ 7” Ca NY 一 )` -> flag occluded phrase)
    if (
      idx === 0 &&
      !/^[A-D]\./.test(cur) &&
      /[”"』]\s*[A-Za-z0-9\u4e00-\u9fff\s]{2,20}[)）]\s*$/.test(cur)
    ) {
      const stemMatch = cur.match(/^(.*[”"』])\s*(.+?)\s*[)）]\s*$/);
      if (stemMatch) {
        const [, prefix, middle] = stemMatch;
        const latinCount = (middle.match(/[A-Za-z]/g) || []).length;
        if (latinCount >= 2 && middle.length <= 22) {
          const cleanNote = middle.trim();
          cur = `${prefix} [待核对遮挡词：${cleanNote}] （  ）`;
          uncertainSpots.push(`题干末尾括号前疑被红笔遮挡（原识：“${cleanNote}”）`);
          fixes.add("规范题干括号并标注被遮挡待核对位置");
        }
      }
    }

    // Detect garbled all-caps/mixed ASCII gibberish inside predominantly Chinese option lines
    const lineCjk = (cur.match(/[\u4e00-\u9fff]/g) || []).length;
    if (lineCjk >= 5) {
      cur = cur.replace(
        /\b([A-Z]{4,}(?:\s+[A-Z]{3,})*)\b\.?/g,
        (full, phrase: string) => {
          const words = phrase.trim().split(/\s+/);
          if (words.every((w) => KNOWN_EN_ACRONYMS.has(w))) return full;
          uncertainSpots.push(`原识“${phrase}”疑似字迹遮挡或乱码，建议对照原图补全`);
          fixes.add("标出疑似乱码位置供快速核对");
          return `[待核对：${phrase}]`;
        }
      );
    }

    // Fix missing "一" when "." replaced "一" before "个/条/张/瓶/块" (e.g. "画了 .个" -> "画了一个")
    cur = cur.replace(/(了|有|买|分|画了)\s*[\.·]\s*([个条张瓶块道名位])/g, "$1一$2");

    // Add missing comma before dimension question clause (e.g. "宽是 0.4 m 长是多少米？")
    cur = cur.replace(/(\d+(?:\.\d+)?\s*(?:m|cm|dm|km|米|厘米|分米))[ \t]+(长是|宽是|高是|面积是|周长是)/g, "$1，$2");

    // Normalize mismatched English closing quote after Chinese opening quote
    cur = cur.replace(/“([^”\n"]{1,40})"/g, "“$1”");

    return cur;
  });

  // Clean horizontal spaces around punctuation while preserving line breaks
  const correctedText = lines
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/([A-D])\.\s+/g, "$1. ")
    .replace(/([，。？！；：])[ \t]+/g, "$1")
    .trim();

  return {
    correctedText,
    appliedFixes: [...fixes],
    uncertainSpots: [...new Set(uncertainSpots)],
  };
}

export async function proofreadOcrText(
  rawText: string,
  subject?: string
): Promise<{
  mode: "ai" | "local-logic";
  correctedText: string;
  appliedFixes: string[];
  uncertainSpots: string[];
}> {
  if (!rawText.trim()) {
    return {
      mode: "local-logic",
      correctedText: "",
      appliedFixes: [],
      uncertainSpots: [],
    };
  }

  try {
    const resp = await fetch("/api/proofread-ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText, subject }),
    });
    const contentType = resp.headers.get("content-type") || "";
    if (resp.ok && contentType.includes("application/json")) {
      const data = await resp.json();
      if (data?.correctedText) {
        return {
          mode: "ai",
          correctedText: String(data.correctedText).trim(),
          appliedFixes: Array.isArray(data.notes) ? data.notes : ["已完成智能语义校对"],
          uncertainSpots: [],
        };
      }
    }
  } catch {
    // Fall back to offline logical corrector
  }

  const localResult = correctOcrTextByLogic(rawText);
  return {
    mode: "local-logic",
    ...localResult,
  };
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
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: "1",
    });
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

  const rawRecognizedText = await runBrowserOcr(imageBase64, onProgress);
  const { correctedText, appliedFixes, uncertainSpots } =
    correctOcrTextByLogic(rawRecognizedText);
  const subject = inferSubject(correctedText || rawRecognizedText, preferredSubject);
  const questionType = inferQuestionType(correctedText || rawRecognizedText);

  return {
    mode: "local-ocr",
    result: {
      subject,
      questionType,
      knowledgePoint: "",
      questionText: correctedText,
      rawQuestionText: rawRecognizedText,
      correctionNotes: appliedFixes,
      uncertainSpots,
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
