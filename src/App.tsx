import React, { useEffect, useMemo, useState } from "react";
import { Plus, UserPlus, X } from "lucide-react";
import { AppState, MistakeItem, Student, Subject } from "./types";
import {
  loadAppState,
  resetToPresetState,
  saveAppState,
} from "./utils/storage";
import { MistakeBook } from "./components/MistakeBook";
import { CaptureStudio } from "./components/CaptureStudio";
import { ExamBuilder } from "./components/ExamBuilder";
import { TracingStudio } from "./components/TracingStudio";
import { StaticHostingModal } from "./components/StaticHostingModal";

type ActiveTab = "notebook" | "capture" | "exam" | "tracing";

export default function App() {
  const [appState, setAppState] = useState<AppState>(() => loadAppState());
  const [activeTab, setActiveTab] = useState<ActiveTab>("notebook");
  const [storageWarning, setStorageWarning] = useState<string>("");

  const [tracingDraft, setTracingDraft] = useState<{
    mistakeId?: string;
    subject: Subject;
    title: string;
    content: string;
  } | null>(null);

  const [showAddStudent, setShowAddStudent] = useState<boolean>(false);
  const [newStudentName, setNewStudentName] = useState<string>("");
  const [newStudentGrade, setNewStudentGrade] = useState<string>("八年级");
  const [newStudentClass, setNewStudentClass] = useState<string>("八年级(1)班");
  const [newStudentNote, setNewStudentNote] = useState<string>("");

  const [showHostingModal, setShowHostingModal] = useState<boolean>(false);

  // Persist to localStorage on state changes
  useEffect(() => {
    const res = saveAppState(appState);
    if (!res.ok && res.error) {
      setStorageWarning(res.error);
    } else {
      setStorageWarning("");
    }
  }, [appState]);

  const activeStudent: Student = useMemo(() => {
    return (
      appState.students.find((s) => s.id === appState.activeStudentId) ||
      appState.students[0]
    );
  }, [appState.students, appState.activeStudentId]);

  const studentMistakes = useMemo(() => {
    return appState.mistakes.filter((m) => m.studentId === activeStudent.id);
  }, [appState.mistakes, activeStudent.id]);

  const handleSelectStudent = (studentId: string) => {
    const stu = appState.students.find((s) => s.id === studentId);
    const stuMistakeIds = appState.mistakes
      .filter((m) => m.studentId === studentId)
      .slice(0, 3)
      .map((m) => m.id);
    setAppState((prev) => ({
      ...prev,
      activeStudentId: studentId,
      examDraft: {
        ...prev.examDraft,
        title: `${stu?.name || ""} · 阶段错题巩固重组训练卷`,
        mistakeIds: stuMistakeIds,
      },
    }));
    setTracingDraft(null);
  };

  const handleCreateStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim()) return;
    const id = `stu-${Date.now()}`;
    const newStu: Student = {
      id,
      name: newStudentName.trim(),
      grade: newStudentGrade.trim() || "八年级",
      className: newStudentClass.trim() || newStudentGrade.trim(),
      note: newStudentNote.trim(),
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setAppState((prev) => ({
      ...prev,
      students: [...prev.students, newStu],
      activeStudentId: id,
      examDraft: {
        ...prev.examDraft,
        title: `${newStu.name} · 阶段错题巩固重组训练卷`,
        mistakeIds: [],
      },
    }));
    setNewStudentName("");
    setNewStudentNote("");
    setShowAddStudent(false);
  };

  const handleSaveNewMistake = (
    draft: Omit<MistakeItem, "id" | "createdAt" | "updatedAt">
  ) => {
    const today = new Date().toISOString().slice(0, 10);
    const created: MistakeItem = {
      ...draft,
      id: `m-${Date.now()}`,
      createdAt: today,
      updatedAt: today,
    };
    setAppState((prev) => ({
      ...prev,
      mistakes: [created, ...prev.mistakes],
    }));
  };

  const handleUpdateMistake = (id: string, patch: Partial<MistakeItem>) => {
    const today = new Date().toISOString().slice(0, 10);
    setAppState((prev) => ({
      ...prev,
      mistakes: prev.mistakes.map((m) =>
        m.id === id ? { ...m, ...patch, updatedAt: today } : m
      ),
    }));
  };

  const handleDeleteMistake = (id: string) => {
    setAppState((prev) => ({
      ...prev,
      mistakes: prev.mistakes.filter((m) => m.id !== id),
      examDraft: {
        ...prev.examDraft,
        mistakeIds: prev.examDraft.mistakeIds.filter((itemId) => itemId !== id),
      },
    }));
  };

  const handleToggleExamItem = (mistakeId: string) => {
    setAppState((prev) => {
      const exists = prev.examDraft.mistakeIds.includes(mistakeId);
      return {
        ...prev,
        examDraft: {
          ...prev.examDraft,
          mistakeIds: exists
            ? prev.examDraft.mistakeIds.filter((id) => id !== mistakeId)
            : [...prev.examDraft.mistakeIds, mistakeId],
        },
      };
    });
  };

  const handleRecordPracticeComplete = (mistakeId: string) => {
    const today = new Date().toISOString().slice(0, 10);
    setAppState((prev) => ({
      ...prev,
      mistakes: prev.mistakes.map((m) =>
        m.id === mistakeId
          ? {
              ...m,
              handwritingPracticeCount: m.handwritingPracticeCount + 1,
              masteryStatus:
                m.masteryStatus === "pending" ? "practicing" : m.masteryStatus,
              updatedAt: today,
            }
          : m
      ),
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="no-print bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab("notebook")}
            className="text-lg font-bold tracking-tight text-slate-900 font-serif-sc whitespace-nowrap shrink-0 cursor-pointer"
          >
            研墨错题本
          </button>

          {/* Zone 2: 4 single-line nav links */}
          <nav className="flex items-center gap-5 sm:gap-7 overflow-x-auto">
            {(
              [
                { id: "notebook", label: "学科错题本" },
                { id: "capture", label: "拍照录题" },
                { id: "exam", label: "重组试卷" },
                { id: "tracing", label: "卷面描红" },
              ] as { id: ActiveTab; label: string }[]
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? "border-blue-700 text-slate-900"
                      : "border-transparent text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="shrink-0 hidden sm:flex items-center">
            <button
              type="button"
              onClick={() => setActiveTab("capture")}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              拍照录错题
            </button>
          </div>
        </div>
      </header>

      {/* Workspace Toolbar: Student Switcher & Static Hosting Guide */}
      <div className="no-print bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 mr-1 whitespace-nowrap">
              当前学生：
            </span>
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {appState.students.map((stu) => {
                const active = stu.id === activeStudent.id;
                return (
                  <button
                    key={stu.id}
                    type="button"
                    onClick={() => handleSelectStudent(stu.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {stu.name} · {stu.className}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setShowAddStudent(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              预设新学生
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs">
            {activeStudent.note && (
              <span className="hidden xl:inline text-slate-500 truncate max-w-xs">
                学习目标：{activeStudent.note}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowHostingModal(true)}
              className="text-xs font-medium text-slate-600 hover:text-blue-700 underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
            >
              静态网页托管说明 & 备份导出
            </button>
          </div>
        </div>
      </div>

      {storageWarning && (
        <div className="no-print max-w-7xl mx-auto px-4 sm:px-6 pt-4 w-full">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            {storageWarning}
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === "notebook" && (
          <MistakeBook
            activeStudent={activeStudent}
            mistakes={studentMistakes}
            examMistakeIds={appState.examDraft.mistakeIds}
            onToggleExamItem={handleToggleExamItem}
            onUpdateMistake={handleUpdateMistake}
            onDeleteMistake={handleDeleteMistake}
            onOpenTracing={(item) => {
              setTracingDraft({
                mistakeId: item.id,
                subject: item.subject,
                title: `${item.knowledgePoint} · 规范书写`,
                content:
                  item.handwritingTemplate ||
                  item.correctionSteps ||
                  item.standardAnswer,
              });
              setActiveTab("tracing");
            }}
            onGoToCapture={() => setActiveTab("capture")}
          />
        )}

        {activeTab === "capture" && (
          <CaptureStudio
            activeStudent={activeStudent}
            onSaveMistake={(draft) => {
              handleSaveNewMistake(draft);
            }}
            onGoToTracing={(draft) => {
              setTracingDraft(draft);
              setActiveTab("tracing");
            }}
          />
        )}

        {activeTab === "exam" && (
          <ExamBuilder
            activeStudent={activeStudent}
            mistakes={studentMistakes}
            draft={appState.examDraft}
            onUpdateDraft={(patch) =>
              setAppState((prev) => ({
                ...prev,
                examDraft: { ...prev.examDraft, ...patch },
              }))
            }
          />
        )}

        {activeTab === "tracing" && (
          <TracingStudio
            activeStudent={activeStudent}
            mistakes={studentMistakes}
            initialDraft={tracingDraft}
            onRecordPracticeComplete={handleRecordPracticeComplete}
          />
        )}
      </main>

      {/* Add Student Modal */}
      {showAddStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateStudent}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                添加预设学生档案
              </h3>
              <button
                type="button"
                onClick={() => setShowAddStudent(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                学生姓名
              </label>
              <input
                type="text"
                required
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                placeholder="例如：周予安"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  年级阶段
                </label>
                <input
                  type="text"
                  value={newStudentGrade}
                  onChange={(e) => setNewStudentGrade(e.target.value)}
                  placeholder="例如：九年级"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  所在班级
                </label>
                <input
                  type="text"
                  value={newStudentClass}
                  onChange={(e) => setNewStudentClass(e.target.value)}
                  placeholder="例如：九年级(4)班"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                薄弱项 / 书写训练备注
              </label>
              <input
                type="text"
                value={newStudentNote}
                onChange={(e) => setNewStudentNote(e.target.value)}
                placeholder="例如：加强化学方程式配平与卷面整洁度"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowAddStudent(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
              >
                确认添加并切换
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Static Web Hosting & Backup Modal */}
      <StaticHostingModal
        isOpen={showHostingModal}
        onClose={() => setShowHostingModal(false)}
        appState={appState}
        onImportState={(nextState) => setAppState(nextState)}
        onResetPresets={() => setAppState(resetToPresetState())}
      />
    </div>
  );
}
