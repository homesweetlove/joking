import { Employee, PayrollReport } from '../types';
import {
  validateEmployeeBackupPayload,
  validatePayrollReportPayload,
} from './dataValidation';

const STORAGE_SCHEMA_VERSION = 2;

const EMPLOYEES_KEY = 'payroll_employees_v2';
const REPORTS_KEY = 'payroll_reports_v2';
const LEGACY_EMPLOYEES_KEY = 'payroll_employees';
const LEGACY_REPORTS_KEY = 'payroll_reports';

interface StorageEnvelope<T> {
  schemaVersion: number;
  type: 'employees' | 'reports';
  updatedAt: string;
  data: T;
}

export interface PayrollStorageState {
  employees: Employee[];
  reports: PayrollReport[];
  warnings: string[];
}

export interface StorageWriteResult {
  ok: boolean;
  error?: string;
}

interface ValidationResult<T> {
  data: T;
  warnings: string[];
}

function getStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    const probeKey = '__payroll_storage_probe__';
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return null;
  }
}

function validateEmployees(value: unknown): ValidationResult<Employee[]> | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return { data: [], warnings: [] };

  const result = validateEmployeeBackupPayload(value);
  if (!result.valid || !result.data) return null;

  return {
    data: result.data,
    warnings: result.warnings ?? [],
  };
}

function validateReports(value: unknown): ValidationResult<PayrollReport[]> | null {
  if (!Array.isArray(value)) return null;

  const reports: PayrollReport[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  value.forEach((item, index) => {
    const result = validatePayrollReportPayload(item);
    if (result.valid && result.data) {
      reports.push(result.data);
      if (result.warnings?.length) {
        warnings.push(...result.warnings.map((warning) => `${index + 1}번째 급여대장: ${warning}`));
      }
    } else {
      skipped += 1;
    }
  });

  if (skipped > 0) {
    warnings.push(
      `저장된 급여대장 ${skipped}건이 현재 데이터 형식과 맞지 않아 화면에서 제외했습니다. 기존 localStorage 원본은 삭제하지 않았습니다.`,
    );
  }

  return { data: reports, warnings };
}

function parseEnvelope<T>(
  raw: string,
  expectedType: StorageEnvelope<T>['type'],
  validate: (value: unknown) => ValidationResult<T> | null,
): { result?: ValidationResult<T>; warning?: string } {
  try {
    const parsed = JSON.parse(raw) as Partial<StorageEnvelope<unknown>>;

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.type !== expectedType ||
      typeof parsed.schemaVersion !== 'number' ||
      !('data' in parsed)
    ) {
      return { warning: '저장 데이터 포맷이 올바르지 않습니다.' };
    }

    const validated = validate(parsed.data);
    if (!validated) {
      return { warning: '저장 데이터 검증에 실패했습니다.' };
    }

    const warnings = [...validated.warnings];
    if (parsed.schemaVersion > STORAGE_SCHEMA_VERSION) {
      warnings.push('더 최신 버전의 앱에서 저장된 데이터입니다. 일부 항목이 표시되지 않을 수 있습니다.');
    }

    return {
      result: {
        data: validated.data,
        warnings,
      },
    };
  } catch (error) {
    return {
      warning: error instanceof Error ? error.message : '저장 데이터를 읽는 중 오류가 발생했습니다.',
    };
  }
}

function parseLegacy<T>(
  raw: string,
  validate: (value: unknown) => ValidationResult<T> | null,
): { result?: ValidationResult<T>; warning?: string } {
  try {
    const parsed = JSON.parse(raw);
    const validated = validate(parsed);
    if (!validated) return { warning: '기존 저장 데이터 검증에 실패했습니다.' };
    return { result: validated };
  } catch (error) {
    return {
      warning: error instanceof Error ? error.message : '기존 저장 데이터를 읽는 중 오류가 발생했습니다.',
    };
  }
}

