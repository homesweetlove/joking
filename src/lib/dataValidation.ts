import { Employee, PayrollReport } from '../types';

/**
 * =============================================================================
 *  데이터 유효성 검증 / 스키마 버전 관리 / 백업 리마인더 유틸리티
 * =============================================================================
 *  이 앱은 서버 없이 전부 로컬(브라우저 localStorage + 사용자가 내보내는 .json
 *  백업 파일)로만 데이터를 관리합니다. 그래서 아래 3가지가 특히 중요합니다:
 *
 *   1) 다른 곳에서 만들었거나 손상된 파일을 불러올 때 "친절하고 구체적인" 에러 안내
 *   2) 나중에 데이터 구조가 바뀌어도 예전 백업 파일이 깨지지 않도록 스키마 버전 관리
 *   3) 브라우저 캐시 삭제로 데이터가 통째로 날아가는 사고를 막기 위한 백업 리마인더
 * =============================================================================
 */

export const CURRENT_REPORT_SCHEMA_VERSION = 1;
export const CURRENT_EMPLOYEE_BACKUP_SCHEMA_VERSION = 1;
export const CURRENT_FULL_BACKUP_SCHEMA_VERSION = 1;

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors: string[];
  warnings?: string[];
}

export interface SafeParseResult {
  ok: boolean;
  data?: any;
  error?: string;
}

// -----------------------------------------------------------------------------
//  1) JSON.parse를 감싸서 사용자에게 보여줄 친절한 에러 메시지로 변환
// -----------------------------------------------------------------------------
export function safeParseJSON(text: string): SafeParseResult {
  if (!text || text.trim().length === 0) {
    return { ok: false, error: '파일이 비어 있습니다. 올바른 백업(.json) 파일을 선택해주세요.' };
  }
  try {
    const data = JSON.parse(text);
    return { ok: true, data };
  } catch (err) {
    let hint = '선택하신 파일이 올바른 JSON 형식이 아닙니다.';
    const trimmed = text.trim();
    if (trimmed.startsWith('PK')) {
      hint = '선택하신 파일은 엑셀(.xlsx) 또는 zip 파일로 보입니다. 급여대장에서 내보낸 .json 백업 파일을 선택해주세요.';
    } else if (trimmed.startsWith('<')) {
      hint = '선택하신 파일은 HTML/XML 파일로 보입니다. 급여대장에서 내보낸 .json 백업 파일을 선택해주세요.';
    } else if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      hint = '선택하신 파일은 JSON 형식(중괄호 { 또는 대괄호 [ 로 시작)이 아닙니다. 파일이 손상되었거나 다른 종류의 파일일 수 있습니다.';
    }
    return { ok: false, error: `${hint}\n\n(상세: ${err instanceof Error ? err.message : String(err)})` };
  }
}

// -----------------------------------------------------------------------------
//  2) 조교(직원) 백업 검증 + 마이그레이션
// -----------------------------------------------------------------------------
function isPlainObject(v: any): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isValidEmployeeShape(item: any): boolean {
  return isPlainObject(item)
    && typeof item.id === 'string' && item.id.length > 0
    && typeof item.name === 'string' && item.name.length > 0;
}

