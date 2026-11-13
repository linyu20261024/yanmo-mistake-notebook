import React, { useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  FilePlus2,
  PenTool,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { MasteryStatus, MistakeItem, Student, SUBJECTS, Subject } from "../types";

interface MistakeBookProps {
  activeStudent: Student;
  mistakes: MistakeItem[];
  examMistakeIds: string[];
  onToggleExamItem: (mistakeId: string) => void;
  onUpdateMistake: (id: string, patch: Partial<MistakeItem>) => void;
  onDeleteMistake: (id: string) => void;
  onOpenTracing: (mistake: MistakeItem) => void;
  onGoToCapture: () => void;
}

const STATUS_META: Record<
  MasteryStatus,
  { label: string; textClass: string; bgClass: string }
> = {
  pending: {
    label: "待订正",
    textClass: "text-red-700",
    bgClass: "bg-red-50 border-red-200",
  },
  practicing: {
    label: "练习中",
    textClass: "text-amber-700",
    bgClass: "bg-amber-50 border-amber-200",
  },
  mastered: {
    label: "已掌握",
    textClass: "text-emerald-700",
    bgClass: "bg-emerald-50 border-emerald-200",
  },
};

export const MistakeBook: React.FC<MistakeBookProps> = ({
  activeStudent,
  mistakes,
  examMistakeIds,
  onToggleExamItem,
  onUpdateMistake,
  onDeleteMistake,
  onOpenTracing,
  onGoToCapture,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string>("全部学科");
  const [statusFilter, setStatusFilter] = useState<MasteryStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [editingMistake, setEditingMistake] = useState<MistakeItem | null>(null);

  // Subject counts for this student
  const subjectCounts = useMemo(() => {
    const map: Record<string, number> = { 全部学科: mistakes.length };
    mistakes.forEach((m) => {
      map[m.subject] = (map[m.subject] || 0) + 1;
    });
    return map;
  }, [mistakes]);

  const availableSubjects = useMemo(() => {
    const activeSet = new Set(mistakes.map((m) => m.subject));
    return SUBJECTS.filter((s) => activeSet.has(s));
  }, [mistakes]);

  const filteredMistakes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return mistakes.filter((m) => {
      if (selectedSubject !== "全部学科" && m.subject !== selectedSubject) return false;
      if (statusFilter !== "all" && m.masteryStatus !== statusFilter) return false;
      if (
        q &&
        !m.questionText.toLowerCase().includes(q) &&
        !m.knowledgePoint.toLowerCase().includes(q) &&
        !m.errorReason.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [mistakes, selectedSubject, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = mistakes.length;
    const mastered = mistakes.filter((m) => m.masteryStatus === "mastered").length;
    const practicing = mistakes.filter((m) => m.masteryStatus === "practicing").length;
    const totalTracing = mistakes.reduce((sum, m) => sum + m.handwritingPracticeCount, 0);
    return { total, mastered, practicing, totalTracing };
  }, [mistakes]);

  return (
    <div className="space-y-6">
      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">错题本累计收录</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
            {stats.total} <span className="text-xs font-normal text-slate-500">道</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">涵盖学科错题集</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
            {availableSubjects.length}{" "}
            <span className="text-xs font-normal text-slate-500">科</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">卷面描红训练次数</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
            {stats.totalTracing}{" "}
            <span className="text-xs font-normal text-slate-500">次</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">已完全掌握题数</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-700 tabular-nums">
            {stats.mastered}
            <span className="text-xs font-normal text-slate-500 ml-1">
              / {stats.total}
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Subject Collection Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Subject Tabs */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setSelectedSubject("全部学科")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                selectedSubject === "全部学科"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              全部学科 ({subjectCounts["全部学科"] || 0})
            </button>
            {availableSubjects.map((subj) => (
              <button
                key={subj}
                type="button"
                onClick={() => setSelectedSubject(subj)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                  selectedSubject === subj
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {subj} ({subjectCounts[subj] || 0})
              </button>
            ))}
          </div>

          {/* Search & Mastery Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="检索知识点、题干或错因..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 w-52 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as MasteryStatus | "all")}
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
              aria-label="掌握状态筛选"
            >
              <option value="all">全部掌握状态</option>
              <option value="pending">待订正</option>
              <option value="practicing">练习中</option>
              <option value="mastered">已掌握</option>
            </select>
          </div>
        </div>
      </div>

      {/* Mistake List */}
      {filteredMistakes.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
          <div className="text-sm font-medium text-slate-800">
            {activeStudent.name} 在当前筛选条件下暂无错题记录
          </div>
          <p className="text-xs text-slate-500">
            点击下方按钮拍照框选错题，或切换顶部“全部学科”查看其他学科错题集。
          </p>
          <button
            type="button"
            onClick={onGoToCapture}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            前往拍照录错题
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMistakes.map((item) => {
            const inExam = examMistakeIds.includes(item.id);
            const status = STATUS_META[item.masteryStatus];
            return (
              <article
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
              >
                <div className="space-y-3">
                  {/* Unboxed quiet metadata line + explicit status label */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500 truncate tabular-nums">
                      <span className="font-semibold text-slate-800">{item.subject}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{item.knowledgePoint}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.questionType}</span>
                    </div>
                    <span
                      className={`text-xs font-medium whitespace-nowrap shrink-0 ${status.textClass}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  {/* Cropped Original Photo (if present) */}
                  {item.croppedImageUrl && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                      <img
                        src={item.croppedImageUrl}
                        alt={item.knowledgePoint}
                        referrerPolicy="no-referrer"
                        className="max-h-32 w-full object-contain rounded"
                      />
                    </div>
                  )}

                  {/* Question Text */}
                  <div className="text-sm text-slate-900 leading-relaxed whitespace-pre-wrap line-clamp-4">
                    {item.questionText}
                  </div>

                  {/* Mistake & Correction Summary */}
                  <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                    <div className="text-slate-600">
                      <span className="font-medium text-red-700">错因：</span>
                      {item.errorReason}
                    </div>
                    <div className="text-slate-600 line-clamp-2">
                      <span className="font-medium text-slate-800">标准答案：</span>
                      {item.standardAnswer}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenTracing(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0"
                    >
                      <PenTool className="w-3.5 h-3.5" />
                      卷面描红 ({item.handwritingPracticeCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleExamItem(item.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                        inExam
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {inExam ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          已入组卷篮
                        </>
                      ) : (
                        <>
                          <FilePlus2 className="w-3.5 h-3.5" />
                          加入组卷
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingMistake(item)}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      订正编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteMistake(item.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                      title="删除错题"
                      aria-label="删除错题"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Mistake Detail & Correction Editor Modal */}
      {editingMistake && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  错题订正修改与规范书写模板编辑
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  修改后的规范作答模板将同步用于生成浅色描红字帖
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMistake(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">学科</label>
                <select
                  value={editingMistake.subject}
                  onChange={(e) =>
                    setEditingMistake({
                      ...editingMistake,
                      subject: e.target.value as Subject,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
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
                  知识点
                </label>
                <input
                  type="text"
                  value={editingMistake.knowledgePoint}
                  onChange={(e) =>
                    setEditingMistake({
                      ...editingMistake,
                      knowledgePoint: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  掌握状态
                </label>
                <select
                  value={editingMistake.masteryStatus}
                  onChange={(e) =>
                    setEditingMistake({
                      ...editingMistake,
                      masteryStatus: e.target.value as MasteryStatus,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                >
                  <option value="pending">待订正</option>
                  <option value="practicing">练习中</option>
                  <option value="mastered">已掌握</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                题干内容
              </label>
              <textarea
                rows={3}
                value={editingMistake.questionText}
                onChange={(e) =>
                  setEditingMistake({ ...editingMistake, questionText: e.target.value })
                }
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  原错解 / 错因
                </label>
                <input
                  type="text"
                  value={editingMistake.errorReason}
                  onChange={(e) =>
                    setEditingMistake({ ...editingMistake, errorReason: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  标准答案
                </label>
                <input
                  type="text"
                  value={editingMistake.standardAnswer}
                  onChange={(e) =>
                    setEditingMistake({
                      ...editingMistake,
                      standardAnswer: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                订正解析
              </label>
              <textarea
                rows={2}
                value={editingMistake.correctionSteps}
                onChange={(e) =>
                  setEditingMistake({
                    ...editingMistake,
                    correctionSteps: e.target.value,
                  })
                }
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                卷面规范书写范例（用于浅色描红临摹）
              </label>
              <textarea
                rows={4}
                value={editingMistake.handwritingTemplate}
                onChange={(e) =>
                  setEditingMistake({
                    ...editingMistake,
                    handwritingTemplate: e.target.value,
                  })
                }
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingMistake(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateMistake(editingMistake.id, editingMistake);
                  onOpenTracing(editingMistake);
                  setEditingMistake(null);
                }}
                className="px-4 py-2 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100"
              >
                保存并去描红
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateMistake(editingMistake.id, editingMistake);
                  setEditingMistake(null);
                }}
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