function writeEnvelope<T>(
  key: string,
  type: StorageEnvelope<T>['type'],
  data: T,
): StorageWriteResult {
  const storage = getStorage();
  if (!storage) {
    return {
      ok: false,
      error: '브라우저 저장소에 접근할 수 없습니다. 시크릿 모드나 브라우저 저장 설정을 확인해주세요.',
    };
  }

  const envelope: StorageEnvelope<T> = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    type,
    updatedAt: new Date().toISOString(),
    data,
  };

  try {
    const serialized = JSON.stringify(envelope);
    storage.setItem(key, serialized);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const quotaHint = /quota|storage|exceed/i.test(message)
      ? ' 브라우저 저장 용량이 부족할 수 있습니다. 오래된 급여대장을 JSON으로 백업한 뒤 정리해주세요.'
      : '';

    return {
      ok: false,
      error: `데이터 저장에 실패했습니다.${quotaHint} (${message})`,
    };
  }
}

export function loadPayrollState(): PayrollStorageState {
  const storage = getStorage();
  const warnings: string[] = [];

  if (!storage) {
    return {
      employees: [],
      reports: [],
      warnings: ['브라우저 저장소에 접근할 수 없어 데이터가 저장되지 않습니다.'],
    };
  }

  let employees: Employee[] = [];
  let reports: PayrollReport[] = [];

  const currentEmployeesRaw = storage.getItem(EMPLOYEES_KEY);
  if (currentEmployeesRaw) {
    const parsed = parseEnvelope(currentEmployeesRaw, 'employees', validateEmployees);
    if (parsed.result) {
      employees = parsed.result.data;
      warnings.push(...parsed.result.warnings);
    } else if (parsed.warning) {
      warnings.push(`직원 데이터: ${parsed.warning}`);
    }
  } else {
    const legacyRaw = storage.getItem(LEGACY_EMPLOYEES_KEY);
    if (legacyRaw) {
      const parsed = parseLegacy(legacyRaw, validateEmployees);
      if (parsed.result) {
        employees = parsed.result.data;
        warnings.push(...parsed.result.warnings);
        const saved = saveEmployees(employees);
        if (!saved.ok && saved.error) warnings.push(saved.error);
      } else if (parsed.warning) {
        warnings.push(`기존 직원 데이터: ${parsed.warning}`);
      }
    }
  }

  const currentReportsRaw = storage.getItem(REPORTS_KEY);
  if (currentReportsRaw) {
    const parsed = parseEnvelope(currentReportsRaw, 'reports', validateReports);
    if (parsed.result) {
      reports = parsed.result.data;
      warnings.push(...parsed.result.warnings);
    } else if (parsed.warning) {
      warnings.push(`급여대장 데이터: ${parsed.warning}`);
    }
  } else {
    const legacyRaw = storage.getItem(LEGACY_REPORTS_KEY);
    if (legacyRaw) {
      const parsed = parseLegacy(legacyRaw, validateReports);
      if (parsed.result) {
        reports = parsed.result.data;
        warnings.push(...parsed.result.warnings);
        const saved = saveReports(reports);
        if (!saved.ok && saved.error) warnings.push(saved.error);
      } else if (parsed.warning) {
        warnings.push(`기존 급여대장 데이터: ${parsed.warning}`);
      }
    }
  }

  return { employees, reports, warnings };
}

export function saveEmployees(employees: Employee[]): StorageWriteResult {
  const validated = validateEmployees(employees);
  if (!validated) {
    return { ok: false, error: '직원 데이터 형식이 올바르지 않아 저장하지 않았습니다.' };
  }
  return writeEnvelope(EMPLOYEES_KEY, 'employees', validated.data);
}

export function saveReports(reports: PayrollReport[]): StorageWriteResult {
  const validated = validateReports(reports);
  if (!validated) {
    return { ok: false, error: '급여대장 데이터 형식이 올바르지 않아 저장하지 않았습니다.' };
  }
  return writeEnvelope(REPORTS_KEY, 'reports', validated.data);
}