export function validateEmployeeBackupPayload(raw: any): ValidationResult<Employee[]> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let employeesArray: any[] | null = null;

  if (Array.isArray(raw)) {
    employeesArray = raw;
    warnings.push('이전 버전 형식의 백업 파일입니다. 정상적으로 불러왔지만, 새로 내보내시면 최신 형식으로 저장됩니다.');
  } else if (isPlainObject(raw) && Array.isArray(raw.employees)) {
    employeesArray = raw.employees;
    if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > CURRENT_EMPLOYEE_BACKUP_SCHEMA_VERSION) {
      warnings.push(`이 백업 파일은 더 최신 버전의 앱에서 만들어졌습니다(v${raw.schemaVersion}). 일부 항목이 반영되지 않을 수 있습니다.`);
    }
  } else {
    errors.push('올바른 조교 백업 파일 형식이 아닙니다. (조교 목록 배열이거나, employees 필드를 포함한 백업 파일이어야 합니다.)');
    return { valid: false, errors, warnings };
  }

  if (employeesArray.length === 0) {
    errors.push('백업 파일 안에 조교 데이터가 하나도 없습니다.');
    return { valid: false, errors, warnings };
  }

  const invalidIndexes: number[] = [];
  employeesArray.forEach((item, i) => {
    if (!isValidEmployeeShape(item)) invalidIndexes.push(i + 1);
  });

  if (invalidIndexes.length > 0) {
    errors.push(`${invalidIndexes.length}개 항목이 조교 데이터 형식(id, name 필수)을 만족하지 않습니다. (${invalidIndexes.slice(0, 5).join(', ')}번째${invalidIndexes.length > 5 ? ' 외 다수' : ''})`);
    return { valid: false, errors, warnings };
  }

  return { valid: true, data: employeesArray as Employee[], errors: [], warnings };
}

export function wrapEmployeeBackupForExport(employees: Employee[]) {
  return {
    schemaVersion: CURRENT_EMPLOYEE_BACKUP_SCHEMA_VERSION,
    type: 'employee_backup' as const,
    exportedAt: new Date().toISOString(),
    employees,
  };
}

// -----------------------------------------------------------------------------
//  3) 급여대장 리포트(PayrollReport) 검증 + 마이그레이션
// -----------------------------------------------------------------------------
export function validatePayrollReportPayload(raw: any): ValidationResult<PayrollReport> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isPlainObject(raw)) {
    errors.push('올바른 급여대장 결과 패키지 형식이 아닙니다. (JSON 객체가 아닙니다)');
    return { valid: false, errors, warnings };
  }

  if (typeof raw.id !== 'string' || raw.id.length === 0) errors.push('필수 항목 누락: id (리포트 고유번호)');
  if (typeof raw.academyName !== 'string') errors.push('필수 항목 누락: academyName (학원명)');
  if (typeof raw.createdAt !== 'string') errors.push('필수 항목 누락: createdAt (생성일시)');
  if (!Array.isArray(raw.employees)) errors.push('필수 항목 누락: employees (조교 목록)');
  if (!Array.isArray(raw.calculated)) errors.push('필수 항목 누락: calculated (계산된 급여 데이터)');
  if (!Array.isArray(raw.attendance)) warnings.push('근태 원본(attendance) 데이터가 없습니다. 근태기록 시트 없이 급여 결과만 확인할 수 있습니다.');

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  if (Array.isArray(raw.calculated)) {
    const badRows = raw.calculated.filter((c: any) => !isPlainObject(c) || typeof c.employeeId !== 'string' || typeof c.netSalary !== 'number');
    if (badRows.length > 0) {
      errors.push(`계산된 급여 데이터 중 ${badRows.length}건의 형식이 올바르지 않습니다.`);
      return { valid: false, errors, warnings };
    }
  }

  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > CURRENT_REPORT_SCHEMA_VERSION) {
    warnings.push(`이 리포트는 더 최신 버전의 앱에서 만들어졌습니다(v${raw.schemaVersion}). 일부 항목이 반영되지 않을 수 있습니다.`);
  } else if (typeof raw.schemaVersion !== 'number') {
    warnings.push('이전 버전 형식의 리포트 파일입니다. 정상적으로 불러왔습니다.');
  }

  const migrated: PayrollReport = {
    id: raw.id,
    createdAt: raw.createdAt,
    academyName: raw.academyName,
    schemaVersion: CURRENT_REPORT_SCHEMA_VERSION,
    exportedAt: raw.exportedAt,
    employees: raw.employees,
    attendance: Array.isArray(raw.attendance) ? raw.attendance : [],
    weeklyHolidayStatus: isPlainObject(raw.weeklyHolidayStatus) ? raw.weeklyHolidayStatus : {},
    nightWorkStatus: isPlainObject(raw.nightWorkStatus) ? raw.nightWorkStatus : {},
    proRataDays: isPlainObject(raw.proRataDays) ? raw.proRataDays : {},
    graceMinutes: typeof raw.graceMinutes === 'number' ? raw.graceMinutes : 0,
    calculated: raw.calculated,
  };

  return { valid: true, data: migrated, errors: [], warnings };
}

