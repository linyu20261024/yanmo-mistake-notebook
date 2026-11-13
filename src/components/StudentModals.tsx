import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  Pencil,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { MistakeItem, Student } from "../types";

interface StudentFormModalProps {
  isOpen: boolean;
  editingStudent?: Student | null;
  onClose: () => void;
  onSave: (data: { name: string; grade: string; className: string; note: string }) => void;
}

export const StudentFormModal: React.FC<StudentFormModalProps> = ({
  isOpen,
  editingStudent,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("八年级");
  const [className, setClassName] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (editingStudent) {
      setName(editingStudent.name);
      setGrade(editingStudent.grade);
      setClassName(editingStudent.className);
      setNote(editingStudent.note || "");
    } else {
      setName("");
      setGrade("八年级");
      setClassName("");
      setNote("");
    }
  }, [editingStudent, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      grade: grade.trim() || "未设年级",
      className: className.trim() || grade.trim() || "默认班级",
      note: note.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-base font-semibold text-slate-900">
            {editingStudent ? "编辑学生档案" : "添加学生档案"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            学生姓名 <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：张小雨"
            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              年级阶段
            </label>
            <input
              type="text"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="例如：八年级"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              所在班级
            </label>
            <input
              type="text"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="例如：八年级(2)班"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            学习薄弱项 / 书写训练备注
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="选填：如巩固二次函数、英语衡水体训练"
            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            取消
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
          >
            {editingStudent ? "保存修改" : "确认添加"}
          </button>
        </div>
      </form>
    </div>
  );
};

interface ParsedStudentRow {
  name: string;
  grade: string;
  className: string;
  note: string;
}

function parseStudentsText(raw: string): ParsedStudentRow[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Try JSON array first
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed);
      const arr = Array.isArray(json)
        ? json
        : Array.isArray(json.students)
        ? json.students
        : [];
      return arr
        .filter((item: unknown) => Boolean(item && typeof item === "object" && "name" in item))
        .map((item: Record<string, unknown>) => ({
          name: String(item.name || "").trim(),
          grade: String(item.grade || "未设年级").trim(),
          className: String(item.className || item.class || item.grade || "默认班级").trim(),
          note: String(item.note || "").trim(),
        }))
        .filter((r: ParsedStudentRow) => r.name.length > 0);
    } catch {
      // Fall through to line-by-line parsing
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const results: ParsedStudentRow[] = [];
  lines.forEach((line, index) => {
    // Support CSV comma, Chinese comma, tab, or pipe
    const cols = line.split(/[,，\t|]+/).map((c) => c.trim());
    const first = cols[0] || "";
    // Skip header row if detected
    if (
      index === 0 &&
      (first === "姓名" || first.toLowerCase() === "name" || first === "学生姓名")
    ) {
      return;
    }
    if (!first) return;
    const grade = cols[1] || "未设年级";
    const className = cols[2] || (cols[1] ? cols[1] : "默认班级");
    const note = cols[3] || "";
    results.push({ name: first, grade, className, note });
  });

  return results;
}

interface StudentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (rows: ParsedStudentRow[]) => void;
}

