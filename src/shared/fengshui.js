/**
 * Phong thủy / Tử vi — traditional Vietnamese almanac rules, computed offline.
 * Presented as traditional guidance for reflection, not prediction.
 *
 * Profile: con giáp, Can Chi of the (lunar) birth year, Ngũ hành nạp âm,
 *          Cung mệnh (Bát trạch: Kua number, lucky directions, Đông/Tây tứ mệnh), colors.
 * Day:     Hoàng đạo / Hắc đạo (12 thần), Trực (12 trực), giờ hoàng đạo,
 *          compatibility of the day's Chi with the birth-year Chi, Nguyệt kỵ / Tam nương,
 *          and an overall 1–5 rating with plain-language reasons.
 * Month-of-year boundaries use lunar months (as most Vietnamese almanacs do); the
 * birth year uses the lunar new year, so a January birthday may belong to the previous year.
 */
import { CAN, CHI, CHI_ANIMAL, CHI_ANIMAL_EN, canChiOfYear, lunarInfo, sexagenaryIndex, solarToLunar, label } from './lunar.js';

// ---------- Ngũ hành ----------
export const ELEMENTS = {
  Kim: { en: 'Metal', colors: ['trắng', 'xám', 'ghi'], support: 'Thổ' },
  Mộc: { en: 'Wood', colors: ['xanh lá'], support: 'Thủy' },
  Thủy: { en: 'Water', colors: ['đen', 'xanh dương'], support: 'Kim' },
  Hỏa: { en: 'Fire', colors: ['đỏ', 'hồng', 'tím'], support: 'Mộc' },
  Thổ: { en: 'Earth', colors: ['vàng', 'nâu đất'], support: 'Hỏa' },
};
/** Element that overcomes (khắc) each element. */
const OVERCOME_BY = { Kim: 'Hỏa', Mộc: 'Kim', Thủy: 'Thổ', Hỏa: 'Thủy', Thổ: 'Mộc' };

/** 30 nạp âm pairs, in sexagenary order (Giáp Tý/Ất Sửu → Hải Trung Kim, …). */
const NAP_AM = [
  ['Hải Trung Kim', 'Gold in the sea'], ['Lư Trung Hỏa', 'Fire in the furnace'], ['Đại Lâm Mộc', 'Wood of the great forest'],
  ['Lộ Bàng Thổ', 'Earth by the roadside'], ['Kiếm Phong Kim', 'Metal of the sword blade'], ['Sơn Đầu Hỏa', 'Fire on the mountaintop'],
  ['Giản Hạ Thủy', 'Water in the ravine'], ['Thành Đầu Thổ', 'Earth of the city wall'], ['Bạch Lạp Kim', 'Metal of white wax'],
  ['Dương Liễu Mộc', 'Willow wood'], ['Tuyền Trung Thủy', 'Water in the spring'], ['Ốc Thượng Thổ', 'Earth on the rooftop'],
  ['Tích Lịch Hỏa', 'Fire of thunder'], ['Tùng Bách Mộc', 'Pine and cypress wood'], ['Trường Lưu Thủy', 'Long-flowing water'],
  ['Sa Trung Kim', 'Metal in the sand'], ['Sơn Hạ Hỏa', 'Fire at the mountain foot'], ['Bình Địa Mộc', 'Wood of the plains'],
  ['Bích Thượng Thổ', 'Earth on the wall'], ['Kim Bạch Kim', 'Gold leaf'], ['Phú Đăng Hỏa', 'Lamp fire'],
  ['Thiên Hà Thủy', 'Water of the heavenly river'], ['Đại Trạch Thổ', 'Earth of the great marsh'], ['Thoa Xuyến Kim', 'Metal of hairpins'],
  ['Tang Đố Mộc', 'Mulberry wood'], ['Đại Khê Thủy', 'Water of the great stream'], ['Sa Trung Thổ', 'Earth in the sand'],
  ['Thiên Thượng Hỏa', 'Fire in the sky'], ['Thạch Lựu Mộc', 'Pomegranate wood'], ['Đại Hải Thủy', 'Water of the great ocean'],
];

export function napAm(cc) {
  const [name, en] = NAP_AM[Math.floor(sexagenaryIndex(cc) / 2)];
  return { name, en, element: name.split(' ').pop() };
}

