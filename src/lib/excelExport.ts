import * as XLSX from 'xlsx-js-style';

/**
 * =============================================================================
 *  엑셀 급여대장 내보내기 엔진 (Payroll → Styled .xlsx Workbook)
 * =============================================================================
 *  기존에는 단순 텍스트 CSV(23개 컬럼, 서식 없음, 근태 원본 데이터 없음)만 내보냈지만,
 *  이 모듈은 xlsx-js-style을 이용해 실제 서식(색상/테두리/정렬/숫자서식/병합/열너비/
 *  자동필터)이 적용된 진짜 .xlsx 파일을 생성합니다.
 *
 *  생성되는 시트 구성:
 *    1) 대시보드      — 학원 정보 + 핵심 지표(KPI) 카드 + 정산방식별 요약
 *    2) 급여대장       — 전 직원 한눈에 보는 와이드 테이블(28개 컬럼, 합계행, 막대 시각화)
 *    3) 직원별 상세명세 — 임금명세서 형태의 항목별 지급/공제 상세 (직원별 블록)
 *    4) 근태기록       — 일자별 출퇴근 원본 데이터 (기존에는 전혀 내보내지 않던 데이터)
 * =============================================================================
 */

// ----------------------------- 색상 팔레트 -----------------------------------
const COLOR = {
  brand: '2563EB',       // blue-600
  brandDark: '1E3A8A',   // blue-900
  brandSoft: 'DBEAFE',   // blue-100
  slate900: '0F172A',
  slate700: '334155',
  slate500: '64748B',
  slate200: 'E2E8F0',
  slate100: 'F1F5F9',
  slate50: 'F8FAFC',
  white: 'FFFFFF',
  green: '059669',       // emerald-600
  greenSoft: 'D1FAE5',
  amber: 'D97706',
  amberSoft: 'FEF3C7',
  red: 'DC2626',
  redSoft: 'FEE2E2',
  purple: '7C3AED',
  purpleSoft: 'EDE9FE',
  indigo: '4338CA',
  border: 'CBD5E1',
  borderSoft: 'E2E8F0',
};

const FONT_FAMILY = '맑은 고딕';

// ----------------------------- 스타일 헬퍼 -----------------------------------
// Note: xlsx-js-style expects plain 6-digit hex color strings (e.g. "2563EB"),
// unlike ExcelJS's 8-digit ARGB convention — no alpha prefix here.
const border = (color = COLOR.border, style: string = 'thin') => ({
  top: { style, color: { rgb: color } },
  bottom: { style, color: { rgb: color } },
  left: { style, color: { rgb: color } },
  right: { style, color: { rgb: color } },
});

const fill = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb }, bgColor: { rgb } });

const font = (opts: { bold?: boolean; italic?: boolean; color?: string; sz?: number } = {}) => ({
  name: FONT_FAMILY,
  bold: !!opts.bold,
  italic: !!opts.italic,
  sz: opts.sz || 10,
  color: { rgb: opts.color || COLOR.slate900 },
});

const centerAlign = { horizontal: 'center', vertical: 'center', wrapText: true };
const leftAlign = { horizontal: 'left', vertical: 'center', wrapText: false };
const rightAlign = { horizontal: 'right', vertical: 'center' };

const MONEY_FMT = '#,##0"원"';
const HOUR_FMT = '0.0"h"';

function styleTitle() {
  return {
    font: font({ bold: true, color: COLOR.white, sz: 18 }),
    fill: fill(COLOR.brandDark),
    alignment: centerAlign,
  };
}
function styleSubtitle() {
  return {
    font: font({ bold: true, color: COLOR.slate700, sz: 10 }),
    fill: fill(COLOR.slate50),
    alignment: leftAlign,
    border: border(COLOR.borderSoft),
  };
}
function styleSectionBar() {
  return {
    font: font({ bold: true, color: COLOR.white, sz: 11 }),
    fill: fill(COLOR.slate700),
    alignment: centerAlign,
    border: border(COLOR.slate900),
  };
}
function styleHeader() {
  return {
    font: font({ bold: true, color: COLOR.white, sz: 9 }),
    fill: fill(COLOR.brand),
    alignment: centerAlign,
    border: border(COLOR.brandDark),
  };
}
function styleKpiLabel() {
  return {
    font: font({ bold: true, color: COLOR.white, sz: 9 }),
    alignment: centerAlign,
  };
}
function styleKpiValue(bg: string) {
  return {
    font: font({ bold: true, color: COLOR.white, sz: 16 }),
    fill: fill(bg),
    alignment: centerAlign,
  };
}
function styleBody(opts: { zebra?: boolean; bold?: boolean; color?: string; numFmt?: string; align?: any } = {}) {
  return {
    font: font({ bold: !!opts.bold, color: opts.color || COLOR.slate900, sz: 9.5 }),
    fill: fill(opts.zebra ? COLOR.slate50 : COLOR.white),
    alignment: opts.align || rightAlign,
    border: border(COLOR.borderSoft),
    numFmt: opts.numFmt,
  };
}
function styleTotalRow(numFmt?: string) {
  return {
    font: font({ bold: true, color: COLOR.slate900, sz: 10 }),
    fill: fill(COLOR.amberSoft),
    alignment: rightAlign,
    border: border(COLOR.amber),
    numFmt,
  };
}
function styleNetSalary() {
  return {
    font: font({ bold: true, color: COLOR.green, sz: 10 }),
    fill: fill(COLOR.greenSoft),
    alignment: rightAlign,
    border: border(COLOR.green),
    numFmt: MONEY_FMT,
  };
}

