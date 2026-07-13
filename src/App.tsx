/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Main from './views/Main';
import EmployeeManagement from './views/EmployeeManagement';
import PayrollCreation from './views/PayrollCreation';
import { Employee, PayrollReport } from './types';

type View = 'MAIN' | 'EMPLOYEES' | 'PAYROLL';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('MAIN');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reports, setReports] = useState<PayrollReport[]>([]);
  const [editingReport, setEditingReport] = useState<PayrollReport | null>(null);

  // Load employees & reports from localStorage on mount
  useEffect(() => {
    const savedEmp = localStorage.getItem('payroll_employees');
    if (savedEmp) {
      try {
        setEmployees(JSON.parse(savedEmp));
      } catch (e) {
        console.error('Failed to parse employees', e);
      }
    }

    const savedReports = localStorage.getItem('payroll_reports');
    if (savedReports) {
      try {
        setReports(JSON.parse(savedReports));
      } catch (e) {
        console.error('Failed to parse reports', e);
      }
    }
  }, []);

  // Save employees to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('payroll_employees', JSON.stringify(employees));
  }, [employees]);

  // Save reports to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('payroll_reports', JSON.stringify(reports));
  }, [reports]);

  const addEmployee = (emp: Employee) => {
    setEmployees(prev => [...prev, emp]);
  };

  const updateEmployee = (updated: Employee) => {
    setEmployees(prev => prev.map(e => e.id === updated.id ? updated : e));
  };

  const deleteEmployee = (id: string) => {
    setEmployees(prev => prev.filter(e => e.id !== id));
  };

  const handleImportEmployees = (imported: Employee[]) => {
    setEmployees(imported);
  };

  const handleSaveReport = (newReport: PayrollReport) => {
    setReports(prev => [newReport, ...prev]);
  };

  const handleDeleteReport = (reportId: string) => {
    setReports(prev => prev.filter(r => r.id !== reportId));
  };

  return (
    <div className="min-h-screen font-sans">
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
              setReports(prev => prev.map(r => r.id === editingReport.id ? report : r));
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