export function stampReportForExport(report: PayrollReport): PayrollReport {
  return {
    ...report,
    schemaVersion: CURRENT_REPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
  };
}

// -----------------------------------------------------------------------------
//  4) 전체 백업(조교 + 전체 리포트 이력)
// -----------------------------------------------------------------------------
export interface FullBackupPayload {
  schemaVersion: number;
  type: 'full_backup';
  exportedAt: string;
  employees: Employee[];
  reports: PayrollReport[];
}

export function wrapFullBackupForExport(employees: Employee[], reports: PayrollReport[]): FullBackupPayload {
  return {
    schemaVersion: CURRENT_FULL_BACKUP_SCHEMA_VERSION,
    type: 'full_backup',
    exportedAt: new Date().toISOString(),
    employees,
    reports: reports.map(stampReportForExport),
  };
}

export function validateFullBackupPayload(raw: any): ValidationResult<{ employees: Employee[]; reports: PayrollReport[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isPlainObject(raw) || raw.type !== 'full_backup') {
    errors.push('전체 백업 파일 형식이 아닙니다. ("전체 백업하기"로 내보낸 .json 파일이어야 합니다.)');
    return { valid: false, errors, warnings };
  }
  if (!Array.isArray(raw.employees)) errors.push('필수 항목 누락: employees (조교 목록)');
  if (!Array.isArray(raw.reports)) errors.push('필수 항목 누락: reports (급여대장 이력)');
  if (errors.length > 0) return { valid: false, errors, warnings };

  const empCheck = validateEmployeeBackupPayload(raw.employees);
  if (!empCheck.valid) {
    errors.push(...empCheck.errors.map(e => `[조교 목록] ${e}`));
  }

  const reportResults = (raw.reports as any[]).map((r, i) => ({ i, res: validatePayrollReportPayload(r) }));
  const badReports = reportResults.filter(r => !r.res.valid);
  if (badReports.length > 0) {
    errors.push(`리포트 이력 중 ${badReports.length}건을 불러올 수 없습니다. (${badReports.slice(0, 3).map(b => `${b.i + 1}번째`).join(', ')}${badReports.length > 3 ? ' 외 다수' : ''})`);
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  return {
    valid: true,
    errors: [],
    warnings,
    data: {
      employees: empCheck.data as Employee[],
      reports: reportResults.map(r => r.res.data as PayrollReport),
    },
  };
}

// -----------------------------------------------------------------------------
//  5) 백업 리마인더 (localStorage에 마지막 백업 시각 기록)
// -----------------------------------------------------------------------------
const LAST_BACKUP_KEY = 'payroll_last_backup_at';
export const BACKUP_REMINDER_THRESHOLD_DAYS = 14;

export function markBackupDone() {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  } catch {
    // localStorage 접근 불가 환경에서는 조용히 무시
  }
}

export function getLastBackupAt(): Date | null {
  try {
    const v = localStorage.getItem(LAST_BACKUP_KEY);
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function getDaysSinceLastBackup(): number | null {
  const last = getLastBackupAt();
  if (!last) return null;
  const diffMs = Date.now() - last.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function shouldShowBackupReminder(hasAnyData: boolean): boolean {
  if (!hasAnyData) return false;
  const days = getDaysSinceLastBackup();
  if (days === null) return true;
  return days >= BACKUP_REMINDER_THRESHOLD_DAYS;
}
