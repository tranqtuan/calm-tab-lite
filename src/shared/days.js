/**
 * Special days for the calendar: Vietnamese public holidays (days off) and notable days, from
 * both the solar and the lunar calendar. Fully offline.
 */
import { lunarInfo, holidayFor } from './lunar.js';

/** Solar days, keyed by "month-day". `off`: a public holiday in Vietnam. */
const SOLAR = {
  '1-1': { name: 'Tết Dương lịch', off: true },
  '2-14': { name: 'Valentine' },
  '3-8': { name: 'Quốc tế Phụ nữ' },
  '4-30': { name: 'Giải phóng miền Nam', off: true },
  '5-1': { name: 'Quốc tế Lao động', off: true },
  '6-1': { name: 'Quốc tế Thiếu nhi' },
  '6-28': { name: 'Ngày Gia đình Việt Nam' },
  '9-2': { name: 'Quốc khánh', off: true },
  '10-20': { name: 'Phụ nữ Việt Nam' },
  '10-31': { name: 'Halloween' },
  '11-20': { name: 'Nhà giáo Việt Nam' },
  '12-24': { name: 'Đêm Giáng sinh' },
  '12-25': { name: 'Giáng sinh' },
};

/** Lunar holidays that are also days off ("month-day"); the rest of LUNAR_HOLIDAYS are notable days. */
const LUNAR_OFF = new Set(['1-1', '1-2', '1-3', '3-10']);

/**
 * Everything notable about a date: [{ name, off, lunar }], days off first.
 * Includes Giao thừa (the last day of lunar month 12, whether it has 29 or 30 days).
 */
export function specialDays(date, info = lunarInfo(date)) {
  const out = [];
  const solar = SOLAR[`${date.getMonth() + 1}-${date.getDate()}`];
  if (solar) out.push({ name: solar.name, off: !!solar.off, lunar: false });
  const lunar = holidayFor(info);
  if (lunar && !out.some((x) => x.name === lunar)) out.push({ name: lunar, off: LUNAR_OFF.has(`${info.month}-${info.day}`), lunar: true });
  if (info.month === 12 && !info.leap) {
    const next = new Date(date);
    next.setDate(date.getDate() + 1);
    const n = lunarInfo(next);
    if (n.month === 1 && n.day === 1 && !n.leap) out.push({ name: 'Giao thừa', off: true, lunar: true });
  }
  return out.sort((a, b) => b.off - a.off);
}