// ------------------------- 데이터 타입 정의 -----------------------------------

export interface ExcelPayrollRow {
  employeeId: string;
  name: string;
  position: string;
  bankLabel: string; // "국민 123-456" 형태 표기, 없으면 '-'
  workDaysCount: number;
  totalHours: number;
  baseSalary: number;
  holidayAllowance: number;
  nightAllowance: number;
  holidayWorkPremiumAllowance: number;
  paidLeaveAllowance: number;
  positionAllowance: number;
  qualificationAllowance: number;
  businessPromotionAllowance: number;
  cashierAllowance: number;
  mealAllowance: number;
  otherAllowance: number;
  omittedAllowance: number;
  totalGross: number;
  taxTypeLabel: string; // "3.3% 프리랜서" | "4대보험 공제" | "커스텀"
  taxRateLabel: string;
  incomeTax: number;
  localTax: number;
  nationalPension: number;
  healthInsurance: number;
  longTermCare: number;
  employmentInsurance: number;
  totalDeduction: number;
  netSalary: number;
  nightHours: number;
  holidayHours: number;
}

export interface ExcelAttendanceRow {
  name: string;
  date: string;       // YYYY-MM-DD
  dayOfWeek: string;   // 월/화/수...
  clockIn: string;
  clockOut: string;
  hasBreak: boolean;
  workedHours: number;
  status: string;      // 정상 / 결석 / 유급휴가 / 공휴근무 등
  isNightWork: boolean;
  isHolidayWork: boolean;
  dailyWage: number;
}

export interface ExcelComparisonRow {
  name: string;
  position: string;
  prevGross: number | null;   // null = 지난달 데이터 없음(신규)
  currGross: number | null;   // null = 이번달 데이터 없음(퇴사/누락)
  prevNet: number | null;
  currNet: number | null;
}

export interface ExcelExportOptions {
  academyName: string;
  periodLabel: string;
  generatedAt: Date;
  rows: ExcelPayrollRow[];
  attendanceRows: ExcelAttendanceRow[];
  comparison?: {
    previousPeriodLabel: string;
    rows: ExcelComparisonRow[];
  };
}

// ------------------------------ 유틸 함수 -------------------------------------

function setCell(ws: any, addr: string, value: any, style?: any) {
  ws[addr] = { v: value, t: typeof value === 'number' ? 'n' : 's', s: style };
}

