import React, { useEffect, useMemo, useState } from "react";
import {
  Pencil,
  Plus,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { AppState, MistakeItem, Student, Subject } from "./types";
import {
  clearAppState,
  loadAppState,
  saveAppState,
} from "./utils/storage";
import { buildAnswerExampleTemplate } from "./utils/ocr";
import { MistakeBook } from "./components/MistakeBook";
import { CaptureStudio } from "./components/CaptureStudio";
import { ExamBuilder } from "./components/ExamBuilder";
import { TracingStudio } from "./components/TracingStudio";
import { StaticHostingModal } from "./components/StaticHostingModal";
import {
  StudentFormModal,
  StudentImportModal,
  StudentManageModal,
} from "./components/StudentModals";

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

  const [showStudentForm, setShowStudentForm] = useState<boolean>(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [showImportStudents, setShowImportStudents] = useState<boolean>(false);
  const [showManageStudents, setShowManageStudents] = useState<boolean>(false);
  const [confirmDeleteActive, setConfirmDeleteActive] = useState<boolean>(false);

  const [showHostingModal, setShowHostingModal] = useState<boolean>(false);

  useEffect(() => {
    const res = saveAppState(appState);
    if (!res.ok && res.error) {
      setStorageWarning(res.error);
    } else {
      setStorageWarning("");
    }
  }, [appState]);

  const activeStudent: Student | null = useMemo(() => {
    if (appState.students.length === 0) return null;
    return (
      appState.students.find((s) => s.id === appState.activeStudentId) ||
      appState.students[0]
    );
  }, [appState.students, appState.activeStudentId]);

  const studentMistakes = useMemo(() => {
    if (!activeStudent) return [];
    return appState.mistakes.filter((m) => m.studentId === activeStudent.id);
  }, [appState.mistakes, activeStudent]);

  const handleSelectStudent = (studentId: string) => {
    const stu = appState.students.find((s) => s.id === studentId);
    const stuMistakeIds = appState.mistakes
      .filter((m) => m.studentId === studentId)
      .slice(0, 3)
      .map((m) => m.id);
    setConfirmDeleteActive(false);
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

  const handleSaveStudentForm = (data: {
    name: string;
    grade: string;
    className: string;
    note: string;
  }) => {
    if (editingStudent) {
      setAppState((prev) => ({
        ...prev,
        students: prev.students.map((s) =>
          s.id === editingStudent.id ? { ...s, ...data } : s
        ),
        examDraft:
          prev.activeStudentId === editingStudent.id
            ? {
                ...prev.examDraft,
                title: `${data.name} · 阶段错题巩固重组训练卷`,
              }
            : prev.examDraft,
      }));
      setEditingStudent(null);
      return;
    }

    const id = `stu-${Date.now()}`;
    const newStu: Student = {
      id,
      name: data.name,
      grade: data.grade,
      className: data.className,
      note: data.note,
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
  };

  const handleBatchImportStudents = (
    rows: { name: string; grade: string; className: string; note: string }[]
  ) => {
    if (rows.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const baseTs = Date.now();
    const created: Student[] = rows.map((r, idx) => ({
      id: `stu-${baseTs}-${idx}`,
      name: r.name,
      grade: r.grade,
      className: r.className,
      note: r.note,
      createdAt: today,
    }));

    setAppState((prev) => {
      const nextStudents = [...prev.students, ...created];
      const nextActiveId = prev.activeStudentId || created[0].id;
      const activeStu = nextStudents.find((s) => s.id === nextActiveId);
      return {
        ...prev,
        students: nextStudents,
        activeStudentId: nextActiveId,
        examDraft: {
          ...prev.examDraft,
          title: activeStu
            ? `${activeStu.name} · 阶段错题巩固重组训练卷`
            : prev.examDraft.title,
        },
      };
    });
  };

  const handleDeleteStudent = (studentId: string) => {
    setConfirmDeleteActive(false);
    setAppState((prev) => {
      const remainingStudents = prev.students.filter((s) => s.id !== studentId);
      const removedMistakeIds = new Set(
        prev.mistakes.filter((m) => m.studentId === studentId).map((m) => m.id)
      );
      const remainingMistakes = prev.mistakes.filter(
        (m) => m.studentId !== studentId
      );
      const nextActiveId =
        prev.activeStudentId === studentId
          ? remainingStudents[0]?.id ?? ""
          : prev.activeStudentId;
      const nextActiveStudent = remainingStudents.find(
        (s) => s.id === nextActiveId
      );

      return {
        ...prev,
        students: remainingStudents,
        activeStudentId: nextActiveId,
        mistakes: remainingMistakes,
        examDraft: {
          ...prev.examDraft,
          title: nextActiveStudent
            ? `${nextActiveStudent.name} · 阶段错题巩固重组训练卷`
            : "阶段错题巩固重组训练卷",
          mistakeIds: prev.examDraft.mistakeIds.filter(
            (id) => !removedMistakeIds.has(id)
          ),
        },
      };
    });
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

  const renderNoStudentEmptyState = () => (
    <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-5 max-w-2xl mx-auto mt-6">
      <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
        <Users className="w-6 h-6" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-slate-900">
          尚未添加学生档案
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          请先添加或批量导入学生名单，随后即可按学生与学科拍照录题、构建错题本、重组试卷并生成浅色描红卷面。
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => {
            setEditingStudent(null);
            setShowStudentForm(true);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          添加单个学生
        </button>
        <button
          type="button"
          onClick={() => setShowImportStudents(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          批量导入学生 (CSV / 粘贴)
        </button>
      </div>
    </div>
  );

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

      {/* Workspace Toolbar: Student Switcher, Import, Edit/Delete & Backup */}
      <div className="no-print bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 mr-1 whitespace-nowrap">
              当前学生：
            </span>
            {appState.students.length > 0 ? (
              <>
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {appState.students.map((stu) => {
                    const active = stu.id === activeStudent?.id;
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

                {/* Quick Edit & Delete for active student */}
                {activeStudent && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingStudent(activeStudent);
                        setShowStudentForm(true);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      title="编辑当前学生"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      编辑
                    </button>
                    {confirmDeleteActive ? (
                      <div className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                        <span className="text-xs text-red-700 whitespace-nowrap">
                          删除 {activeStudent.name}？
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteStudent(activeStudent.id)}
                          className="px-2 py-0.5 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 cursor-pointer"
                        >
                          确认
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteActive(false)}
                          className="text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteActive(true)}
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        title="删除当前学生"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        删除
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-slate-400 mr-1">暂无学生</span>
            )}

            <div className="flex items-center gap-1.5 pl-1">
              <button
                type="button"
                onClick={() => {
                  setEditingStudent(null);
                  setShowStudentForm(true);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                添加学生
              </button>
              <button
                type="button"
                onClick={() => setShowImportStudents(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/70 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                批量导入
              </button>
              {appState.students.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowManageStudents(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
                >
                  <Users className="w-3.5 h-3.5" />
                  管理 ({appState.students.length})
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            {activeStudent?.note && (
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
        {activeTab === "notebook" &&
          (activeStudent ? (
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
                  title: `${item.knowledgePoint} · 规范答题范例`,
                  content:
                    item.handwritingTemplate ||
                    buildAnswerExampleTemplate({
                      subject: item.subject,
                      questionType: item.questionType,
                      standardAnswer: item.standardAnswer,
                      correctionSteps: item.correctionSteps,
                    }),
                });
                setActiveTab("tracing");
              }}
              onGoToCapture={() => setActiveTab("capture")}
            />
          ) : (
            renderNoStudentEmptyState()
          ))}

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
            onRequireStudent={() => {
              setEditingStudent(null);
              setShowStudentForm(true);
            }}
          />
        )}

        {activeTab === "exam" &&
          (activeStudent ? (
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
          ) : (
            renderNoStudentEmptyState()
          ))}

        {activeTab === "tracing" && (
          <TracingStudio
            activeStudent={activeStudent}
            mistakes={studentMistakes}
            initialDraft={tracingDraft}
            onRecordPracticeComplete={handleRecordPracticeComplete}
          />
        )}
      </main>

      {/* Add / Edit Single Student Modal */}
      <StudentFormModal
        isOpen={showStudentForm}
        editingStudent={editingStudent}
        onClose={() => {
          setShowStudentForm(false);
          setEditingStudent(null);
        }}
        onSave={handleSaveStudentForm}
      />

      {/* Batch Import Students Modal */}
      <StudentImportModal
        isOpen={showImportStudents}
        onClose={() => setShowImportStudents(false)}
        onImport={handleBatchImportStudents}
      />

      {/* Manage All Students Modal */}
      <StudentManageModal
        isOpen={showManageStudents}
        students={appState.students}
        activeStudentId={activeStudent?.id || ""}
        mistakes={appState.mistakes}
        onClose={() => setShowManageStudents(false)}
        onSelectStudent={handleSelectStudent}
        onEditStudent={(stu) => {
          setShowManageStudents(false);
          setEditingStudent(stu);
          setShowStudentForm(true);
        }}
        onDeleteStudent={handleDeleteStudent}
        onOpenAdd={() => {
          setEditingStudent(null);
          setShowStudentForm(true);
        }}
        onOpenImport={() => setShowImportStudents(true)}
      />

      {/* Static Web Hosting & Backup Modal */}
      <StaticHostingModal
        isOpen={showHostingModal}
        onClose={() => setShowHostingModal(false)}
        appState={appState}
        onImportState={(nextState) => setAppState(nextState)}
        onClearAllData={() => setAppState(clearAppState())}
      />
    </div>
  );
}
