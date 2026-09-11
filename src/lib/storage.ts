import { Employee, PayrollReport } from '../types';
import {
  validateEmployeeBackupPayload,
  validatePayrollReportPayload,
} from './dataValidation';

const STORAGE_SCHEMA_VERSION = 1;

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
  migratedLegacyData: boolean;
}

export interface StorageWriteResult {
  ok: boolean;
  error?: string;
}

type Validation<T> = (value: unknown) => { valid: boolean; data?: T; error?: string };

function parseJSON(raw: string): unknown {
  return JSON.parse(raw);
}

function validateEmployees(value: unknown): { valid: boolean; data?: Employee[]; error?: string } {
  if (!Array.isArray(value)) {
    return { valid: false, error: '직원 데이터가 배열 형식이 아닙니다.' };
  }

  // 빈 직원 목록은 정상 상태입니다. 백업 파일 검증 함수는 빈 백업을 오류로 보므로 별도 처리합니다.
  if (value.length === 0) {
    return { valid: true, data: [] };
  }

  const result = validateEmployeeBackupPayload(value);
  if (!result.valid || !result.data) {
    return {
      valid: false,
      error: result.errors.join(' / ') || '직원 데이터 형식이 올바르지 않습니다.',
    };
  }

  return { valid: true, data: result.data };
}

function validateReports(value: unknown): { valid: boolean; data?: PayrollReport[]; error?: string } {
  if (!Array.isArray(value)) {
    return { valid: false, error: '급여대장 이력이 배열 형식이 아닙니다.' };
  }

  const reports: PayrollReport[] = [];
  const errors: string[] = [];

  value.forEach((item, index) => {
    const result = validatePayrollReportPayload(item);
    if (result.valid && result.data) {
      reports.push(result.data);
    } else {
      errors.push(`${index + 1}번째 급여대장: ${result.errors.join(' / ')}`);
    }
  });

  if (errors.length > 0) {
    return {
      valid: false,
      error: `${errors.length}개의 급여대장 데이터가 손상되었거나 형식이 맞지 않습니다. ${errors.slice(0, 2).join(' | ')}`,
    };
  }

  return { valid: true, data: reports };
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

function readEnvelope<T>(
  storage: Storage,
  key: string,
  expectedType: StorageEnvelope<T>['type'],
  validate: Validation<T>,
): { data?: T; warning?: string; recoveredFromBackup?: boolean } {
  const tryRead = (targetKey: string): { data?: T; error?: string } => {
    const raw = storage.getItem(targetKey);
    if (!raw) return {};

    try {
      const parsed = parseJSON(raw) as Partial<StorageEnvelope<unknown>>;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        parsed.type !== expectedType ||
        typeof parsed.schemaVersion !== 'number' ||
        !('data' in parsed)
      ) {
        return { error: '저장 데이터 포맷이 올바르지 않습니다.' };
      }

      const validated = validate(parsed.data);
      if (!validated.valid || validated.data === undefined) {
        return { error: validated.error || '저장 데이터 검증에 실패했습니다.' };
      }

      return { data: validated.data };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : '저장 데이터를 읽는 중 알 수 없는 오류가 발생했습니다.',
      };
    }
  };

  const primary = tryRead(key);
  if (primary.data !== undefined) {
    return { data: primary.data };
  }

  const backup = tryRead(`${key}:bak`);
  if (backup.data !== undefined) {
    return {
      data: backup.data,
      recoveredFromBackup: true,
      warning: `${expectedType === 'employees' ? '직원 목록' : '급여대장 이력'}의 최신 저장본을 읽지 못해 마지막 정상 백업본으로 복구했습니다.`,
    };
  }

  if (primary.error) {
    return {
      warning: `${expectedType === 'employees' ? '직원 목록' : '급여대장 이력'} 저장 데이터를 읽지 못했습니다: ${primary.error}`,
    };
  }

  return {};
}