function textBar(value: number, max: number, width = 20): string {
  if (max <= 0) return '';
  const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ============================================================================
//  시트 1: 대시보드
// ============================================================================
function buildDashboardSheet(opts: ExcelExportOptions) {
  const { rows, academyName, periodLabel, generatedAt } = opts;
  const ws: any = {};
  const merges: any[] = [];

  const totalHeadcount = rows.length;
  const totalGross = rows.reduce((s, r) => s + r.totalGross, 0);
  const totalDeduction = rows.reduce((s, r) => s + r.totalDeduction, 0);
  const totalNet = rows.reduce((s, r) => s + r.netSalary, 0);
  const avgNet = totalHeadcount > 0 ? Math.round(totalNet / totalHeadcount) : 0;

  // Title banner
  setCell(ws, 'A1', `🏫 ${academyName || '학원명 미입력'}  급여대장 대시보드`, styleTitle());
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } });

  setCell(ws, 'A2', `정산 기간: ${periodLabel || '-'}     생성일시: ${generatedAt.toLocaleString('ko-KR')}`, styleSubtitle());
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 9 } });

  // KPI cards row (labels row 4, values row 5-6 merged)
  const kpis: Array<{ label: string; value: string; bg: string }> = [
    { label: '👥 총 지급 인원', value: `${totalHeadcount}명`, bg: COLOR.brand },
    { label: '💰 총 지급액(세전)', value: `${totalGross.toLocaleString('ko-KR')}원`, bg: COLOR.slate700 },
    { label: '🧾 총 공제액', value: `${totalDeduction.toLocaleString('ko-KR')}원`, bg: COLOR.red },
    { label: '✅ 총 실지급액', value: `${totalNet.toLocaleString('ko-KR')}원`, bg: COLOR.green },
  ];

  kpis.forEach((k, i) => {
    const c0 = i * 2;
    const c1 = c0 + 1;
    const labelAddr = XLSX.utils.encode_cell({ r: 3, c: c0 });
    setCell(ws, labelAddr, k.label, styleKpiLabel());
    ws[labelAddr].s.fill = fill(k.bg);
    merges.push({ s: { r: 3, c: c0 }, e: { r: 3, c: c1 } });

    const valueAddr = XLSX.utils.encode_cell({ r: 4, c: c0 });
    setCell(ws, valueAddr, k.value, styleKpiValue(k.bg));
    merges.push({ s: { r: 4, c: c0 }, e: { r: 5, c: c1 } });
  });

  setCell(ws, 'A8', `평균 실수령액: ${avgNet.toLocaleString('ko-KR')}원`, styleSubtitle());
  merges.push({ s: { r: 7, c: 0 }, e: { r: 7, c: 9 } });

  // Breakdown by tax type
  const byType: Record<string, { count: number; gross: number; net: number }> = {};
  rows.forEach(r => {
    const key = r.taxTypeLabel;
    if (!byType[key]) byType[key] = { count: 0, gross: 0, net: 0 };
    byType[key].count += 1;
    byType[key].gross += r.totalGross;
    byType[key].net += r.netSalary;
  });

  let r = 9;
  setCell(ws, `A${r + 1}`, '정산방식별 요약', styleSectionBar());
  merges.push({ s: { r, c: 0 }, e: { r, c: 9 } });
  r += 1;

  const headerRow = r + 1;
  ['정산방식', '인원수', '세전 지급액 합계(원)', '실지급액 합계(원)', '인원 비중 시각화'].forEach((h, i) => {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c: i });
    setCell(ws, addr, h, styleHeader());
  });
  merges.push({ s: { r: headerRow, c: 4 }, e: { r: headerRow, c: 9 } });
  r = headerRow + 1;

  Object.entries(byType).forEach(([type, agg], idx) => {
    const zebra = idx % 2 === 1;
    setCell(ws, `A${r + 1}`, type, styleBody({ zebra, align: leftAlign }));
    setCell(ws, `B${r + 1}`, agg.count, styleBody({ zebra, align: centerAlign }));
    setCell(ws, `C${r + 1}`, agg.gross, styleBody({ zebra, numFmt: MONEY_FMT }));
    setCell(ws, `D${r + 1}`, agg.net, styleBody({ zebra, numFmt: MONEY_FMT }));
    setCell(ws, `E${r + 1}`, textBar(agg.count, totalHeadcount, 24), styleBody({ zebra, align: leftAlign, color: COLOR.brand }));
    merges.push({ s: { r, c: 4 }, e: { r, c: 9 } });
    r += 1;
  });

  ws['!merges'] = merges;
  ws['!cols'] = [
    { wch: 16 }, { wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
  ];
  ws['!rows'] = [{ hpt: 30 }, { hpt: 20 }, {}, { hpt: 22 }, { hpt: 28 }];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r, 12), c: 9 } });
  return ws;
}

