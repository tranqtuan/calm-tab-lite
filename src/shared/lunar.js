/**
 * Vietnamese lunar calendar (Âm lịch), computed offline.
 * Astronomical algorithm by Hồ Ngọc Đức (based on Jean Meeus, "Astronomical
 * Algorithms"), evaluated for Vietnam's time zone (UTC+7).
 */

const TZ = 7;
const PI = Math.PI;
const INT = Math.floor;

export const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
export const CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
export const CHI_ANIMAL = ['Chuột', 'Trâu', 'Hổ', 'Mèo', 'Rồng', 'Rắn', 'Ngựa', 'Dê', 'Khỉ', 'Gà', 'Chó', 'Lợn'];
export const CHI_ANIMAL_EN = ['Rat', 'Ox', 'Tiger', 'Cat', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];

/** Julian day number of a Gregorian (or pre-1582 Julian) calendar date. */
export function jdFromDate(dd, mm, yy) {
  const a = INT((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  return jd;
}

export function jdToDate(jd) {
  let b, c;
  if (jd > 2299160) {
    const a = jd + 32044;
    b = INT((4 * a + 3) / 146097);
    c = a - INT((b * 146097) / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }
  const d = INT((4 * c + 3) / 1461);
  const e = c - INT((1461 * d) / 4);
  const m = INT((5 * e + 2) / 153);
  return [e - INT((153 * m + 2) / 5) + 1, m + 3 - 12 * INT(m / 10), b * 100 + d - 4800 + INT(m / 10)];
}

/** Julian day of the k-th new moon after 1900-01-01 (time zone adjusted, floored). */
function newMoonDay(k) {
  const T = k / 1236.85;
  const T2 = T * T, T3 = T2 * T, dr = PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 = C1 + 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const deltat = T < -11 ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3 : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return INT(Jd1 + C1 - deltat + 0.5 + TZ / 24);
}

/** Sun longitude at local midnight of day `jdn`, as one of 12 sectors (0–11). */
function sunLongitude(jdn) {
  const T = (jdn - 2451545.5 - TZ / 24) / 36525;
  const T2 = T * T, dr = PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L -= PI * 2 * INT(L / (PI * 2));
  return INT((L / PI) * 6);
}

/** Sun's apparent longitude in degrees (0–360) at local midnight of day `jdn` (UTC+7). */
export function sunLongitudeDeg(jdn) {
  const T = (jdn - 2451545.5 - TZ / 24) / 36525;
  const T2 = T * T, dr = PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  const DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M) + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  return (((L0 + DL) % 360) + 360) % 360;
}

/** Day of the new moon that starts lunar month 11 (the month containing the winter solstice). */
function lunarMonth11(yy) {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = INT(off / 29.530588853);
  let nm = newMoonDay(k);
  if (sunLongitude(nm) >= 9) nm = newMoonDay(k - 1);
  return nm;
}

function leapMonthOffset(a11) {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0;
  let i = 1;
  let arc = sunLongitude(newMoonDay(k + i));
  do {
    last = arc;
    i++;
    arc = sunLongitude(newMoonDay(k + i));
  } while (arc !== last && i < 14);
  return i - 1;
}

/** Solar → lunar. Returns { day, month, year, leap }. */
export function solarToLunar(dd, mm, yy) {
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = INT((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = newMoonDay(k + 1);
  if (monthStart > dayNumber) monthStart = newMoonDay(k);
  let a11 = lunarMonth11(yy);
  let b11 = a11;
  let lunarYear;
  if (a11 >= monthStart) {
    lunarYear = yy;
    a11 = lunarMonth11(yy - 1);
  } else {
    lunarYear = yy + 1;
    b11 = lunarMonth11(yy + 1);
  }
  const day = dayNumber - monthStart + 1;
  const diff = INT((monthStart - a11) / 29);
  let leap = false;
  let month = diff + 11;
  if (b11 - a11 > 365) {
    const leapDiff = leapMonthOffset(a11);
    if (diff >= leapDiff) {
      month = diff + 10;
      if (diff === leapDiff) leap = true;
    }
  }
  if (month > 12) month -= 12;
  if (month >= 11 && diff < 4) lunarYear -= 1;
  return { day, month, year: lunarYear, leap };
}

/** Lunar → solar. Returns [dd, mm, yy] or null if the date doesn't exist. */
export function lunarToSolar(day, month, year, leap = false) {
  let a11, b11;
  if (month < 11) {
    a11 = lunarMonth11(year - 1);
    b11 = lunarMonth11(year);
  } else {
    a11 = lunarMonth11(year);
    b11 = lunarMonth11(year + 1);
  }
  const k = INT(0.5 + (a11 - 2415021.076998695) / 29.530588853);
  let off = month - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365) {
    const leapOff = leapMonthOffset(a11);
    let leapMonth = leapOff - 2;
    if (leapMonth < 0) leapMonth += 12;
    if (leap && month !== leapMonth) return null;
    if (leap || off >= leapOff) off += 1;
  }
  return jdToDate(newMoonDay(k + off) + day - 1);
}

// ---------- Can Chi ----------
export const canChiOfYear = (lunarYear) => ({ can: (lunarYear + 6) % 10, chi: (lunarYear + 8) % 12 });
export const canChiOfMonth = (lunarMonth, lunarYear) => ({ can: (lunarYear * 12 + lunarMonth + 3) % 10, chi: (lunarMonth + 1) % 12 });
export const canChiOfDay = (jd) => ({ can: (jd + 9) % 10, chi: (jd + 1) % 12 });
export const label = ({ can, chi }) => `${CAN[can]} ${CHI[chi]}`;

/** Position (0–59) in the sexagenary cycle from a can/chi pair. */
export const sexagenaryIndex = ({ can, chi }) => (6 * can - 5 * chi + 60) % 60;

/** Everything a calendar cell or header needs for one solar date. */
export function lunarInfo(date = new Date()) {
  const dd = date.getDate(), mm = date.getMonth() + 1, yy = date.getFullYear();
  const lunar = solarToLunar(dd, mm, yy);
  const jd = jdFromDate(dd, mm, yy);
  return {
    ...lunar,
    jd,
    yearCC: canChiOfYear(lunar.year),
    monthCC: canChiOfMonth(lunar.month, lunar.year),
    dayCC: canChiOfDay(jd),
  };
}

/** "Mùng 7", "Rằm", "23". */
export function dayName(day) {
  if (day === 15) return 'Rằm';
  return day <= 10 ? `Mùng ${day}` : String(day);
}

/** "Mùng 7 tháng 9 năm Bính Ngọ" (adds "nhuận" for leap months). */
export function fullLunarLabel(info) {
  const month = info.month === 1 ? 'Giêng' : info.month === 12 ? 'Chạp' : String(info.month);
  return `${dayName(info.day)} tháng ${month}${info.leap ? ' nhuận' : ''} năm ${label(info.yearCC)}`;
}

/** Major Vietnamese lunar holidays, keyed by "month-day". */
export const LUNAR_HOLIDAYS = {
  '1-1': 'Tết Nguyên Đán', '1-2': 'Tết Nguyên Đán', '1-3': 'Tết Nguyên Đán',
  '1-15': 'Rằm tháng Giêng', '3-3': 'Tết Hàn Thực', '3-10': 'Giỗ Tổ Hùng Vương',
  '4-15': 'Lễ Phật Đản', '5-5': 'Tết Đoan Ngọ', '7-15': 'Vu Lan',
  '8-15': 'Tết Trung Thu', '12-23': 'Ông Công Ông Táo',
};

export function holidayFor(info) {
  return info.leap ? null : LUNAR_HOLIDAYS[`${info.month}-${info.day}`] ?? null;
}
