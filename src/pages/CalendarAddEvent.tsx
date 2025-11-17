import { useEffect, useMemo, useState, useRef } from "react";

import { useNavigate } from "react-router-dom";

import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil } from "lucide-react";

import { toast } from "../components/Toast";

import { InputDateByScrollPicker } from "../components/scroll-picker/InputDateByScrollPicker";
import { useCalendarStore, type CalendarEventColor } from "../state/calendar";
import { getCalendarTemplates, insertCalendarTemplate, deleteCalendarTemplate } from "../db/sqlite";

const LAST_TAB_KEY = "calendar-add-last-tab";

const MINUTE_STEP = 5;

const formatDateLabel = (date: Date) => {
  const y = date.getFullYear();

  const m = `${date.getMonth() + 1}`.padStart(2, "0");

  const d = `${date.getDate()}`.padStart(2, "0");

  return `${y}/${m}/${d}`;
};

const formatTimeLabel = (date: Date) => {
  const h = `${date.getHours()}`.padStart(2, "0");

  const m = `${date.getMinutes()}`.padStart(2, "0");

  return `${h}:${m}`;
};

const alignToMinuteStep = (date: Date, step: number) => {
  const result = new Date(date);

  result.setSeconds(0, 0);

  const minutes = result.getMinutes();

  const remainder = minutes % step;

  if (remainder !== 0) {
    result.setMinutes(minutes - remainder);
  }

  return result;
};

const createInitialRange = () => {
  const start = alignToMinuteStep(new Date(), MINUTE_STEP);

  const end = alignToMinuteStep(
    new Date(start.getTime() + 60 * 60 * 1000),
    MINUTE_STEP,
  );

  return {
    start,

    end,
  };
};

const COLOR_OPTIONS: Array<{
  value: CalendarEventColor;
  color: string;
  label: string;
}> = [
  { value: "white", color: "#e2e8f0", label: "ホワイト" },
  { value: "green", color: "#86efac", label: "グリーン" },
  { value: "blue", color: "#93c5fd", label: "ブルー" },
  { value: "red", color: "#f87171", label: "レッド" },
  { value: "yellow", color: "#fbbf24", label: "イエロー" },
];

type ManualField = "start" | "end";

type PickerSection = "date" | "time";

type TemplateActivityItem = {
  id: string;
  label: string;
  startTime: string; // "HH:mm" format
  endTime: string; // "HH:mm" format
  enabled: boolean;
  memo?: string;
  color?: CalendarEventColor;
};

type TemplateActivity = {
  id: string;
  name: string;
  summary: string;
  activities: TemplateActivityItem[];
};

const TEMPLATE_LIBRARY: TemplateActivity[] = [];