// ============================================================================
//  시트 2: 급여대장 (전 직원 와이드 테이블)
// ============================================================================
function buildLedgerSheet(opts: ExcelExportOptions) {
  const { rows, academyName, periodLabel } = opts;
  const ws: any = {};
  const merges: any[] = [];

  const headers = [
    '이름', '직급', '은행/계좌', '근로일수', '총근로시간',
    '기본급(원)', '주휴수당(원)', '야간가산수당(원)', '공휴가산수당(원)', '유급연차수당(원)',
    '직책수당(원)', '자격수당(원)', '업무추진비(원)', '출납수당(원)', '식대(비과세)(원)',
    '기타수당(원)', '수기누락금(원)', '세전 총지급액(원)',
    '정산방식', '세율/요율',
    '소득세(원)', '지방소득세(원)', '국민연금(원)', '건강보험(원)', '장기요양보험(원)', '고용보험(원)',
    '공제액 합계(원)', '실수령액(원)', '실수령액 시각화',
  ];

  setCell(ws, 'A1', `${academyName || '학원명 미입력'} 급여대장  (정산기간: ${periodLabel || '-'})`, styleTitle());
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } });

  const headerRowIdx = 1; // row 2 (0-based index 1)
  headers.forEach((h, i) => {
    const addr = XLSX.utils.encode_cell({ r: headerRowIdx, c: i });
    setCell(ws, addr, h, styleHeader());
  });

  const maxNet = rows.reduce((m, r) => Math.max(m, r.netSalary), 0);
  let rIdx = headerRowIdx + 1;

  rows.forEach((row, idx) => {
    const zebra = idx % 2 === 1;
    const values = [
      row.name, row.position, row.bankLabel, row.workDaysCount, row.totalHours,
      row.baseSalary, row.holidayAllowance, row.nightAllowance, row.holidayWorkPremiumAllowance, row.paidLeaveAllowance,
      row.positionAllowance, row.qualificationAllowance, row.businessPromotionAllowance, row.cashierAllowance, row.mealAllowance,
      row.otherAllowance, row.omittedAllowance, row.totalGross,
      row.taxTypeLabel, row.taxRateLabel,
      row.incomeTax, row.localTax, row.nationalPension, row.healthInsurance, row.longTermCare, row.employmentInsurance,
      row.totalDeduction, row.netSalary, textBar(row.netSalary, maxNet, 18),
    ];

    values.forEach((v, c) => {
      const addr = XLSX.utils.encode_cell({ r: rIdx, c });
      let st: any;
      if (c === 0 || c === 1 || c === 2) st = styleBody({ zebra, align: leftAlign });
      else if (c === 3) st = styleBody({ zebra, align: centerAlign });
      else if (c === 4) st = styleBody({ zebra, numFmt: HOUR_FMT });
      else if (c === 18 || c === 19) st = styleBody({ zebra, align: centerAlign });
      else if (c === 27) st = styleNetSalary();
      else if (c === 28) st = styleBody({ zebra, align: leftAlign, color: COLOR.green, bold: true });
      else if (c === 17) st = styleBody({ zebra, numFmt: MONEY_FMT, bold: true });
      else st = styleBody({ zebra, numFmt: MONEY_FMT });
      setCell(ws, addr, v, st);
    });
    rIdx += 1;
  });

  // Totals row
  const totalLabelAddr = XLSX.utils.encode_cell({ r: rIdx, c: 0 });
  setCell(ws, totalLabelAddr, '합계', styleTotalRow());
  merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx, c: 2 } });
  setCell(ws, XLSX.utils.encode_cell({ r: rIdx, c: 1 }), '', styleTotalRow());
  setCell(ws, XLSX.utils.encode_cell({ r: rIdx, c: 2 }), '', styleTotalRow());

  const sumCols = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23, 24, 25, 26, 27];
  sumCols.forEach(c => {
    const total = rows.reduce((s, row) => {
      const arrIdx = c;
      const map: Record<number, number> = {
        3: row.workDaysCount, 4: row.totalHours, 5: row.baseSalary, 6: row.holidayAllowance,
        7: row.nightAllowance, 8: row.holidayWorkPremiumAllowance, 9: row.paidLeaveAllowance,
        10: row.positionAllowance, 11: row.qualificationAllowance, 12: row.businessPromotionAllowance,
        13: row.cashierAllowance, 14: row.mealAllowance, 15: row.otherAllowance, 16: row.omittedAllowance,
        17: row.totalGross, 20: row.incomeTax, 21: row.localTax, 22: row.nationalPension,
        23: row.healthInsurance, 24: row.longTermCare, 25: row.employmentInsurance,
        26: row.totalDeduction, 27: row.netSalary,
      };
      return s + (map[arrIdx] || 0);
    }, 0);
    const addr = XLSX.utils.encode_cell({ r: rIdx, c });
    const fmt = c === 4 ? HOUR_FMT : (c === 3 ? undefined : MONEY_FMT);
    setCell(ws, addr, total, styleTotalRow(fmt));
  });
  // blank cells for text columns in totals row
  [18, 19, 28].forEach(c => {
    setCell(ws, XLSX.utils.encode_cell({ r: rIdx, c }), '', styleTotalRow());
  });

  ws['!merges'] = merges;
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRowIdx, c: 0 }, e: { r: headerRowIdx, c: headers.length - 1 } }) };
  ws['!cols'] = headers.map((h, i) => {
    if (i === 0) return { wch: 10 };
    if (i === 1) return { wch: 10 };
    if (i === 2) return { wch: 16 };
    if (i === 18) return { wch: 14 };
    if (i === 19) return { wch: 12 };
    if (i === 28) return { wch: 22 };
    return { wch: 13 };
  });
  ws['!rows'] = [{ hpt: 26 }, { hpt: 40 }];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rIdx, c: headers.length - 1 } });
  return ws;
}

