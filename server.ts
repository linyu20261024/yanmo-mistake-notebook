import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "20mb" }));

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

app.post("/api/extract-mistake", async (req, res) => {
  try {
    const { imageBase64, mimeType, preferredSubject, studentGrade } = req.body as {
      imageBase64?: string;
      mimeType?: string;
      preferredSubject?: string;
      studentGrade?: string;
    };

    if (!imageBase64) {
      res.status(400).json({ error: "请先选择或裁剪需要识别的错题图片区域。" });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: "未检测到服务端 GEMINI_API_KEY，已自动为您保留本地手工录题模式。",
      });
      return;
    }

    const cleanBase64 = imageBase64.includes(",")
      ? imageBase64.split(",")[1]
      : imageBase64;

    const prompt = `你是一名经验丰富的中小学全科阅卷与错题整理教师。
请仔细识别这张学生试卷/作业裁剪图片中的题目内容、学生手写错解（如有）以及教师批改痕迹。
${studentGrade ? `学生年级背景：${studentGrade}。` : ""}
${preferredSubject && preferredSubject !== "自动识别" ? `优先按学科【${preferredSubject}】理解。` : ""}

请提取并生成以下结构化错题信息（全部使用清晰规范的中文，英语题题干和范文保留英文）：
1. subject: 学科名称，必须是以下之一：数学、语文、英语、物理、化学、生物、历史、地理、道德与法治。
2. questionType: 题型，如：选择题、填空题、解答题、计算题、作文/书面表达、阅读理解、实验题。
3. knowledgePoint: 核心知识点（简明扼要，2-8字，如“二次函数最值”、“宾语从句”、“牛顿第二定律”）。
4. questionText: 完整清晰的题干文本（保留数学符号、换行和选项，修复OCR断行，不要包含学生错写过程）。
5. studentWrongAnswer: 图片中观察到的学生原错解或错因简述（若图片中无手写答案则留空或写“未作答”）。
6. errorReason: 错因归类，如“计算粗心”、“概念混淆”、“审题偏差”、“步骤不规范”、“语法/拼写错误”。
7. standardAnswer: 精炼的标准答案。
8. correctionSteps: 详细的订正解析与解题思路。
9. handwritingTemplate: 专用于“浅色规范卷面描红”的【考场规范答题范例】（只包含规范答题过程与结论，不要把原题题干抄进去）：
   - 选择题/填空题：写出“答：选 X。”以及分步推导解析范例；
   - 数学/物理/化学大题：必须包含“解：”或“证明：”、分步编号(1)(2)、“答：”等规范卷面作答格式，每行长度适中以便在A4纸答题卡上临摹描红；
   - 英语作文或句子改错：输出完整规范的英文满分作答段落；
   - 语文默写/简答：输出分点规范的“答：1. ... 2. ...”规范作答文本。`;

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || "image/jpeg",
              data: cleanBase64,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            questionType: { type: Type.STRING },
            knowledgePoint: { type: Type.STRING },
            questionText: { type: Type.STRING },
            studentWrongAnswer: { type: Type.STRING },
            errorReason: { type: Type.STRING },
            standardAnswer: { type: Type.STRING },
            correctionSteps: { type: Type.STRING },
            handwritingTemplate: { type: Type.STRING },
          },
          required: [
            "subject",
            "questionType",
            "knowledgePoint",
            "questionText",
            "standardAnswer",
            "correctionSteps",
            "handwritingTemplate",
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? "{}").trim());
    res.json({ result: parsed });
  } catch (error) {
    console.error("Extract mistake error:", error);
    const message = error instanceof Error ? error.message : "识题服务暂时不可用";
    res.status(500).json({ error: `识题处理失败：${message}` });
  }
});

app.post("/api/format-handwriting", async (req, res) => {
  try {
    const { subject, questionText, rawCorrection } = req.body as {
      subject?: string;
      questionText?: string;
      rawCorrection?: string;
    };

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({ error: "未配置 GEMINI_API_KEY" });
      return;
    }

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: `请将以下【${subject || "学科"}】错题订正内容，改写为适合在A4答题卡/字帖上“浅色描红临摹”的考场满分规范卷面文本。
要求：
1. 格式严格对齐阅卷得分点，如使用“解：”、“证明：”、“答：”、“①”、“②”或分段缩进；
2. 语言精炼、逻辑递进清晰，去掉口语化废话；
3. 直接输出可用于描红的纯文本内容，不要加Markdown代码块或多余解释。

题目：${questionText || ""}
原订正内容：${rawCorrection || ""}`,
    });

    res.json({ formattedText: (response.text ?? "").trim() });
  } catch (error) {
    console.error("Format handwriting error:", error);
    const message = error instanceof Error ? error.message : "规范卷面生成失败";
    res.status(500).json({ error: message });
  }
});

app.post("/api/proofread-ocr", async (req, res) => {
  try {
    const { rawText, subject } = req.body as {
      rawText?: string;
      subject?: string;
    };
    if (!rawText || !rawText.trim()) {
      res.status(400).json({ error: "请先提供需要逻辑修正的文本。" });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({ error: "未配置 GEMINI_API_KEY" });
      return;
    }

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: `你是一名中小学全科试卷校对教师。下面这段文字是从试卷照片离线 OCR 识别出来的，存在形近错别字（如“频子→瓶子”、“彩迟→彩带”、“华果→苹果”）、数学符号误识别（如“二→÷”、“<→≈”、“k8→kg”、“0:4→0.4”、“7→？”）、选项序号错位（如“8，”应为“B.”）或红笔涂抹导致的乱码。
请结合【${subject || "中小学学科"}】语义、上下文数值一致性与题型结构逻辑，将它修正为通顺、规范的试卷原题文本（保留换行与 A/B/C/D 选项排版；对完全缺失且无法确定原词的地方用“[待核对]”标注，切勿凭空编造无关题目）。

待校对文本：
${rawText}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            correctedText: { type: Type.STRING },
            notes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["correctedText", "notes"],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? "{}").trim());
    res.json({
      correctedText: parsed.correctedText || rawText,
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    });
  } catch (error) {
    console.error("Proofread OCR error:", error);
    const message = error instanceof Error ? error.message : "文本逻辑纠偏失败";
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
