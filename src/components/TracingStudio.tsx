import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Eraser,
  Loader2,
  PenTool,
  Printer,
  RotateCcw,
  Sparkles,
  Undo2,
} from "lucide-react";
import {
  FontStyle,
  GridType,
  MistakeItem,
  PracticeMode,
  Student,
  SUBJECTS,
  Subject,
  TraceColor,
  TracingConfig,
} from "../types";

interface TracingStudioProps {
  activeStudent: Student | null;
  mistakes: MistakeItem[];
  initialDraft?: {
    mistakeId?: string;
    subject: Subject;
    title: string;
    content: string;
  } | null;
  onRecordPracticeComplete: (mistakeId: string) => void;
}

const TRACE_COLORS: Record<TraceColor, { label: string; rgb: string; hex: string }> = {
  slate: { label: "浅墨灰（推荐打印）", rgb: "51, 65, 85", hex: "#334155" },
  vermilion: { label: "浅朱红（传统描红）", rgb: "220, 38, 38", hex: "#DC2626" },
  indigo: { label: "浅靛蓝（字帖专色）", rgb: "29, 78, 216", hex: "#1D4ED8" },
};

const GRID_OPTIONS: { id: GridType; label: string }[] = [
  { id: "lined", label: "标准横线答题卡" },
  { id: "tianzige", label: "语文田字格" },
  { id: "mizige", label: "楷书米字格" },
  { id: "english_4line", label: "英语四线三格" },
  { id: "square", label: "方格稿纸" },
];