// ============================================================================
//  시트 3: 직원별 상세명세 (임금명세서 스타일)
// ============================================================================
function buildDetailSheet(opts: ExcelExportOptions) {
  const { rows, academyName, periodLabel } = opts;
  const ws: any = {};
  const merges: any[] = [];
  const COLS = 6; // 0..5 (A..F)

  setCell(ws, 'A1', `${academyName || '학원명 미입력'}  직원별 급여 상세명세서 (${periodLabel || '-'})`, styleTitle());
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } });

  let r = 2;

  rows.forEach(row => {
    // Employee header bar
    setCell(ws, XLSX.utils.encode_cell({ r, c: 0 }), `👤 ${row.name}  (${row.position})   |   ${row.bankLabel}   |   정산방식: ${row.taxTypeLabel} (${row.taxRateLabel})`, styleSectionBar());
    merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
    r += 1;

    // Attendance summary line
    ['근로일수', '총근로시간', '야간근로시간', '휴일근로시간'].forEach((h, i) => {
      setCell(ws, XLSX.utils.encode_cell({ r, c: i }), h, styleHeader());
    });
    setCell(ws, XLSX.utils.encode_cell({ r, c: 4 }), '', styleHeader());
    setCell(ws, XLSX.utils.encode_cell({ r, c: 5 }), '', styleHeader());
    merges.push({ s: { r, c: 4 }, e: { r, c: 5 } });
    r += 1;
    setCell(ws, XLSX.utils.encode_cell({ r, c: 0 }), `${row.workDaysCount}일`, styleBody({ align: centerAlign, bold: true }));
    setCell(ws, XLSX.utils.encode_cell({ r, c: 1 }), row.totalHours, styleBody({ align: centerAlign, bold: true, numFmt: HOUR_FMT }));
    setCell(ws, XLSX.utils.encode_cell({ r, c: 2 }), row.nightHours, styleBody({ align: centerAlign, bold: true, numFmt: HOUR_FMT, color: COLOR.indigo }));
    setCell(ws, XLSX.utils.encode_cell({ r, c: 3 }), row.holidayHours, styleBody({ align: centerAlign, bold: true, numFmt: HOUR_FMT, color: COLOR.brand }));
    setCell(ws, XLSX.utils.encode_cell({ r, c: 4 }), '', styleBody({}));
    setCell(ws, XLSX.utils.encode_cell({ r, c: 5 }), '', styleBody({}));
    merges.push({ s: { r, c: 4 }, e: { r, c: 5 } });
    r += 2;

    // Earnings table
    setCell(ws, XLSX.utils.encode_cell({ r, c: 0 }), '지급 항목', styleHeader());
    merges.push({ s: { r, c: 0 }, e: { r, c: 2 } });
    setCell(ws, XLSX.utils.encode_cell({ r, c: 3 }), '금액(원)', styleHeader());
    merges.push({ s: { r, c: 3 }, e: { r, c: 5 } });
    r += 1;

    const earnings: Array<[string, number]> = [
      ['기본급', row.baseSalary],
      ['주휴수당', row.holidayAllowance],
      ['야간가산수당', row.nightAllowance],
      ['공휴가산수당', row.holidayWorkPremiumAllowance],
      ['유급연차수당', row.paidLeaveAllowance],
      ['직책수당', row.positionAllowance],
      ['자격수당', row.qualificationAllowance],
      ['업무추진비', row.businessPromotionAllowance],
      ['출납수당', row.cashierAllowance],
      ['식대(비과세)', row.mealAllowance],
      ['기타수당', row.otherAllowance],
      ['수기누락금', row.omittedAllowance],
    ];
    earnings.filter(([, v]) => v !== 0).forEach(([label, val], idx) => {
      const zebra = idx % 2 === 1;
      setCell(ws, XLSX.utils.encode_cell({ r, c: 0 }), label, styleBody({ zebra, align: leftAlign }));
      merges.push({ s: { r, c: 0 }, e: { r, c: 2 } });
      setCell(ws, XLSX.utils.encode_cell({ r, c: 3 }), val, styleBody({ zebra, numFmt: MONEY_FMT }));
      merges.push({ s: { r, c: 3 }, e: { r, c: 5 } });
      r += 1;
    });
    setCell(ws, XLSX.utils.encode_cell({ r, c: 0 }), '지급액 합계', styleTotalRow());
    merges.push({ s: { r, c: 0 }, e: { r, c: 2 } });
    setCell(ws, XLSX.utils.encode_cell({ r, c: 3 }), row.totalGross, styleTotalRow(MONEY_FMT));
    merges.push({ s: { r, c: 3 }, e: { r, c: 5 } });
    r += 2;

    // Deductions table
    setCell(ws, XLSX.utils.encode_cell({ r, c: 0 }), '공제 항목', styleHeader());
    merges.push({ s: { r, c: 0 }, e: { r, c: 2 } });
    setCell(ws, XLSX.utils.encode_cell({ r, c: 3 }), '금액(원)', styleHeader());
    merges.push({ s: { r, c: 3 }, e: { r, c: 5 } });
    r += 1;

    const deductions: Array<[string, number]> = [
      ['소득세', row.incomeTax],
      ['지방소득세', row.localTax],
      ['국민연금', row.nationalPension],
      ['건강보험', row.healthInsurance],
      ['장기요양보험', row.longTermCare],
      ['고용보험', row.employmentInsurance],
    ];
    deductions.filter(([, v]) => v !== 0).forEach(([label, val], idx) => {
      const zebra = idx % 2 === 1;
      setCell(ws, XLSX.utils.encode_cell({ r, c: 0 }), label, styleBody({ zebra, align: leftAlign, color: COLOR.red }));
      merges.push({ s: { r, c: 0 }, e: { r, c: 2 } });
      setCell(ws, XLSX.utils.encode_cell({ r, c: 3 }), val, styleBody({ zebra, numFmt: MONEY_FMT, color: COLOR.red }));
      merges.push({ s: { r, c: 3 }, e: { r, c: 5 } });
      r += 1;
    });
    setCell(ws, XLSX.utils.encode_cell({ r, c: 0 }), '공제액 합계', styleTotalRow());
    merges.push({ s: { r, c: 0 }, e: { r, c: 2 } });
    setCell(ws, XLSX.utils.encode_cell({ r, c: 3 }), row.totalDeduction, styleTotalRow(MONEY_FMT));
    merges.push({ s: { r, c: 3 }, e: { r, c: 5 } });
    r += 1;

    // Net salary highlight
    setCell(ws, XLSX.utils.encode_cell({ r, c: 0 }), '💵 실수령액', styleNetSalary());
    ws[XLSX.utils.encode_cell({ r, c: 0 })].s.alignment = centerAlign;
    ws[XLSX.utils.encode_cell({ r, c: 0 })].s.font.sz = 12;
    merges.push({ s: { r, c: 0 }, e: { r, c: 2 } });
    const netAddr = XLSX.utils.encode_cell({ r, c: 3 });
    setCell(ws, netAddr, row.netSalary, styleNetSalary());
    ws[netAddr].s.font.sz = 13;
    merges.push({ s: { r, c: 3 }, e: { r, c: 5 } });
    r += 3; // spacer before next employee
  });

  ws['!merges'] = merges;
  ws['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r, 10), c: COLS - 1 } });
  return ws;
}

