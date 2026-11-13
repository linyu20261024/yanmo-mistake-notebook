import React, { useRef, useState } from "react";
import { Download, RotateCcw, Upload, X } from "lucide-react";
import { AppState } from "../types";
import { exportBackupJSON } from "../utils/storage";

interface StaticHostingModalProps {
  isOpen: boolean;
  onClose: () => void;
  appState: AppState;
  onImportState: (state: AppState) => void;
  onResetPresets: () => void;
}

export const StaticHostingModal: React.FC<StaticHostingModalProps> = ({
  isOpen,
  onClose,
  appState,
  onImportState,
  onResetPresets,
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importStatus, setImportStatus] = useState<string>("");

  if (!isOpen) return null;

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const nextState = parsed.data ? parsed.data : parsed;
        if (!nextState.students || !Array.isArray(nextState.mistakes)) {
          throw new Error("备份文件格式不正确");
        }
        onImportState(nextState);
        setImportStatus("已成功恢复备份数据。");
      } catch {
        setImportStatus("导入失败：请确认选择的是本系统导出的 JSON 备份文件。");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Web 静态托管架构评估与数据备份
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              解答：如果简单实现，使用纯静态网页托管（如 GitHub Pages / OSS / Vercel 静态）是否可支撑？
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs leading-relaxed text-slate-700">
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900">
            <span className="font-semibold">结论：完全可以支撑绝大部分核心功能，且零服务器运维成本。</span>
            本应用已采用“前端优先存储 + 可选轻量识题接口”架构设计。
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  <th className="py-2 px-3 font-semibold">核心功能模块</th>
                  <th className="py-2 px-3 font-semibold">纯静态托管可支撑？</th>
                  <th className="py-2 px-3 font-semibold">技术实现原理</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="py-2 px-3 font-medium text-slate-900">多学生管理 & 学科错题本</td>
                  <td className="py-2 px-3 text-emerald-700 font-medium">100% 纯静态支持</td>
                  <td className="py-2 px-3 text-slate-600">
                    浏览器 LocalStorage / IndexedDB 本地持久化 + JSON 导入导出跨设备迁移
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-medium text-slate-900">拍照裁剪 & 试卷增白去红痕</td>
                  <td className="py-2 px-3 text-emerald-700 font-medium">100% 纯静态支持</td>
                  <td className="py-2 px-3 text-slate-600">
                    WebRTC 相机 / File API + HTML5 Canvas 像素级去红笔批改与框选切片
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-medium text-slate-900">重组试卷 & 浅色描红字帖</td>
                  <td className="py-2 px-3 text-emerald-700 font-medium">100% 纯静态支持</td>
                  <td className="py-2 px-3 text-slate-600">
                    纯前端 SVG 田字格/米字格/四线三格排版 + A4 Print CSS 导出 PDF 打印
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-medium text-slate-900">拍照自动识题（文字与公式 OCR）</td>
                  <td className="py-2 px-3 text-amber-700 font-medium">静态可兜底 / 建议配轻量代理</td>
                  <td className="py-2 px-3 text-slate-600">
                    纯静态可用 Tesseract.js 离线识字或“裁剪图片+手工输入”；若需高精度手写体/公式识别，搭配 1 个无服务器函数调用大模型接口即可
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Backup & Restore Actions */}
        <div className="pt-3 border-t border-slate-200 space-y-3">
          <div className="text-xs font-medium text-slate-800">
            本地错题库迁移与备份（纯静态多设备同步方案）
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => exportBackupJSON(appState)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
            >
              <Download className="w-3.5 h-3.5" />
              导出全部学生错题 JSON 备份
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              <Upload className="w-3.5 h-3.5" />
              导入恢复备份
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => {
                onResetPresets();
                setImportStatus("已重置为初始预设学生与示例错题。");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 hover:text-red-600 ml-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              恢复预设示例数据
            </button>
          </div>
          {importStatus && <p className="text-xs text-blue-700">{importStatus}</p>}
        </div>
      </div>
    </div>
  );
};