export default function CalendarAddEvent() {
  const navigate = useNavigate();
  const addEvent = useCalendarStore((state) => state.addEvent);

  const initial = useMemo(() => createInitialRange(), []);

  const [activeTab, setActiveTab] = useState<"manual" | "template">(() => {
    if (typeof window === "undefined") return "manual";

    return window.localStorage.getItem(LAST_TAB_KEY) === "template"
      ? "template"
      : "manual";
  });

  const [manualTitle, setManualTitle] = useState("");

  const [manualMemo, setManualMemo] = useState("");

  const [manualStart, setManualStart] = useState(() => new Date(initial.start));

  const [manualEnd, setManualEnd] = useState(() => new Date(initial.end));

  const [manualColor, setManualColor] =
    useState<CalendarEventColor>("white");

  const [activePicker, setActivePicker] = useState<{
    field: ManualField;
    section: PickerSection;
  } | null>(null);

  const [selectedTemplate, setSelectedTemplate] =
    useState<TemplateActivity | null>(null);
  
  // テンプレート編集用の状態
  const [editingActivities, setEditingActivities] = useState<TemplateActivityItem[]>([]);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [templateDate, setTemplateDate] = useState(() => new Date());
  
  // 保存されたテンプレート
  const [savedTemplates, setSavedTemplates] = useState<TemplateActivity[]>([]);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  
  // 時間ピッカー用の状態
  const [activeTimePicker, setActiveTimePicker] = useState<{
    activityId: string;
    field: "startTime" | "endTime";
  } | null>(null);
  
  // アクティビティ編集用のref
  const activityRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_TAB_KEY, activeTab);
    }
  }, [activeTab]);
  
  // アクティビティ編集の外側をクリックしたときに閉じる
  useEffect(() => {
    if (!editingActivityId || activeTimePicker) return;
    
    const handleMouseDownOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      
      // アクティビティ内の要素かどうかを確認
      const activityElement = activityRefs.current.get(editingActivityId);
      if (activityElement && !activityElement.contains(target)) {
        setEditingActivityId(null);
      }
    };
    
    // 少し遅延を入れて、現在のイベントが処理されるのを待つ
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDownOutside);
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleMouseDownOutside);
    };
  }, [editingActivityId, activeTimePicker]);
  
  // 保存されたテンプレートを読み込む
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const templates = await getCalendarTemplates();
        const parsedTemplates: TemplateActivity[] = templates.map(t => ({
          id: t.id,
          name: t.name,
          summary: t.summary || "",
          activities: JSON.parse(t.activities),
        }));
        setSavedTemplates(parsedTemplates);
      } catch (error) {
        console.error("Failed to load templates:", error);
      }
    };
    if (activeTab === "template") {
      loadTemplates();
    }
  }, [activeTab]);

  const manualTitleValid = manualTitle.trim().length > 0;
  const isSameDay =
    manualStart.getFullYear() === manualEnd.getFullYear() &&
    manualStart.getMonth() === manualEnd.getMonth() &&
    manualStart.getDate() === manualEnd.getDate();

  const manualTimeError =
    manualEnd.getTime() <= manualStart.getTime()
      ? "終了は開始後に設定してください"
      : !isSameDay
        ? "開始と終了は同じ日付を選択してください"
        : "";

  const manualValid = manualTitleValid && manualTimeError === "";

  const handleCancel = () => {
    navigate(-1);
  };

  const handleAdd = async () => {
    if (activeTab === "manual") {
      if (!manualValid) {
        toast("入力内容を確認してください。");
        return;
      }

      addEvent({
        title: manualTitle,
        memo: manualMemo,
        start: manualStart,
        end: manualEnd,
        color: manualColor,
      });

      toast("予定を追加しました。");
      navigate(-1);
      return;
    }

    // テンプレートからの追加（editingActivitiesを使用、selectedTemplateには影響しない）
    if (!selectedTemplate) return;
    
    const enabledActivities = editingActivities.filter(a => a.enabled);
    if (enabledActivities.length === 0) {
      toast("有効なアクティビティがありません。");
      return;
    }
    
    // 各アクティビティを予定として追加
    for (const activity of enabledActivities) {
      const start = parseTimeToDate(activity.startTime, templateDate);
      const end = parseTimeToDate(activity.endTime, templateDate);
      
      // 終了時刻が開始時刻より前の場合は次の日に
      if (end.getTime() <= start.getTime()) {
        end.setDate(end.getDate() + 1);
      }
      
      await addEvent({
        title: activity.label,
        memo: activity.memo ?? "",
        start,
        end,
        color: activity.color ?? "white",
      });
    }
    
    toast(`${enabledActivities.length}件の予定を追加しました。`);
    navigate(-1);
  };

  const handleTemplateToggle = (template: TemplateActivity) => {
    setSelectedTemplate(template);
    // テンプレート選択時にアクティビティのディープコピーを作成（テンプレート本体を変更しないように）
    setEditingActivities(template.activities.map(a => ({ ...a })));
    setEditingActivityId(null);
    setIsEditingTemplate(false);
    setEditingTemplateId(null);
    setNewTemplateName("");
  };
  
  // テンプレート編集を開始
  const startEditingTemplate = () => {
    if (!selectedTemplate) return;
    setIsEditingTemplate(true);
    setEditingTemplateId(selectedTemplate.id);
    setNewTemplateName(selectedTemplate.name);
    // アクティビティは既にeditingActivitiesにコピーされている
  };
  
  // テンプレート編集をキャンセル
  const cancelEditingTemplate = () => {
    if (!selectedTemplate) return;
    setIsEditingTemplate(false);
    setEditingTemplateId(null);
    // テンプレートの元の状態に戻す（ディープコピー）
    setEditingActivities(selectedTemplate.activities.map(a => ({ ...a })));
    setNewTemplateName(selectedTemplate.name);
    // モーダルを閉じる（selectedTemplateはそのまま残す）
  };
  
  // テンプレートを更新
  const updateTemplate = async () => {
    if (!selectedTemplate || !editingTemplateId) return;
    if (!newTemplateName.trim()) {
      toast("テンプレート名を入力してください。");
      return;
    }
    if (editingActivities.length === 0) {
      toast("アクティビティを追加してください。");
      return;
    }
    
    try {
      // 既存のテンプレートを削除して新しいものを作成（簡易実装）
      await deleteCalendarTemplate(editingTemplateId);
      const summary = editingActivities
        .filter(a => a.enabled)
        .map(a => a.label)
        .join(", ");
      
      const newTemplate = await insertCalendarTemplate({
        name: newTemplateName.trim(),
        summary,
        activities: editingActivities,
      });
      
      toast("テンプレートを更新しました。");
      setIsEditingTemplate(false);
      setEditingTemplateId(null);
      
      // テンプレート一覧を再読み込み
      const templates = await getCalendarTemplates();
      const parsedTemplates: TemplateActivity[] = templates.map(t => ({
        id: t.id,
        name: t.name,
        summary: t.summary || "",
        activities: JSON.parse(t.activities),
      }));
      setSavedTemplates(parsedTemplates);
      
      // 選択中のテンプレートも更新（ディープコピー）
      const updatedTemplate = parsedTemplates.find(t => t.id === newTemplate.id);
      if (updatedTemplate) {
        setSelectedTemplate(updatedTemplate);
        setEditingActivities(updatedTemplate.activities.map(a => ({ ...a })));
      }
    } catch (error) {
      console.error("Failed to update template:", error);
      toast("テンプレートの更新に失敗しました。");
    }
  };
  
  // テンプレートを削除
  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;
    
    // 確認ダイアログ
    if (!confirm(`「${selectedTemplate.name}」を削除しますか？`)) {
      return;
    }
    
    try {
      // 保存されたテンプレートかどうか確認
      const isSavedTemplate = savedTemplates.some(t => t.id === selectedTemplate.id);
      if (isSavedTemplate) {
        await deleteCalendarTemplate(selectedTemplate.id);
        toast("テンプレートを削除しました。");
        
        // テンプレート一覧を再読み込み
        const templates = await getCalendarTemplates();
        const parsedTemplates: TemplateActivity[] = templates.map(t => ({
          id: t.id,
          name: t.name,
          summary: t.summary || "",
          activities: JSON.parse(t.activities),
        }));
        setSavedTemplates(parsedTemplates);
      }
      
      // テンプレート詳細画面を閉じる
      setSelectedTemplate(null);
      setEditingActivities([]);
      setEditingActivityId(null);
      setIsEditingTemplate(false);
      setEditingTemplateId(null);
    } catch (error) {
      console.error("Failed to delete template:", error);
      toast("テンプレートの削除に失敗しました。");
    }
  };
  
  
  // アクティビティの編集開始
  const startEditingActivity = (activityId: string) => {
    setEditingActivityId(activityId);
  };
  
  // アクティビティの更新（editingActivitiesのみを更新、selectedTemplateには影響しない）
  const updateActivity = (activityId: string, updates: Partial<TemplateActivityItem>) => {
    setEditingActivities(prev =>
      prev.map(activity =>
        activity.id === activityId
          ? { ...activity, ...updates }
          : activity
      )
    );
  };
  
  // アクティビティの削除（editingActivitiesのみを更新、selectedTemplateには影響しない）
  const deleteActivity = (activityId: string) => {
    setEditingActivities(prev => prev.filter(activity => activity.id !== activityId));
    if (editingActivityId === activityId) {
      setEditingActivityId(null);
    }
  };
  
  // 新しいアクティビティを追加（editingActivitiesのみを更新、selectedTemplateには影響しない）
  const addNewActivity = () => {
    const newId = `activity-${Date.now()}`;
    
    // 直前のアクティビティの終了時間を取得、なければ00:00
    let startTime = "00:00";
    let endTime = "01:00";
    
    if (editingActivities.length > 0) {
      // 最後のアクティビティの終了時間を開始時間として設定
      const lastActivity = editingActivities[editingActivities.length - 1];
      startTime = lastActivity.endTime;
      
      // 終了時間は開始時間の1時間後
      const [startHours, startMinutes] = startTime.split(":").map(Number);
      const startTotalMinutes = startHours * 60 + startMinutes;
      const endTotalMinutes = startTotalMinutes + 60;
      const endHours = Math.floor(endTotalMinutes / 60) % 24;
      const endMins = endTotalMinutes % 60;
      
      endTime = `${String(endHours).padStart(2, "0")}:${String(endMins).padStart(2, "0")}`;
    }
    
    const newActivity: TemplateActivityItem = {
      id: newId,
      label: "",
      startTime,
      endTime,
      enabled: true,
      memo: "",
      color: "white",
    };
    setEditingActivities(prev => [...prev, newActivity]);
    setEditingActivityId(newId);
  };
  
  // 時間文字列をDateに変換（今日の日付を使用）
  const parseTimeToDate = (timeStr: string, date: Date): Date => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    return result;
  };
  
  // 時間文字列からDateに変換（テンプレート用）
  const parseTimeStringToDate = (timeStr: string): Date => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const result = new Date();
    result.setHours(hours || 0, minutes || 0, 0, 0);
    return result;
  };
  
  // 時間ピッカーの確認ハンドラ
  const handleTimePickerConfirm = (date: Date) => {
    if (!activeTimePicker) return;
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const timeStr = `${hours}:${minutes}`;
    updateActivity(activeTimePicker.activityId, { [activeTimePicker.field]: timeStr });
    setActiveTimePicker(null);
  };
  
  // テンプレート作成を開始
  const startCreatingTemplate = () => {
    setIsCreatingTemplate(true);
    setNewTemplateName("");
    setEditingActivities([]);
    setEditingActivityId(null);
    setSelectedTemplate(null);
  };
  
  // テンプレート作成をキャンセル
  const cancelCreatingTemplate = () => {
    setIsCreatingTemplate(false);
    setNewTemplateName("");
    setEditingActivities([]);
    setEditingActivityId(null);
  };
  
  // テンプレートを保存
  const saveTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast("テンプレート名を入力してください。");
      return;
    }
    if (editingActivities.length === 0) {
      toast("アクティビティを追加してください。");
      return;
    }
    
    try {
      const summary = editingActivities
        .filter(a => a.enabled)
        .map(a => a.label)
        .join(", ");
      
      await insertCalendarTemplate({
        name: newTemplateName.trim(),
        summary,
        activities: editingActivities,
      });
      
      toast("テンプレートを保存しました。");
      cancelCreatingTemplate();
      
      // テンプレート一覧を再読み込み
      const templates = await getCalendarTemplates();
      const parsedTemplates: TemplateActivity[] = templates.map(t => ({
        id: t.id,
        name: t.name,
        summary: t.summary || "",
        activities: JSON.parse(t.activities),
      }));
      setSavedTemplates(parsedTemplates);
    } catch (error) {
      console.error("Failed to save template:", error);
      toast("テンプレートの保存に失敗しました。");
    }
  };

  const updateManualField = (field: ManualField, next: Date) => {
    const aligned = alignToMinuteStep(next, MINUTE_STEP);

    if (field === "start") {
      setManualStart(aligned);
    } else {
      setManualEnd(aligned);
    }
  };

  const openPicker = (field: ManualField, section: PickerSection) => {
    setActivePicker({ field, section });
  };

  const closePicker = () => {
    setActivePicker(null);
  };

  const handlePickerConfirm = (next: Date) => {
    if (!activePicker) return;
    updateManualField(activePicker.field, next);
    setActivePicker(null);
  };

  return (
    <div className="calendar-add-screen">
      <header className="calendar-add-header">
        <button
          type="button"
          className="calendar-add-header__link is-cancel"
          onClick={handleCancel}
        >
          キャンセル
        </button>

        <h1 className="calendar-add-header__title">
          新規イベント
        </h1>

        {activeTab === "template" && isCreatingTemplate ? (
          <button
            type="button"
            className="calendar-add-header__link is-primary"
            disabled={!newTemplateName.trim() || editingActivities.length === 0}
            onClick={saveTemplate}
          >
            保存
          </button>
        ) : activeTab === "template" && selectedTemplate ? (
          <button
            type="button"
            className="calendar-add-header__link is-primary"
            disabled={editingActivities.filter(a => a.enabled).length === 0}
            onClick={handleAdd}
          >
            追加
          </button>
        ) : (
          <button
            type="button"
            className="calendar-add-header__link is-primary"
            disabled={activeTab === "manual" ? !manualValid : false}
            onClick={handleAdd}
          >
            追加
          </button>
        )}
      </header>

      <div
        className="calendar-add-tabs"
        role="tablist"
        aria-label="予定追加モード"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "manual"}
          className={`calendar-add-tab ${activeTab === "manual" ? "is-active" : ""}`}
          onClick={() => setActiveTab("manual")}
        >
          手動入力
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "template"}
          className={`calendar-add-tab ${activeTab === "template" ? "is-active" : ""}`}
          onClick={() => {
            setSelectedTemplate(null);

            setActiveTab("template");
          }}
        >
          テンプレートから作成
        </button>
      </div>

      <main className="calendar-add-body">
        {activeTab === "manual" ? (
          <>
            <div
              className="calendar-add-color-row"
              role="radiogroup"
              aria-label="カードの色"
              style={{ 
                display: "flex", 
                gap: "18px", 
                padding: "18px 20px",
                justifyContent: "center"
              }}
            >
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={manualColor === option.value}
                  style={{ 
                    width: "32px", 
                    height: "32px", 
                    minWidth: "32px",
                    minHeight: "32px",
                    aspectRatio: "1",
                    borderRadius: "50%", 
                    border: manualColor === option.value 
                      ? "2px solid #64748b" 
                      : "2px solid transparent",
                    backgroundColor: option.color,
                    cursor: "pointer",
                    transform: manualColor === option.value ? "scale(1.15)" : "scale(1)",
                    transition: "transform 0.2s ease, border-color 0.2s ease",
                    flexShrink: 0
                  }}
                  onClick={() => setManualColor(option.value)}
                >
                  <span className="sr-only">{option.label}</span>
                </button>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid rgba(255,255,255,.08)", borderRadius: "18px", overflow: "hidden" }}>
              <label>
                <input
                  className="calendar-template-activity__input"
                  type="text"
                  placeholder="タイトル"
                  value={manualTitle}
                  required
                  aria-invalid={!manualTitleValid}
                  onChange={(event) => setManualTitle(event.target.value)}
                />
              </label>

              <label>
                <textarea
                  className="calendar-template-activity__textarea"
                  placeholder="メモ"
                  value={manualMemo}
                  onChange={(event) => setManualMemo(event.target.value)}
                  rows={2}
                />
              </label>
            </div>

            <section className="calendar-add-card calendar-add-card--schedule">
              <div className="calendar-schedule-row">
                <div className="calendar-schedule-row__label">開始</div>

                <div className="calendar-schedule-row__buttons">
                  <button
                    type="button"
                    className={`calendar-schedule-button${activePicker?.field === "start" && activePicker?.section === "date" ? " is-active" : ""}`}
                    onClick={() => openPicker("start", "date")}
                  >
                    {formatDateLabel(manualStart)}
                  </button>

                  <button
                    type="button"
                    className={`calendar-schedule-button${activePicker?.field === "start" && activePicker?.section === "time" ? " is-active" : ""}`}
                    onClick={() => openPicker("start", "time")}
                  >
                    {formatTimeLabel(manualStart)}
                  </button>
                </div>
              </div>

              <div
                className={`calendar-schedule-row ${manualTimeError ? "has-error" : ""}`}
              >
                <div className="calendar-schedule-row__label">終了</div>

                <div className="calendar-schedule-row__buttons">
                  <button
                    type="button"
                    className={`calendar-schedule-button${activePicker?.field === "end" && activePicker?.section === "date" ? " is-active" : ""}`}
                    onClick={() => openPicker("end", "date")}
                  >
                    {formatDateLabel(manualEnd)}
                  </button>

                  <button
                    type="button"
                    className={`calendar-schedule-button${activePicker?.field === "end" && activePicker?.section === "time" ? " is-active" : ""}`}
                    onClick={() => openPicker("end", "time")}
                  >
                    {formatTimeLabel(manualEnd)}
                  </button>
                </div>
              </div>

              {manualTimeError && (
                <p className="calendar-add-error">{manualTimeError}</p>
              )}
            </section>

            {activePicker && (
              <InputDateByScrollPicker
                value={activePicker.field === "start" ? manualStart : manualEnd}
                open
                columns={
                  activePicker.section === "date"
                    ? ["year", "month", "day"]
                    : ["hour", "minute"]
                }
                minuteStep={
                  activePicker.section === "time" ? MINUTE_STEP : undefined
                }
                onConfirm={handlePickerConfirm}
                onCancel={closePicker}
                title={
                  activePicker.section === "date" ? "日付を選択" : "時間を選択"
                }
                className="scroll-picker-dialog--sheet"
              />
            )}
          </>
        ) : selectedTemplate ? (
          <section className="calendar-template-detail">
            <div className="calendar-template-detail__back-wrapper">
              <button
                type="button"
                className="calendar-template-detail__back"
                onClick={() => {
                  setSelectedTemplate(null);
                  setEditingActivities([]);
                  setEditingActivityId(null);
                }}
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="calendar-template-detail__back-text"
                onClick={() => {
                  setSelectedTemplate(null);
                  setEditingActivities([]);
                  setEditingActivityId(null);
                }}
              >
                テンプレート一覧へ
              </button>
            </div>

            <div className="calendar-template-detail__header">
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                <label className="calendar-template-detail__title-label">タイトル</label>
                {isEditingTemplate ? (
                  <input
                    type="text"
                    className="calendar-template-detail__title-input"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    style={{ width: "100%" }}
                  />
                ) : (
                  <h2 className="calendar-template-detail__title">
                    {selectedTemplate.name}
                  </h2>
                )}
              </div>
              {!isEditingTemplate && savedTemplates.some(t => t.id === selectedTemplate.id) && (
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    className="calendar-template-detail__edit-button"
                    onClick={startEditingTemplate}
                    aria-label="テンプレートを編集"
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="calendar-template-detail__delete-button"
                    onClick={handleDeleteTemplate}
                    aria-label="テンプレートを削除"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            <div className="calendar-template-detail__scrollable">
              <div className="calendar-template-detail__activities">
                {editingActivities.map((activity) => {
                  const isEditing = editingActivityId === activity.id;
                  return (
                    <div
                      key={activity.id}
                      className={`calendar-template-activity ${activity.enabled ? "" : "is-disabled"}`}
                      onClick={() => {
                        if (!isEditing && !isEditingTemplate) {
                          startEditingActivity(activity.id);
                        }
                      }}
                      style={{ 
                        cursor: isEditing || isEditingTemplate ? "default" : "pointer",
                        borderLeft: activity.color ? `4px solid ${COLOR_OPTIONS.find(opt => opt.value === activity.color)?.color}` : undefined
                      }}
                    >
                    {isEditing ? (
                      <div
                        ref={(el) => {
                          if (el) {
                            activityRefs.current.set(activity.id, el);
                          } else {
                            activityRefs.current.delete(activity.id);
                          }
                        }}
                        style={{ 
                          display: "flex", 
                          flexDirection: "column", 
                          gap: "12px", 
                          width: "100%"
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="calendar-template-activity__color-wrapper">
                          <div
                            style={{ 
                              display: "flex", 
                              gap: "12px", 
                              padding: "8px 0",
                              justifyContent: "flex-start",
                              alignItems: "center",
                              width: "100%"
                            }}
                          >
                            {COLOR_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                role="radio"
                                aria-checked={(activity.color ?? "white") === option.value}
                                style={{ 
                                  width: "28px", 
                                  height: "28px", 
                                  minWidth: "28px",
                                  minHeight: "28px",
                                  aspectRatio: "1",
                                  borderRadius: "50%", 
                                  border: (activity.color ?? "white") === option.value 
                                    ? "2px solid #64748b" 
                                    : "2px solid transparent",
                                  backgroundColor: option.color,
                                  cursor: "pointer",
                                  transform: (activity.color ?? "white") === option.value ? "scale(1.15)" : "scale(1)",
                                  transition: "transform 0.2s ease, border-color 0.2s ease",
                                  flexShrink: 0
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateActivity(activity.id, { color: option.value });
                                }}
                              >
                                <span className="sr-only">{option.label}</span>
                              </button>
                            ))}
                            <button
                              type="button"
                              className="calendar-template-activity__delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteActivity(activity.id);
                              }}
                              aria-label="削除"
                              style={{ marginLeft: "auto", flexShrink: 0 }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                            <button
                              type="button"
                              className="calendar-template-activity__time-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTimePicker({ activityId: activity.id, field: "startTime" });
                              }}
                            >
                              {activity.startTime}
                            </button>
                            <span style={{ color: "#fff", fontSize: "16px", fontWeight: 600, lineHeight: 1, display: "inline-block", transform: "rotate(90deg)" }}>～</span>
                            <button
                              type="button"
                              className="calendar-template-activity__time-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTimePicker({ activityId: activity.id, field: "endTime" });
                              }}
                            >
                              {activity.endTime}
                            </button>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid rgba(255,255,255,.08)", borderRadius: "18px", overflow: "hidden", flex: 1 }}>
                            <label>
                              <input
                                className="calendar-template-activity__input"
                                type="text"
                                placeholder="タイトル"
                                value={activity.label}
                                onChange={(e) => updateActivity(activity.id, { label: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </label>
                            <label>
                              <textarea
                                className="calendar-template-activity__textarea"
                                placeholder="メモ"
                                value={activity.memo ?? ""}
                                onChange={(e) => updateActivity(activity.id, { memo: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                                rows={2}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="calendar-template-activity__time">
                          {activity.startTime} ~ {activity.endTime}
                        </div>
                        <div className="calendar-template-activity__label">
                          {activity.label || "（タイトルなし）"}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              </div>

              <button
                type="button"
                className="calendar-template-detail__add-activity"
                onClick={addNewActivity}
              >
                <Plus size={16} aria-hidden="true" />
                <span>アクティビティを追加</span>
              </button>
            </div>

            {isEditingTemplate && (
              <>
                <button
                  type="button"
                  className="calendar-template-detail__cta"
                  onClick={updateTemplate}
                  disabled={!newTemplateName.trim() || editingActivities.length === 0}
                >
                  テンプレートを更新
                </button>
                <button
                  type="button"
                  className="calendar-template-detail__cancel-button"
                  onClick={cancelEditingTemplate}
                >
                  キャンセル
                </button>
              </>
            )}
            
            {!isEditingTemplate && (
              <button
                type="button"
                className="calendar-template-detail__cta calendar-template-detail__cta--fixed"
                onClick={handleAdd}
                disabled={editingActivities.filter(a => a.enabled).length === 0}
              >
                予定をカレンダーに追加
              </button>
            )}
            
            {activeTimePicker && (
              <InputDateByScrollPicker
                value={parseTimeStringToDate(
                  editingActivities.find(a => a.id === activeTimePicker.activityId)?.[activeTimePicker.field] || "00:00"
                )}
                open
                columns={["hour", "minute"]}
                minuteStep={MINUTE_STEP}
                onConfirm={handleTimePickerConfirm}
                onCancel={() => setActiveTimePicker(null)}
                title="時間を選択"
                className="scroll-picker-dialog--sheet"
              />
            )}
          </section>
        ) : (
          <section className="calendar-template-list">
            {[...TEMPLATE_LIBRARY, ...savedTemplates].map((template) => (
              <button
                key={template.id}
                type="button"
                className="calendar-template-card"
                onClick={() => handleTemplateToggle(template)}
              >
                <div className="calendar-template-card__text">
                  <span className="calendar-template-card__title">
                    {template.name}
                  </span>
                  <span className="calendar-template-card__summary">
                    {template.summary}
                  </span>
                </div>
                <ChevronRight size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
              </button>
            ))}

            <button
              type="button"
              className="calendar-template-list__add"
              onClick={startCreatingTemplate}
            >
              <Plus size={16} aria-hidden="true" />

              <span>テンプレートを追加</span>
            </button>
          </section>
        )}
        
        {/* テンプレート追加・編集モーダル */}
        {(isCreatingTemplate || isEditingTemplate) && (
          <div
            className="scroll-picker-dialog__overlay"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                if (isEditingTemplate) {
                  cancelEditingTemplate();
                } else {
                  cancelCreatingTemplate();
                }
              }
            }}
          >
            <div
              className="scroll-picker-dialog"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="scroll-picker-dialog__header">
                <h2 className="scroll-picker-dialog__title">
                  {isEditingTemplate ? "テンプレートを編集" : "テンプレートを追加"}
                </h2>
              </div>
              <div className="scroll-picker-dialog__body" style={{ padding: "20px 24px", maxHeight: "70vh", overflowY: "auto" }}>
                <section className="calendar-template-detail" style={{ background: "transparent", border: "none", padding: 0, maxHeight: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                    <input
                      type="text"
                      className="calendar-template-detail__title-input"
                      placeholder="テンプレート名"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      style={{ flex: 1, minWidth: 0 }}
                    />
                  </div>

                  <div className="calendar-template-detail__activities">
                    {editingActivities.map((activity) => {
                      const isEditing = editingActivityId === activity.id;
                      return (
                        <div
                          key={activity.id}
                          className={`calendar-template-activity ${activity.enabled ? "" : "is-disabled"}`}
                          onClick={() => {
                            if (!isEditing) {
                              startEditingActivity(activity.id);
                            }
                          }}
                          style={{ 
                            cursor: isEditing ? "default" : "pointer",
                            borderLeft: activity.color ? `4px solid ${COLOR_OPTIONS.find(opt => opt.value === activity.color)?.color}` : undefined
                          }}
                        >
                          {isEditing ? (
                            <div
                              ref={(el) => {
                                if (el) {
                                  activityRefs.current.set(activity.id, el);
                                } else {
                                  activityRefs.current.delete(activity.id);
                                }
                              }}
                              style={{ 
                                display: "flex", 
                                flexDirection: "column", 
                                gap: "12px", 
                                width: "100%"
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="calendar-template-activity__color-wrapper">
                                <div
                                  style={{ 
                                    display: "flex", 
                                    gap: "12px", 
                                    padding: "8px 0",
                                    justifyContent: "flex-start",
                                    alignItems: "center",
                                    width: "100%"
                                  }}
                                >
                                  {COLOR_OPTIONS.map((option) => (
                                    <button
                                      key={option.value}
                                      type="button"
                                      role="radio"
                                      aria-checked={(activity.color ?? "white") === option.value}
                                      style={{ 
                                        width: "28px", 
                                        height: "28px", 
                                        minWidth: "28px",
                                        minHeight: "28px",
                                        aspectRatio: "1",
                                        borderRadius: "50%", 
                                        border: (activity.color ?? "white") === option.value 
                                          ? "2px solid #64748b" 
                                          : "2px solid transparent",
                                        backgroundColor: option.color,
                                        cursor: "pointer",
                                        transform: (activity.color ?? "white") === option.value ? "scale(1.15)" : "scale(1)",
                                        transition: "transform 0.2s ease, border-color 0.2s ease",
                                        flexShrink: 0
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateActivity(activity.id, { color: option.value });
                                      }}
                                    >
                                      <span className="sr-only">{option.label}</span>
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    className="calendar-template-activity__delete"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteActivity(activity.id);
                                    }}
                                    aria-label="削除"
                                    style={{ marginLeft: "auto", flexShrink: 0 }}
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%" }}>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    className="calendar-template-activity__time-button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveTimePicker({ activityId: activity.id, field: "startTime" });
                                    }}
                                  >
                                    {activity.startTime}
                                  </button>
                                  <span style={{ color: "#fff", fontSize: "16px", fontWeight: 600, lineHeight: 1, display: "inline-block", transform: "rotate(90deg)" }}>～</span>
                                  <button
                                    type="button"
                                    className="calendar-template-activity__time-button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveTimePicker({ activityId: activity.id, field: "endTime" });
                                    }}
                                  >
                                    {activity.endTime}
                                  </button>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid rgba(255,255,255,.08)", borderRadius: "18px", overflow: "hidden", flex: 1 }}>
                                  <label>
                                    <input
                                      className="calendar-template-activity__input"
                                      type="text"
                                      placeholder="タイトル"
                                      value={activity.label}
                                      onChange={(e) => updateActivity(activity.id, { label: e.target.value })}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </label>
                                  <label>
                                    <textarea
                                      className="calendar-template-activity__textarea"
                                      placeholder="メモ"
                                      value={activity.memo ?? ""}
                                      onChange={(e) => updateActivity(activity.id, { memo: e.target.value })}
                                      onClick={(e) => e.stopPropagation()}
                                      rows={2}
                                    />
                                  </label>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="calendar-template-activity__time">
                                {activity.startTime} ~ {activity.endTime}
                              </div>
                              <div className="calendar-template-activity__label">
                                {activity.label || "（タイトルなし）"}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className="calendar-template-detail__add-activity"
                    onClick={addNewActivity}
                  >
                    <Plus size={16} aria-hidden="true" />
                    <span>アクティビティを追加</span>
                  </button>
                </section>
              </div>
              <div className="scroll-picker-dialog__footer">
                <button
                  type="button"
                  className="scroll-picker-dialog__button scroll-picker-dialog__button--cancel"
                  onClick={() => {
                    if (isEditingTemplate) {
                      cancelEditingTemplate();
                    } else {
                      cancelCreatingTemplate();
                    }
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  className="scroll-picker-dialog__button scroll-picker-dialog__button--confirm"
                  onClick={() => {
                    if (isEditingTemplate) {
                      updateTemplate();
                    } else {
                      saveTemplate();
                    }
                  }}
                  disabled={!newTemplateName.trim() || editingActivities.length === 0}
                >
                  {isEditingTemplate ? "更新" : "保存"}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {activeTimePicker && (
          <InputDateByScrollPicker
            value={parseTimeStringToDate(
              editingActivities.find(a => a.id === activeTimePicker.activityId)?.[activeTimePicker.field] || "00:00"
            )}
            open
            columns={["hour", "minute"]}
            minuteStep={MINUTE_STEP}
            onConfirm={handleTimePickerConfirm}
            onCancel={() => setActiveTimePicker(null)}
            title="時間を選択"
            className="scroll-picker-dialog--sheet"
          />
        )}
      </main>
    </div>
  );
}