function readLegacy<T>(
  storage: Storage,
  key: string,
  validate: Validation<T>,
): { data?: T; warning?: string } {
  const raw = storage.getItem(key);
  if (!raw) return {};

  try {
    const parsed = parseJSON(raw);
    const validated = validate(parsed);
    if (!validated.valid || validated.data === undefined) {
      return { warning: validated.error || '기존 저장 데이터 검증에 실패했습니다.' };
    }
    return { data: validated.data };
  } catch (error) {
    return {
      warning: error instanceof Error ? error.message : '기존 저장 데이터를 읽지 못했습니다.',
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
      error: '브라우저 저장소에 접근할 수 없습니다. 시크릿 모드/브라우저 설정 또는 저장 공간을 확인해주세요.',
    };
  }

  const envelope: StorageEnvelope<T> = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    type,
    updatedAt: new Date().toISOString(),
    data,
  };

  try {
    const current = storage.getItem(key);
    if (current) {
      // 새 값을 쓰기 전에 직전 정상본을 별도 키에 남겨 둡니다.
      storage.setItem(`${key}:bak`, current);
    }
    storage.setItem(key, JSON.stringify(envelope));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error
        ? `브라우저 저장에 실패했습니다: ${error.message}`
        : '브라우저 저장에 실패했습니다.',
    };
  }
}

export function loadPayrollState(): PayrollStorageState {
  const warnings: string[] = [];
  const storage = getStorage();

  if (!storage) {
    return {
      employees: [],
      reports: [],
      warnings: ['브라우저 저장소에 접근할 수 없어 데이터가 저장되지 않습니다.'],
      migratedLegacyData: false,
    };
  }

  let migratedLegacyData = false;

  const employeesCurrent = readEnvelope(storage, EMPLOYEES_KEY, 'employees', validateEmployees);
  if (employeesCurrent.warning) warnings.push(employeesCurrent.warning);

  let employees = employeesCurrent.data;
  if (employees === undefined) {
    const legacy = readLegacy(storage, LEGACY_EMPLOYEES_KEY, validateEmployees);
    if (legacy.warning) warnings.push(`기존 직원 데이터: ${legacy.warning}`);
    if (legacy.data !== undefined) {
      employees = legacy.data;
      migratedLegacyData = true;
      const saved = saveEmployees(employees);
      if (!saved.ok && saved.error) warnings.push(saved.error);
    }
  }

  const reportsCurrent = readEnvelope(storage, REPORTS_KEY, 'reports', validateReports);
  if (reportsCurrent.warning) warnings.push(reportsCurrent.warning);

  let reports = reportsCurrent.data;
  if (reports === undefined) {
    const legacy = readLegacy(storage, LEGACY_REPORTS_KEY, validateReports);
    if (legacy.warning) warnings.push(`기존 급여대장 데이터: ${legacy.warning}`);
    if (legacy.data !== undefined) {
      reports = legacy.data;
      migratedLegacyData = true;
      const saved = saveReports(reports);
      if (!saved.ok && saved.error) warnings.push(saved.error);
    }
  }

  return {
    employees: employees ?? [],
    reports: reports ?? [],
    warnings,
    migratedLegacyData,
  };
}

export function saveEmployees(employees: Employee[]): StorageWriteResult {
  const validation = validateEmployees(employees);
  if (!validation.valid || !validation.data) {
    return { ok: false, error: validation.error || '직원 데이터 검증에 실패했습니다.' };
  }
  return writeEnvelope(EMPLOYEES_KEY, 'employees', validation.data);
}

export function saveReports(reports: PayrollReport[]): StorageWriteResult {
  const validation = validateReports(reports);
  if (!validation.valid || !validation.data) {
    return { ok: false, error: validation.error || '급여대장 데이터 검증에 실패했습니다.' };
  }
  return writeEnvelope(REPORTS_KEY, 'reports', validation.data);
}
