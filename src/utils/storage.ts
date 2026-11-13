import { AppState } from "../types";
import { INITIAL_APP_STATE } from "../data/presets";

const STORAGE_KEY = "yanmo_mistake_notebook_v1";

export function loadAppState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return INITIAL_APP_STATE;
    }
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (!parsed.students || !Array.isArray(parsed.students) || parsed.students.length === 0) {
      return INITIAL_APP_STATE;
    }
    return {
      students: parsed.students,
      activeStudentId:
        parsed.activeStudentId && parsed.students.some((s) => s.id === parsed.activeStudentId)
          ? parsed.activeStudentId
          : parsed.students[0].id,
      mistakes: Array.isArray(parsed.mistakes) ? parsed.mistakes : [],
      examDraft: parsed.examDraft ?? INITIAL_APP_STATE.examDraft,
    };
  } catch {
    return INITIAL_APP_STATE;
  }
}

export function saveAppState(state: AppState): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? "本地浏览器存储空间接近上限，建议导出 JSON 备份或清理旧图片。"
          : "保存失败",
    };
  }
}

export function exportBackupJSON(state: AppState): void {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `错题本备份_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function resetToPresetState(): AppState {
  localStorage.removeItem(STORAGE_KEY);
  return INITIAL_APP_STATE;
}
