import { useEffect, useMemo, useState } from "react";

import { useNavigate } from "react-router-dom";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { toast } from "../components/Toast";

import { InputDateByScrollPicker } from "../components/scroll-picker/InputDateByScrollPicker";
import { useCalendarStore } from "../state/calendar";
import type { CalendarEventColor } from "../state/calendar";

const LAST_TAB_KEY = "calendar-add-last-tab";

const MINUTE_STEP = 5;

const COLOR_OPTIONS: Array<{ value: CalendarEventColor; label: string; tint: string }> = [
  { value: "white", label: "白", tint: "#f8fafc" },
  { value: "green", label: "緑", tint: "#bbf7d0" },
  { value: "blue", label: "青", tint: "#bfdbfe" },
  { value: "red", label: "赤", tint: "#fecaca" },
  { value: "yellow", label: "黄", tint: "#fef3c7" },
];

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

type ManualField = "start" | "end";

type PickerSection = "date" | "time";

type TemplateActivity = {
  id: string;

  name: string;

  summary: string;

  activities: Array<{
    id: string;

    label: string;

    time: string;

    enabled: boolean;
  }>;
};

const TEMPLATE_LIBRARY: TemplateActivity[] = [
  {
    id: "template-morning",

    name: "朝のルーティン",

    summary: "ストレッチ, 朝食, ニュースチェック",

    activities: [
      { id: "stretch", label: "ストレッチ", time: "07:00", enabled: true },

      { id: "breakfast", label: "朝食", time: "07:30", enabled: true },

      { id: "news", label: "ニュースチェック", time: "08:00", enabled: true },
    ],
  },

  {
    id: "template-workout",

    name: "午後のワークアウト",

    summary: "ジム, ランニング",

    activities: [
      { id: "gym", label: "ジムトレーニング", time: "17:30", enabled: true },

      { id: "run", label: "ランニング", time: "18:45", enabled: true },
    ],
  },
];

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

  const [selectedColor, setSelectedColor] = useState<CalendarEventColor>("white");

  const [activePicker, setActivePicker] = useState<{
    field: ManualField;
    section: PickerSection;
  } | null>(null);

  const [selectedTemplate, setSelectedTemplate] =
    useState<TemplateActivity | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_TAB_KEY, activeTab);
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
      try {
        await addEvent({
          title: manualTitle,
          memo: manualMemo,
          start: manualStart,
          end: manualEnd,
          color: selectedColor,
        });
        toast("予定を追加しました。");
        navigate(-1);
      } catch (error) {
        console.error(error);
        toast("予定の追加に失敗しました。もう一度お試しください。");
      }
      return;
    }

    toast("テンプレートからの追加は近日対応予定です。");
    navigate(-1);
  };

  const handleTemplateToggle = (template: TemplateActivity) => {
    setSelectedTemplate(template);
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

        <h1 className="calendar-add-header__title">新規イベント</h1>

        <button
          type="button"
          className="calendar-add-header__link is-primary"
          disabled={activeTab === "manual" ? !manualValid : false}
          onClick={handleAdd}
        >
          追加
        </button>
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
              <section className="calendar-add-card calendar-add-card--color">
                <h2 className="calendar-color-picker__title">カードの色</h2>
                <div className="calendar-color-picker" role="radiogroup" aria-label="カードの色">
                  {COLOR_OPTIONS.map((option) => {
                    const isActive = option.value === selectedColor;
                    return (
                      <div className="calendar-color-picker__item" key={option.value}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          className={`calendar-color-picker__button${isActive ? " is-active" : ""}`}
                          onClick={() => setSelectedColor(option.value)}
                        >
                          <span
                            className="calendar-color-picker__swatch"
                            style={{ backgroundColor: option.tint }}
                            aria-hidden="true"
                          />
                        </button>
                        <span className="calendar-color-picker__label" aria-hidden="true">
                          {option.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="calendar-add-card calendar-add-card--input">
              <label>
                <input
                  className="calendar-add-input"
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
                  className="calendar-add-textarea"
                  placeholder="メモ"
                  value={manualMemo}
                  onChange={(event) => setManualMemo(event.target.value)}
                  rows={3}
                />
              </label>
            </section>

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
                minuteStep={activePicker.section === "time" ? MINUTE_STEP : undefined}
                onConfirm={handlePickerConfirm}
                onCancel={closePicker}
                title={activePicker.section === "date" ? "日付を選択" : "時間を選択"}
                className="scroll-picker-dialog--sheet"
              />
            )}
          </>
        ) : selectedTemplate ? (
          <section className="calendar-template-detail">
            <button
              type="button"
              className="calendar-template-detail__back"
              onClick={() => setSelectedTemplate(null)}
            >
              <ChevronLeft size={18} aria-hidden="true" />

              <span>テンプレート一覧</span>
            </button>

            <h2 className="calendar-template-detail__title">
              {selectedTemplate.name}
            </h2>

            <div className="calendar-template-detail__activities">
              {selectedTemplate.activities.map((activity) => (
                <div
                  key={activity.id}
                  className={`calendar-template-activity ${activity.enabled ? "" : "is-disabled"}`}
                >
                  <div className="calendar-template-activity__time">
                    {activity.time}
                  </div>

                  <div className="calendar-template-activity__label">
                    {activity.label}
                  </div>

                  <button
                    type="button"
                    className="calendar-template-activity__toggle"
                  >
                    {activity.enabled ? "✔" : "○"}
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="calendar-template-detail__cta"
              onClick={handleAdd}
            >
              予定をカレンダーに追加
            </button>
          </section>
        ) : (
          <section className="calendar-template-list">
            {TEMPLATE_LIBRARY.map((template) => (
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

                <ChevronRight size={18} aria-hidden="true" />
              </button>
            ))}

            <button
              type="button"
              className="calendar-template-list__add"
              onClick={() => toast("テンプレート追加は近日対応です。")}
            >
              <Plus size={16} aria-hidden="true" />

              <span>テンプレートを追加</span>
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