// ============================================================================
//  시트: 전월 대비 비교 (선택적으로만 생성됨)
// ============================================================================
function buildComparisonSheet(opts: ExcelExportOptions) {
  const comparison = opts.comparison!;
  const { academyName, periodLabel } = opts;
  const ws: any = {};
  const merges: any[] = [];

  const headers = [
    '이름', '직급', '상태',
    '지난달 세전지급액(원)', '이번달 세전지급액(원)', '지급액 증감(원)', '지급액 증감률',
    '지난달 실수령액(원)', '이번달 실수령액(원)', '실수령액 증감(원)', '실수령액 증감률',
  ];

  setCell(ws, 'A1', `${academyName || '학원명 미입력'}  전월 대비 급여 비교  (지난달: ${comparison.previousPeriodLabel} → 이번달: ${periodLabel || '-'})`, styleTitle());
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } });

  const headerRowIdx = 1;
  headers.forEach((h, i) => {
    setCell(ws, XLSX.utils.encode_cell({ r: headerRowIdx, c: i }), h, styleHeader());
  });

  let rIdx = headerRowIdx + 1;
  let increasedCount = 0, decreasedCount = 0, sameCount = 0, newCount = 0, leftCount = 0;

  comparison.rows.forEach((row, idx) => {
    const zebra = idx % 2 === 1;
    const isNew = row.prevNet === null && row.currNet !== null;
    const isLeft = row.currNet === null && row.prevNet !== null;
    const netDiff = (row.currNet !== null && row.prevNet !== null) ? row.currNet - row.prevNet : null;
    const grossDiff = (row.currGross !== null && row.prevGross !== null) ? row.currGross - row.prevGross : null;
    const netPct = (netDiff !== null && row.prevNet) ? (netDiff / row.prevNet) * 100 : null;
    const grossPct = (grossDiff !== null && row.prevGross) ? (grossDiff / row.prevGross) * 100 : null;

    let status = '변동없음';
    let statusColor = COLOR.slate500;
    let rowBg = zebra ? COLOR.slate50 : COLOR.white;
    if (isNew) { status = '🆕 신규'; statusColor = COLOR.brand; rowBg = COLOR.brandSoft; newCount++; }
    else if (isLeft) { status = '⛔ 퇴사/누락'; statusColor = COLOR.slate500; rowBg = COLOR.slate100; leftCount++; }
    else if (netDiff !== null && netDiff > 0) { status = '📈 인상'; statusColor = COLOR.green; rowBg = COLOR.greenSoft; increasedCount++; }
    else if (netDiff !== null && netDiff < 0) { status = '📉 삭감'; statusColor = COLOR.red; rowBg = COLOR.redSoft; decreasedCount++; }
    else { sameCount++; }

    const values = [
      row.name, row.position, status,
      row.prevGross, row.currGross, grossDiff, grossPct !== null ? `${grossPct >= 0 ? '+' : ''}${grossPct.toFixed(1)}%` : '-',
      row.prevNet, row.currNet, netDiff, netPct !== null ? `${netPct >= 0 ? '+' : ''}${netPct.toFixed(1)}%` : '-',
    ];

    values.forEach((v, c) => {
      const addr = XLSX.utils.encode_cell({ r: rIdx, c });
      let st: any;
      if (c === 2) {
        st = { font: font({ bold: true, color: statusColor, sz: 9.5 }), fill: fill(rowBg), alignment: centerAlign, border: border(COLOR.borderSoft) };
      } else if (c === 0 || c === 1) {
        st = { font: font({ bold: c === 0, color: COLOR.slate900, sz: 9.5 }), fill: fill(rowBg), alignment: leftAlign, border: border(COLOR.borderSoft) };
      } else if (c === 3 || c === 4 || c === 7 || c === 8) {
        st = { font: font({ color: COLOR.slate900, sz: 9.5 }), fill: fill(rowBg), alignment: rightAlign, border: border(COLOR.borderSoft), numFmt: MONEY_FMT };
      } else if (c === 5 || c === 9) {
        const diffColor = typeof v === 'number' ? (v > 0 ? COLOR.green : v < 0 ? COLOR.red : COLOR.slate500) : COLOR.slate500;
        st = { font: font({ bold: true, color: diffColor, sz: 9.5 }), fill: fill(rowBg), alignment: rightAlign, border: border(COLOR.borderSoft), numFmt: MONEY_FMT };
      } else {
        const pctColor = typeof v === 'string' && v.startsWith('+') ? COLOR.green : (typeof v === 'string' && v.startsWith('-') ? COLOR.red : COLOR.slate500);
        st = { font: font({ bold: true, color: pctColor, sz: 9.5 }), fill: fill(rowBg), alignment: centerAlign, border: border(COLOR.borderSoft) };
      }
      setCell(ws, addr, v === null ? '-' : v, st);
    });
    rIdx += 1;
  });

  // Summary footer
  rIdx += 1;
  setCell(ws, XLSX.utils.encode_cell({ r: rIdx, c: 0 }), `📈 인상 ${increasedCount}명   📉 삭감 ${decreasedCount}명   ➖ 변동없음 ${sameCount}명   🆕 신규 ${newCount}명   ⛔ 퇴사/누락 ${leftCount}명`, styleSubtitle());
  merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx, c: headers.length - 1 } });

  ws['!merges'] = merges;
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRowIdx, c: 0 }, e: { r: headerRowIdx, c: headers.length - 1 } }) };
  ws['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 14 },
    { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 10 },
    { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 10 },
  ];
  ws['!rows'] = [{ hpt: 26 }, { hpt: 22 }];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rIdx, c: headers.length - 1 } });
  return ws;
}

