import React, { useState } from 'react';
import { format } from 'date-fns';
import { Printer, FileDown, Loader2 } from 'lucide-react';
import { Employee, EmployeeAllowances } from '../types';
import { formatCurrency } from '../lib/utils';
import { downloadElementAsPdf, downloadElementsAsPdfZip } from '../lib/pdfExport';

interface WageStatementSheetProps {
  employee?: Employee;
  calculated?: {
    employeeId: string;
    name: string;
    position: string;
    weeklyHours: number;
    baseSalary: number;
    holidayAllowance: number;
    overtimeAllowance?: number;
    nightAllowance?: number;
    allowancesAmount: number;
    itemizedAllowances: EmployeeAllowances;
    totalGross: number;
    deductions: Record<string, number>;
    totalDeduction: number;
    netSalary: number;
    taxType: string;
    customTaxRate?: number;
    workDaysCount: number;
    totalMinutes: number;
    overtimeHours: number;
    nightHours: number;
    holidayHours: number;
    holidayWorkPremiumAllowance?: number;
    paidLeaveAllowance?: number;
  };
  allStatements?: Array<{
    employee: Employee;
    calculated: {
      employeeId: string;
      name: string;
      position: string;
      weeklyHours: number;
      baseSalary: number;
      holidayAllowance: number;
      overtimeAllowance?: number;
      nightAllowance?: number;
      allowancesAmount: number;
      itemizedAllowances: EmployeeAllowances;
      totalGross: number;
      deductions: Record<string, number>;
      totalDeduction: number;
      netSalary: number;
      taxType: string;
      customTaxRate?: number;
      workDaysCount: number;
      totalMinutes: number;
      overtimeHours: number;
      nightHours: number;
      holidayHours: number;
      holidayWorkPremiumAllowance?: number;
      paidLeaveAllowance?: number;
    };
  }>;
  academyName: string;
  paydayDateString?: string; 
  onClose?: () => void;
}

