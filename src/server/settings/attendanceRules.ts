import { getAppSettings, setAppSetting } from "@/server/settings/appSettings";

const ATTENDANCE_RULE_KEYS = {
  oddShiftInBefore: "attendance.odd_shift.in_before",
  oddShiftOutAfter: "attendance.odd_shift.out_after",
} as const;

const DEFAULT_ODD_SHIFT_IN_BEFORE = "05:30";
const DEFAULT_ODD_SHIFT_OUT_AFTER = "21:00";

function parseTimeToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const h = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function normalizeTime(value: string, fallback: string): string {
  const mins = parseTimeToMinutes(value);
  if (mins === null) return fallback;
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export type AttendanceRuleConfig = {
  oddShiftInBefore: string;
  oddShiftOutAfter: string;
  oddShiftInBeforeMins: number;
  oddShiftOutAfterMins: number;
};

export async function readAttendanceRuleConfig(): Promise<AttendanceRuleConfig> {
  const values = await getAppSettings([
    ATTENDANCE_RULE_KEYS.oddShiftInBefore,
    ATTENDANCE_RULE_KEYS.oddShiftOutAfter,
  ]);

  const oddShiftInBefore = normalizeTime(values[ATTENDANCE_RULE_KEYS.oddShiftInBefore] ?? "", DEFAULT_ODD_SHIFT_IN_BEFORE);
  const oddShiftOutAfter = normalizeTime(values[ATTENDANCE_RULE_KEYS.oddShiftOutAfter] ?? "", DEFAULT_ODD_SHIFT_OUT_AFTER);

  return {
    oddShiftInBefore,
    oddShiftOutAfter,
    oddShiftInBeforeMins: parseTimeToMinutes(oddShiftInBefore) ?? parseTimeToMinutes(DEFAULT_ODD_SHIFT_IN_BEFORE) ?? 330,
    oddShiftOutAfterMins: parseTimeToMinutes(oddShiftOutAfter) ?? parseTimeToMinutes(DEFAULT_ODD_SHIFT_OUT_AFTER) ?? 1260,
  };
}

export async function readAttendanceRuleConfigForUi() {
  const cfg = await readAttendanceRuleConfig();
  return {
    oddShiftInBefore: cfg.oddShiftInBefore,
    oddShiftOutAfter: cfg.oddShiftOutAfter,
  };
}

export async function saveAttendanceRuleConfig(input: { oddShiftInBefore: string; oddShiftOutAfter: string }) {
  const oddShiftInBefore = normalizeTime(input.oddShiftInBefore, DEFAULT_ODD_SHIFT_IN_BEFORE);
  const oddShiftOutAfter = normalizeTime(input.oddShiftOutAfter, DEFAULT_ODD_SHIFT_OUT_AFTER);
  await setAppSetting(ATTENDANCE_RULE_KEYS.oddShiftInBefore, oddShiftInBefore);
  await setAppSetting(ATTENDANCE_RULE_KEYS.oddShiftOutAfter, oddShiftOutAfter);
}