// ---------- Bát trạch (Eight Mansions) ----------
const TRIGRAMS = {
  1: { name: 'Khảm', element: 'Thủy', dir: 'Bắc', group: 'Đông' },
  2: { name: 'Khôn', element: 'Thổ', dir: 'Tây Nam', group: 'Tây' },
  3: { name: 'Chấn', element: 'Mộc', dir: 'Đông', group: 'Đông' },
  4: { name: 'Tốn', element: 'Mộc', dir: 'Đông Nam', group: 'Đông' },
  6: { name: 'Càn', element: 'Kim', dir: 'Tây Bắc', group: 'Tây' },
  7: { name: 'Đoài', element: 'Kim', dir: 'Tây', group: 'Tây' },
  8: { name: 'Cấn', element: 'Thổ', dir: 'Đông Bắc', group: 'Tây' },
  9: { name: 'Ly', element: 'Hỏa', dir: 'Nam', group: 'Đông' },
};
/** Lucky directions: Sinh khí, Thiên y, Diên niên, Phục vị. */
const LUCKY = {
  1: ['Đông Nam', 'Đông', 'Nam', 'Bắc'], 2: ['Đông Bắc', 'Tây', 'Tây Bắc', 'Tây Nam'],
  3: ['Nam', 'Bắc', 'Đông Nam', 'Đông'], 4: ['Bắc', 'Nam', 'Đông', 'Đông Nam'],
  6: ['Tây', 'Đông Bắc', 'Tây Nam', 'Tây Bắc'], 7: ['Tây Bắc', 'Tây Nam', 'Đông Bắc', 'Tây'],
  8: ['Tây Nam', 'Tây Bắc', 'Tây', 'Đông Bắc'], 9: ['Đông', 'Đông Nam', 'Bắc', 'Nam'],
};
const LUCKY_NAMES = [['Sinh khí', 'prosperity'], ['Thiên y', 'health'], ['Diên niên', 'relationships'], ['Phục vị', 'stability']];
const DIR_EN = { Bắc: 'N', Nam: 'S', Đông: 'E', Tây: 'W', 'Đông Bắc': 'NE', 'Đông Nam': 'SE', 'Tây Bắc': 'NW', 'Tây Nam': 'SW' };

/** Kua number from the lunar birth year (mod-9 form of the classic digit-sum formula). */
export function kua(lunarYear, gender) {
  let k = gender === 'female' ? (lunarYear % 9 + 4) % 9 : (11 - (lunarYear % 9)) % 9;
  if (k === 0) k = 9;
  if (k === 5) k = gender === 'female' ? 8 : 2;
  return k;
}

const HOUR_CHI = (hour) => Math.floor(((hour + 1) % 24) / 2); // 23:00–00:59 = Tý

export function profile({ birthDate, gender, birthHour }) {
  const [y, m, d] = birthDate.split('-').map(Number);
  const lunar = solarToLunar(d, m, y);
  const cc = canChiOfYear(lunar.year);
  const na = napAm(cc);
  const k = kua(lunar.year, gender);
  const tri = TRIGRAMS[k];
  const el = ELEMENTS[na.element];
  return {
    lunar,
    yearCC: cc,
    yearLabel: label(cc),
    animal: CHI_ANIMAL[cc.chi],
    animalEn: CHI_ANIMAL_EN[cc.chi],
    napAm: na,
    element: na.element,
    elementEn: el.en,
    kua: k,
    cung: tri.name,
    cungElement: tri.element,
    group: `${tri.group} tứ mệnh`,
    lucky: LUCKY[k].map((dir, i) => ({ name: LUCKY_NAMES[i][0], meaning: LUCKY_NAMES[i][1], dir, en: DIR_EN[dir] })),
    colors: { own: el.colors, support: ELEMENTS[el.support].colors, avoid: ELEMENTS[OVERCOME_BY[na.element]].colors },
    hourChi: birthHour !== '' && birthHour != null ? CHI[HOUR_CHI(Number(birthHour))] : null,
  };
}

// ---------- Day rules ----------
/** 12 thần, in order starting from Thanh Long. */
const THAN = [
  ['Thanh Long', true], ['Minh Đường', true], ['Thiên Hình', false], ['Chu Tước', false],
  ['Kim Quỹ', true], ['Kim Đường', true], ['Bạch Hổ', false], ['Ngọc Đường', true],
  ['Thiên Lao', false], ['Huyền Vũ', false], ['Tư Mệnh', true], ['Câu Trận', false],
];
/** Chi on which Thanh Long falls, by lunar month (1–12). */
const THANH_LONG_DAY = [null, 0, 2, 4, 6, 8, 10, 0, 2, 4, 6, 8, 10];
/** Chi of the hour on which Thanh Long falls, by day Chi. */
const THANH_LONG_HOUR = [8, 10, 0, 2, 4, 6, 8, 10, 0, 2, 4, 6];

const TRUC = ['Kiến', 'Trừ', 'Mãn', 'Bình', 'Định', 'Chấp', 'Phá', 'Nguy', 'Thành', 'Thu', 'Khai', 'Bế'];
const TRUC_SCORE = { Trừ: 0.5, Mãn: 0.5, Định: 0.5, Thành: 0.5, Khai: 0.5, Phá: -0.5, Nguy: -0.5, Bế: -0.5 };