export const StudentImportModal: React.FC<StudentImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [rawText, setRawText] = useState("");
  const [fileError, setFileError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const parsedRows = useMemo(() => parseStudentsText(rawText), [rawText]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError("");
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setRawText(reader.result);
      } else {
        setFileError("无法读取文件内容，请使用 UTF-8 编码的 CSV / TXT / JSON 文件。");
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const handleDownloadTemplate = () => {
    const csv = "\uFEFF姓名,年级,班级,备注\n张小雨,八年级,八年级(2)班,二次函数与几何规范作答\n李明轩,高一,高一(1)班,英语书面表达卷面训练\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "学生名单导入模板.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmImport = () => {
    if (parsedRows.length === 0) return;
    onImport(parsedRows);
    setRawText("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              批量导入学生名单
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              支持上传 CSV / TXT / JSON 文件，或直接从 Excel 复制粘贴（每行：姓名,年级,班级,备注）
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
            >
              <Upload className="w-3.5 h-3.5" />
              选择 CSV / TXT / JSON 文件
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.json,text/csv,text/plain,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" />
              下载 CSV 模板
            </button>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            已识别有效学生：{parsedRows.length} 人
          </span>
        </div>

        {fileError && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {fileError}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            粘贴学生名单（每行一位，仅填姓名也可导入）
          </label>
          <textarea
            rows={5}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={"示例：\n张小雨,八年级,八年级(2)班,数学错题巩固\n李明轩,高一,高一(1)班,英语作文描红\n王一诺"}
            className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {parsedRows.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 border-b border-slate-200">
              待导入预览（前 {Math.min(parsedRows.length, 50)} 条）
            </div>
            <div className="max-h-44 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 bg-white">
                    <th className="py-1.5 px-3 font-medium">姓名</th>
                    <th className="py-1.5 px-3 font-medium">年级</th>
                    <th className="py-1.5 px-3 font-medium">班级</th>
                    <th className="py-1.5 px-3 font-medium">备注</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedRows.slice(0, 50).map((row, idx) => (
                    <tr key={idx}>
                      <td className="py-1.5 px-3 font-medium text-slate-900">{row.name}</td>
                      <td className="py-1.5 px-3 text-slate-600">{row.grade}</td>
                      <td className="py-1.5 px-3 text-slate-600">{row.className}</td>
                      <td className="py-1.5 px-3 text-slate-500">{row.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            取消
          </button>
          <button
            type="button"
            disabled={parsedRows.length === 0}
            onClick={handleConfirmImport}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            确认导入 {parsedRows.length} 名学生
          </button>
        </div>
      </div>
    </div>
  );
};

interface StudentManageModalProps {
  isOpen: boolean;
  students: Student[];
  activeStudentId: string;
  mistakes: MistakeItem[];
  onClose: () => void;
  onSelectStudent: (id: string) => void;
  onEditStudent: (student: Student) => void;
  onDeleteStudent: (id: string) => void;
  onOpenAdd: () => void;
  onOpenImport: () => void;
}

export const StudentManageModal: React.FC<StudentManageModalProps> = ({
  isOpen,
  students,
  activeStudentId,
  mistakes,
  onClose,
  onSelectStudent,
  onEditStudent,
  onDeleteStudent,
  onOpenAdd,
  onOpenImport,
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) setConfirmDeleteId(null);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              学生档案管理（{students.length} 人）
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              可随时编辑学生信息、删除学生及其关联错题，或批量导入新名单
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAdd();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
          >
            <UserPlus className="w-3.5 h-3.5" />
            添加单个学生
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenImport();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50"
          >
            <Upload className="w-3.5 h-3.5" />
            批量导入学生
          </button>
        </div>

        {students.length === 0 ? (
          <div className="py-10 text-center space-y-2 border border-dashed border-slate-200 rounded-lg">
            <Users className="w-7 h-7 text-slate-300 mx-auto" />
            <div className="text-xs text-slate-500">当前暂无学生档案，请点击上方按钮添加或批量导入。</div>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-200">
            {students.map((stu) => {
              const stuMistakeCount = mistakes.filter((m) => m.studentId === stu.id).length;
              const isActive = stu.id === activeStudentId;
              const isConfirming = confirmDeleteId === stu.id;

              return (
                <div
                  key={stu.id}
                  className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/60"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-slate-900">{stu.name}</span>
                      <span className="text-xs text-slate-500">
                        {stu.grade} · {stu.className}
                      </span>
                      {isActive && (
                        <span className="text-xs font-medium text-blue-700">当前选中</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      已收录错题 {stuMistakeCount} 道
                      {stu.note ? ` · ${stu.note}` : ""}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isConfirming ? (
                      <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1">
                        <span className="text-xs text-red-700">
                          确认删除{stuMistakeCount > 0 ? `及 ${stuMistakeCount} 题` : ""}？
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteStudent(stu.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-0.5 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          确认
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-1.5 py-0.5 text-xs text-slate-600 hover:text-slate-900"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <>
                        {!isActive && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectStudent(stu.id);
                              onClose();
                            }}
                            className="px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-lg"
                          >
                            切换
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onEditStudent(stu)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                        >
                          <Pencil className="w-3 h-3" />
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(stu.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-white border border-slate-200 rounded-lg hover:bg-red-50 hover:border-red-200"
                        >
                          <Trash2 className="w-3 h-3" />
                          删除
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
