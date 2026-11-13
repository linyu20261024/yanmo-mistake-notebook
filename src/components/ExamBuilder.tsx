import React, { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Printer,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AppState, MistakeItem, Student, SUBJECTS } from "../types";

interface ExamBuilderProps {
  activeStudent: Student;
  mistakes: MistakeItem[];
  draft: AppState["examDraft"];
  onUpdateDraft: (patch: Partial<AppState["examDraft"]>) => void;
}

export const ExamBuilder: React.FC<ExamBuilderProps> = ({
  activeStudent,
  mistakes,
  draft,
  onUpdateDraft,
}) => {
  const [quickSubject, setQuickSubject] = useState<string>("全部学科");

  const selectedItems = useMemo(() => {
    const map = new Map(mistakes.map((m) => [m.id, m]));
    return draft.mistakeIds
      .map((id) => map.get(id))
      .filter((item): item is MistakeItem => Boolean(item));
  }, [mistakes, draft.mistakeIds]);

  const unselectedItems = useMemo(() => {
    const set = new Set(draft.mistakeIds);
    return mistakes.filter(
      (m) =>
        !set.has(m.id) &&
        (quickSubject === "全部学科" || m.subject === quickSubject)
    );
  }, [mistakes, draft.mistakeIds, quickSubject]);

  const moveItem = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= selectedItems.length) return;
    const next = selectedItems.map((i) => i.id);
    [next[index], next[target]] = [next[target], next[index]];
    onUpdateDraft({ mistakeIds: next });
  };

  const removeItem = (id: string) => {
    onUpdateDraft({
      mistakeIds: draft.mistakeIds.filter((item) => item !== id),
    });
  };

  const addItem = (id: string) => {
    if (draft.mistakeIds.includes(id)) return;
    onUpdateDraft({
      mistakeIds: [...draft.mistakeIds, id],
    });
  };

  const handleAutoAssemble = () => {
    const candidates = mistakes.filter(
      (m) =>
        m.masteryStatus !== "mastered" &&
        (quickSubject === "全部学科" || m.subject === quickSubject)
    );
    const pool =
      candidates.length > 0
        ? candidates
        : mistakes.filter(
            (m) => quickSubject === "全部学科" || m.subject === quickSubject
          );
    onUpdateDraft({
      title:
        quickSubject === "全部学科"
          ? `${activeStudent.name} · 阶段薄弱错题重练卷`
          : `${activeStudent.name} · ${quickSubject}错题专项巩固卷`,
      mistakeIds: pool.map((m) => m.id),
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Exam Configuration & Question Picker (4 cols) */}
      <aside className="no-print lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              重组试卷编排台
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              自由挑选并重排 {activeStudent.name} 的错题生成新试卷
            </p>
          </div>
        </div>

        {/* Auto-assemble by Subject */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
          <div className="text-xs font-medium text-slate-700">
            按学科一键抽取未掌握错题组卷
          </div>
          <div className="flex items-center gap-2">
            <select
              value={quickSubject}
              onChange={(e) => setQuickSubject(e.target.value)}
              className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            >
              <option value="全部学科">全部学科</option>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAutoAssemble}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              智能抽题
            </button>
          </div>
        </div>

        {/* Paper Header Config */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              试卷主标题
            </label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => onUpdateDraft({ title: e.target.value })}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                副标题说明
              </label>
              <input
                type="text"
                value={draft.subtitle}
                onChange={(e) => onUpdateDraft({ subtitle: e.target.value })}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                建议用时（分钟）
              </label>
              <input
                type="number"
                min={10}
                max={180}
                value={draft.durationMinutes}
                onChange={(e) =>
                  onUpdateDraft({ durationMinutes: Number(e.target.value) || 45 })
                }
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg tabular-nums"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-slate-700">每题答题留白行数</span>
              <span className="text-slate-500 tabular-nums">
                {draft.blankLinesPerQuestion} 行
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={12}
              step={1}
              value={draft.blankLinesPerQuestion}
              onChange={(e) =>
                onUpdateDraft({ blankLinesPerQuestion: Number(e.target.value) })
              }
              className="w-full accent-blue-700"
            />
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.includeImages}
                onChange={(e) => onUpdateDraft({ includeImages: e.target.checked })}
                className="rounded border-slate-300 text-blue-700"
              />
              附带原卷裁剪插图（适合几何图形题）
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.includeAnswerKey}
                onChange={(e) =>
                  onUpdateDraft({ includeAnswerKey: e.target.checked })
                }
                className="rounded border-slate-300 text-blue-700"
              />
              末尾附带独立《参考答案与订正解析页》
            </label>
          </div>
        </div>

        {/* Selected Questions Reorder */}
        <div className="pt-3 border-t border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-700">
            <span>已编排题序 ({selectedItems.length} 题)</span>
          </div>
          {selectedItems.length === 0 ? (
            <div className="text-xs text-slate-400 py-3">
              尚未添加试题，请从下方候选题库中添加。
            </div>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {selectedItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  <div className="truncate">
                    <span className="font-semibold text-slate-900 tabular-nums mr-1.5">
                      {idx + 1}.
                    </span>
                    <span className="text-slate-500 mr-1">[{item.subject}]</span>
                    <span className="text-slate-800">{item.knowledgePoint}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveItem(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30"
                      title="上移"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(idx, 1)}
                      disabled={idx === selectedItems.length - 1}
                      className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30"
                      title="下移"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="p-1 text-slate-400 hover:text-red-600"
                      title="移出试卷"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Unselected Pool */}
        {unselectedItems.length > 0 && (
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <div className="text-xs font-medium text-slate-700">
              可追加的错题 ({unselectedItems.length})
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {unselectedItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addItem(item.id)}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs bg-white border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
                >
                  <span className="truncate text-slate-700">
                    [{item.subject}] {item.knowledgePoint}
                  </span>
                  <span className="text-blue-700 font-medium shrink-0">+ 加入</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Right: A4 Printable Reassembled Exam Preview (8 cols) */}
      <div className="lg:col-span-8 space-y-3">
        <div className="no-print bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600 tabular-nums">
            A4 重组试卷实时排版预览 · 共 {selectedItems.length} 题
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={selectedItems.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5" />
            打印 / 导出 PDF 试卷
          </button>
        </div>

        <div className="print-container bg-white border border-slate-200 rounded-xl p-8 sm:p-11 shadow-xs space-y-6">
          {/* Exam Paper Header */}
          <div className="text-center border-b-2 border-slate-900 pb-4 space-y-2">
            <h2 className="text-2xl font-bold text-slate-900 font-serif-sc">
              {draft.title || "阶段错题巩固重组训练卷"}
            </h2>
            <p className="text-xs text-slate-600">{draft.subtitle}</p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-700 tabular-nums">
              <span>姓名：{activeStudent.name}</span>
              <span>班级：{activeStudent.className}</span>
              <span>建议用时：{draft.durationMinutes} 分钟</span>
              <span>总题数：{selectedItems.length} 题</span>
              <span>得分：________</span>
            </div>
          </div>

          {/* Questions */}
          {selectedItems.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              请在左侧选择错题或点击“智能抽题”以生成重组试卷
            </div>
          ) : (
            <div className="space-y-6">
              {selectedItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="print-avoid-break pb-4 border-b border-slate-200 last:border-none space-y-3"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-slate-900 tabular-nums shrink-0">
                      {idx + 1}.
                    </span>
                    <div className="flex-1 space-y-2">
                      <div className="text-xs text-slate-500">
                        {item.subject} · {item.questionType} · {item.knowledgePoint}
                      </div>
                      <div className="text-sm text-slate-900 leading-relaxed whitespace-pre-wrap">
                        {item.questionText}
                      </div>
                      {draft.includeImages && item.croppedImageUrl && (
                        <div className="pt-1">
                          <img
                            src={item.croppedImageUrl}
                            alt={`第${idx + 1}题附图`}
                            referrerPolicy="no-referrer"
                            className="max-h-40 object-contain border border-slate-200 rounded p-1"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ruled Answer Space */}
                  <div className="pl-5 pt-1 space-y-0">
                    {Array.from({ length: draft.blankLinesPerQuestion }).map((_, lineIdx) => (
                      <div
                        key={lineIdx}
                        className="h-7 border-b border-dashed border-slate-300"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Optional Separate Answer Key & Correction Page */}
          {draft.includeAnswerKey && selectedItems.length > 0 && (
            <div className="print-page-break pt-6 border-t-2 border-slate-300 space-y-4">
              <div className="text-center pb-2 border-b border-slate-200">
                <h3 className="text-lg font-bold text-slate-900 font-serif-sc">
                  参考答案与错题订正解析
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  完成作答后对照核查步骤规范，若仍薄弱建议进入“卷面描红”强化书写
                </p>
              </div>
              <div className="space-y-4">
                {selectedItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="print-avoid-break text-xs leading-relaxed space-y-1 pb-3 border-b border-slate-100"
                  >
                    <div className="font-semibold text-slate-900 tabular-nums">
                      第 {idx + 1} 题（{item.subject} · {item.knowledgePoint}）
                    </div>
                    <div className="text-slate-800">
                      <span className="font-medium">标准答案：</span>
                      {item.standardAnswer}
                    </div>
                    {item.correctionSteps && (
                      <div className="text-slate-600 whitespace-pre-wrap">
                        <span className="font-medium text-slate-700">订正思路：</span>
                        {item.correctionSteps}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