const TAM_HOP = [[8, 0, 4], [2, 6, 10], [11, 3, 7], [5, 9, 1]];
const LUC_HOP = { 0: 1, 1: 0, 2: 11, 11: 2, 3: 10, 10: 3, 4: 9, 9: 4, 5: 8, 8: 5, 6: 7, 7: 6 };
const HAI = { 0: 7, 7: 0, 1: 6, 6: 1, 2: 5, 5: 2, 3: 4, 4: 3, 8: 11, 11: 8, 9: 10, 10: 9 };
const NGUYET_KY = [5, 14, 23];
const TAM_NUONG = [3, 7, 13, 18, 22, 27];

const HOUR_RANGES = ['23–1', '1–3', '3–5', '5–7', '7–9', '9–11', '11–13', '13–15', '15–17', '17–19', '19–21', '21–23'];

/** Relationship between two Earthly Branches. */
function chiRelation(a, b) {
  if (a === b) return { kind: 'same', label: 'cùng Chi', score: 0.25 };
  if (TAM_HOP.some((g) => g.includes(a) && g.includes(b))) return { kind: 'tamhop', label: 'tam hợp', score: 1 };
  if (LUC_HOP[a] === b) return { kind: 'luchop', label: 'lục hợp', score: 1 };
  if ((a + 6) % 12 === b) return { kind: 'xung', label: 'lục xung', score: -1.5 };
  if (HAI[a] === b) return { kind: 'hai', label: 'tương hại', score: -0.5 };
  return { kind: 'neutral', label: 'bình hòa', score: 0 };
}

/** Full reading for one date, optionally personalised with a profile. */
export function dayReading(date, prof = null) {
  const info = lunarInfo(date);
  const dayChi = info.dayCC.chi;
  const thanIndex = (dayChi - THANH_LONG_DAY[info.month] + 12) % 12;
  const [thanName, hoangDao] = THAN[thanIndex];
  const truc = TRUC[(dayChi - info.monthCC.chi + 12) % 12];
  const hourStart = THANH_LONG_HOUR[dayChi];
  const goodHours = [];
  for (let i = 0; i < 12; i++) {
    const chi = (hourStart + i) % 12;
    if (THAN[i][1]) goodHours.push({ chi, name: CHI[chi], range: HOUR_RANGES[chi] });
  }
  goodHours.sort((a, b) => a.chi - b.chi);

  const reasons = [];
  let score = 3;
  if (hoangDao) { score += 1; reasons.push({ good: true, text: `Ngày hoàng đạo (${thanName}) — a favourable day` }); }
  else { score -= 1; reasons.push({ good: false, text: `Ngày hắc đạo (${thanName}) — keep plans simple` }); }

  const ts = TRUC_SCORE[truc] ?? 0;
  score += ts;
  if (ts) reasons.push({ good: ts > 0, text: `Trực ${truc} — ${ts > 0 ? 'good for starting things' : 'better for finishing than starting'}` });

  let relation = null;
  if (prof) {
    relation = chiRelation(dayChi, prof.yearCC.chi);
    score += relation.score;
    if (relation.kind !== 'neutral') {
      reasons.push({
        good: relation.score > 0,
        text: `${label(info.dayCC)} ${relation.label} with your ${prof.animal} (${prof.yearLabel}) year${relation.kind === 'xung' ? ' — avoid big decisions' : ''}`,
      });
    }
  }
  if (NGUYET_KY.includes(info.day)) { score -= 0.5; reasons.push({ good: false, text: `Mùng ${info.day} is a Nguyệt kỵ day` }); }
  if (TAM_NUONG.includes(info.day)) { score -= 0.5; reasons.push({ good: false, text: `Ngày Tam nương (${info.day})` }); }

  const rating = Math.max(1, Math.min(5, Math.round(score)));
  return { info, thanName, hoangDao, truc, goodHours, relation, rating, reasons, dayLabel: label(info.dayCC) };
}

export const RATING_WORDS = ['', 'Challenging', 'Careful', 'Balanced', 'Good', 'Excellent'];
export { CAN, CHI };

// ---------- Plain-language guidance (used by the widget) ----------