export const TracingStudio: React.FC<TracingStudioProps> = ({
  activeStudent,
  mistakes,
  initialDraft,
  onRecordPracticeComplete,
}) => {
  const defaultMistake =
    mistakes.find((m) => m.id === initialDraft?.mistakeId) || mistakes[0];

  const [selectedMistakeId, setSelectedMistakeId] = useState<string>(
    initialDraft?.mistakeId || defaultMistake?.id || ""
  );

  const [config, setConfig] = useState<TracingConfig>(() => {
    const subj = initialDraft?.subject || defaultMistake?.subject || "数学";
    return {
      title:
        initialDraft?.title ||
        defaultMistake?.knowledgePoint ||
        "规范卷面书写描红训练",
      subject: subj,
      content:
        initialDraft?.content ||
        defaultMistake?.handwritingTemplate ||
        "解：请在此输入或选择错题订正范例，系统将自动排版为浅色规范卷面供临摹描红。",
      gridType:
        subj === "英语" ? "english_4line" : subj === "语文" ? "tianzige" : "lined",
      traceColor: "slate",
      traceOpacity: 24,
      fontSize: subj === "语文" ? 24 : 20,
      lineHeight: 2.2,
      fontStyle: subj === "英语" ? "english_neat" : "kaiti",
      practiceMode: "alternating_copy",
      showMarginGuide: true,
    };
  });

  // Sync when user jumps from MistakeBook or CaptureStudio
  useEffect(() => {
    if (!initialDraft) return;
    if (initialDraft.mistakeId) {
      setSelectedMistakeId(initialDraft.mistakeId);
    }
    setConfig((prev) => ({
      ...prev,
      title: initialDraft.title,
      subject: initialDraft.subject,
      content: initialDraft.content,
      gridType:
        initialDraft.subject === "英语"
          ? "english_4line"
          : initialDraft.subject === "语文"
          ? "tianzige"
          : "lined",
      fontStyle: initialDraft.subject === "英语" ? "english_neat" : "kaiti",
    }));
  }, [initialDraft]);

  // Interactive screen tracing pad state
  const [drawModeEnabled, setDrawModeEnabled] = useState<boolean>(false);
  const [penColor, setPenColor] = useState<string>("#0F172A");
  const [penSize, setPenSize] = useState<number>(2.5);
  const [isEraser, setIsEraser] = useState<boolean>(false);
  const [practiceCompletedToast, setPracticeCompletedToast] = useState<boolean>(false);
  const [formattingAI, setFormattingAI] = useState<boolean>(false);
  const [formatError, setFormatError] = useState<string>("");

  const sheetContainerRef = useRef<HTMLDivElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const strokeHistoryRef = useRef<ImageData[]>([]);

  const handleSelectMistake = (id: string) => {
    setSelectedMistakeId(id);
    const m = mistakes.find((item) => item.id === id);
    if (!m) return;
    setConfig((prev) => ({
      ...prev,
      title: `${m.knowledgePoint} · 规范订正`,
      subject: m.subject,
      content: m.handwritingTemplate || m.correctionSteps || m.standardAnswer,
      gridType:
        m.subject === "英语"
          ? "english_4line"
          : m.subject === "语文"
          ? "tianzige"
          : "lined",
      fontStyle: m.subject === "英语" ? "english_neat" : "kaiti",
    }));
    clearDrawCanvas();
  };

  // Resize drawing canvas to match paper sheet container
  useEffect(() => {
    const syncSize = () => {
      const container = sheetContainerRef.current;
      const canvas = drawCanvasRef.current;
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (canvas.width !== Math.round(rect.width) || canvas.height !== Math.round(rect.height)) {
        canvas.width = Math.round(rect.width);
        canvas.height = Math.round(rect.height);
      }
    };
    syncSize();
    const timer = setTimeout(syncSize, 120);
    window.addEventListener("resize", syncSize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", syncSize);
    };
  }, [config, drawModeEnabled]);

  const clearDrawCanvas = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    strokeHistoryRef.current = [];
  };

  const handleUndoStroke = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const prev = strokeHistoryRef.current.pop();
    if (prev) {
      ctx.putImageData(prev, 0, 0);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawModeEnabled) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Save snapshot for undo
    if (strokeHistoryRef.current.length > 25) {
      strokeHistoryRef.current.shift();
    }
    strokeHistoryRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((e.clientY - rect.top) * canvas.height) / rect.height;

    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = isEraser ? penSize * 5 : penSize;
    ctx.globalCompositeOperation = isEraser ? "destination-out" : "source-over";
    ctx.strokeStyle = penColor;
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawModeEnabled || !isDrawingRef.current) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((e.clientY - rect.top) * canvas.height) / rect.height;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleCanvasPointerUp = () => {
    isDrawingRef.current = false;
  };

  const handleAIFormatStandard = async () => {
    setFormattingAI(true);
    setFormatError("");
    try {
      const m = mistakes.find((item) => item.id === selectedMistakeId);
      const resp = await fetch("/api/format-handwriting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: config.subject,
          questionText: m?.questionText || config.title,
          rawCorrection: config.content,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "规范排版请求失败");
      }
      if (data.formattedText) {
        setConfig((prev) => ({ ...prev, content: data.formattedText }));
      }
    } catch (err) {
      setFormatError(
        err instanceof Error ? err.message : "排版整理失败，请手工微调换行。"
      );
    } finally {
      setFormattingAI(false);
    }
  };

  const traceRgba = `rgba(${TRACE_COLORS[config.traceColor].rgb}, ${config.traceOpacity / 100})`;
  const fontClass =
    config.fontStyle === "kaiti"
      ? "font-kaiti"
      : config.fontStyle === "serif"
      ? "font-serif-sc"
      : "font-english-neat";

  // Split content into lines for lined / 4-line / character grids
  const contentLines = useMemo(() => {
    const rawLines = config.content.split("\n");
    return rawLines.length > 0 ? rawLines : [""];
  }, [config.content]);

  // For character grids (田字格 / 米字格 / 方格), chunk lines into rows of N cells
  const cellsPerRow = config.fontSize >= 26 ? 12 : config.fontSize >= 22 ? 14 : 16;

  const charRows = useMemo(() => {
    const rows: string[][] = [];
    contentLines.forEach((line) => {
      const chars = Array.from(line);
      if (chars.length === 0) {
        rows.push(Array(cellsPerRow).fill(""));
        return;
      }
      for (let i = 0; i < chars.length; i += cellsPerRow) {
        const slice = chars.slice(i, i + cellsPerRow);
        while (slice.length < cellsPerRow) slice.push("");
        rows.push(slice);
      }
    });
    return rows;
  }, [contentLines, cellsPerRow]);

  const handleFinishTraining = () => {
    if (selectedMistakeId) {
      onRecordPracticeComplete(selectedMistakeId);
    }
    setPracticeCompletedToast(true);
    setTimeout(() => setPracticeCompletedToast(false), 3000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left / Main Stage: Light-Colored Tracing Sheet A4 Preview (8 cols) */}
      <div className="lg:col-span-8 space-y-3">
        {/* Stage Top Action Bar */}
        <div className="no-print bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawModeEnabled((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                drawModeEnabled
                  ? "bg-blue-700 text-white border-blue-700"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              {drawModeEnabled ? "屏幕描红中（可手写）" : "开启屏幕手写试描"}
            </button>

            {drawModeEnabled && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsEraser(false);
                    setPenColor("#0F172A");
                  }}
                  className={`w-5 h-5 rounded-full bg-slate-900 border-2 ${
                    !isEraser && penColor === "#0F172A" ? "border-blue-500" : "border-transparent"
                  }`}
                  title="黑笔"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsEraser(false);
                    setPenColor("#1E3A8A");
                  }}
                  className={`w-5 h-5 rounded-full bg-blue-900 border-2 ${
                    !isEraser && penColor === "#1E3A8A" ? "border-blue-400" : "border-transparent"
                  }`}
                  title="蓝黑钢笔"
                />
                <button
                  type="button"
                  onClick={() => setIsEraser((v) => !v)}
                  className={`p-1.5 rounded-md text-xs border ${
                    isEraser
                      ? "bg-amber-50 border-amber-300 text-amber-800"
                      : "bg-white border-slate-200 text-slate-600"
                  }`}
                  title="橡皮擦"
                >
                  <Eraser className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleUndoStroke}
                  className="p-1.5 rounded-md text-xs bg-white border border-slate-200 text-slate-600 hover:text-slate-900"
                  title="撤销一笔"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={clearDrawCanvas}
                  className="p-1.5 rounded-md text-xs bg-white border border-slate-200 text-slate-600 hover:text-slate-900"
                  title="清空试写字迹"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleFinishTraining}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {practiceCompletedToast ? "已打卡本次卷面训练" : "完成本次描红打卡"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              打印 A4 浅色描红字帖
            </button>
          </div>
        </div>

        {/* Printable A4 Tracing Worksheet */}
        <div
          ref={sheetContainerRef}
          className="print-container relative bg-white border border-slate-200 rounded-xl p-7 sm:p-10 shadow-xs overflow-hidden"
        >
          {/* Sheet Header */}
          <div className="border-b-2 border-slate-800 pb-3 mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500 mb-1">
                错题卷面规范书写训练 · 浅色临摹描红字帖
              </div>
              <h3 className="text-xl font-bold text-slate-900 font-serif-sc">
                {config.title || "规范卷面描红训练"}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 tabular-nums">
              <span>学生：{activeStudent?.name || "________"}</span>
              <span>班级：{activeStudent?.className || "________"}</span>
              <span>学科：{config.subject}</span>
              <span>日期：____年__月__日</span>
            </div>
          </div>

          {/* Mode: Split Column (Left Light Trace, Right Blank Practice) */}
          {config.practiceMode === "split_column" ? (
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-slate-400 pb-1 border-b border-slate-200">
                  左侧 · 浅色规范范例描红区
                </div>
                {contentLines.map((line, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: `${Math.max(14, config.fontSize - 3)}px`,
                      lineHeight: config.lineHeight,
                      color: traceRgba,
                    }}
                    className={`${fontClass} border-b border-slate-200 min-h-[2.2em] whitespace-pre-wrap px-1`}
                  >
                    {line || " "}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-slate-400 pb-1 border-b border-slate-200">
                  右侧 · 独立规范仿写区
                </div>
                {contentLines.map((_, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: `${Math.max(14, config.fontSize - 3)}px`,
                      lineHeight: config.lineHeight,
                    }}
                    className="border-b border-slate-200 min-h-[2.2em]"
                  >
                    &nbsp;
                  </div>
                ))}
              </div>
            </div>
          ) : config.gridType === "tianzige" ||
            config.gridType === "mizige" ||
            config.gridType === "square" ? (
            /* Character Grid Rendering (田字格 / 米字格 / 方格) */
            <div className="space-y-2.5">
              {charRows.map((row, rowIdx) => {
                const cellPx = Math.round(config.fontSize * 1.85);
                const renderGridRow = (chars: string[], isBlankCopyRow: boolean, keySuffix: string) => (
                  <div
                    key={`${rowIdx}-${keySuffix}`}
                    className="grid border-t border-l border-slate-300"
                    style={{
                      gridTemplateColumns: `repeat(${cellsPerRow}, minmax(0, 1fr))`,
                    }}
                  >
                    {chars.map((ch, colIdx) => (
                      <div
                        key={colIdx}
                        style={{ height: `${cellPx}px` }}
                        className="relative border-r border-b border-slate-300 flex items-center justify-center select-none"
                      >
                        {/* Crosshairs for 田字格 & 米字格 */}
                        {(config.gridType === "tianzige" || config.gridType === "mizige") && (
                          <svg
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                            className="absolute inset-0 w-full h-full pointer-events-none"
                          >
                            <line
                              x1="50"
                              y1="0"
                              x2="50"
                              y2="100"
                              stroke="#CBD5E1"
                              strokeWidth="1"
                              strokeDasharray="3 3"
                            />
                            <line
                              x1="0"
                              y1="50"
                              x2="100"
                              y2="50"
                              stroke="#CBD5E1"
                              strokeWidth="1"
                              strokeDasharray="3 3"
                            />
                            {config.gridType === "mizige" && (
                              <>
                                <line
                                  x1="0"
                                  y1="0"
                                  x2="100"
                                  y2="100"
                                  stroke="#E2E8F0"
                                  strokeWidth="1"
                                  strokeDasharray="3 3"
                                />
                                <line
                                  x1="100"
                                  y1="0"
                                  x2="0"
                                  y2="100"
                                  stroke="#E2E8F0"
                                  strokeWidth="1"
                                  strokeDasharray="3 3"
                                />
                              </>
                            )}
                          </svg>
                        )}
                        {!isBlankCopyRow && (
                          <span
                            style={{
                              fontSize: `${config.fontSize}px`,
                              color: traceRgba,
                            }}
                            className={`relative z-10 leading-none ${fontClass}`}
                          >
                            {ch}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                );

                return (
                  <React.Fragment key={rowIdx}>
                    {renderGridRow(row, false, "trace")}
                    {config.practiceMode === "alternating_copy" &&
                      renderGridRow(Array(cellsPerRow).fill(""), true, "copy")}
                  </React.Fragment>
                );
              })}
            </div>
          ) : config.gridType === "english_4line" ? (
            /* English 4-Line 3-Space Calligraphy Sheet */
            <div className="space-y-3">
              {contentLines.map((line, idx) => {
                const rowHeight = Math.round(config.fontSize * config.lineHeight);
                const renderEnglishLine = (text: string, isBlank: boolean, suffix: string) => (
                  <div
                    key={`${idx}-${suffix}`}
                    style={{ height: `${rowHeight}px` }}
                    className="relative flex items-center px-2"
                  >
                    {/* 4-Line SVG Guide */}
                    <svg
                      viewBox="0 0 1000 100"
                      preserveAspectRatio="none"
                      className="absolute inset-0 w-full h-full pointer-events-none"
                    >
                      <line x1="0" y1="15" x2="1000" y2="15" stroke="#94A3B8" strokeWidth="1" />
                      <line
                        x1="0"
                        y1="38"
                        x2="1000"
                        y2="38"
                        stroke="#CBD5E1"
                        strokeWidth="1"
                        strokeDasharray="6 4"
                      />
                      <line x1="0" y1="65" x2="1000" y2="65" stroke="#FCA5A5" strokeWidth="1.2" />
                      <line x1="0" y1="88" x2="1000" y2="88" stroke="#94A3B8" strokeWidth="1" />
                    </svg>
                    {!isBlank && (
                      <div
                        style={{
                          fontSize: `${config.fontSize}px`,
                          color: traceRgba,
                        }}
                        className={`relative z-10 tracking-wide ${fontClass} whitespace-pre-wrap`}
                      >
                        {text || " "}
                      </div>
                    )}
                  </div>
                );

                return (
                  <React.Fragment key={idx}>
                    {renderEnglishLine(line, false, "trace")}
                    {config.practiceMode === "alternating_copy" &&
                      renderEnglishLine("", true, "copy")}
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            /* Standard Lined Exam Answer Sheet (标准横线答题卡) */
            <div className="relative">
              {config.showMarginGuide && (
                <div className="absolute left-7 top-0 bottom-0 w-px bg-red-200 pointer-events-none" />
              )}
              <div className="space-y-0">
                {contentLines.map((line, idx) => {
                  const rowHeight = Math.round(config.fontSize * config.lineHeight);
                  const renderLinedRow = (text: string, isBlank: boolean, suffix: string) => (
                    <div
                      key={`${idx}-${suffix}`}
                      style={{
                        minHeight: `${rowHeight}px`,
                        fontSize: `${config.fontSize}px`,
                        lineHeight: `${rowHeight}px`,
                      }}
                      className={`border-b border-slate-300 ${
                        config.showMarginGuide ? "pl-10 pr-2" : "px-2"
                      } flex items-baseline`}
                    >
                      {!isBlank ? (
                        <span
                          style={{ color: traceRgba }}
                          className={`${fontClass} whitespace-pre-wrap`}
                        >
                          {text || " "}
                        </span>
                      ) : (
                        <span>&nbsp;</span>
                      )}
                    </div>
                  );

                  return (
                    <React.Fragment key={idx}>
                      {renderLinedRow(line, false, "trace")}
                      {config.practiceMode === "alternating_copy" &&
                        renderLinedRow("", true, "copy")}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sheet Footer */}
          <div className="mt-6 pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400">
            <span>提示：请使用黑色中性笔顺着浅色字迹匀速描红，注意步骤对齐与字形结构。</span>
            <span className="tabular-nums">
              浅度 {config.traceOpacity}% · 字号 {config.fontSize}px
            </span>
          </div>

          {/* Interactive Handwriting Canvas Overlay */}
          <canvas
            ref={drawCanvasRef}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            className={`no-print absolute inset-0 w-full h-full touch-none ${
              drawModeEnabled ? "pointer-events-auto cursor-crosshair z-20" : "pointer-events-none z-10"
            }`}
          />
        </div>
      </div>

      {/* Right Zone: Control & Concept Deck (4 cols) */}
      <aside className="no-print lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            规范卷面参数设置
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            自定义浅色描红深浅、格线制式与临摹模式
          </p>
        </div>

        {/* Mistake Selector */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            {activeStudent
              ? `从 ${activeStudent.name} 的错题本载入规范范例`
              : "从错题本载入规范范例"}
          </label>
          <select
            value={selectedMistakeId}
            onChange={(e) => handleSelectMistake(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">-- 自定义空白输入 --</option>
            {mistakes.map((m) => (
              <option key={m.id} value={m.id}>
                [{m.subject}] {m.knowledgePoint}（已练 {m.handwritingPracticeCount} 次）
              </option>
            ))}
          </select>
        </div>

        {/* Grid Type */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            卷面格线制式
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {GRID_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, gridType: opt.id }))}
                className={`px-2.5 py-2 text-xs font-medium rounded-lg border text-left transition-colors whitespace-nowrap truncate ${
                  config.gridType === opt.id
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Practice Mode */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            训练排版模式
          </label>
          <div className="grid grid-cols-1 gap-1.5">
            {(
              [
                { id: "alternating_copy", label: "一行浅色描红 + 一行空行独立临摹" },
                { id: "full_trace", label: "整篇浅色规范卷面直接描红" },
                { id: "split_column", label: "左栏浅色范例 · 右栏空白仿写" },
              ] as { id: PracticeMode; label: string }[]
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, practiceMode: mode.id }))}
                className={`px-3 py-2 text-xs font-medium rounded-lg border text-left transition-colors ${
                  config.practiceMode === mode.id
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Trace Color & Opacity */}
        <div className="space-y-3 pt-2 border-t border-slate-200">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              描红墨色
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(TRACE_COLORS) as TraceColor[]).map((colorKey) => (
                <button
                  key={colorKey}
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, traceColor: colorKey }))}
                  className={`px-2 py-1.5 text-[11px] font-medium rounded-lg border transition-colors whitespace-nowrap truncate ${
                    config.traceColor === colorKey
                      ? "bg-slate-100 border-slate-400 text-slate-900"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {colorKey === "slate" ? "浅墨灰" : colorKey === "vermilion" ? "浅朱红" : "浅靛蓝"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-slate-700">字迹浅度（墨色浓度）</span>
              <span className="text-slate-500 tabular-nums">{config.traceOpacity}%</span>
            </div>
            <input
              type="range"
              min={12}
              max={48}
              step={2}
              value={config.traceOpacity}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, traceOpacity: Number(e.target.value) }))
              }
              className="w-full accent-blue-700"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-slate-700">卷面字号</span>
              <span className="text-slate-500 tabular-nums">{config.fontSize} px</span>
            </div>
            <input
              type="range"
              min={16}
              max={32}
              step={1}
              value={config.fontSize}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, fontSize: Number(e.target.value) }))
              }
              className="w-full accent-blue-700"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-slate-700">行距倍比</span>
              <span className="text-slate-500 tabular-nums">{config.lineHeight.toFixed(1)} ×</span>
            </div>
            <input
              type="range"
              min={1.8}
              max={2.8}
              step={0.1}
              value={config.lineHeight}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, lineHeight: Number(e.target.value) }))
              }
              className="w-full accent-blue-700"
            />
          </div>
        </div>

        {/* Font Style & Content Editor */}
        <div className="space-y-3 pt-2 border-t border-slate-200">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                书体风格
              </label>
              <select
                value={config.fontStyle}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, fontStyle: e.target.value as FontStyle }))
                }
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
              >
                <option value="kaiti">楷体规范</option>
                <option value="serif">宋体印刷</option>
                <option value="english_neat">英文规范体</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                学科标签
              </label>
              <select
                value={config.subject}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, subject: e.target.value as Subject }))
                }
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
              >
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              字帖标题
            </label>
            <input
              type="text"
              value={config.title}
              onChange={(e) => setConfig((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-700">
                描红卷面内容
              </label>
              <button
                type="button"
                onClick={handleAIFormatStandard}
                disabled={formattingAI}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-800 disabled:opacity-60"
              >
                {formattingAI ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                智能规范格式排版
              </button>
            </div>
            <textarea
              rows={6}
              value={config.content}
              onChange={(e) => setConfig((prev) => ({ ...prev, content: e.target.value }))}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {formatError && <p className="text-[11px] text-red-600 mt-1">{formatError}</p>}
          </div>
        </div>
      </aside>
    </div>
  );
};
