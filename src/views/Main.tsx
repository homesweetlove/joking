import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Users, Calculator, Settings, ChevronRight, Upload, Download, Database, Check, FileText, Trash2, Calendar, Clock, Coffee, AlertCircle, X, Search, Printer, Building2, FileSpreadsheet, Copy } from 'lucide-react';
import { parse, differenceInMinutes } from 'date-fns';
import { cn, formatCurrency } from '../lib/utils';
import { Employee, PayrollReport } from '../types';
import WageStatementSheet from '../components/WageStatementSheet';
import {
  safeParseJSON,
  validatePayrollReportPayload,
  validateFullBackupPayload,
  wrapFullBackupForExport,
  markBackupDone,
  shouldShowBackupReminder,
  getDaysSinceLastBackup,
} from '../lib/dataValidation';

interface MainProps {
  onCreatePayroll: () => void;
  onManageEmployees: () => void;
  employees: Employee[];
  onImportEmployees: (employees: Employee[]) => void;
  reports: PayrollReport[];
  onImportReport: (report: PayrollReport) => void;
  onDeleteReport: (reportId: string) => void;
  onEditReport: (report: PayrollReport) => void;
}

export default function Main({ onCreatePayroll, onManageEmployees, employees, onImportEmployees, reports, onImportReport, onDeleteReport, onEditReport }: MainProps) {
  const reportFileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [viewingReport, setViewingReport] = useState<PayrollReport | null>(null);

  // Consolidated Audit Dashboard Integration States
  const [selectedAcademy, setSelectedAcademy] = useState<string>('');
  const [filterYear, setFilterYear] = useState<number | 'all'>(2026);
  const [filterMonth, setFilterMonth] = useState<number | 'all'>(6);
  const [activeAuditEmployeeId, setActiveAuditEmployeeId] = useState<string | null>(null);

  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditTaxFilter, setAuditTaxFilter] = useState<'all' | 'FREELANCER' | 'FOUR_MAJOR'>('all');

  const [showPayslipEmpId, setShowPayslipEmpId] = useState<string | null>(null);
  const [taxDelegationEmpId, setTaxDelegationEmpId] = useState<string | null>(null);
  const [taxDelegationYear, setTaxDelegationYear] = useState('2026');
  const [taxDelegationAddress, setTaxDelegationAddress] = useState('서울특별시 마포구 백범로 31');
  const [taxDelegationPhone, setTaxDelegationPhone] = useState('010-4567-8901');
  const [showBulkStatements, setShowBulkStatements] = useState<boolean>(false);

  const [selectedPayslipCalc, setSelectedPayslipCalc] = useState<{ employee: Employee; calculated: any; academyName: string } | null>(null);
  const [selectedBulkCalcs, setSelectedBulkCalcs] = useState<{ statements: { employee: Employee; calculated: any }[]; academyName: string } | null>(null);

  const [copiedTransfer, setCopiedTransfer] = useState(false);
  const [auditViewMode, setAuditViewMode] = useState<'individual' | 'analytics'>('individual');
  const [academyRevenue, setAcademyRevenue] = useState<number>(30000000);

  const handleExportReportExcel = (report: PayrollReport | null) => {
    if (!report) return;

    const formatCSVAmount = (val: number) => {
      const rounded = Math.round(val || 0);
      return `"${rounded.toLocaleString('ko-KR')}"`;
    };

    const headers = [
      "조교명", "직급", "근무시간(h)", "기본수당(원)", "주휴수당(원)", 
      "연장가산수당(원)", "야간가산수당(원)",
      "직책수당(원)", "자격수당(원)", "업무추진비(원)", "출납수당(원)", 
      "식대(비과세)(원)", "기타수당(원)", "수기누락금(원)", "세전 총수령액(원)", 
      "정산 세무방식", "원천세율/보험료공제(%)", "국민연금(원)", "건강보험(원)", 
      "장기요양(원)", "고용보험(원)", "공제 합계액(원)", "실수령액(원)",
      "은행명", "계좌번호"
    ].join(",");

    const csvRows = [headers];

    report.calculated.forEach((item: any) => {
      const name = item.name || "";
      const pos = item.position || "";
      const hours = item.weeklyHours || 0;
      const baseSalary = item.baseSalary || 0;
      const holidayAllowance = item.holidayAllowance || 0;
      const overtimeAllow = item.overtimeAllowance || 0;
      const nightAllow = item.nightAllowance || 0;
      
      const itemized = item.itemizedAllowances || {};
      const posAllowance = itemized.position || 0;
      const qualAllowance = itemized.qualification || 0;
      const bizAllowance = itemized.businessPromotion || 0;
      const cashAllowance = itemized.cashier || 0;
      const mealAllowance = itemized.meal || 0;
      const otherAllowance = itemized.other || 0;
      const omitted = itemized.omitted || 0;
      
      const gross = item.totalGross || 0;
      
      let taxTypeStr = "3.3% 프리랜서";
      let taxRateStr = "3.3%";
      if (item.taxType === "FOUR_MAJOR") {
        taxTypeStr = "4대보험 공제";
        taxRateStr = "실시간 사회보험요율";
      } else if (item.taxType === "CUSTOM") {
        taxTypeStr = "커스텀";
        taxRateStr = `${item.customTaxRate || 0}%`;
      }

      const np = item.deductions?.['국민연금 (4.5%)'] || 0;
      const hi = item.deductions?.['건강보험 (3.545%)'] || 0;
      const ltc = item.deductions?.['장기요양보험'] || 0;
      const ei = item.deductions?.['고용보험 (0.9%)'] || 0;
      
      const totalDeduction = item.totalDeduction || 0;
      const netSalary = item.netSalary || 0;

      // 찾아내는 직원 계좌 정보
      const matchEmp = report.employees.find((e: any) => e.id === item.employeeId);
      const bName = matchEmp?.bankName || "";
      const bAcc = matchEmp?.bankAccount || "";

      const row = [
        `"${name}"`,
        `"${pos}"`,
        `"${hours.toFixed(1)}"`,
        formatCSVAmount(baseSalary),
        formatCSVAmount(holidayAllowance),
        formatCSVAmount(overtimeAllow),
        formatCSVAmount(nightAllow),
        formatCSVAmount(posAllowance),
        formatCSVAmount(qualAllowance),
        formatCSVAmount(bizAllowance),
        formatCSVAmount(cashAllowance),
        formatCSVAmount(mealAllowance),
        formatCSVAmount(otherAllowance),
        formatCSVAmount(omitted),
        formatCSVAmount(gross),
        `"${taxTypeStr}"`,
        `"${taxRateStr}"`,
        formatCSVAmount(np),
        formatCSVAmount(hi),
        formatCSVAmount(ltc),
        formatCSVAmount(ei),
        formatCSVAmount(totalDeduction),
        formatCSVAmount(netSalary),
        `"${bName}"`,
        `"${bAcc}"`
      ];

      csvRows.push(row.join(","));
    });

    const csvContent = "\uFEFF" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `급여정산감사대장_엑셀_${report.academyName || '학원'}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Sync state whenever a report is clicked for 상세 감사
  useEffect(() => {
    if (viewingReport) {
      setSelectedAcademy(viewingReport.academyName);
      const d = new Date(viewingReport.createdAt);
      setFilterYear(d.getFullYear());
      setFilterMonth(d.getMonth() + 1);
      
      if (viewingReport.calculated.length > 0) {
        setActiveAuditEmployeeId(viewingReport.calculated[0].employeeId);
      } else {
        setActiveAuditEmployeeId(null);
      }
    }
  }, [viewingReport]);

  const [bannerDismissed, setBannerDismissed] = useState(false);
  const fullBackupInputRef = useRef<HTMLInputElement>(null);

  const hasAnyData = employees.length > 0 || reports.length > 0;
  const daysSinceBackup = getDaysSinceLastBackup();
  const showBackupBanner = !bannerDismissed && shouldShowBackupReminder(hasAnyData);

  const handleFullBackupExport = () => {
    const payload = wrapFullBackupForExport(employees, reports);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `조교급여대장_전체백업_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    markBackupDone();
    setBannerDismissed(true);
    alert(`✅ 전체 백업이 완료되었습니다.\n\n조교 ${employees.length}명, 급여대장 리포트 ${reports.length}건이 저장되었습니다.\n이 파일을 안전한 곳(클라우드 드라이브, USB 등)에 보관해주세요.`);
  };

  const handleFullBackupImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const parseResult = safeParseJSON(evt.target?.result as string);
      if (!parseResult.ok) {
        alert(`❌ 파일을 열 수 없습니다\n\n${parseResult.error}`);
        return;
      }
      const validation = validateFullBackupPayload(parseResult.data);
      if (!validation.valid) {
        alert(`❌ 올바르지 않은 전체 백업 파일입니다\n\n${validation.errors.map(e => `· ${e}`).join('\n')}`);
        return;
      }

      const { employees: importedEmployees, reports: importedReports } = validation.data!;
      const existingIds = new Set(reports.map(r => r.id));
      const newReports = importedReports.filter(r => !existingIds.has(r.id));
      const skippedCount = importedReports.length - newReports.length;

      onImportEmployees(importedEmployees);
      newReports.forEach(r => onImportReport(r));

      let msg = `✅ 전체 백업 불러오기 완료\n\n· 조교 ${importedEmployees.length}명 (기존 목록을 대체합니다)\n· 급여대장 리포트 ${newReports.length}건 추가됨`;
      if (skippedCount > 0) msg += `\n· 이미 있던 리포트 ${skippedCount}건은 건너뛰었습니다`;
      if (validation.warnings && validation.warnings.length > 0) {
        msg += `\n\n참고사항:\n${validation.warnings.map(w => `· ${w}`).join('\n')}`;
      }
      alert(msg);
    };
    reader.onerror = () => {
      alert('❌ 파일을 읽는 중 문제가 발생했습니다. 파일이 손상되었을 수 있습니다. 다시 시도해주세요.');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportReportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const parseResult = safeParseJSON(evt.target?.result as string);
      if (!parseResult.ok) {
        alert(`❌ 파일을 열 수 없습니다\n\n${parseResult.error}`);
        return;
      }
      const validation = validatePayrollReportPayload(parseResult.data);
      if (!validation.valid) {
        alert(`❌ 올바르지 않은 급여대장 결과 패키지입니다\n\n${validation.errors.map(e => `· ${e}`).join('\n')}\n\n급여대장에서 "패키지(.json) 내보내기"로 만든 파일이 맞는지 확인해주세요.`);
        return;
      }
      onImportReport(validation.data!);
      setViewingReport(validation.data!); // Open inspector directly
      if (validation.warnings && validation.warnings.length > 0) {
        // 조용히 넘어가도 되는 참고사항이라 alert 대신 콘솔에만 남깁니다.
        console.info('리포트 불러오기 참고사항:', validation.warnings);
      }
    };
    reader.onerror = () => {
      alert('❌ 파일을 읽는 중 문제가 발생했습니다. 파일이 손상되었을 수 있습니다. 다시 시도해주세요.');
    };
    reader.readAsText(file);
  };

  const handleEditReportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const parseResult = safeParseJSON(evt.target?.result as string);
      if (!parseResult.ok) {
        alert(`❌ 파일을 열 수 없습니다\n\n${parseResult.error}`);
        return;
      }
      const validation = validatePayrollReportPayload(parseResult.data);
      if (!validation.valid) {
        alert(`❌ 올바르지 않은 급여대장 결과 패키지입니다\n\n${validation.errors.map(e => `· ${e}`).join('\n')}\n\n급여대장에서 "패키지(.json) 내보내기"로 만든 파일이 맞는지 확인해주세요.`);
        return;
      }
      const parsed = validation.data!;
      const exists = reports.some(r => r.id === parsed.id);
      if (!exists) {
        onImportReport(parsed);
      }
      onEditReport(parsed);
    };
    reader.onerror = () => {
      alert('❌ 파일을 읽는 중 문제가 발생했습니다. 파일이 손상되었을 수 있습니다. 다시 시도해주세요.');
    };
    reader.readAsText(file);
  };
  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <input
        ref={fullBackupInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFullBackupImport}
      />
      <header className="text-center mb-16">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-5xl font-black text-slate-900 mb-4 tracking-tight">
            조교급여<span className="text-blue-600">대장</span>
          </h1>
          <p className="text-xl text-slate-500 font-medium">
            조교급여 웹 구축화 테스트 사이트
          </p>
        </motion.div>
      </header>

      {showBackupBanner && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 -mt-8 flex flex-col md:flex-row items-center justify-between gap-4 bg-amber-50 border border-amber-200 rounded-2xl px-6 py-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <AlertCircle className="text-amber-600" size={20} />
            </div>
            <div>
              <p className="font-bold text-amber-900 text-sm">
                {daysSinceBackup === null
                  ? '아직 백업한 적이 없어요'
                  : `마지막 백업으로부터 ${daysSinceBackup}일이 지났어요`}
              </p>
              <p className="text-amber-700 text-xs mt-0.5">
                모든 데이터는 이 브라우저에만 저장되어 있어요. 캐시가 지워지면 복구할 수 없으니, 지금 백업 파일을 받아두세요.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleFullBackupExport}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5"
            >
              <Download size={14} />
              지금 전체 백업하기
            </button>
            <button
              onClick={() => setBannerDismissed(true)}
              className="px-3 py-2 text-amber-700 hover:bg-amber-100 rounded-xl text-xs font-bold transition-all"
            >
              나중에
            </button>
          </div>
        </motion.div>
      )}


      <div className="grid md:grid-cols-2 gap-8 items-center">
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="space-y-8"
        >
          <div className="glass-card p-8 space-y-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Users className="text-purple-600" />
              인력 관리
            </h2>
            <p className="text-slate-600 leading-relaxed">
              조교들의 기본 정보, 시급, 근로계약 시간, 고정 수당 및 부서 정보를 등록하고 관리합니다. 
              체계적인 기본 마스터 데이터를 먼저 등록해 두어야 정확한 급여대장 산출이 가능합니다.
            </p>
            <button
              onClick={onManageEmployees}
              className="btn-3d-secondary w-full text-lg group"
            >
              조교 정보 관리
              <ChevronRight className="ml-2 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="glass-card p-8 space-y-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Calculator className="text-blue-600" />
              급여 관리 시작하기
            </h2>
            <p className="text-slate-600 leading-relaxed">
              학원 조교들의 출퇴근 기록을 업로드하고, 주휴수당과 세금을 자동으로 계산하세요. 
              3.3% 프리랜서, 4대보험 공제 방식 및 커스텀 세율(%) 임의 산출을 완벽하게 처리합니다.
            </p>
            <div className="space-y-3">
              <button
                onClick={onCreatePayroll}
                className="btn-3d w-full text-lg group"
              >
                조교급여 대장 생성
                <ChevronRight className="ml-2 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => editFileInputRef.current?.click()}
                className="btn-3d-secondary w-full text-lg group flex items-center justify-center gap-1.5"
              >
                <Upload size={18} className="text-slate-600 group-hover:scale-105 transition-transform" />
                조교급여 대장 수정
              </button>
              <input
                type="file"
                ref={editFileInputRef}
                onChange={handleEditReportFile}
                accept=".json"
                className="hidden"
              />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="space-y-8"
        >
          {/* Main page Right column - Historical Audit & Archive System */}
          <div className="glass-card p-8 space-y-6 relative border-2 border-slate-900 bg-slate-900 text-white shadow-2xl">
            <h2 className="text-2xl font-black flex items-center gap-2">
              <FileText className="text-blue-400" />
              급여정산 결과 및 상세기록 감사
            </h2>
            <p className="text-slate-300 leading-relaxed text-sm">
              이전에 내보낸 급여대장 리포트 파일(.json)을 직접 업로드하거나 로컬 이력에서 선택해 **"어떤 정보와 근태 기록을 넣었는지, 주휴수당과 세금 공제 버튼은 무엇을 눌렀는지"** 상세 기록을 한눈에 감사하세요.
            </p>

            <button
              onClick={() => reportFileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-xl shadow-lg transition-all cursor-pointer"
            >
              <Upload size={16} />
              급여 리포트(.json) 파일 불러오기
            </button>
            <input
              type="file"
              ref={reportFileInputRef}
              onChange={handleImportReportFile}
              accept=".json"
              className="hidden"
            />

            <div className="flex items-center gap-2">
              <button
                onClick={handleFullBackupExport}
                className="flex items-center justify-center gap-1.5 flex-1 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-slate-700 transition-all cursor-pointer"
              >
                <Download size={14} />
                전체 백업하기 (조교+리포트)
              </button>
              <button
                onClick={() => fullBackupInputRef.current?.click()}
                className="flex items-center justify-center gap-1.5 flex-1 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-slate-700 transition-all cursor-pointer"
              >
                <Upload size={14} />
                전체 백업 불러오기
              </button>
            </div>
            {daysSinceBackup !== null && (
              <p className="text-[11px] text-slate-500 text-center">마지막 백업: {daysSinceBackup === 0 ? '오늘' : `${daysSinceBackup}일 전`}</p>
            )}

            <div className="space-y-4 pt-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">최근 정산 기록 ({reports.length}개)</h3>
              
              {reports.length === 0 ? (
                <div className="text-center py-8 bg-slate-800/40 rounded-xl border border-slate-800 text-slate-500 text-xs">
                  최근 완료하거나 불러온 정산 결과 이력이 없습니다.
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {reports.map((rep) => {
                    const totalNet = rep.calculated.reduce((sum, item) => sum + item.netSalary, 0);
                    return (
                      <div key={rep.id} className="p-4 bg-slate-800/60 hover:bg-slate-800 rounded-xl border border-slate-800 flex justify-between items-center text-sm transition-all">
                        <div className="space-y-1">
                          <div className="font-extrabold text-white text-base">{rep.academyName}</div>
                          <div className="text-xs text-slate-400 flex items-center gap-1">
                            <Calendar size={12} />
                            {new Date(rep.createdAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}
                          </div>
                          <div className="text-xs text-blue-300 font-bold">
                            인원: {rep.calculated.length}명 · 총 지급: {formatCurrency(totalNet)}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              onEditReport(rep);
                            }}
                            className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => {
                              setViewingReport(rep);
                              if (rep.calculated.length > 0) {
                                setActiveAuditEmployeeId(rep.calculated[0].employeeId);
                              }
                            }}
                            className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                          >
                            상세 감사
                          </button>
                          <button
                            onClick={() => onDeleteReport(rep.id)}
                            className="p-2 text-slate-500 hover:text-red-400 transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* DETAILED LEDGER AUDIT MODAL DRAWER */}
      <AnimatePresence>
        {viewingReport && (() => {
          const filteredReports = reports.filter((rep) => {
            const d = new Date(rep.createdAt);
            const yearMatch = filterYear === 'all' || d.getFullYear() === Number(filterYear);
            const monthMatch = filterMonth === 'all' || (d.getMonth() + 1) === Number(filterMonth);
            return yearMatch && monthMatch;
          });

          const academiesInFilter = Array.from(new Set(filteredReports.map((r) => r.academyName)));

          // Derive active report based on selection
          const activeReport = filteredReports
            .filter((r) => r.academyName === selectedAcademy)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || viewingReport;

          const handleAcademySelect = (academy: string) => {
            setSelectedAcademy(academy);
            const targetReport = filteredReports
              .filter((r) => r.academyName === academy)
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
            if (targetReport && targetReport.calculated.length > 0) {
              setActiveAuditEmployeeId(targetReport.calculated[0].employeeId);
            } else {
              setActiveAuditEmployeeId(null);
            }
          };

          const handleYearChange = (year: string) => {
            const yr = year === 'all' ? 'all' : Number(year);
            setFilterYear(yr);
            const updatedFiltered = reports.filter((rep) => {
              const d = new Date(rep.createdAt);
              const yearMatch = yr === 'all' || d.getFullYear() === Number(yr);
              const monthMatch = filterMonth === 'all' || (d.getMonth() + 1) === Number(filterMonth);
              return yearMatch && monthMatch;
            });
            const updatedAcademies = Array.from(new Set(updatedFiltered.map((r) => r.academyName)));
            if (updatedAcademies.length > 0) {
              setSelectedAcademy(updatedAcademies[0]);
              const nextReport = updatedFiltered.filter(r => r.academyName === updatedAcademies[0]).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
              if (nextReport && nextReport.calculated.length > 0) {
                setActiveAuditEmployeeId(nextReport.calculated[0].employeeId);
              } else {
                setActiveAuditEmployeeId(null);
              }
            } else {
              setSelectedAcademy('');
              setActiveAuditEmployeeId(null);
            }
          };

          const handleMonthChange = (month: string) => {
            const mo = month === 'all' ? 'all' : Number(month);
            setFilterMonth(mo);
            const updatedFiltered = reports.filter((rep) => {
              const d = new Date(rep.createdAt);
              const yearMatch = filterYear === 'all' || d.getFullYear() === Number(filterYear);
              const monthMatch = mo === 'all' || (d.getMonth() + 1) === Number(mo);
              return yearMatch && monthMatch;
            });
            const updatedAcademies = Array.from(new Set(updatedFiltered.map((r) => r.academyName)));
            if (updatedAcademies.length > 0) {
              setSelectedAcademy(updatedAcademies[0]);
              const nextReport = updatedFiltered.filter(r => r.academyName === updatedAcademies[0]).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
              if (nextReport && nextReport.calculated.length > 0) {
                setActiveAuditEmployeeId(nextReport.calculated[0].employeeId);
              } else {
                setActiveAuditEmployeeId(null);
              }
            } else {
              setSelectedAcademy('');
              setActiveAuditEmployeeId(null);
            }
          };

          const totalNet = activeReport ? activeReport.calculated.reduce((sum, item) => sum + item.netSalary, 0) : 0;
          const totalGross = activeReport ? activeReport.calculated.reduce((sum, item) => sum + item.totalGross, 0) : 0;
          const totalDeductions = activeReport ? activeReport.calculated.reduce((sum, item) => sum + item.totalDeduction, 0) : 0;

          return (
            <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200"
              >
                {/* Modal Header */}
                <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 bg-blue-600 font-black rounded text-[10px] uppercase">AUDIT PORTAL</span>
                      <h3 className="text-2xl font-black">급여정산 결과 및 상세기록 감사 대시보드</h3>
                    </div>
                    <p className="text-xs text-slate-400">
                      정산 리포트별 내역을 기간(연/월)과 학원 단위로 상세 추적 및 감사할 수 있습니다.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeReport && (
                      <button
                        onClick={() => handleExportReportExcel(activeReport)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-emerald-950/20 cursor-pointer h-9 text-xs"
                      >
                        <FileSpreadsheet size={15} />
                        엑셀(.csv) 대장 다운로드
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setViewingReport(null);
                        setActiveAuditEmployeeId(null);
                        setAuditSearchQuery('');
                        setAuditTaxFilter('all');
                      }}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Quick Overall Stats */}
                {activeReport && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-slate-100 bg-slate-50 text-sm">
                    <div className="p-4 text-center border-r border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">선택된 학원</p>
                      <p className="text-lg font-black text-slate-800">
                        {activeReport ? activeReport.academyName : '-'}
                      </p>
                    </div>
                    <div className="p-4 text-center border-r border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">정산 인원 및 세전 총액</p>
                      <p className="text-lg font-black text-slate-800">
                        {activeReport ? `${activeReport.calculated.length}명 / ${formatCurrency(totalGross)}` : '0명'}
                      </p>
                    </div>
                    <div className="p-4 text-center border-r border-slate-100">
                      <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">총 세금 / 공제 합계</p>
                      <p className="text-lg font-black text-red-500">
                        -{formatCurrency(totalDeductions)}
                      </p>
                    </div>
                    <div className="p-4 text-center bg-blue-50">
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">최종 실지급액</p>
                      <p className="text-lg font-black text-blue-700">
                        {formatCurrency(totalNet)}
                      </p>
                    </div>
                  </div>
                )}

                {/* 3-Column Unified Audit Body Layout */}
                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                  
                  {/* Column 1: Period Selection & Academies Sidebar */}
                  <div className="w-full lg:w-64 border-r border-slate-150 bg-slate-50/70 overflow-y-auto p-4 flex flex-col space-y-4">
                    
                    {/* Period Setting */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar size={13} className="text-slate-500" />
                        감사 기간 선택
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">연도</label>
                          <select
                            value={filterYear}
                            onChange={(e) => handleYearChange(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="all">전체</option>
                            <option value="2025">2025년</option>
                            <option value="2026">2026년</option>
                            <option value="2027">2027년</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">월</label>
                          <select
                            value={filterMonth}
                            onChange={(e) => handleMonthChange(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="all">전체</option>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                              <option key={m} value={m}>{m}월</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Academy Selection ("학원 선택") */}
                    <div className="space-y-2 flex-1 flex flex-col">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Building2 size={13} className="text-blue-600" />
                        학원 선택
                      </h4>

                      {academiesInFilter.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 text-xs font-bold border border-dashed border-slate-200 rounded-xl bg-white/50 p-3">
                          해당 기간에 생성된 급여 대장이 없습니다.
                        </div>
                      ) : (
                        <div className="space-y-1.5 overflow-y-auto pr-1">
                          {academiesInFilter.map((academy) => {
                            const matchCount = filteredReports.filter(r => r.academyName === academy).length;
                            const isSelected = selectedAcademy === academy;
                            
                            return (
                              <button
                                key={academy}
                                onClick={() => handleAcademySelect(academy)}
                                className={cn(
                                  "w-full text-left p-3 rounded-xl border flex items-center gap-2.5 transition-all",
                                  isSelected
                                    ? "bg-blue-600 border-blue-600 text-white shadow-md font-bold"
                                    : "bg-white border-slate-100 hover:border-slate-350 text-slate-700 font-semibold"
                                )}
                              >
                                <Building2 size={15} className={cn(isSelected ? "text-white" : "text-blue-500")} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs truncate">{academy}</div>
                                  <div className={cn(
                                    "text-[9px] font-medium block mt-0.5",
                                    isSelected ? "text-blue-100" : "text-slate-400"
                                  )}>
                                    정산 이력: {matchCount}회
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 실시간 급여 정산 점유 분석 시각 인포 바 (Visual Distribution Analytics) */}
                    {activeReport && activeReport.calculated.length > 0 && (
                      <div className="bg-white rounded-xl p-4 border border-slate-200/60 space-y-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">급여 정산 구성 비율</span>
                        {(() => {
                          const totalBasic = activeReport.calculated.reduce((sum, c) => sum + (c.baseSalary || 0), 0);
                          const totalHoliday = activeReport.calculated.reduce((sum, c) => sum + (c.holidayAllowance || 0), 0);
                          const totalAllowances = activeReport.calculated.reduce((sum, c) => {
                            const itemized = c.itemizedAllowances || {};
                            return sum + (itemized.position || 0) + (itemized.qualification || 0) + (itemized.businessPromotion || 0) + (itemized.cashier || 0) + (itemized.meal || 0) + (itemized.other || 0) + (itemized.omitted || 0);
                          }, 0);
                          const totalSum = totalBasic + totalHoliday + totalAllowances;
                          
                          if (totalSum === 0) return null;

                          const basicPct = Math.round((totalBasic / totalSum) * 100);
                          const holidayPct = Math.round((totalHoliday / totalSum) * 100);
                          const allowancePct = 100 - basicPct - holidayPct;

                          return (
                            <div className="space-y-2">
                              {/* Stacked Percentage Bar */}
                              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                                <div style={{ width: `${basicPct}%` }} className="bg-blue-600 h-full" title={`기본일급: ${basicPct}%`} />
                                <div style={{ width: `${holidayPct}%` }} className="bg-emerald-500 h-full" title={`주휴수당: ${holidayPct}%`} />
                                <div style={{ width: `${allowancePct}%` }} className="bg-amber-500 h-full" title={`각종수당: ${allowancePct}%`} />
                              </div>
                              <div className="grid grid-cols-3 text-[9px] font-bold text-slate-500 text-center gap-1 leading-none pt-1">
                                <div className="text-left text-blue-700">
                                  <span className="inline-block w-1 h-1 rounded-full bg-blue-600 mr-1" />
                                  기본 {basicPct}%
                                </div>
                                <div className="text-emerald-600">
                                  <span className="inline-block w-1 h-1 rounded-full bg-emerald-500 mr-1" />
                                  주휴 {holidayPct}%
                                </div>
                                <div className="text-right text-amber-600">
                                  <span className="inline-block w-1 h-1 rounded-full bg-amber-500 mr-1" />
                                  수당 {allowancePct}%
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* 대량 뱅킹 은행 이체를 위한 다이렉트 텍스트 복사 유틸 카드 */}
                    {activeReport && activeReport.calculated.length > 0 && (
                      <div className="bg-slate-900 text-white rounded-xl p-4 space-y-3 shadow-md shadow-slate-950/20">
                        <div className="flex justify-between items-center">
                          <h4 className="text-[11px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1">
                            <Building2 size={11} className="text-blue-400" />
                            급여 즉시 송금 이체 복사
                          </h4>
                          <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 text-[8px] font-black rounded">기업뱅킹</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-normal">
                          은행 거래 시 간편하게 사용할 수 있도록 [조교명 은행명 계좌 실수령액] 한눈 텍스트를 복사합니다.
                        </p>
                        
                        <button
                          onClick={() => {
                            const text = activeReport.calculated.map(calc => {
                              const emp = activeReport.employees.find(e => e.id === calc.employeeId);
                              const bank = emp?.bankName ? emp.bankName : "미등록은행";
                              const account = emp?.bankAccount ? emp.bankAccount : "계좌미등록";
                              return `${calc.name} ${bank} ${account} ${calc.netSalary.toLocaleString()}원`;
                            }).join('\n');
                            
                            navigator.clipboard.writeText(text);
                            setCopiedTransfer(true);
                            setTimeout(() => setCopiedTransfer(false), 2000);
                          }}
                          className={cn(
                            "w-full py-2 rounded-lg text-xs font-black tracking-tight transition-all flex items-center justify-center gap-1 cursor-pointer",
                            copiedTransfer ? "bg-emerald-600 text-white anim-pulse" : "bg-blue-600 hover:bg-blue-750 text-white"
                          )}
                        >
                          {copiedTransfer ? (
                            <>
                              <Check size={13} />
                              클립보드 전체 복사 완료!
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              송금 정보 다이렉트 복사
                            </>
                          )}
                        </button>

                        {/* Mini Quick View list */}
                        <div className="border-t border-slate-800 pt-2 space-y-1.5 max-h-24 overflow-y-auto pr-1 text-[10px] font-medium text-slate-300 divide-y divide-slate-800/50">
                          {activeReport.calculated.map(calc => {
                            const emp = activeReport.employees.find(e => e.id === calc.employeeId);
                            return (
                              <div key={calc.employeeId} className="flex justify-between items-center text-slate-400 pt-1.5">
                                <span className="font-extrabold text-slate-200">{calc.name}</span>
                                <span className="text-[9px] text-slate-500 truncate max-w-[70px] text-center">
                                  {emp?.bankName ? emp.bankName : '계좌 없음'}
                                </span>
                                <span className="font-mono text-blue-300 text-[10px] text-right">
                                  {calc.netSalary.toLocaleString()}원
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Column 2: Selected Academy Employees List */}
                  <div className="w-full lg:w-80 border-r border-slate-150 bg-white overflow-y-auto p-4 flex flex-col">
                    
                    {/* Search and Filters */}
                    <div className="space-y-2 mb-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-slate-400 h-3.5 w-3.5" />
                        <input
                          type="text"
                          placeholder="이름으로 검색..."
                          value={auditSearchQuery}
                          onChange={(e) => setAuditSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-850"
                        />
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setAuditTaxFilter('all')}
                          className={cn(
                            "flex-1 py-1 text-[10px] font-black rounded transition-all",
                            auditTaxFilter === 'all' ? "bg-slate-950 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                          )}
                        >
                          전체
                        </button>
                        <button
                          onClick={() => setAuditTaxFilter('FREELANCER')}
                          className={cn(
                            "flex-1 py-1 text-[10px] font-black rounded transition-all",
                            auditTaxFilter === 'FREELANCER' ? "bg-blue-600 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                          )}
                        >
                          3.3% 프리
                        </button>
                        <button
                          onClick={() => setAuditTaxFilter('FOUR_MAJOR')}
                          className={cn(
                            "flex-1 py-1 text-[10px] font-black rounded transition-all",
                            auditTaxFilter === 'FOUR_MAJOR' ? "bg-purple-600 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                          )}
                        >
                          4대보험
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-3 px-1">
                      <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">직원 목록</h4>
                      {activeReport && activeReport.calculated.length > 0 && (
                        <button
                          onClick={() => setShowBulkStatements(true)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black rounded-lg transition-all shadow-sm cursor-pointer"
                        >
                          <Printer size={11} />
                          전원 명세서 인쇄
                        </button>
                      )}
                    </div>

                    <div className="flex-1 space-y-2 pr-1">
                      {activeReport ? (() => {
                        const list = activeReport.calculated.filter((calc) => {
                          const nameMatch = calc.name.toLowerCase().includes(auditSearchQuery.toLowerCase());
                          const emp = activeReport.employees.find(e => e.id === calc.employeeId);
                          const resolvedTaxType = calc.taxType || emp?.taxType || 'FREELANCER';
                          const taxMatch = auditTaxFilter === 'all' || 
                            (auditTaxFilter === 'FREELANCER' && (resolvedTaxType === 'FREELANCER' || resolvedTaxType === 'CUSTOM')) ||
                            (auditTaxFilter === 'FOUR_MAJOR' && resolvedTaxType === 'FOUR_MAJOR');
                          return nameMatch && taxMatch;
                        });

                        if (list.length === 0) {
                          return (
                            <div className="text-center py-8 text-slate-400 text-xs font-bold bg-slate-50 rounded-xl border border-dashed border-slate-150">
                              조건에 맞는 정산 대상이 없습니다.
                            </div>
                          );
                        }

                        return list.map((calc) => {
                          const emp = activeReport.employees.find(e => e.id === calc.employeeId);
                          const resolvedTaxType = calc.taxType || emp?.taxType || 'FREELANCER';
                          let taxBadgeLabel = '4대보험';
                          if (resolvedTaxType === 'FREELANCER') {
                            taxBadgeLabel = '3.3% 프리';
                          } else if (resolvedTaxType === 'CUSTOM') {
                            const rate = calc.customTaxRate !== undefined ? calc.customTaxRate : (emp?.customTaxRate || 0);
                            taxBadgeLabel = `커스텀 (${rate}%)`;
                          }

                          return (
                            <button
                              key={calc.employeeId}
                              onClick={() => setActiveAuditEmployeeId(calc.employeeId)}
                              className={cn(
                                "w-full text-left p-3 rounded-xl border transition-all flex justify-between items-center",
                                activeAuditEmployeeId === calc.employeeId
                                  ? "bg-slate-50 border-slate-900 shadow-sm translate-x-1"
                                  : "bg-white border-slate-100 hover:bg-slate-50/50"
                              )}
                            >
                              <div className="space-y-1">
                                <div className="font-extrabold text-slate-900 text-sm leading-tight">{calc.name}</div>
                                <div className="text-xs text-slate-500">{calc.position}</div>
                              </div>
                              <div className="text-right">
                                <div className={cn(
                                  "text-[9px] px-1.5 py-0.5 rounded font-black inline-block mb-1 tracking-tight",
                                  resolvedTaxType === 'FREELANCER' ? "bg-blue-50 text-blue-600" :
                                  resolvedTaxType === 'FOUR_MAJOR' ? "bg-purple-50 text-purple-600" : "bg-amber-50 text-amber-600"
                                )}>
                                  {taxBadgeLabel}
                                </div>
                                <div className="font-black text-xs text-slate-800">{formatCurrency(calc.netSalary)}</div>
                              </div>
                            </button>
                          );
                        });
                      })() : (
                        <div className="text-center py-10 text-slate-400 text-xs font-semibold">
                          학원을 선택해주시면 조교 목록이 표시됩니다.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Column 3: Selected Employee Attendance & Formulas Sheet */}
                  <div className="flex-1 bg-slate-50/50 overflow-y-auto p-6 space-y-6">
                    {(() => {
                      if (!activeReport) {
                        return (
                          <div className="text-center py-20 text-slate-400 text-sm font-semibold">
                            지정된 날짜의 학원을 선택해 대장 감사를 시작하십시오.
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-6">
                          {/* Tab selectors */}
                          <div className="flex bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200 w-full sm:w-fit">
                            <button
                              onClick={() => setAuditViewMode('individual')}
                              className={cn(
                                "flex-grow sm:flex-grow-0 px-4 py-2 text-xs font-black rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 h-8",
                                auditViewMode === 'individual'
                                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/40 font-extrabold"
                                  : "text-slate-500 hover:text-slate-800"
                              )}
                            >
                              <Users size={13} className="text-blue-600" />
                              개별 명세 감사
                            </button>
                            <button
                              onClick={() => setAuditViewMode('analytics')}
                              className={cn(
                                "flex-grow sm:flex-grow-0 px-4 py-2 text-xs font-black rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 h-8",
                                auditViewMode === 'analytics'
                                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/40 font-extrabold"
                                  : "text-slate-500 hover:text-slate-800"
                              )}
                            >
                              <Calculator size={13} className="text-emerald-600" />
                              대시보드 통계 및 인건비 분석
                            </button>
                          </div>

                          {auditViewMode === 'analytics' ? (
                            (() => {
                              // A. Time-of-day Shift Density Heatmap
                              const daysLabels = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
                              
                              // We will have 6 time slots
                              const timeSlots = [
                                { label: '06:00 - 09:00', labelShort: '오픈', start: 6, end: 9 },
                                { label: '09:00 - 12:00', labelShort: '오전', start: 9, end: 12 },
                                { label: '12:00 - 15:00', labelShort: '오후교대', start: 12, end: 15 },
                                { label: '15:00 - 18:00', labelShort: '오후/피크', start: 15, end: 18 },
                                { label: '18:00 - 21:00', labelShort: '저녁/정점', start: 18, end: 21 },
                                { label: '21:00 - 24:00', labelShort: '야간/마감', start: 21, end: 24 }
                              ];

                              const dayMapping = [1, 2, 3, 4, 5, 6, 0]; // Monday to Sunday

                              // Build overlaps count
                              const overlapGrid: Record<number, Record<number, Set<string>>> = {};
                              
                              dayMapping.forEach(day => {
                                overlapGrid[day] = {};
                                timeSlots.forEach((_, sIdx) => {
                                  overlapGrid[day][sIdx] = new Set<string>();
                                });
                              });

                              activeReport.attendance.forEach(record => {
                                if (record.isAbsence || !record.clockIn || !record.clockOut) return;
                                try {
                                  const d = parse(record.date, 'yyyy-MM-dd', new Date());
                                  const dayOfWeek = d.getDay();
                                  
                                  const [sh, sm] = record.clockIn.split(':').map(Number);
                                  const [eh, em] = record.clockOut.split(':').map(Number);
                                  const recStartMin = sh * 60 + sm;
                                  let recEndMin = eh * 60 + em;
                                  if (recEndMin < recStartMin) recEndMin += 24 * 60;

                                  timeSlots.forEach((slot, sIdx) => {
                                    const slotStartMin = slot.start * 60;
                                    const slotEndMin = slot.end * 60;
                                    
                                    const isOverlap = Math.max(recStartMin, slotStartMin) < Math.min(recEndMin, slotEndMin);
                                    if (isOverlap) {
                                      if (overlapGrid[dayOfWeek] !== undefined && overlapGrid[dayOfWeek][sIdx] !== undefined) {
                                        overlapGrid[dayOfWeek][sIdx].add(record.employeeId);
                                      }
                                    }
                                  });
                                } catch (e) {}
                              });

                              // B. Wage distribution by Rank/Spec
                              const ranks: Record<string, { totalWage: number, count: number, employees: string[] }> = {};
                              activeReport.employees.forEach(emp => {
                                const rank = emp.position || '일반조교';
                                if (!ranks[rank]) {
                                  ranks[rank] = { totalWage: 0, count: 0, employees: [] };
                                }
                                ranks[rank].totalWage += emp.hourlyWage;
                                ranks[rank].count += 1;
                                ranks[rank].employees.push(emp.name);
                              });

                              const rankStatsList = Object.entries(ranks).map(([name, r]) => ({
                                name,
                                avgHourlyWage: Math.round(r.totalWage / r.count),
                                count: r.count,
                                employeeNames: r.employees.join(', ')
                              })).sort((a, b) => b.avgHourlyWage - a.avgHourlyWage);

                              const maxWage = Math.max(...rankStatsList.map(r => r.avgHourlyWage), 10000);

                              // C. L/R Ratio & Trend
                              const totalLaborCosts = activeReport.calculated.reduce((sum, item) => sum + item.totalGross, 0);
                              const lrRatio = (totalLaborCosts / academyRevenue) * 100;

                              let lrStatus = { text: '최적 (Optimized)', color: 'text-emerald-700 bg-emerald-50 border-emerald-100', barColor: 'bg-emerald-500' };
                              if (lrRatio > 40) {
                                lrStatus = { text: '위험 (High Risk)', color: 'text-red-700 bg-red-50 border-red-100', barColor: 'bg-red-500' };
                              } else if (lrRatio > 30) {
                                lrStatus = { text: '주의 (Caution)', color: 'text-amber-700 bg-amber-50 border-amber-100', barColor: 'bg-amber-500' };
                              }

                              const academyHistory = reports
                                .filter(r => r.academyName === activeReport.academyName)
                                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

                              return (
                                <div className="space-y-6">
                                  {/* L/R Ratio Section */}
                                  <div className="bg-white p-6 rounded-2xl border border-slate-150 shadow-sm space-y-6">
                                    <div className="flex flex-wrap justify-between items-start gap-4">
                                      <div className="space-y-1">
                                        <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-1.5">
                                          <Calculator size={18} className="text-blue-600" />
                                          학원별 인건비 점유율 (L/R Ratio) 실시간 분석
                                        </h4>
                                        <p className="text-xs text-slate-500">
                                          총지급 인건비가 당월 학원 매출(Revenue) 대비 차지하는 비율이며, 30% 이하가 가장 우수한 수익 구조입니다.
                                        </p>
                                      </div>
                                      
                                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2 w-full sm:w-auto">
                                        <div className="flex justify-between items-center text-xs text-slate-500 gap-6">
                                          <span className="font-bold">당월 학원 매출 입력</span>
                                          <span className="font-mono text-slate-900 font-extrabold text-sm">{formatCurrency(academyRevenue)}</span>
                                        </div>
                                        <input
                                          type="range"
                                          min={10000000}
                                          max={150000000}
                                          step={5000000}
                                          value={academyRevenue}
                                          onChange={(e) => setAcademyRevenue(Number(e.target.value))}
                                          className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                        />
                                        <div className="flex justify-between text-[8px] font-bold text-slate-400 leading-none">
                                          <span>1,000만</span>
                                          <span>5,000만</span>
                                          <span>1억</span>
                                          <span>1.5억</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      <div className="p-4 bg-slate-50/50 border border-slate-150 rounded-xl flex flex-col justify-between">
                                        <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">총 인건비 선지급액 (세전)</span>
                                        <span className="text-2xl font-black text-slate-900 mt-2 font-mono">{formatCurrency(totalLaborCosts)}</span>
                                        <span className="text-[11px] text-slate-500 mt-1 block">현재 {activeReport.calculated.length}명의 급여 전표 대장 합계</span>
                                      </div>

                                      <div className="p-4 bg-slate-50/50 border border-slate-150 rounded-xl text-center flex flex-col justify-center items-center">
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-black">인건비 점유율 (L/R Ratio)</span>
                                        <div className="text-3xl font-black text-blue-700 mt-2 font-mono">{lrRatio.toFixed(1)}%</div>
                                        <span className={cn("text-[9px] font-black px-2.5 py-0.5 rounded-full mt-1.5 border block w-fit mx-auto leading-none", lrStatus.color)}>
                                          {lrStatus.text}
                                        </span>
                                      </div>

                                      <div className="p-4 bg-slate-50/50 border border-slate-150 rounded-xl space-y-2 flex flex-col justify-center">
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">점유 비중 등급 기준표</span>
                                        <div className="space-y-1 text-[11px] font-semibold text-slate-600 leading-none">
                                          <div className="flex justify-between items-center"><span className="text-emerald-600 font-bold flex items-center gap-1">● 0% ~ 30%</span> <span>최적 구조</span></div>
                                          <div className="flex justify-between items-center"><span className="text-amber-500 font-bold flex items-center gap-1">● 30% ~ 40%</span> <span>경계 주의</span></div>
                                          <div className="flex justify-between items-center"><span className="text-red-500 font-bold flex items-center gap-1">● 40% 초과</span> <span>비용 고밀도</span></div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* History Trend tracker */}
                                    {academyHistory.length > 1 && (
                                      <div className="border-t border-slate-150 pt-4 space-y-3">
                                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest block">인건비 및 L/R Ratio 등급 추이 분석 ({academyHistory.length}회 이력)</span>
                                        <div className="flex items-end gap-3 h-28 pt-4 pb-2 px-4 overflow-x-auto bg-slate-50 border border-slate-150 rounded-xl">
                                          {academyHistory.map((hist) => {
                                            const histTotal = hist.calculated.reduce((sum, item) => sum + item.totalGross, 0);
                                            const histRatio = Math.min((histTotal / academyRevenue) * 100, 100);
                                            const dt = new Date(hist.createdAt);
                                            const formatLabel = `${dt.getMonth() + 1}/${dt.getDate()}`;
                                            const isSelected = hist.id === activeReport.id;

                                            return (
                                              <div key={hist.id} className="flex-1 min-w-[50px] flex flex-col items-center gap-2 group h-full justify-end">
                                                <div className="w-full relative flex justify-center items-end h-[75%]">
                                                  <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-slate-900 text-white text-[9px] px-1.5 py-0.5 rounded font-black transition-opacity whitespace-nowrap z-10">
                                                    {histRatio.toFixed(1)}% ({formatCurrency(histTotal)})
                                                  </div>
                                                  <div
                                                    className={cn(
                                                      "w-5 rounded-t-md transition-all duration-300",
                                                      isSelected ? "bg-blue-600 scale-x-110 shadow-sm" : "bg-slate-300 hover:bg-slate-450"
                                                    )}
                                                    style={{ height: `${Math.max(histRatio, 15)}%` }}
                                                  />
                                                </div>
                                                <span className={cn("text-[9px] font-black", isSelected ? "text-blue-600 font-black scale-105" : "text-slate-400")}>
                                                  {formatLabel}
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Heatmap Section */}
                                  <div className="bg-white p-6 rounded-2xl border border-slate-150 shadow-sm space-y-4">
                                    <div className="space-y-1">
                                      <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-1.5">
                                        <Clock size={18} className="text-blue-600" />
                                        요일 및 소정/실근무 시간대별 조교 배치 집중 피크 타임 히트맵
                                      </h4>
                                      <p className="text-xs text-slate-500">
                                        출퇴근 기록 데이터에서 요일별 조교들의 인력 밀도를 추출하여, 어느 시간대에 보조 인력이 가장 조밀하게 집중되어 있는지 보여줍니다.
                                      </p>
                                    </div>

                                    <div className="overflow-x-auto pb-2">
                                      <table className="w-full border-collapse">
                                        <thead>
                                          <tr>
                                            <th className="p-2 text-left text-[10px] font-black text-slate-400 bg-slate-50 border border-slate-150 uppercase tracking-widest min-w-[100px]">근무 요일 / 시간대</th>
                                            {timeSlots.map((slot, sIdx) => (
                                              <th key={sIdx} className="p-2 text-center text-[10px] font-black text-slate-600 bg-slate-50 border border-slate-150">
                                                <div className="font-mono text-slate-800">{slot.labelShort}</div>
                                                <div className="text-[8px] text-slate-400 font-semibold mt-0.5">{slot.label}</div>
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {dayMapping.map((dayNum) => {
                                            const dayLabel = daysLabels[dayNum === 0 ? 6 : dayNum - 1];
                                            const isWeekend = dayNum === 0 || dayNum === 6;

                                            return (
                                              <tr key={dayNum} className="hover:bg-slate-50/50 transition-colors">
                                                <td className={cn(
                                                  "p-2 text-xs font-black border border-slate-150",
                                                  isWeekend ? "text-red-500 bg-red-50/10 font-black" : "text-slate-700 bg-slate-50/30"
                                                )}>
                                                  {dayLabel}
                                                </td>
                                                {timeSlots.map((_, sIdx) => {
                                                  const count = overlapGrid[dayNum]?.[sIdx]?.size || 0;
                                                  
                                                  let cellStyle = "bg-slate-50/50 text-slate-350 border-slate-100";
                                                  if (count >= 3) {
                                                    cellStyle = "bg-blue-600 text-white font-black";
                                                  } else if (count === 2) {
                                                    cellStyle = "bg-blue-200 text-blue-800 font-bold border-blue-300";
                                                  } else if (count === 1) {
                                                    cellStyle = "bg-blue-50 text-blue-700 font-semibold border-blue-100";
                                                  }

                                                  return (
                                                    <td
                                                      key={sIdx}
                                                      className={cn(
                                                        "p-4 text-center text-xs border border-slate-150 transition-all font-mono",
                                                        cellStyle
                                                      )}
                                                      title={`${dayLabel} ${timeSlots[sIdx].label} 조교 배치: ${count}명`}
                                                    >
                                                      {count === 0 ? '-' : `${count}명`}
                                                    </td>
                                                  );
                                                })}
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-4 text-[9px] font-black text-slate-400 pt-1 border-t border-slate-100">
                                      <span>범정 밀도:</span>
                                      <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 bg-slate-50 border border-slate-200 rounded" /> 미배치 (-)</span>
                                      <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 bg-blue-50 border border-blue-100 rounded" /> 1명 근무</span>
                                      <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 bg-blue-200 border border-blue-200 rounded" /> 2명 공동 근무</span>
                                      <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 bg-blue-600 rounded" /> 3명 이상 피크 가용 인원</span>
                                    </div>
                                  </div>

                                  {/* Average wage distribution */}
                                  <div className="bg-white p-6 rounded-2xl border border-slate-150 shadow-sm space-y-4">
                                    <div className="space-y-1">
                                      <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-1.5">
                                        <Users size={18} className="text-blue-600" />
                                        조교 직급 및 스펙별 평균 시급 분포 차트
                                      </h4>
                                      <p className="text-xs text-slate-500">
                                        동일 학원 직무 직급군별 조교들의 인원 분포와 평균 시급의 불균형 지표를 확인하여 평정 근로비를 설정합니다.
                                      </p>
                                    </div>

                                    <div className="space-y-4 pt-1">
                                      {rankStatsList.map((stat, rIdx) => {
                                        const percentage = Math.round((stat.avgHourlyWage / maxWage) * 100);

                                        return (
                                          <div key={rIdx} className="space-y-1.5 hover:translate-x-0.5 transition-transform duration-100">
                                            <div className="flex justify-between items-baseline text-xs font-black leading-none">
                                              <span className="text-slate-800 flex items-baseline gap-2">
                                                <span className="font-extrabold text-sm">{stat.name}</span>
                                                <span className="text-[10px] text-slate-400 font-bold">{stat.count}명 ({stat.employeeNames})</span>
                                              </span>
                                              <span className="text-blue-600 font-mono font-black text-sm">{stat.avgHourlyWage.toLocaleString()}원</span>
                                            </div>

                                            <div className="h-3.5 w-full bg-slate-100 rounded-full overflow-hidden flex relative items-center">
                                              <div
                                                style={{ width: `${percentage}%` }}
                                                className="bg-blue-600 h-full rounded-full transition-all duration-500"
                                              />
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                            (() => {
                              const selectedCalc = activeReport.calculated.find(c => c.employeeId === activeAuditEmployeeId);
                              const selectedEmp = activeReport.employees.find(e => e.id === activeAuditEmployeeId);
                              if (!selectedCalc) {
                                  return (
                                    <div className="text-center py-20 text-slate-400 text-sm font-semibold border-2 border-dashed border-slate-200/60 bg-white/40 p-12 rounded-2xl">
                                      왼쪽의 조교 목록에서 급여를 상세 감사할 대상을 지정하십시오.
                                    </div>
                                  );
                              }

                              const resolvedTaxType = selectedCalc.taxType || selectedEmp?.taxType || 'FREELANCER';
                              const resolvedCustomTaxRate = selectedCalc.customTaxRate !== undefined ? selectedCalc.customTaxRate : (selectedEmp?.customTaxRate || 3.3);

                              // Ensure deductions are computed on the fly if they are missing or sum to 0 but the gross salary is > 0
                              let resolvedDeductions = { ...selectedCalc.deductions };
                              let resolvedTotalDeduction = selectedCalc.totalDeduction || 0;
                              let resolvedNetSalary = selectedCalc.netSalary || 0;

                              const totalDeductionsSum = Object.values(resolvedDeductions).reduce((s, v) => (s as number) + (v as number), 0);
                              if (totalDeductionsSum === 0 && selectedCalc.totalGross > 0) {
                                const mealAllowance = selectedCalc.itemizedAllowances?.meal || 0;
                                const nonTaxableAmount = Math.min(200000, mealAllowance);
                                const taxableGross = Math.max(0, selectedCalc.totalGross - nonTaxableAmount);

                                const TAX_RATES_2026 = {
                                  FREELANCER: 0.033,
                                  FOUR_MAJOR: {
                                    NATIONAL_PENSION: 0.045,
                                    HEALTH_INSURANCE: 0.03545,
                                    LONG_TERM_CARE: 0.1295,
                                    EMPLOYMENT_INSURANCE: 0.009,
                                  }
                                };

                                if (resolvedTaxType === 'FREELANCER') {
                                  const incomeTax = Math.round(selectedCalc.totalGross * 0.03);
                                  const localTax = Math.round(incomeTax * 0.1);
                                  resolvedDeductions = {
                                    '소득세 (3.0%)': incomeTax,
                                    '지방소득세 (0.3%)': localTax,
                                  };
                                  resolvedTotalDeduction = incomeTax + localTax;
                                } else if (resolvedTaxType === 'CUSTOM') {
                                  const rate = (resolvedCustomTaxRate || 0) / 100;
                                  const incomeTax = Math.round(selectedCalc.totalGross * rate);
                                  const localTax = Math.round(incomeTax * 0.1);
                                  resolvedDeductions = {
                                    [`소득세 (${resolvedCustomTaxRate}%)`]: incomeTax,
                                    '지방소득세 (10%)': localTax,
                                  };
                                  resolvedTotalDeduction = incomeTax + localTax;
                                } else {
                                  // FOUR_MAJOR
                                  const np = Math.round(taxableGross * TAX_RATES_2026.FOUR_MAJOR.NATIONAL_PENSION);
                                  const hi = Math.round(taxableGross * TAX_RATES_2026.FOUR_MAJOR.HEALTH_INSURANCE);
                                  const ltc = Math.round(hi * TAX_RATES_2026.FOUR_MAJOR.LONG_TERM_CARE);
                                  const ei = Math.round(taxableGross * TAX_RATES_2026.FOUR_MAJOR.EMPLOYMENT_INSURANCE);

                                  resolvedDeductions = {
                                    '국민연금 (4.5%)': np,
                                    '건강보험 (3.545%)': hi,
                                    '장기요양보험': ltc,
                                    '고용보험 (0.9%)': ei,
                                  };
                                  resolvedTotalDeduction = np + hi + ltc + ei;
                                }
                                resolvedNetSalary = Math.round(selectedCalc.totalGross - resolvedTotalDeduction);
                              }

                              const personAttendance = activeReport.attendance.filter(att => att.employeeId === activeAuditEmployeeId);
                              const hStat = activeReport.weeklyHolidayStatus[selectedCalc.employeeId]?.[0] !== false;

                              return (
                                <>
                                  {/* TA Metadata Card */}
                                  <div className="bg-white p-5 rounded-2xl border border-slate-150 shadow-xs flex flex-wrap justify-between items-center gap-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-12 h-12 bg-slate-900 text-white rounded-xl flex items-center justify-center font-bold text-xl shadow-xs">
                                        {selectedCalc.name[0]}
                                      </div>
                                      <div>
                                        <h4 className="text-xl font-bold text-slate-900">{selectedCalc.name} <span className="text-xs text-slate-500 font-normal">{selectedCalc.position}</span></h4>
                                        <p className="text-xs text-slate-400">주민번호: {selectedEmp?.ssn.split('-')[0]}-******* · 입사일: {selectedEmp?.hireDate}</p>
                                      </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-bold text-slate-600">
                                      <div>
                                        <span className="text-slate-400 font-medium block">시정 시급</span>
                                        <span className="text-slate-800">{selectedEmp?.hourlyWage.toLocaleString()}원</span>
                                      </div>
                                      <div>
                                        <span className="text-slate-400 font-medium block">주휴일자</span>
                                        <span className="text-slate-800">{selectedEmp?.weeklyHoliday}요일</span>
                                      </div>
                                      <div>
                                        <span className="text-slate-400 font-medium block">세금설정</span>
                                        <span className="text-blue-600">
                                          {resolvedTaxType === 'FREELANCER'
                                            ? '3.3% 사업소득세'
                                            : resolvedTaxType === 'CUSTOM'
                                            ? `커스텀 (${resolvedCustomTaxRate}%)`
                                            : '4대보험 공제'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Attendance Logs Details (Where numbers were entered) */}
                                  <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                      <h5 className="font-bold text-slate-800 flex items-center gap-2">
                                        <Calendar size={16} className="text-blue-600" />
                                        입력된 근태 기록 및 설정 감사시트
                                      </h5>
                                      <span className="text-xs text-slate-500">주 근무시간: <strong className="text-slate-900 text-sm font-black">{selectedCalc.weeklyHours.toFixed(1)}시간</strong></span>
                                    </div>
                                    <div className="border border-slate-150 rounded-xl overflow-hidden text-xs bg-white shadow-xs">
                                      <table className="w-full text-left border-collapse">
                                        <thead>
                                          <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                                            <th className="px-4 py-3">근무 일자</th>
                                            <th className="px-4 py-3">출근 기록</th>
                                            <th className="px-4 py-3">퇴근 기록</th>
                                            <th className="px-4 py-3">휴게 적용여부 (4h당 30m)</th>
                                            <th className="px-4 py-3">차감 후 실시간</th>
                                            <th className="px-4 py-3">상태</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {personAttendance.length === 0 ? (
                                            <tr>
                                              <td colSpan={6} className="text-center py-6 text-slate-400">당시 정산기록에 상세 행 데이터가 누락되었습니다.</td>
                                            </tr>
                                          ) : (
                                            personAttendance.map((att) => (
                                              <tr key={att.date} className="border-t border-slate-100 hover:bg-slate-50/40">
                                                <td className="px-4 py-3 font-semibold text-slate-800">{att.date}</td>
                                                <td className="px-4 py-3 font-bold text-slate-700">{att.clockIn || '-'}</td>
                                                <td className="px-4 py-3 font-bold text-slate-700">{att.clockOut || '-'}</td>
                                                <td className="px-4 py-3">
                                                  <span className={cn(
                                                    "px-2 py-0.5 rounded text-[10px] font-black",
                                                    att.hasBreak ? "bg-orange-50 text-orange-600 border border-orange-200" : "bg-slate-100 text-slate-400"
                                                  )}>
                                                    {att.hasBreak ? 'Break Y' : 'Break N'}
                                                  </span>
                                                </td>
                                                <td className="px-4 py-3 font-black text-slate-900">
                                                  {att.clockIn && att.clockOut ? (
                                                    (() => {
                                                      const start = parse(att.clockIn, 'HH:mm', new Date());
                                                      const end = parse(att.clockOut, 'HH:mm', new Date());
                                                      let diff = differenceInMinutes(end, start);
                                                      if (att.hasBreak) {
                                                        if (diff >= 480) diff -= 60;
                                                        else if (diff >= 240) diff -= 30;
                                                      }
                                                      return `${Math.max(0, diff / 60).toFixed(1)}h`;
                                                    })()
                                                  ) : '-'}
                                                </td>
                                                <td className="px-4 py-3">
                                                  {att.isAbsence ? (
                                                    <span className="px-2 py-0.5 bg-red-100 text-red-600 font-bold rounded">결석</span>
                                                  ) : (
                                                    <span className="px-2 py-0.5 bg-green-100 text-green-600 font-bold rounded">정상</span>
                                                  )}
                                                </td>
                                              </tr>
                                            ))
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>

                                  {/* Financial Ledger Formulas */}
                                  <div className="grid md:grid-cols-2 gap-4">
                                    <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-150 text-xs space-y-3">
                                      <h6 className="font-bold text-blue-900 flex items-center gap-1.5 text-sm">
                                        <Calculator size={14} className="text-blue-600" />
                                        지급 산식 공식
                                      </h6>
                                      <div className="flex justify-between">
                                        <span className="text-slate-500">기본급 ({selectedCalc.weeklyHours.toFixed(1)}시간)</span>
                                        <span className="font-extrabold text-slate-800">{formatCurrency(selectedCalc.baseSalary)}</span>
                                      </div>
                                      <div className="flex justify-between items-center">
                                        <span className="text-slate-500 flex items-center gap-2">
                                          주휴수당 지급 여부
                                          <span className={cn(
                                            "px-2 py-0.5 rounded text-[9px] font-black",
                                            hStat ? "bg-blue-600 text-white" : "bg-red-500 text-white"
                                          )}>
                                            {hStat ? '지급 Y' : '미자격/제외 N'}
                                          </span>
                                        </span>
                                        <span className="font-extrabold text-slate-800">{formatCurrency(selectedCalc.holidayAllowance)}</span>
                                      </div>
                                      <hr className="border-blue-105" />
                                      <div className="flex justify-between text-base font-black text-blue-900">
                                        <span>세전 총급여</span>
                                        <span>{formatCurrency(selectedCalc.totalGross)}</span>
                                      </div>
                                    </div>

                                    <div className="p-5 bg-red-50/50 rounded-2xl border border-red-150 text-xs space-y-3">
                                      <h6 className="font-bold text-red-900 flex items-center gap-1.5 text-sm">
                                        <Clock size={14} className="text-red-500" />
                                        공제 세금 및 영수 법정 요율
                                      </h6>
                                      {Object.entries(resolvedDeductions).map(([taxName, amt]) => (
                                        <div key={taxName} className="flex justify-between">
                                          <span className="text-slate-500">{taxName}</span>
                                          <span className="font-extrabold text-red-600">-{formatCurrency(amt as number)}</span>
                                        </div>
                                      ))}
                                      <hr className="border-red-105" />
                                      <div className="flex justify-between text-base font-black text-red-600">
                                        <span>공제 합계액</span>
                                        <span>-{formatCurrency(resolvedTotalDeduction)}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Final Result Card */}
                                  <div className="p-6 bg-slate-900 text-white rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4">
                                    <div>
                                      <span className="text-slate-400 text-xs font-bold block uppercase tracking-widest mb-1">실 수령급여 산출액</span>
                                      <span className="text-slate-300 text-xs font-semibold">{formatCurrency(selectedCalc.totalGross)} (세전) - {formatCurrency(resolvedTotalDeduction)} (공제)</span>
                                    </div>
                                    <div className="text-right flex flex-wrap gap-3 items-center justify-end">
                                      <button
                                        onClick={() => {
                                          setTaxDelegationEmpId(selectedCalc.employeeId);
                                          setTaxDelegationYear('25');
                                        }}
                                        className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-orange-400 font-bold text-xs rounded-xl transition-all shadow-md cursor-pointer"
                                      >
                                        <FileText size={13} className="text-orange-400" />
                                        위임 신고 자료 패키지
                                      </button>
                                      <button
                                        onClick={() => setShowPayslipEmpId(selectedCalc.employeeId)}
                                        className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-md cursor-pointer"
                                      >
                                        <Printer size={13} />
                                        법정 임금명세서 인쇄
                                      </button>
                                      <span className="text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded font-black uppercase tracking-widest">NET PAY</span>
                                      <span className="text-3xl font-black text-white leading-none inline-block">{formatCurrency(resolvedNetSalary)}</span>
                                    </div>
                                  </div>
                                </>
                              );
                            })()
                          )}
                        </div>
                      );
                    })()}
                   </div>
 
                 </div>
               </motion.div>
             </div>
           );
         })()}
       </AnimatePresence>
 
       {/* Wage Statement Sheet for Audited Reports */}
       {showPayslipEmpId && viewingReport && (() => {
         // Find reference report safely
         const filteredReports = reports.filter((rep) => {
           const d = new Date(rep.createdAt);
           const yearMatch = filterYear === 'all' || d.getFullYear() === Number(filterYear);
           const monthMatch = filterMonth === 'all' || (d.getMonth() + 1) === Number(filterMonth);
           return yearMatch && monthMatch;
         });
         const activeReport = filteredReports.find(r => r.academyName === selectedAcademy) || viewingReport;
 
         const emp = activeReport.employees.find(e => e.id === showPayslipEmpId);
         const calculated = activeReport.calculated.find(c => c.employeeId === showPayslipEmpId);
         if (!emp || !calculated) return null;
 
         const resolvedTaxType = calculated.taxType || emp.taxType || 'FREELANCER';
         const resolvedCustomTaxRate = calculated.customTaxRate !== undefined ? calculated.customTaxRate : (emp.customTaxRate || 3.3);
 
         let resolvedDeductions = { ...calculated.deductions };
         let resolvedTotalDeduction = calculated.totalDeduction || 0;
         let resolvedNetSalary = calculated.netSalary || 0;
 
         const totalDeductionsSum = Object.values(resolvedDeductions).reduce((s, v) => (s as number) + (v as number), 0);
         if (totalDeductionsSum === 0 && calculated.totalGross > 0) {
           const mealAllowance = calculated.itemizedAllowances?.meal || 0;
           const nonTaxableAmount = Math.min(200000, mealAllowance);
           const taxableGross = Math.max(0, calculated.totalGross - nonTaxableAmount);
 
           const TAX_RATES_2026 = {
             FREELANCER: 0.033,
             FOUR_MAJOR: {
               NATIONAL_PENSION: 0.045,
               HEALTH_INSURANCE: 0.03545,
               LONG_TERM_CARE: 0.1295,
               EMPLOYMENT_INSURANCE: 0.009,
             }
           };
 
           if (resolvedTaxType === 'FREELANCER') {
             const incomeTax = Math.round(calculated.totalGross * 0.03);
             const localTax = Math.round(incomeTax * 0.1);
             resolvedDeductions = {
               '소득세 (3.0%)': incomeTax,
               '지방소득세 (0.3%)': localTax,
             };
             resolvedTotalDeduction = incomeTax + localTax;
           } else if (resolvedTaxType === 'CUSTOM') {
             const rate = (resolvedCustomTaxRate || 0) / 100;
             const incomeTax = Math.round(calculated.totalGross * rate);
             const localTax = Math.round(incomeTax * 0.1);
             resolvedDeductions = {
               [`소득세 (${resolvedCustomTaxRate}%)`]: incomeTax,
               '지방소득세 (10%)': localTax,
             };
             resolvedTotalDeduction = incomeTax + localTax;
           } else {
             // FOUR_MAJOR
             const np = Math.round(taxableGross * TAX_RATES_2026.FOUR_MAJOR.NATIONAL_PENSION);
             const hi = Math.round(taxableGross * TAX_RATES_2026.FOUR_MAJOR.HEALTH_INSURANCE);
             const ltc = Math.round(hi * TAX_RATES_2026.FOUR_MAJOR.LONG_TERM_CARE);
             const ei = Math.round(taxableGross * TAX_RATES_2026.FOUR_MAJOR.EMPLOYMENT_INSURANCE);
 
             resolvedDeductions = {
               '국민연금 (4.5%)': np,
               '건강보험 (3.545%)': hi,
               '장기요양보험': ltc,
               '고용보험 (0.9%)': ei,
             };
             resolvedTotalDeduction = np + hi + ltc + ei;
           }
           resolvedNetSalary = Math.round(calculated.totalGross - resolvedTotalDeduction);
         }
 
         const resolvedCalculatedForSheet = {
           ...calculated,
           taxType: resolvedTaxType,
           customTaxRate: resolvedCustomTaxRate,
           deductions: resolvedDeductions,
           totalDeduction: resolvedTotalDeduction,
           netSalary: resolvedNetSalary,
         };
 
         return (
           <WageStatementSheet
             employee={emp}
             calculated={resolvedCalculatedForSheet as any}
             academyName={activeReport.academyName}
             onClose={() => setShowPayslipEmpId(null)}
           />
         );
             })()}
                {/*
                const nonTaxableAmount = Math.min(200000, mealAllowance);
                const taxableGross = Math.max(0, calc.totalGross - nonTaxableAmount);

                const TAX_RATES_2026 = {
                  FREELANCER: 0.033,
                  FOUR_MAJOR: {
                    NATIONAL_PENSION: 0.045,
                    HEALTH_INSURANCE: 0.03545,
                    LONG_TERM_CARE: 0.1295,
                    EMPLOYMENT_INSURANCE: 0.009,
                  }
                };

                if (resolvedTaxType === 'FREELANCER') {
                  const incomeTax = Math.round(calc.totalGross * 0.03);
                  const localTax = Math.round(incomeTax * 0.1);
                  resolvedDeductions = {
                    '소득세 (3.0%)': incomeTax,
                    '지방소득세 (0.3%)': localTax,
                  };
                  resolvedTotalDeduction = incomeTax + localTax;
                } else if (resolvedTaxType === 'CUSTOM') {
                  const rate = (resolvedCustomTaxRate || 0) / 100;
                  const incomeTax = Math.round(calc.totalGross * rate);
                  const localTax = Math.round(incomeTax * 0.1);
                  resolvedDeductions = {
                    [`소득세 (${resolvedCustomTaxRate}%)`]: incomeTax,
                    '지방소득세 (10%)': localTax,
                  };
                  resolvedTotalDeduction = incomeTax + localTax;
                } else {
                  // FOUR_MAJOR
                  const np = Math.round(taxableGross * TAX_RATES_2026.FOUR_MAJOR.NATIONAL_PENSION);
                  const hi = Math.round(taxableGross * TAX_RATES_2026.FOUR_MAJOR.HEALTH_INSURANCE);
                  const ltc = Math.round(hi * TAX_RATES_2026.FOUR_MAJOR.LONG_TERM_CARE);
                  const ei = Math.round(taxableGross * TAX_RATES_2026.FOUR_MAJOR.EMPLOYMENT_INSURANCE);

                  resolvedDeductions = {
                    '국민연금 (4.5%)': np,
                    '건강보험 (3.545%)': hi,
                    '장기요양보험': ltc,
                    '고용보험 (0.9%)': ei,
                  };
                  resolvedTotalDeduction = np + hi + ltc + ei;
                }
              }

              acc.totalDeduction += resolvedTotalDeduction;
              acc.netSalary += Math.round(calc.totalGross - resolvedTotalDeduction);

              // Deductions detailed breakdown
              Object.entries(resolvedDeductions).forEach(([key, val]) => {
                acc.deductionsBreakdown[key] = (acc.deductionsBreakdown[key] || 0) + (val as number);
              });
            }
            return acc;
          }, {
            hours: 0,
            baseSalary: 0,
            holidayAllowance: 0,
            overtimeAllowance: 0,
            nightAllowance: 0,
            allowancesAmount: 0,
            totalGross: 0,
            totalDeduction: 0,
            netSalary: 0,
            monthsCount: 0,
            deductionsBreakdown: {} as Record<string, number>
          });
            academyName={activeReport.academyName}
            onClose={() => setShowPayslipEmpId(null)}
          />
        );
      })()} */}

      {/* Bulk Wage Statement Sheet for Audited Reports */}
      {showBulkStatements && viewingReport && (() => {
        // Find reference report safely
        const filteredReports = reports.filter((rep) => {
          const d = new Date(rep.createdAt);
          const yearMatch = filterYear === 'all' || d.getFullYear() === Number(filterYear);
          const monthMatch = filterMonth === 'all' || (d.getMonth() + 1) === Number(filterMonth);
          return yearMatch && monthMatch;
        });
        const activeReport = filteredReports.find(r => r.academyName === selectedAcademy) || viewingReport;

        const statements = activeReport.calculated.map(calc => {
          const emp = activeReport.employees.find(e => e.id === calc.employeeId);
          return emp ? { employee: emp, calculated: calc } : null;
        }).filter(Boolean) as Array<{ employee: Employee; calculated: any }>;

        if (statements.length === 0) return null;

        return (
          <WageStatementSheet
            allStatements={statements}
            academyName={activeReport.academyName}
            onClose={() => setShowBulkStatements(false)}
          />
        );
      })()}

      {/* 3. Year-End Tax Settlement TA Delegation / Reporting Package Generator */}
      <AnimatePresence>
        {taxDelegationEmpId && (() => {
          // Find employee
          const emp = employees.find(e => e.id === taxDelegationEmpId);
          if (!emp) return null;

          // Gather all calculation matching this employee across all reports
          // Sum up metrics for the year-end report
          const annualSummary = reports.reduce((acc, rep) => {
            const calc = rep.calculated.find(c => c.employeeId === taxDelegationEmpId);
            if (calc) {
              acc.hours += (calc.totalMinutes || 0) / 60;
              acc.baseSalary += calc.baseSalary || 0;
              acc.holidayAllowance += calc.holidayAllowance || 0;
              acc.overtimeAllowance += calc.overtimeAllowance || 0;
              acc.nightAllowance += calc.nightAllowance || 0;
              acc.allowancesAmount += calc.allowancesAmount || 0;
              acc.totalGross += calc.totalGross || 0;
              acc.totalDeduction += calc.totalDeduction || 0;
              acc.netSalary += calc.netSalary || 0;
              acc.monthsCount += 1;
              
              // Deductions detailed breakdown
              if (calc.deductions) {
                Object.entries(calc.deductions).forEach(([key, val]) => {
                  acc.deductionsBreakdown[key] = (acc.deductionsBreakdown[key] || 0) + (val as number);
                });
              }
            }
            return acc;
          }, {
            hours: 0,
            baseSalary: 0,
            holidayAllowance: 0,
            overtimeAllowance: 0,
            nightAllowance: 0,
            allowancesAmount: 0,
            totalGross: 0,
            totalDeduction: 0,
            netSalary: 0,
            monthsCount: 0,
            deductionsBreakdown: {} as Record<string, number>
          });

          return (
            <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col my-8"
              >
                <div className="p-5 bg-slate-900 text-white flex justify-between items-center no-print col-span-2">
                  <div className="space-y-1">
                    <span className="px-2.5 py-0.5 bg-orange-600 font-black rounded text-[9px] uppercase tracking-wider">TAX REPORTING DELEGATION</span>
                    <h3 className="text-lg font-black" id="tax-pkg-title">연말정상/사업원천세 신고 위임장 및 증명패키지</h3>
                  </div>
                  <button
                    onClick={() => setTaxDelegationEmpId(null)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-lg transition-all cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4 no-print text-xs">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">정산/신고 귀속년도</label>
                    <select
                      value={taxDelegationYear}
                      onChange={(e) => setTaxDelegationYear(e.target.value)}
                      className="w-full text-xs font-bold bg-white text-slate-800 p-2.5 border border-slate-200 rounded-xl cursor-pointer"
                    >
                      <option value="2026">2026 귀속</option>
                      <option value="2025">2025 귀속</option>
                      <option value="2024">2024 귀속</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">조교 주소지 (위임인)</label>
                    <input
                      type="text"
                      value={taxDelegationAddress}
                      onChange={(e) => setTaxDelegationAddress(e.target.value)}
                      className="w-full text-xs font-bold bg-white text-slate-800 p-2.5 border border-slate-200 rounded-xl"
                      placeholder="주소 입력"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">조교 연락처 (위임인)</label>
                    <input
                      type="text"
                      value={taxDelegationPhone}
                      onChange={(e) => setTaxDelegationPhone(e.target.value)}
                      className="w-full text-xs font-bold bg-white text-slate-800 p-2.5 border border-slate-200 rounded-xl"
                      placeholder="연락처 입력"
                    />
                  </div>
                </div>

                {/* Printable Document Area */}
                <div className="p-8 overflow-y-auto bg-slate-100 flex-1 max-h-[60vh] text-slate-900" id="tax-print-area">
                  <div className="bg-white p-8 max-w-xl mx-auto space-y-8 shadow-sm border border-slate-300 rounded-xl print:shadow-none print:border-none">
                    <div className="text-center space-y-1">
                      <h2 className="text-2xl font-serif font-black tracking-widest text-slate-950 underline">세무대리 신고 및 연말정산 위임장</h2>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Withholding Tax & Year-End Settlement Delegation</p>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-xs font-black text-slate-800 border-b pb-1">1. 위임인 (조교 소득자 법정대리사항)</h3>
                      <table className="w-full border-collapse border border-slate-300 text-[11px]">
                        <tbody>
                          <tr>
                            <td className="border border-slate-300 bg-slate-50 p-2 font-bold text-center w-24">성 명</td>
                            <td className="border border-slate-300 p-2 font-semibold text-slate-800">{emp.name}</td>
                            <td className="border border-slate-300 bg-slate-50 p-2 font-bold text-center w-24">직 급</td>
                            <td className="border border-slate-300 p-2 font-semibold text-slate-800">{emp.position}</td>
                          </tr>
                          <tr>
                            <td className="border border-slate-300 bg-slate-50 p-2 font-bold text-center">주민등록번호</td>
                            <td className="border border-slate-300 p-2 font-semibold font-mono text-slate-800">{emp.ssn}</td>
                            <td className="border border-slate-300 bg-slate-50 p-2 font-bold text-center">연 락 처</td>
                            <td className="border border-slate-300 p-2 font-semibold font-mono text-slate-800">{taxDelegationPhone}</td>
                          </tr>
                          <tr>
                            <td className="border border-slate-300 bg-slate-50 p-2 font-bold text-center">주 소</td>
                            <td className="border border-slate-300 p-2 font-semibold text-slate-800" colSpan={3}>{taxDelegationAddress}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-xs font-black text-slate-800 border-b pb-1">2. 수임인 (학원 소득신고 대표권)</h3>
                      <table className="w-full border-collapse border border-slate-300 text-[11px]">
                        <tbody>
                          <tr>
                            <td className="border border-slate-300 bg-slate-50 p-2 font-bold text-center w-24">상 호 / 법 인</td>
                            <td className="border border-slate-300 p-2 font-semibold text-slate-800">동명 가맹 학원 주식회사</td>
                            <td className="border border-slate-300 bg-slate-50 p-2 font-bold text-center w-24">대표자 지부장</td>
                            <td className="border border-slate-300 p-2 font-semibold text-slate-800">정 현 철 (인)</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="space-y-2.5 text-[11px] leading-relaxed text-slate-650">
                      <h3 className="text-xs font-black text-slate-800 border-b pb-1">3. 위임 내용 및 위헌보장 확약</h3>
                      <p>
                        위임인은 귀속년도 <strong className="text-slate-900 font-extrabold">{taxDelegationYear}년</strong> 소득세 연말정산 신고, 종합소득세 선납 정산, 원천징수 대상 사업소득세(3.3%) 신고, 4대 사회보험 급여 자료 공제액의 세무대리 및 피고용 신고 권한 일체를 상기 수임인(학원 대표 및 위탁 지무장)에게 전적으로 위임합니다.
                      </p>
                      <p>
                        수임인은 위임인을 조력하여 해당 귀속년도 중 당해 학원에서 집계된 다음의 연간 누적 총 노동시간 및 지급 실적 대장을 준용하여 성실하고 투명하게 공제 세액을 국세청 홈택스에 전자 신고할 것임을 확약합니다.
                      </p>
                    </div>

                    <div className="space-y-3 page-break-before">
                      <div className="flex justify-between items-center border-b pb-1">
                        <h3 className="text-xs font-black text-slate-800">4. 당해 기관 지급 및 원천공제 세무 요약장 (귀속기간 내 집계)</h3>
                        <span className="text-[9px] text-slate-400 font-extrabold font-mono">신고대상 월수: {annualSummary.monthsCount}개월</span>
                      </div>
                      
                      <table className="w-full border-collapse border border-slate-300 text-[10px]">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="border border-slate-300 p-1.5 font-bold text-center">누적총시간</th>
                            <th className="border border-slate-300 p-1.5 font-bold text-center">세전총급여</th>
                            <th className="border border-slate-300 p-1.5 font-bold text-center">공제 합계액</th>
                            <th className="border border-slate-300 p-1.5 font-bold text-center">실수령 누적액</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="font-mono text-center font-bold text-slate-900">
                            <td className="border border-slate-300 p-2">{annualSummary.hours.toFixed(1)}시간</td>
                            <td className="border border-slate-300 p-2 text-blue-700">{formatCurrency(annualSummary.totalGross)}</td>
                            <td className="border border-slate-300 p-2 text-red-600">-{formatCurrency(annualSummary.totalDeduction)}</td>
                            <td className="border border-slate-300 p-2 text-emerald-700">{formatCurrency(annualSummary.netSalary)}</td>
                          </tr>
                        </tbody>
                      </table>

                      {Object.keys(annualSummary.deductionsBreakdown).length > 0 && (
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] space-y-1 font-mono">
                          <span className="font-bold text-slate-500 block text-[9px] mb-1">상세 공제 항목 합산 일람 (세무 신고 대조용)</span>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {Object.entries(annualSummary.deductionsBreakdown).map(([key, value]) => (
                              <div key={key} className="flex justify-between border-b pb-0.5 border-slate-150">
                                <span className="text-slate-400">{key}</span>
                                <span className="font-bold text-red-650">{formatCurrency(value)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 pt-4 text-[10.5px] leading-relaxed text-slate-500">
                      <p>
                        본 위임장에 기재된 총 노동시간 통계 및 지급 내역은 피사용자인 위임인 본인의 동의하에 시스템에서 엄격히 보정 및 인출된 공식 소득 자료 연간 합산액임이 보장되며, 위임인 및 수임인은 상호 투명한 세무합의에 따라 본 서류를 날인하여 세무대리 신고 시 제출하는 바입니다.
                      </p>
                    </div>

                    <div className="text-right text-[11px] pr-6 pt-4 font-bold text-slate-800">
                      제 출 자 (위임조교): &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; (서명 또는 인)
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-150 flex justify-end gap-3.5 no-print">
                  <button
                    onClick={() => setTaxDelegationEmpId(null)}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    닫기
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer size={13} />
                    위임 세무신고 패키지 인쇄 출력
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
