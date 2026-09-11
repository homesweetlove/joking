/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  Database,
  LayoutDashboard,
  ShieldCheck,
  Users,
  WalletCards,
} from 'lucide-react';
import Main from './views/Main';
import EmployeeManagement from './views/EmployeeManagement';
import PayrollCreation from './views/PayrollCreation';
import { Employee, PayrollReport } from './types';
import { loadPayrollState, saveEmployees, saveReports } from './lib/storage';

type View = 'MAIN' | 'EMPLOYEES' | 'PAYROLL';

const formatWon = (value: number) => `${Math.round(value || 0).toLocaleString('ko-KR')}원`;

export default function App() {
  const [currentView, setCurrentView] = useState<View>('MAIN');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reports, setReports] = useState<PayrollReport[]>([]);
  const [editingReport, setEditingReport] = useState<PayrollReport | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [storageWarnings, setStorageWarnings] = useState<string[]>([]);

  const addStorageWarning = (message: string) => {
    setStorageWarnings((prev) => (prev.includes(message) ? prev : [...prev, message]));
  };

  useEffect(() => {
    const restored = loadPayrollState();
    setEmployees(restored.employees);
    setReports(restored.reports);
    setStorageWarnings(restored.warnings);
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const result = saveEmployees(employees);
    if (!result.ok && result.error) addStorageWarning(result.error);
  }, [employees, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    const result = saveReports(reports);
    if (!result.ok && result.error) addStorageWarning(result.error);
  }, [reports, storageReady]);

  const latestReport = reports[0] ?? null;
  const latestNet = useMemo(
    () => latestReport?.calculated?.reduce((sum, item) => sum + (item.netSalary || 0), 0) ?? 0,
    [latestReport],
  );

  const addEmployee = (emp: Employee) => setEmployees((prev) => [...prev, emp]);
  const updateEmployee = (updated: Employee) => {
    setEmployees((prev) => prev.map((employee) => (employee.id === updated.id ? updated : employee)));
  };
  const deleteEmployee = (id: string) => {
    setEmployees((prev) => prev.filter((employee) => employee.id !== id));
  };
  const handleImportEmployees = (imported: Employee[]) => setEmployees(imported);
  const handleSaveReport = (newReport: PayrollReport) => setReports((prev) => [newReport, ...prev]);
  const handleDeleteReport = (reportId: string) => {
    setReports((prev) => prev.filter((report) => report.id !== reportId));
  };

  const navigate = (view: View) => {
    if (view !== 'PAYROLL') setEditingReport(null);
    if (view === 'PAYROLL') setEditingReport(null);
    setCurrentView(view);
  };

  return (
    <div className="payroll-app min-h-screen font-sans">
      <header className="payroll-topbar">
        <div className="payroll-topbar-inner">
          <button type="button" className="payroll-brand" onClick={() => navigate('MAIN')}>
            <span className="payroll-brand-mark"><WalletCards size={18} /></span>
            <span>
              <strong>PAYROLL DESK</strong>
              <small>조교 급여 운영</small>
            </span>
          </button>

          <nav className="payroll-nav" aria-label="주요 메뉴">
            <button type="button" className={currentView === 'MAIN' ? 'is-active' : ''} onClick={() => navigate('MAIN')}>
              <LayoutDashboard size={16} />
              <span>대시보드</span>
            </button>
            <button type="button" className={currentView === 'EMPLOYEES' ? 'is-active' : ''} onClick={() => navigate('EMPLOYEES')}>
              <Users size={16} />
              <span>조교 관리</span>
            </button>
            <button type="button" className={currentView === 'PAYROLL' ? 'is-active' : ''} onClick={() => navigate('PAYROLL')}>
              <Calculator size={16} />
              <span>급여 정산</span>
            </button>
          </nav>

          <div className="payroll-storage-state" title="데이터는 현재 브라우저에 저장됩니다.">
            <ShieldCheck size={15} />
            <span>로컬 저장 보호</span>
          </div>
        </div>
      </header>

      {storageWarnings.length > 0 && (
        <div role="alert" className="payroll-storage-warning">
          <div>
            <strong>저장된 데이터 일부를 확인해주세요.</strong>
            <ul>
              {storageWarnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={() => setStorageWarnings([])}>확인</button>
        </div>
      )}

      <main className="payroll-stage">
        {currentView === 'MAIN' && (
          <section className="payroll-overview" aria-label="급여 운영 현황">
            <div className="payroll-overview-copy">
              <span className="payroll-eyebrow">ACADEMY PAYROLL OPERATIONS</span>
              <h1>급여 업무를 빠르고<br />확실하게 정리하세요.</h1>
              <p>직원 정보부터 월별 정산, 감사 기록과 백업까지 한 흐름으로 관리합니다.</p>
            </div>

            <div className="payroll-metrics">
              <article>
                <span className="metric-icon"><Users size={18} /></span>
                <small>등록 조교</small>
                <strong>{employees.length}<em>명</em></strong>
              </article>
              <article>
                <span className="metric-icon"><Database size={18} /></span>
                <small>정산 기록</small>
                <strong>{reports.length}<em>건</em></strong>
              </article>
              <article className="metric-wide">
                <span className="metric-icon"><WalletCards size={18} /></span>
                <small>최근 실지급 합계</small>
                <strong>{latestReport ? formatWon(latestNet) : '정산 전'}</strong>
                <span className="metric-caption">{latestReport?.academyName ?? '급여대장을 생성하면 여기에 표시됩니다.'}</span>
              </article>
            </div>
          </section>
        )}

        {currentView === 'MAIN' && (
          <Main
            onCreatePayroll={() => setCurrentView('PAYROLL')}
            onManageEmployees={() => setCurrentView('EMPLOYEES')}
            employees={employees}
            onImportEmployees={handleImportEmployees}
            reports={reports}
            onImportReport={handleSaveReport}
            onDeleteReport={handleDeleteReport}
            onEditReport={(report) => {
              setEditingReport(report);
              setCurrentView('PAYROLL');
            }}
          />
        )}

        {currentView === 'EMPLOYEES' && (
          <EmployeeManagement
            employees={employees}
            onAddEmployee={addEmployee}
            onUpdateEmployee={updateEmployee}
            onDeleteEmployee={deleteEmployee}
            onBack={() => setCurrentView('MAIN')}
            onImportEmployees={handleImportEmployees}
          />
        )}

        {currentView === 'PAYROLL' && (
          <PayrollCreation
            employees={editingReport ? editingReport.employees : employees}
            reports={reports}
            onBack={() => {
              setEditingReport(null);
              setCurrentView('MAIN');
            }}
            onSaveReport={(report) => {
              if (editingReport) {
                setReports((prev) => prev.map((item) => (item.id === editingReport.id ? report : item)));
                setEditingReport(null);
              } else {
                handleSaveReport(report);
              }
            }}
            editReport={editingReport || undefined}
          />
        )}
      </main>

      <footer className="payroll-footer">
        <span>PAYROLL DESK</span>
        <span>Local-first payroll workspace</span>
      </footer>
    </div>
  );
}