export default function WageStatementSheet({
  employee,
  calculated,
  allStatements,
  academyName,
  paydayDateString,
  onClose
}: WageStatementSheetProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);

  const handlePrint = () => {
    const printContent = document.getElementById('printable-wage-statement');
    if (!printContent) return;
    
    // Create an iframe to print cleanly without changing standard app state
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`
        <html>
          <head>
            <title>임금명세서 - ${allStatements ? '전직원 일괄' : calculated?.name || ''}</title>
            <style>
              body {
                font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', 'Segoe UI', system-ui, -apple-system, sans-serif;
                margin: 20px;
                padding: 0;
                color: #1e293b;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .payslip-wrapper {
                width: 100%;
                max-width: 800px;
                margin: 0 auto;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
                font-size: 13px;
              }
              th, td {
                border: 1px solid #718096;
                padding: 8px 10px;
                text-align: center;
              }
              .bg-gray-gray {
                background-color: #cbd5e1 !important;
                font-weight: bold;
              }
              .bg-soft-gray {
                background-color: #f1f5f9 !important;
              }
              .title-box {
                background-color: #94a3b8 !important;
                border: 2px solid #475569;
                padding: 15px;
                text-align: center;
                font-size: 24px;
                font-weight: bold;
                letter-spacing: 15px;
                margin-bottom: 20px;
              }
              .text-left {
                text-align: left;
              }
              .text-right {
                text-align: right;
              }
              .font-bold {
                font-weight: bold;
              }
              .footer {
                text-align: center;
                margin-top: 30px;
                font-size: 16px;
                font-weight: bold;
              }
              .print-page-break {
                page-break-after: always;
                break-after: page;
              }
              /* Do not show page break on last item in print */
              .print-page-break:last-child {
                page-break-after: avoid;
                break-after: avoid;
              }
            </style>
          </head>
          <body>
            <div class="payslip-wrapper">
              ${printContent.innerHTML}
            </div>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() {
                  window.frameElement.remove();
                }, 100);
              }
            </script>
          </body>
        </html>
      `);
      doc.close();
    }
  };

  const activeStatements = allStatements || (employee && calculated ? [{ employee, calculated }] : []);

  const handleDownloadSinglePdf = async () => {
    const node = document.querySelector('#printable-wage-statement > div') as HTMLElement | null;
    if (!node || activeStatements.length === 0) return;
    setIsGeneratingPdf(true);
    try {
      const name = activeStatements[0].employee.name;
      await downloadElementAsPdf(node, `임금명세서_${name}_${format(new Date(), 'yyyyMMdd')}.pdf`);
    } catch (e) {
      console.error('PDF 생성 실패', e);
      alert('PDF 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadBulkPdfZip = async () => {
    const nodes = Array.from(document.querySelectorAll('#printable-wage-statement > div')) as HTMLElement[];
    if (nodes.length === 0) return;
    setIsGeneratingPdf(true);
    setPdfProgress({ done: 0, total: nodes.length });
    try {
      const items = nodes.map((node, i) => ({
        element: node,
        fileName: `${String(i + 1).padStart(2, '0')}_${activeStatements[i]?.employee.name || '직원'}_임금명세서.pdf`,
      }));
      await downloadElementsAsPdfZip(
        items,
        `임금명세서_전직원일괄_${academyName || '학원'}_${format(new Date(), 'yyyyMMdd')}.zip`,
        (done, total) => setPdfProgress({ done, total })
      );
    } catch (e) {
      console.error('PDF 일괄 생성 실패', e);
      alert('PDF 일괄 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsGeneratingPdf(false);
      setPdfProgress(null);
    }
  };

  // Match Excel layout
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col border border-slate-200">
        
        {/* Modal Header Actions */}
        <div className="p-4 bg-slate-100 border-b border-slate-200 flex justify-between items-center text-slate-700">
          <span className="font-bold text-sm text-slate-800 flex items-center gap-2">
            📄 {allStatements ? `전직원 일괄 임금명세서 (${allStatements.length}명) 미리보기` : '표준 임금명세서 미리보기 (근로기준법 시행령 제27조의2 준수)'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-md"
            >
              <Printer size={14} />
              {allStatements ? '전직원 일괄 인쇄' : '인쇄하기'}
            </button>
            {allStatements ? (
              <button
                onClick={handleDownloadBulkPdfZip}
                disabled={isGeneratingPdf}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold transition-all shadow-md"
              >
                {isGeneratingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                {isGeneratingPdf
                  ? `PDF 생성 중... (${pdfProgress?.done ?? 0}/${pdfProgress?.total ?? allStatements.length})`
                  : 'PDF 일괄 저장 (zip)'}
              </button>
            ) : (
              <button
                onClick={handleDownloadSinglePdf}
                disabled={isGeneratingPdf}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold transition-all shadow-md"
              >
                {isGeneratingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                {isGeneratingPdf ? 'PDF 생성 중...' : 'PDF로 저장'}
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 px-2.5 bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-600 font-bold text-sm transition-all"
              >
                닫기
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Document Container */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50 space-y-8">
          
          {/* Printable Layout Match Screen & Paper */}
          <div 
            id="printable-wage-statement" 
            className="space-y-8"
          >
            {activeStatements.map(({ employee: emp, calculated: calc }, index) => {
              const items = calc.itemizedAllowances || {};
              const currentPaydayDay = emp.payday || 10;
              const payDateDisplay = paydayDateString || `${format(new Date(), 'yyyy년 MM월')} ${currentPaydayDay}일`;
              const workHoursTotal = (calc.totalMinutes / 60).toFixed(1);

              return (
                <div 
                  key={emp.id} 
                  className="bg-white border-2 border-slate-300 p-8 max-w-2xl mx-auto shadow-sm text-slate-800 print-page-break bg-white"
                >
                  {/* Title banner */}
                  <div className="bg-slate-400 border border-slate-600 text-center text-slate-900 py-3 font-extrabold text-2xl tracking-[1.5rem] uppercase mb-4 shadow-sm">
                    임금명세서
                  </div>

                  {/* Payday date row */}
                  <div className="text-right text-xs font-bold text-slate-700 mb-2">
                    지급일: <span className="underline decoration-slate-400 underline-offset-4">{payDateDisplay}</span>
                  </div>

                  {/* General Metadata Excel Grid */}
                  <table className="w-full border-collapse mb-4 border border-slate-400 text-xs">
                    <tbody>
                      <tr>
                        <td className="bg-slate-300 border border-slate-400 font-extrabold w-[15%] text-slate-900">성명</td>
                        <td className="border border-slate-400 w-[35%] font-bold text-left px-3">{calc.name}</td>
                        <td className="bg-slate-300 border border-slate-400 font-extrabold w-[15%] text-slate-900">생년월일</td>
                        <td className="border border-slate-400 w-[35%] font-bold text-left px-3">{emp.ssn ? emp.ssn.split('-')[0] : '대체'}</td>
                      </tr>
                      <tr>
                        <td className="bg-slate-300 border border-slate-400 font-extrabold text-slate-900">부서</td>
                        <td className="border border-slate-400 font-bold text-left px-3">{academyName}</td>
                        <td className="bg-slate-300 border border-slate-400 font-extrabold text-slate-900">직급</td>
                        <td className="border border-slate-400 font-bold text-left px-3">{calc.position}</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Detailed Breakdown Banner */}
                  <div className="bg-slate-300 border border-slate-400 border-b-0 text-center py-1.5 font-extrabold text-sm text-slate-900">
                    세부내역
                  </div>

                  {/* Side-by-Side Earnings and Deductions Table */}
                  <table className="w-full border-collapse mb-4 border border-slate-400 text-xs shadow-sm">
                    <thead>
                      <tr className="bg-slate-200">
                        <th colSpan={2} className="border border-slate-400 text-center font-extrabold text-slate-950 py-1.5 w-1/2">지급내역</th>
                        <th colSpan={2} className="border border-slate-400 text-center font-extrabold text-slate-950 py-1.5 w-1/2">공제내역</th>
                      </tr>
                      <tr className="bg-slate-100 font-bold">
                        <td className="border border-slate-400 text-center py-1 font-extrabold">임금항목</td>
                        <td className="border border-slate-400 text-center font-extrabold">지급금액(원)</td>
                        <td className="border border-slate-400 text-center font-extrabold">공제항목</td>
                        <td className="border border-slate-400 text-center font-extrabold">공제금액(원)</td>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">기본급</td>
                        <td className="border border-slate-400 text-right px-3 font-mono font-bold">{calc.baseSalary.toLocaleString()}</td>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">소득세</td>
                        <td className="border border-slate-400 text-right px-3 font-mono font-bold">
                          {(calc.deductions['소득세 (3.0%)'] || calc.deductions[`소득세 (${calc.customTaxRate}%)`] || calc.deductions['사업소득세 (3.3%)'] || 0).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">주휴수당</td>
                        <td className="border border-slate-400 text-right px-3 font-mono font-bold text-blue-600">{calc.holidayAllowance.toLocaleString()}</td>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">지방소득세</td>
                        <td className="border border-slate-400 text-right px-3 font-mono font-bold">
                          {(calc.deductions['지방소득세 (0.3%)'] || calc.deductions['지방소득세 (10%)'] || 0).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">직책수당</td>
                        <td className="border border-slate-400 text-right px-3 font-mono">{items.position ? items.position.toLocaleString() : '-'}</td>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">건강보험</td>
                        <td className="border border-slate-400 text-right px-3 font-mono">
                          {calc.deductions['건강보험 (3.545%)'] ? calc.deductions['건강보험 (3.545%)'].toLocaleString() : '-'}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">자격수당</td>
                        <td className="border border-slate-400 text-right px-3 font-mono">{items.qualification ? items.qualification.toLocaleString() : '-'}</td>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">장기요양보험</td>
                        <td className="border border-slate-400 text-right px-3 font-mono">
                          {calc.deductions['장기요양보험'] ? calc.deductions['장기요양보험'].toLocaleString() : '-'}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">업무추진비</td>
                        <td className="border border-slate-400 text-right px-3 font-mono">{items.businessPromotion ? items.businessPromotion.toLocaleString() : '-'}</td>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">국민연금</td>
                        <td className="border border-slate-400 text-right px-3 font-mono">
                          {calc.deductions['국민연금 (4.5%)'] ? calc.deductions['국민연금 (4.5%)'].toLocaleString() : '-'}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">출납수당</td>
                        <td className="border border-slate-400 text-right px-3 font-mono">{items.cashier ? items.cashier.toLocaleString() : '-'}</td>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">고용보험</td>
                        <td className="border border-slate-400 text-right px-3 font-mono">
                          {calc.deductions['고용보험 (0.9%)'] ? calc.deductions['고용보험 (0.9%)'].toLocaleString() : '-'}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">식대(비과세)</td>
                        <td className="border border-slate-400 text-right px-3 font-mono text-green-600">{items.meal ? items.meal.toLocaleString() : '-'}</td>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">-</td>
                        <td className="border border-slate-400 text-right px-3 font-mono">-</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">수당(기타)</td>
                        <td className="border border-slate-400 text-right px-3 font-mono">{items.other ? items.other.toLocaleString() : '-'}</td>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">-</td>
                        <td className="border border-slate-400 text-right px-3 font-mono">-</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50 font-bold text-red-500">누락금</td>
                        <td className="border border-slate-400 text-right px-3 font-mono text-red-500 font-bold">{items.omitted ? items.omitted.toLocaleString() : '-'}</td>
                        <td className="border border-slate-400 text-center font-semibold bg-slate-50">-</td>
                        <td className="border border-slate-400 text-right px-3 font-mono">-</td>
                      </tr>
                      {calc.holidayWorkPremiumAllowance ? (
                        <tr>
                          <td className="border border-slate-400 text-center font-semibold bg-slate-50 text-amber-700 font-bold">공휴가산수당</td>
                          <td className="border border-slate-400 text-right px-3 font-mono text-amber-700 font-bold">+{calc.holidayWorkPremiumAllowance.toLocaleString()}</td>
                          <td className="border border-slate-400 text-center font-semibold bg-slate-50">-</td>
                          <td className="border border-slate-400 text-right px-3 font-mono">-</td>
                        </tr>
                      ) : null}
                      {calc.nightAllowance ? (
                        <tr>
                          <td className="border border-slate-400 text-center font-semibold bg-slate-50 text-indigo-700 font-bold">야간가산수당</td>
                          <td className="border border-slate-400 text-right px-3 font-mono text-indigo-700 font-bold">+{Math.round(calc.nightAllowance).toLocaleString()}</td>
                          <td className="border border-slate-400 text-center font-semibold bg-slate-50">-</td>
                          <td className="border border-slate-400 text-right px-3 font-mono">-</td>
                        </tr>
                      ) : null}
                      {calc.paidLeaveAllowance ? (
                        <tr>
                          <td className="border border-slate-400 text-center font-semibold bg-slate-50 text-purple-700 font-bold">유급연차수당</td>
                          <td className="border border-slate-400 text-right px-3 font-mono text-purple-700 font-bold">+{calc.paidLeaveAllowance.toLocaleString()}</td>
                          <td className="border border-slate-400 text-center font-semibold bg-slate-50">-</td>
                          <td className="border border-slate-400 text-right px-3 font-mono">-</td>
                        </tr>
                      ) : null}
                      {/* Total row */}
                      <tr className="bg-slate-200 font-extrabold">
                        <td className="border border-slate-400 text-center py-2 text-slate-900">지급액 계</td>
                        <td className="border border-slate-400 text-right px-3 font-mono text-slate-950 font-black">{calc.totalGross.toLocaleString()}</td>
                        <td className="border border-slate-400 text-center text-slate-900">공제액 계</td>
                        <td className="border border-slate-400 text-right px-3 font-mono text-red-700 font-black">{calc.totalDeduction.toLocaleString()}</td>
                      </tr>
                      {/* Net payment row */}
                      <tr className="bg-slate-300 font-extrabold">
                        <td colSpan={2} className="border border-slate-400 text-center py-2.5 text-base text-slate-900">실수령액(원)</td>
                        <td colSpan={2} className="border border-slate-400 text-right px-4 text-lg font-black text-blue-700 font-mono">{calc.netSalary.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Attendance Status Section */}
                  <div className="bg-slate-300 border border-slate-400 border-b-0 text-center py-1.5 font-extrabold text-xs text-slate-900">
                    근무현황 (정산 기간 중 집계)
                  </div>
                  <table className="w-full border-collapse mb-4 border border-slate-400 text-xs">
                    <thead>
                      <tr className="bg-slate-200">
                        <th className="border border-slate-400 text-center py-1 font-extrabold w-[25%]">근로일수</th>
                        <th className="border border-slate-400 text-center font-extrabold w-[25%]">총근로시간</th>
                        <th className="border border-slate-400 text-center font-extrabold w-[25%]">야간근로시간</th>
                        <th className="border border-slate-400 text-center font-extrabold w-[25%]">휴일근로시간</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="font-bold">
                        <td className="border border-slate-400 text-center py-1.5">{calc.workDaysCount}일</td>
                        <td className="border border-slate-400 text-center font-mono">{workHoursTotal}시간</td>
                        <td className="border border-slate-400 text-center font-mono text-violet-600">{calc.nightHours.toFixed(1)}시간</td>
                        <td className="border border-slate-400 text-center font-mono text-blue-600">{calc.holidayHours.toFixed(1)}시간</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Work Method Formulas Section */}
                  <div className="bg-slate-300 border border-slate-400 border-b-0 text-center py-1.5 font-extrabold text-xs text-slate-900">
                    계산 방법 (수당 및 공제 산출 상세 내역)
                  </div>
                  <table className="w-full border-collapse border border-slate-400 text-[11px] leading-relaxed">
                    <thead>
                      <tr className="bg-slate-200 text-center font-extrabold">
                        <td className="border border-slate-400 py-1 font-bold w-[25%]">구분</td>
                        <td className="border border-slate-400 font-bold w-[55%]">산출방법</td>
                        <td className="border border-slate-400 font-bold w-[20%]">지급액(원)</td>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-400 font-bold bg-slate-50 px-2.5 py-1 text-center">야간근로수당</td>
                        <td className="border border-slate-400 text-left px-3">
                          {calc.nightHours > 0 
                            ? `야간근로(22:00 ~ 06:00) ${calc.nightHours.toFixed(1)}시간 × 시급 ${emp.hourlyWage.toLocaleString()}원 × 0.5 가산`
                            : '야간근무(22시~익일06시) 집계분 없음'}
                        </td>
                        <td className="border border-slate-400 text-right px-3 font-mono font-bold">
                          {Math.round(calc.nightAllowance || 0).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-400 font-bold bg-slate-50 px-2.5 py-1 text-center">휴일근로수당</td>
                        <td className="border border-slate-400 text-left px-3">
                          {calc.holidayHours > 0 
                            ? `휴일 및 지정주휴 근무 ${calc.holidayHours.toFixed(1)}시간 × 시급 ${emp.hourlyWage.toLocaleString()}원`
                            : '토/일 및 법정주휴일 근무 내역 없음'}
                        </td>
                        <td className="border border-slate-400 text-right px-3 font-mono font-bold">
                          {Math.round(calc.holidayHours * emp.hourlyWage).toLocaleString()}
                        </td>
                      </tr>
                      {calc.holidayWorkPremiumAllowance ? (
                        <tr>
                          <td className="border border-slate-400 font-bold bg-slate-50 px-2.5 py-1 text-center text-amber-700">공휴가산수당</td>
                          <td className="border border-slate-400 text-left px-3 text-amber-800">
                            공휴일 출근 근로 가산 (총 근로시간에 대한 50% 가산수당 적용)
                          </td>
                          <td className="border border-slate-400 text-right px-3 font-mono font-bold text-amber-700">
                            {calc.holidayWorkPremiumAllowance.toLocaleString()}
                          </td>
                        </tr>
                      ) : null}
                      {calc.paidLeaveAllowance ? (
                        <tr>
                          <td className="border border-slate-400 font-bold bg-slate-50 px-2.5 py-1 text-center text-purple-700">유급연차수당</td>
                          <td className="border border-slate-400 text-left px-3 text-purple-800">
                            유급 휴가 및 연차 사용 (소정근로시간 기준 전액 100% 지급)
                          </td>
                          <td className="border border-slate-400 text-right px-3 font-mono font-bold text-purple-700">
                            {calc.paidLeaveAllowance.toLocaleString()}
                          </td>
                        </tr>
                      ) : null}
                      <tr>
                        <td className="border border-slate-400 font-bold bg-slate-50 px-2.5 py-1 text-center">주휴수당 산출</td>
                        <td className="border border-slate-400 text-left px-3">
                          {calc.weeklyHours >= 15 
                            ? `주간 근로시간: ${calc.weeklyHours.toFixed(1)}h (15h 이상 발생 충족) / 40 × 8 × 시급`
                            : '1주 근무시간 15시간 미만으로 주휴수당 미해당'}
                        </td>
                        <td className="border border-slate-400 text-right px-3 font-mono font-bold text-blue-600">
                          {calc.holidayAllowance.toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Bottom Credit Block */}
                  <div className="text-center font-bold text-slate-800 border-2 border-dashed border-slate-300 rounded-lg py-4 mt-6 text-sm">
                    위 원천징수 및 근태 산정 보고서는 근로기준법 시행령 제27조의2에 근거하여 작성된 정식 임금명세서입니다.
                    <br />
                    <span className="text-slate-500 font-bold mt-2 inline-block text-xs">작성 학원명: &ldquo;{academyName}&rdquo;</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