// ============================================================================
//  시트 4: 근태기록 (일자별 원본 데이터)
// ============================================================================
function buildAttendanceSheet(opts: ExcelExportOptions) {
  const { attendanceRows, academyName, periodLabel } = opts;
  const ws: any = {};
  const merges: any[] = [];

  const headers = ['이름', '날짜', '요일', '출근', '퇴근', '휴게적용', '실근무시간', '근태상태', '야간근무', '공휴근무', '당일 예상급여(원)'];

  setCell(ws, 'A1', `${academyName || '학원명 미입력'}  근태기록 원본 (${periodLabel || '-'})`, styleTitle());
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } });

  const headerRowIdx = 1;
  headers.forEach((h, i) => {
    setCell(ws, XLSX.utils.encode_cell({ r: headerRowIdx, c: i }), h, styleHeader());
  });

  let rIdx = headerRowIdx + 1;
  attendanceRows.forEach((row, idx) => {
    const zebra = idx % 2 === 1;
    let statusColor = COLOR.slate900;
    if (row.status === '결석') statusColor = COLOR.red;
    else if (row.status === '유급휴가') statusColor = COLOR.purple;
    else if (row.status === '공휴근무') statusColor = COLOR.amber;
    else if (row.status === '정상') statusColor = COLOR.green;

    const values = [
      row.name, row.date, row.dayOfWeek, row.clockIn || '-', row.clockOut || '-',
      row.hasBreak ? 'Y' : 'N', row.workedHours, row.status,
      row.isNightWork ? '야간' : '-', row.isHolidayWork ? '공휴' : '-', row.dailyWage,
    ];
    values.forEach((v, c) => {
      const addr = XLSX.utils.encode_cell({ r: rIdx, c });
      let st: any;
      if (c === 0) st = styleBody({ zebra, align: leftAlign });
      else if (c === 6) st = styleBody({ zebra, align: centerAlign, numFmt: HOUR_FMT });
      else if (c === 7) st = styleBody({ zebra, align: centerAlign, bold: true, color: statusColor });
      else if (c === 10) st = styleBody({ zebra, numFmt: MONEY_FMT, bold: true });
      else st = styleBody({ zebra, align: centerAlign });
      setCell(ws, addr, v, st);
    });
    rIdx += 1;
  });

  ws['!merges'] = merges;
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRowIdx, c: 0 }, e: { r: headerRowIdx, c: headers.length - 1 } }) };
  ws['!cols'] = [
    { wch: 10 }, { wch: 12 }, { wch: 6 }, { wch: 9 }, { wch: 9 },
    { wch: 9 }, { wch: 11 }, { wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 16 },
  ];
  ws['!rows'] = [{ hpt: 26 }, { hpt: 22 }];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rIdx, 3), c: headers.length - 1 } });
  return ws;
}