/** Traditional activities per Trực: [English, Vietnamese]. */
export const TRUC_GUIDE = {
  Kiến: { good: [['Travel & departures', 'xuất hành'], ['Opening a business', 'khai trương'], ['Weddings', 'cưới hỏi']], avoid: [['Breaking ground', 'động thổ'], ['Digging wells', 'đào giếng']] },
  Trừ: { good: [['Health & treatment', 'chữa bệnh'], ['Cleaning & clearing out', 'dọn dẹp'], ['Letting go of debts', 'giải hạn']], avoid: [['Weddings', 'cưới hỏi'], ['Long journeys', 'đi xa']] },
  Mãn: { good: [['Asking for prosperity', 'cầu tài'], ['Ceremonies', 'cúng tế'], ['Opening a business', 'khai trương']], avoid: [['Lawsuits', 'kiện tụng'], ['Taking office', 'nhậm chức']] },
  Bình: { good: [['Routine work', 'việc thường ngày'], ['Repairs', 'sửa chữa'], ['Tidying up', 'dọn dẹp']], avoid: [['Big launches', 'việc lớn']] },
  Định: { good: [['Signing agreements', 'ký kết'], ['Weddings', 'cưới hỏi'], ['Starting school', 'nhập học'], ['Buying & selling', 'mua bán']], avoid: [['Lawsuits', 'kiện tụng'], ['Long journeys', 'đi xa']] },
  Chấp: { good: [['Building', 'xây dựng'], ['Planting', 'trồng cây'], ['Hiring', 'tuyển người']], avoid: [['Moving house', 'chuyển nhà'], ['Travel', 'xuất hành']] },
  Phá: { good: [['Demolition', 'phá dỡ'], ['Medical treatment', 'chữa bệnh']], avoid: [['Most important events', 'việc trọng đại'], ['Weddings', 'cưới hỏi'], ['Opening a business', 'khai trương']] },
  Nguy: { good: [['Ceremonies & reflection', 'cúng tế']], avoid: [['Risky trips', 'đi xa, sông nước'], ['Big investments', 'đầu tư lớn']] },
  Thành: { good: [['Opening a business', 'khai trương'], ['Weddings', 'cưới hỏi'], ['Starting school', 'nhập học'], ['Almost anything', 'mọi việc']], avoid: [['Lawsuits', 'kiện tụng']] },
  Thu: { good: [['Collecting payments', 'thu nợ'], ['Stocking up', 'nhập hàng'], ['Shopping', 'mua sắm']], avoid: [['Opening a business', 'khai trương'], ['Funerals', 'an táng']] },
  Khai: { good: [['Opening a business', 'khai trương'], ['Breaking ground', 'động thổ'], ['Starting school', 'nhập học'], ['Travel', 'xuất hành']], avoid: [['Funerals', 'an táng']] },
  Bế: { good: [['Finishing & closing things', 'kết thúc việc cũ'], ['Repairs to walls & dykes', 'đắp đê, lấp hố']], avoid: [['Opening a business', 'khai trương'], ['Big decisions', 'quyết định lớn']] },
};

/** One-sentence summary for a reading. */
export function headline(r) {
  if (r.rating >= 5) return 'An excellent day — good for starting new things';
  if (r.rating === 4) return 'A good day to move important things forward';
  if (r.rating === 3) return 'A balanced day — steady progress, no big gambles';
  if (r.rating === 2) return 'Go gently — better for routine than for big starts';
  return 'A day for rest and reflection rather than big decisions';
}

export const GLOSSARY = [
  ['Hoàng đạo / Hắc đạo', 'Each day is ruled by one of 12 “stars”. Six are favourable (hoàng đạo, golden path) and six are not (hắc đạo, dark path).'],
  ['Trực', 'A 12-day cycle that says what kind of activity suits the day — e.g. Thành (completion) suits launches, Phá (breaking) suits clearing out.'],
  ['Giờ hoàng đạo', 'The six favourable 2-hour periods of the day, named after the 12 animals (Tý = 23–1h, Sửu = 1–3h, …).'],
  ['Tam hợp / Lục hợp', 'Animal signs that work well together. Lục xung means opposite signs — traditionally a day to avoid big decisions.'],
  ['Mệnh & Cung', 'Mệnh is your element (from the year you were born); cung mệnh is your house in the Eight Mansions, which gives your lucky directions.'],
];

/** Approximate colours for the Vietnamese colour names used in profiles. */
export const COLOR_HEX = {
  'trắng': '#f4f4f2', 'xám': '#9a9ea3', 'ghi': '#b9bcbf', 'xanh lá': '#4caf6e', 'đen': '#1d1d1f', 'xanh dương': '#3d7be0',
  'đỏ': '#e04848', 'hồng': '#ef8fb1', 'tím': '#9a6ad6', 'vàng': '#f2c14e', 'nâu đất': '#9a6b45',
};
export const COLOR_EN = { 'trắng': 'white', 'xám': 'grey', 'ghi': 'silver', 'xanh lá': 'green', 'đen': 'black', 'xanh dương': 'blue', 'đỏ': 'red', 'hồng': 'pink', 'tím': 'purple', 'vàng': 'yellow', 'nâu đất': 'earth brown' };
export const ELEMENT_COLOR = { Kim: '#c9ccd1', Mộc: '#4caf6e', Thủy: '#3d7be0', Hỏa: '#e04848', Thổ: '#c9a063' };
