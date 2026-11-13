import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  Crop,
  Eraser,
  ImagePlus,
  Loader2,
  RotateCw,
  Sparkles,
  Upload,
} from "lucide-react";
import { MistakeItem, Student, SUBJECTS, Subject } from "../types";
import { SAMPLE_ENGLISH_PAPER_URL, SAMPLE_MATH_PAPER_URL } from "../data/presets";

interface CaptureStudioProps {
  activeStudent: Student;
  onSaveMistake: (mistake: Omit<MistakeItem, "id" | "createdAt" | "updatedAt">) => void;
  onGoToTracing: (mistakeDraft: {
    subject: Subject;
    title: string;
    content: string;
  }) => void;
}

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CaptureStudio: React.FC<CaptureStudioProps> = ({
  activeStudent,
  onSaveMistake,
  onGoToTracing,
}) => {
  const [sourceUrl, setSourceUrl] = useState<string>(SAMPLE_MATH_PAPER_URL);
  const [rotation, setRotation] = useState<number>(0);
  const [enhancePaper, setEnhancePaper] = useState<boolean>(false);
  const [removeRedMarks, setRemoveRedMarks] = useState<boolean>(false);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [croppedDataUrl, setCroppedDataUrl] = useState<string>("");

  const [preferredSubject, setPreferredSubject] = useState<string>("自动识别");
  const [extracting, setExtracting] = useState<boolean>(false);
  const [extractError, setExtractError] = useState<string>("");

  // Form fields
  const [subject, setSubject] = useState<Subject>("数学");
  const [questionType, setQuestionType] = useState<string>("解答题");
  const [knowledgePoint, setKnowledgePoint] = useState<string>("");
  const [questionText, setQuestionText] = useState<string>("");
  const [studentWrongAnswer, setStudentWrongAnswer] = useState<string>("");
  const [errorReason, setErrorReason] = useState<string>("");
  const [standardAnswer, setStandardAnswer] = useState<string>("");
  const [correctionSteps, setCorrectionSteps] = useState<string>("");
  const [handwritingTemplate, setHandwritingTemplate] = useState<string>("");
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Load image into canvas whenever sourceUrl or rotation changes
  useEffect(() => {
    if (!sourceUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      loadedImageRef.current = img;
      const isRotated = rotation % 180 !== 0;
      const w = isRotated ? img.height : img.width;
      const h = isRotated ? img.width : img.height;
      setImageSize({ w, h });
      // Default crop box covering central question area
      setCropRect({
        x: Math.round(w * 0.14),
        y: Math.round(h * 0.38),
        w: Math.round(w * 0.72),
        h: Math.round(h * 0.44),
      });
    };
    img.src = sourceUrl;
  }, [sourceUrl, rotation]);

  // Draw preview canvas & export cropped output using 4 surrounding masks so crop area stays crisp
  const renderOverlay = () => {
    const canvas = canvasRef.current;
    const img = loadedImageRef.current;
    if (!canvas || !img || imageSize.w === 0) return;

    canvas.width = imageSize.w;
    canvas.height = imageSize.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();

    if (enhancePaper || removeRedMarks) {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i];
        let g = d[i + 1];
        let b = d[i + 2];
        if (removeRedMarks && r > 135 && r - g > 40 && r - b > 40) {
          d[i] = 252;
          d[i + 1] = 252;
          d[i + 2] = 252;
          continue;
        }
        if (enhancePaper) {
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum > 165) {
            r = Math.min(255, r + 42);
            g = Math.min(255, g + 42);
            b = Math.min(255, b + 42);
          } else {
            r = Math.max(0, r - 35);
            g = Math.max(0, g - 35);
            b = Math.max(0, b - 35);
          }
          d[i] = r;
          d[i + 1] = g;
          d[i + 2] = b;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    if (cropRect && cropRect.w > 12 && cropRect.h > 12) {
      const outCanvas = document.createElement("canvas");
      const maxOutW = 1100;
      const scale = Math.min(1, maxOutW / cropRect.w);
      outCanvas.width = Math.round(cropRect.w * scale);
      outCanvas.height = Math.round(cropRect.h * scale);
      const outCtx = outCanvas.getContext("2d");
      if (outCtx) {
        outCtx.drawImage(
          canvas,
          cropRect.x,
          cropRect.y,
          cropRect.w,
          cropRect.h,
          0,
          0,
          outCanvas.width,
          outCanvas.height
        );
        setCroppedDataUrl(outCanvas.toDataURL("image/jpeg", 0.88));
      }

      // Draw 4 scrim strips around cropRect
      ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
      ctx.fillRect(0, 0, canvas.width, cropRect.y);
      ctx.fillRect(0, cropRect.y + cropRect.h, canvas.width, canvas.height - (cropRect.y + cropRect.h));
      ctx.fillRect(0, cropRect.y, cropRect.x, cropRect.h);
      ctx.fillRect(
        cropRect.x + cropRect.w,
        cropRect.y,
        canvas.width - (cropRect.x + cropRect.w),
        cropRect.h
      );

      ctx.strokeStyle = "#2563EB";
      ctx.lineWidth = Math.max(2, Math.round(canvas.width / 320));
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    }
  };

  useEffect(() => {
    renderOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSize, rotation, enhancePaper, removeRedMarks, cropRect]);

  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.max(0, Math.min(canvas.width, (clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(canvas.height, (clientY - rect.top) * scaleY)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getCanvasCoords(e.clientX, e.clientY);
    setDragStart(pt);
    setCropRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStart) return;
    const pt = getCanvasCoords(e.clientX, e.clientY);
    setCropRect({
      x: Math.min(dragStart.x, pt.x),
      y: Math.min(dragStart.y, pt.y),
      w: Math.abs(pt.x - dragStart.x),
      h: Math.abs(pt.y - dragStart.y),
    });
  };

  const handlePointerUp = () => {
    setDragStart(null);
  };

  const startCamera = async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 60);
    } catch {
      setCameraError("无法开启摄像头（浏览器未授权或当前环境无摄像头），请改用上传照片或示例试卷。");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhotoFromCamera = () => {
    const video = videoRef.current;
    if (!video) return;
    const temp = document.createElement("canvas");
    temp.width = video.videoWidth || 1280;
    temp.height = video.videoHeight || 960;
    const ctx = temp.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, temp.width, temp.height);
    setSourceUrl(temp.toDataURL("image/jpeg", 0.92));
    setRotation(0);
    stopCamera();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setSourceUrl(reader.result);
        setRotation(0);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAIExtract = async () => {
    if (!croppedDataUrl) {
      setExtractError("请在左侧试卷照片上框选需要识别的错题区域。");
      return;
    }
    setExtracting(true);
    setExtractError("");
    try {
      const resp = await fetch("/api/extract-mistake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: croppedDataUrl,
          mimeType: "image/jpeg",
          preferredSubject,
          studentGrade: activeStudent.grade,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "识别请求失败");
      }
      const r = data.result;
      if (r) {
        if (SUBJECTS.includes(r.subject)) {
          setSubject(r.subject);
        }
        setQuestionType(r.questionType || "解答题");
        setKnowledgePoint(r.knowledgePoint || "");
        setQuestionText(r.questionText || "");
        setStudentWrongAnswer(r.studentWrongAnswer || "");
        setErrorReason(r.errorReason || "");
        setStandardAnswer(r.standardAnswer || "");
        setCorrectionSteps(r.correctionSteps || "");
        setHandwritingTemplate(r.handwritingTemplate || r.standardAnswer || "");
      }
    } catch (err) {
      setExtractError(
        err instanceof Error
          ? err.message
          : "智能识题失败，您可以直接在右侧表单手工录入并保存。"
      );
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) {
      setExtractError("请填写或识别错题题干内容后再保存。");
      return;
    }
    onSaveMistake({
      studentId: activeStudent.id,
      subject,
      questionType: questionType.trim() || "解答题",
      knowledgePoint: knowledgePoint.trim() || "核心考点巩固",
      questionText: questionText.trim(),
      croppedImageUrl: croppedDataUrl || undefined,
      studentWrongAnswer: studentWrongAnswer.trim(),
      errorReason: errorReason.trim() || "待复盘错因",
      standardAnswer: standardAnswer.trim(),
      correctionSteps: correctionSteps.trim(),
      handwritingTemplate:
        handwritingTemplate.trim() || correctionSteps.trim() || standardAnswer.trim(),
      masteryStatus: "pending",
      handwritingPracticeCount: 0,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Photo Capture & Canvas Cropper */}
      <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              01. 拍照框选错题区域
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              拖动框选单道错题，支持前端实时试卷增白与去除教师红笔批改痕迹
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cameraActive ? stopCamera : startCamera}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                cameraActive
                  ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              {cameraActive ? "关闭相机" : "现场拍照"}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              上传试卷照片
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Sample quick load bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
          <span className="text-slate-600">快速体验内置实拍试卷：</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setSourceUrl(SAMPLE_MATH_PAPER_URL);
                setRotation(0);
              }}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 ${
                sourceUrl === SAMPLE_MATH_PAPER_URL
                  ? "bg-white text-blue-700 border border-slate-200 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              数学函数错题卷
            </button>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setSourceUrl(SAMPLE_ENGLISH_PAPER_URL);
                setRotation(0);
              }}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 ${
                sourceUrl === SAMPLE_ENGLISH_PAPER_URL
                  ? "bg-white text-blue-700 border border-slate-200 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              英语作文批改卷
            </button>
          </div>
        </div>

        {cameraError && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            {cameraError}
          </div>
        )}

        {/* Camera viewfinder OR Interactive Cropper Canvas */}
        {cameraActive ? (
          <div className="relative rounded-lg overflow-hidden bg-slate-950 border border-slate-200">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full max-h-[420px] object-contain"
            />
            <div className="p-3 bg-slate-900 flex items-center justify-between">
              <span className="text-xs text-slate-300">对准错题后点击快门</span>
              <button
                type="button"
                onClick={capturePhotoFromCamera}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0"
              >
                拍摄此页试卷
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative bg-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="w-full h-auto block cursor-crosshair touch-none"
              />
            </div>

            {/* Image Processing Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  旋转 90°
                </button>
                <button
                  type="button"
                  onClick={() => setRemoveRedMarks((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    removeRedMarks
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5" />
                  去除红笔批改痕
                </button>
                <button
                  type="button"
                  onClick={() => setEnhancePaper((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    enhancePaper
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <Crop className="w-3.5 h-3.5" />
                  试卷增白锐化
                </button>
              </div>
              {cropRect && (
                <span className="text-xs text-slate-500 tabular-nums">
                  选区：{Math.round(cropRect.w)} × {Math.round(cropRect.h)} px
                </span>
              )}
            </div>
          </div>
        )}

        {/* Cropped preview + AI extract trigger */}
        {croppedDataUrl && !cameraActive && (
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-slate-700">
                裁剪结果预览（将存入错题本并用于重排组卷）
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={preferredSubject}
                  onChange={(e) => setPreferredSubject(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  aria-label="识题预设学科"
                >
                  <option value="自动识别">自动识别学科</option>
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAIExtract}
                  disabled={extracting}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                >
                  {extracting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  {extracting ? "正在识题解析..." : "智能识题并生成描红范例"}
                </button>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex justify-center">
              <img
                src={croppedDataUrl}
                alt="裁剪后的错题切片"
                referrerPolicy="no-referrer"
                className="max-h-40 object-contain rounded"
              />
            </div>
          </div>
        )}

        {extractError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {extractError}
          </div>
        )}
      </section>

      {/* Right Column: Structured Mistake & Handwriting Template Editor */}
      <form
        onSubmit={handleSave}
        className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              02. 确认错题归档与规范卷面范例
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              当前归档学生：<span className="font-medium text-slate-800">{activeStudent.name}</span>（{activeStudent.className}）
            </p>
          </div>
          {savedNotice && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
              <Check className="w-3.5 h-3.5" />
              已存入错题本
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              归属学科
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value as Subject)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              题型分类
            </label>
            <input
              type="text"
              value={questionType}
              onChange={(e) => setQuestionType(e.target.value)}
              placeholder="如：解答题、作文"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              核心知识点
            </label>
            <input
              type="text"
              value={knowledgePoint}
              onChange={(e) => setKnowledgePoint(e.target.value)}
              placeholder="如：二次函数顶点"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            题干文本（用于组卷重排打印）
          </label>
          <textarea
            rows={4}
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="点击左侧“智能识题”自动提取，或直接在此输入/粘贴题目文本（纯静态离线亦可直接录题）"
            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 leading-relaxed"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              学生原错解记录
            </label>
            <input
              type="text"
              value={studentWrongAnswer}
              onChange={(e) => setStudentWrongAnswer(e.target.value)}
              placeholder="简述原卷面错误做法"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              错因标签
            </label>
            <input
              type="text"
              value={errorReason}
              onChange={(e) => setErrorReason(e.target.value)}
              placeholder="如：计算粗心 / 步骤跳跃"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              标准答案
            </label>
            <textarea
              rows={2}
              value={standardAnswer}
              onChange={(e) => setStandardAnswer(e.target.value)}
              placeholder="输入最终标准答案"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              订正解析思路
            </label>
            <textarea
              rows={2}
              value={correctionSteps}
              onChange={(e) => setCorrectionSteps(e.target.value)}
              placeholder="关键解题突破口与易错提醒"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-slate-700">
              卷面规范作答范例（自动生成浅色描红字帖）
            </label>
            <button
              type="button"
              onClick={() =>
                onGoToTracing({
                  subject,
                  title: knowledgePoint || `${subject}错题规范书写训练`,
                  content:
                    handwritingTemplate.trim() ||
                    correctionSteps.trim() ||
                    standardAnswer.trim() ||
                    questionText.trim(),
                })
              }
              className="text-xs font-medium text-blue-700 hover:text-blue-800 hover:underline whitespace-nowrap shrink-0"
            >
              立即预览浅色描红卷面 →
            </button>
          </div>
          <textarea
            rows={4}
            value={handwritingTemplate}
            onChange={(e) => setHandwritingTemplate(e.target.value)}
            placeholder="例如：解：(1) 由题意得... 规范分步排版后将直接生成浅色描红字帖"
            className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 leading-relaxed"
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-200">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <ImagePlus className="w-4 h-4" />
            保存到 {activeStudent.name} 的{subject}错题集
          </button>
        </div>
      </form>
    </div>
  );
};