// ============================================================================
//  공개 함수: 워크북 생성 및 다운로드
// ============================================================================
export async function exportPayrollWorkbook(opts: ExcelExportOptions): Promise<void> {
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: `${opts.academyName || '급여대장'} 급여대장`,
    Subject: '급여대장',
    Author: opts.academyName || 'Payroll Manager',
    CreatedDate: opts.generatedAt,
  };

  const dashboardSheet = buildDashboardSheet(opts);
  const ledgerSheet = buildLedgerSheet(opts);
  const detailSheet = buildDetailSheet(opts);
  const attendanceSheet = buildAttendanceSheet(opts);

  XLSX.utils.book_append_sheet(wb, dashboardSheet, '대시보드');
  XLSX.utils.book_append_sheet(wb, ledgerSheet, '급여대장');
  if (opts.comparison && opts.comparison.rows.length > 0) {
    const comparisonSheet = buildComparisonSheet(opts);
    XLSX.utils.book_append_sheet(wb, comparisonSheet, '전월대비 비교');
  }
  XLSX.utils.book_append_sheet(wb, detailSheet, '직원별 상세명세');
  XLSX.utils.book_append_sheet(wb, attendanceSheet, '근태기록');

  const dateStr = opts.generatedAt.toISOString().split('T')[0];
  const fileName = `급여대장_${opts.academyName || '학원'}_${dateStr}.xlsx`;

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
