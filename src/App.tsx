/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import Main from './views/Main';
import EmployeeManagement from './views/EmployeeManagement';
import PayrollCreation from './views/PayrollCreation';
import { Employee, PayrollReport } from './types';
import { loadPayrollState, saveEmployees, saveReports } from './lib/storage';

type View = 'MAIN' | 'EMPLOYEES' | 'PAYROLL';

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

  const addEmployee = (emp: Employee) => {
    setEmployees((prev) => [...prev, emp]);
  };

  const updateEmployee = (updated: Employee) => {
    setEmployees((prev) => prev.map((employee) => (employee.id === updated.id ? updated : employee)));
  };

  const deleteEmployee = (id: string) => {
    setEmployees((prev) => prev.filter((employee) => employee.id !== id));
  };

  const handleImportEmployees = (imported: Employee[]) => {
    setEmployees(imported);
  };

  const handleSaveReport = (newReport: PayrollReport) => {
    setReports((prev) => [newReport, ...prev]);
  };

  const handleDeleteReport = (reportId: string) => {
    setReports((prev) => prev.filter((report) => report.id !== reportId));
  };

  return (
    <div className="min-h-screen font-sans">
      {storageWarnings.length > 0 && (
        <div
          role="alert"
          className="sticky top-0 z-[100] border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm"
        >
          <div className="mx-auto flex max-w-7xl items-start justify-between gap-4">
            <div>
              <p className="font-semibold">저장된 데이터 일부를 확인해주세요.</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {storageWarnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setStorageWarnings([])}
              className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-amber-100"
            >
              확인
            </button>
          </div>
        </div>
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
    </div>
  );
}
