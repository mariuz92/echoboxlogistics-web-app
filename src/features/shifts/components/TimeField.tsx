import { TimePicker } from "antd";
import { dayjs } from "../../../lib/dates";
import { MINUTE_STEP } from "../time";

interface TimeFieldProps {
  /** "HH:mm" ("24:00" for the end of the day). */
  value: string;
  onChange: (value: string) => void;
  label: string;
  /** The end of a window: 00:00 means midnight and is stored as 24:00. */
  isEnd?: boolean;
  disabled?: boolean;
}

/** A time of day on the 15-minute grid. */
export function TimeField({ value, onChange, label, isEnd, disabled }: TimeFieldProps) {
  const shown = value === "24:00" ? "00:00" : value;
  return (
    <TimePicker
      value={dayjs(`2000-01-01 ${shown}`)}
      format="HH:mm"
      minuteStep={MINUTE_STEP}
      showNow={false}
      needConfirm={false}
      allowClear={false}
      disabled={disabled}
      aria-label={label}
      style={{ width: 96 }}
      onChange={(next) => {
        if (!next) return;
        const time = next.format("HH:mm");
        onChange(isEnd && time === "00:00" ? "24:00" : time);
      }}
    />
  );
}
