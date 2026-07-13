import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronRight, 
  ChevronLeft, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Coffee,
  Calculator,
  Download,
  Building2,
  Settings,
  Plus,
  Coins,
  FileSpreadsheet
} from 'lucide-react';
import { Employee, AttendanceRecord, PayrollStep, PayrollReport, EmployeeAllowances } from '../types';
import { TAX_RATES_2026 } from '../constants';
import { cn, formatCurrency, calculateWeeklyHolidayAllowance, calculateNightHours, normalizeTimeToHHMM } from '../lib/utils';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, parse, differenceInMinutes, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';
import * as XLSX from 'xlsx-js-style';
import WageStatementSheet from '../components/WageStatementSheet';
import { exportPayrollWorkbook, ExcelPayrollRow, ExcelAttendanceRow, ExcelComparisonRow } from '../lib/excelExport';
import { stampReportForExport, markBackupDone } from '../lib/dataValidation';

interface PayrollCreationProps {
  employees: Employee[];
  onBack: () => void;
  onSaveReport: (report: PayrollReport) => void;
  editReport?: PayrollReport;
  reports?: PayrollReport[];
}

export default function PayrollCreation({ employees, onBack, onSaveReport, editReport, reports = [] }: PayrollCreationProps) {
  const [step, setStep] = useState(editReport ? 3 : 1);
  const [academyName, setAcademyName] = useState(editReport ? editReport.academyName : '');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(editReport ? editReport.attendance : []);
  const [selectedWeek, setSelectedWeek] = useState(new Date());
  const [weeklyHolidayStatus, setWeeklyHolidayStatus] = useState<Record<string, any>>(editReport ? editReport.weeklyHolidayStatus : {}); 
  const [nightWorkStatus, setNightWorkStatus] = useState<Record<string, any>>(editReport && editReport.nightWorkStatus ? editReport.nightWorkStatus : {});
  const [proRataDays, setProRataDays] = useState<Record<string, Record<string, number>>>(editReport && editReport.proRataDays ? editReport.proRataDays : {});
  const [graceMinutes, setGraceMinutes] = useState<number>(editReport && editReport.graceMinutes !== undefined ? editReport.graceMinutes : 3);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [employeeTaxOverrides, setEmployeeTaxOverrides] = useState<Record<string, { taxType: 'FREELANCER' | 'FOUR_MAJOR' | 'CUSTOM', customTaxRate: number }>>({});
  const [employeeAllowanceOverrides, setEmployeeAllowanceOverrides] = useState<Record<string, EmployeeAllowances>>({});
  const [activePayslipEmpId, setActivePayslipEmpId] = useState<string | null>(null);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [comparisonReportId, setComparisonReportId] = useState<string>('');
  const [showAllPayslips, setShowAllPayslips] = useState(false);

  React.useEffect(() => {
    if (employees && employees.length > 0) {
      const initialTaxes: Record<string, { taxType: 'FREELANCER' | 'FOUR_MAJOR' | 'CUSTOM', customTaxRate: number }> = {};
      const initialAllowances: Record<string, EmployeeAllowances> = {};

      employees.forEach(emp => {
        const editedCalc = editReport?.calculated.find(c => c.employeeId === emp.id);

        if (editedCalc) {
          initialTaxes[emp.id] = {
            taxType: editedCalc.taxType || 'FREELANCER',
            customTaxRate: editedCalc.customTaxRate || 3.3
          };
          initialAllowances[emp.id] = editedCalc.itemizedAllowances || {
            position: 0,
            qualification: 0,
            businessPromotion: 0,
            cashier: 0,
            meal: 0,
            other: 0,
            omitted: 0
          };
        } else {
          initialTaxes[emp.id] = {
            taxType: emp.taxType || 'FREELANCER',
            customTaxRate: emp.customTaxRate || 3.3
          };
          initialAllowances[emp.id] = emp.allowances || {
            position: 0,
            qualification: 0,
            businessPromotion: 0,
            cashier: 0,
            meal: 0,
            other: 0,
            omitted: 0
          };
        }
      });

      setEmployeeTaxOverrides(initialTaxes);
      setEmployeeAllowanceOverrides(initialAllowances);
    }
  }, [employees, editReport]);


  // Step 1: Academy Name
  const handleAcademySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (academyName) setStep(2);
  };

  // Step 3: File Upload (Real Parsing)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      // Skip header row (index 0)
      const rows = data.slice(1);
      
      const parsedRecords: AttendanceRecord[] = [];

      rows.forEach(row => {
        const dateStr = row[0]; // A: 출퇴근일
        const name = row[1];    // B: 이름
        const clockIn = row[4]; // E: 출근 시간
        const clockOut = row[5];// F: 퇴근 시간

        if (!dateStr || !name) return;

        // Find matching employee
        const employee = employees.find(emp => emp.name === name);
        if (!employee) return;

        // Format date (Excel might provide date objects or strings)
        let formattedDate = '';
        if (typeof dateStr === 'number') {
          // Excel serial date
          const date = XLSX.SSF.parse_date_code(dateStr);
          formattedDate = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
        } else {
          formattedDate = String(dateStr).trim();
        }

        const parsedIn = normalizeTimeToHHMM(clockIn);
        const parsedOut = normalizeTimeToHHMM(clockOut);
        const isNight = (parsedIn && parsedOut) ? (calculateNightHours(parsedIn, parsedOut) > 0) : false;

        parsedRecords.push({
          employeeId: employee.id,
          date: formattedDate,
          clockIn: parsedIn,
          clockOut: parsedOut,
          hasBreak: false,
          isAbsence: !parsedIn || !parsedOut || clockIn === '-',
          isNightWork: isNight,
        });
      });

      setAttendance(parsedRecords);
      setStep(3);
    };
    reader.readAsBinaryString(file);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const toggleBreak = (employeeId: string, date: string) => {
    setAttendance(prev => prev.map(r => 
      (r.employeeId === employeeId && r.date === date) 
        ? { ...r, hasBreak: !r.hasBreak } 
        : r
    ));
  };

  const applyAllBreaks = () => {
    setAttendance(prev => prev.map(r => ({ ...r, hasBreak: true })));
  };

  const getStandardHoursForRecord = (emp: Employee, record: AttendanceRecord) => {
    try {
      const d = parse(record.date, 'yyyy-MM-dd', new Date());
      const daysStr = ['일', '월', '화', '수', '목', '금', '토'] as const;
      const korDay = daysStr[d.getDay()];
      const sched = emp.standardWorkHours?.[korDay as any];
      if (sched && sched.start && sched.end) {
        return { start: sched.start, end: sched.end };
      }
    } catch (e) {
      // ignore
    }
    return { start: '09:00', end: '18:00' };
  };

  const getGraceAdjustedTimes = (record: AttendanceRecord) => {
    let startStr = record.clockIn;
    let endStr = record.clockOut;

    if (graceMinutes > 0 && startStr && endStr && !record.isPaidLeave) {
      const emp = employees.find(e => e.id === record.employeeId);
      if (emp) {
        const std = getStandardHoursForRecord(emp, record);
        if (std && std.start && std.end) {
          try {
            const actStart = parse(startStr, 'HH:mm', new Date());
            const stdStart = parse(std.start, 'HH:mm', new Date());
            if (Math.abs(differenceInMinutes(actStart, stdStart)) <= graceMinutes) {
              startStr = std.start;
            }
          } catch (e) { /* ignore */ }
          try {
            const actEnd = parse(endStr, 'HH:mm', new Date());
            const stdEnd = parse(std.end, 'HH:mm', new Date());
            if (Math.abs(differenceInMinutes(actEnd, stdEnd)) <= graceMinutes) {
              endStr = std.end;
            }
          } catch (e) { /* ignore */ }
        }
      }
    }
    return { clockIn: startStr, clockOut: endStr };
  };

  const calculateHours = (record: AttendanceRecord) => {
    let { clockIn: startStr, clockOut: endStr } = getGraceAdjustedTimes(record);

    if (record.isPaidLeave) {
      const emp = employees.find(e => e.id === record.employeeId);
      if (emp) {
        const std = getStandardHoursForRecord(emp, record);
        startStr = std.start;
        endStr = std.end;
      }
    }

    if (!startStr || !endStr) return 0;
    const start = parse(startStr, 'HH:mm', new Date());
    const end = parse(endStr, 'HH:mm', new Date());
    let diff = differenceInMinutes(end, start);
    
    if (record.hasBreak) {
      // 4시간마다 30분 휴게 (단순화: 4시간 이상이면 30분, 8시간 이상이면 1시간 제외)
      if (diff >= 480) diff -= 60;
      else if (diff >= 240) diff -= 30;
    }
    
    return Math.max(0, diff / 60);
  };

  const getWeeklyHours = (employeeId: string) => {
    return attendance
      .filter(r => r.employeeId === employeeId)
      .reduce((sum, r) => sum + calculateHours(r), 0);
  };

  const renderStep1 = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto py-20">
      <div className="glass-card p-10 text-center space-y-8">
        <div className="w-20 h-20 bg-blue-100 rounded-3xl flex items-center justify-center mx-auto text-blue-600">
          <Building2 size={40} />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-slate-900">학원명을 입력하세요</h2>
          <p className="text-slate-500">급여대장에 표시될 학원 이름을 기재해주세요.</p>
        </div>
        <form onSubmit={handleAcademySubmit} className="space-y-4">
          <input
            autoFocus
            type="text"
            required
            value={academyName}
            onChange={e => setAcademyName(e.target.value)}
            placeholder="예: 미래인재 학원"
            className="w-full px-6 py-4 text-xl rounded-2xl border-2 border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-center font-bold"
          />
          <button type="submit" className="btn-3d w-full py-4 text-lg">
            다음 단계로
            <ChevronRight className="ml-2" />
          </button>
        </form>
      </div>
    </motion.div>
  );

  const renderStep2 = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto py-12 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">{academyName} 급여 생성</h2>
          <p className="text-slate-500">출퇴근 기록 파일을 불러와주세요.</p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setStep(1)} className="px-4 py-2 text-slate-500 font-medium hover:text-slate-800 transition-colors">이전</button>
        </div>
      </div>

      <div className="glass-card p-12 text-center border-2 border-dashed border-slate-200 hover:border-blue-400 transition-colors group">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xlsx, .xls, .csv"
          className="hidden"
        />
        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-blue-50 transition-colors">
          <Upload size={40} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">출퇴근 기록 파일 업로드</h3>
        <p className="text-slate-500 mb-8">엑셀(XLSX) 또는 CSV 파일을 드래그하거나 클릭하여 선택하세요.</p>
        <button
          onClick={triggerFileInput}
          className="btn-3d px-10"
        >
          파일 불러오기
        </button>
      </div>

      <div className="glass-card p-6 bg-blue-50 border-blue-100">
        <h4 className="font-bold text-blue-800 flex items-center gap-2 mb-2">
          <AlertCircle size={18} />
          참고 사항
        </h4>
        <p className="text-sm text-blue-700 leading-relaxed">
          파일 양식에는 [날짜, 이름, 출근시간, 퇴근시간] 항목이 포함되어 있어야 합니다. 
          기록이 없는 날짜는 자동으로 결석 처리됩니다.
        </p>
      </div>
    </motion.div>
  );

  const getWeeksList = () => {
    const weeksMap: Record<string, { start: Date; end: Date; label: string }> = {};
    attendance.forEach(record => {
      try {
        const d = parse(record.date, 'yyyy-MM-dd', new Date());
        if (!isValid(d)) return;
        const start = startOfWeek(d, { weekStartsOn: 1 });
        const end = endOfWeek(d, { weekStartsOn: 1 });
        const key = format(start, 'yyyy-MM-dd');
        if (!weeksMap[key]) {
          weeksMap[key] = {
            start,
            end,
            label: `${format(start, 'M/d')} ~ ${format(end, 'M/d')}`
          };
        }
      } catch (e) {
        // ignore
      }
    });

    return Object.keys(weeksMap)
      .sort()
      .map(key => ({
        key,
        ...weeksMap[key]
      }));
  };

  const getScheduledHours = (emp: Employee, dateStr: string) => {
    try {
      const d = parse(dateStr, 'yyyy-MM-dd', new Date());
      const daysStr = ['일', '월', '화', '수', '목', '금', '토'] as const;
      const korDay = daysStr[d.getDay()];
      const sched = emp.standardWorkHours?.[korDay as any];
      if (sched && sched.start && sched.end) {
        const start = parse(sched.start, 'HH:mm', new Date());
        const end = parse(sched.end, 'HH:mm', new Date());
        return Math.max(0, differenceInMinutes(end, start) / 60);
      }
    } catch (e) {
      // ignore
    }
    return 8; // fallback to 8 hours
  };

  const getWeeklyHoursForEmployee = (empId: string, weekKey: string, attRecords: AttendanceRecord[]) => {
    let totalHours = 0;
    attRecords.forEach(r => {
      if (r.employeeId !== empId) return;
      try {
        const d = parse(r.date, 'yyyy-MM-dd', new Date());
        const start = startOfWeek(d, { weekStartsOn: 1 });
        const currentWeekKey = format(start, 'yyyy-MM-dd');
        if (currentWeekKey === weekKey) {
          if (!r.isAbsence) {
            totalHours += calculateHours(r);
          } else if (r.isPaidLeave) {
            const employee = employees.find(e => e.id === empId);
            if (employee) {
              totalHours += getScheduledHours(employee, r.date);
            }
          }
        }
      } catch (e) {
        // ignore
      }
    });
    return totalHours;
  };

  const formatWorkTime = (hoursFloat: number) => {
    const totalMinutes = Math.round(hoursFloat * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}시간 ${String(m).padStart(2, '0')}분`;
  };

  const renderStep3 = () => {
    const weeks = getWeeksList();

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-[1520px] mx-auto px-4 md:px-8 py-8 space-y-8 animate-fade-in">
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">출퇴근 및 주휴수당 확인</h2>
            <p className="text-sm text-slate-500">각 주차별 소정근로 시간과 주휴수당 여부를 개별 설정 및 일괄 조정하세요.</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={applyAllBreaks}
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Coffee size={14} className="text-orange-500" />
              일괄 휴게 적용
            </button>
            <button onClick={() => setStep(4)} className="btn-3d px-8 py-2 text-xs font-bold flex items-center gap-1 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">
              다음 단계로 이동
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* 출퇴근 정방 시간(Grace Period) 보정 설정 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-150 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div className="space-y-1">
              <span className="flex items-center gap-1.5 font-bold text-xs text-slate-700 block uppercase tracking-tight">
                <Clock size={15} className="text-blue-600" />
                출퇴근 정방 시간 (Grace Period) 보정 설정
              </span>
              <span className="text-[12px] text-slate-500 block">
                조교의 출퇴근 시간이 소정근로 scheduled 시간과 설정된 범위(분) 내일 경우, 온타임 정시 정각 근로로 보정 처리해 급여를 정밀 계산합니다.
              </span>
            </div>
            {/* Range Toggles */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              {[0, 1, 2, 3, 5, 10].map((mins) => (
                <button
                  key={mins}
                  onClick={() => setGraceMinutes(mins)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-black rounded-lg transition-all shadow-sm cursor-pointer",
                    graceMinutes === mins
                      ? "bg-blue-600 text-white font-extrabold shadow-sm"
                      : "bg-white text-slate-650 hover:bg-slate-50 hover:text-slate-900 border border-slate-200/50"
                  )}
                >
                  {mins === 0 ? "보정 없음" : `${mins}분`}
                </button>
              ))}
            </div>
          </div>
          <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center gap-2.5 text-[11px] text-blue-900 leading-relaxed">
            <AlertCircle size={15} className="text-blue-600 flex-shrink-0" />
            <span>
              {graceMinutes === 0 ? (
                <span><strong>보정 비활성화:</strong> 조교가 태그한 출퇴근 시간이 분당 그대로 소수점 계산에 산입됩니다.</span>
              ) : (
                <span>
                  <strong>정방 시간 {graceMinutes}분 보정 적용 중:</strong> 실시간 출퇴근 기록이 매칭되는 요일별 소정 교대 시작/종료 시각의 <strong>앞뒤 {graceMinutes}분 범위</strong> 내에 들어오는 경우(예: 13:00 출근 시 12:57~13:03 사이 출근), 자동으로 정시 출근 또는 정시 퇴근으로 정칙화하여 일관성 있는 시급을 보상하게 됩니다.
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="space-y-8">
          {employees.map(emp => {
            const empRecords = attendance.filter(r => r.employeeId === emp.id);
            let totalHoursWorked = 0;
            let estHolidayAllowance = 0;

            weeks.forEach(week => {
              const wHours = getWeeklyHoursForEmployee(emp.id, week.key, attendance);
              const isAutoEligible = wHours >= 15;
              const currentSetting = weeklyHolidayStatus[emp.id]?.[week.key] || 'AUTO';
              const isPaid = currentSetting === 'YES' || (currentSetting === 'AUTO' && isAutoEligible);
              if (isPaid) {
                let wAllowance = calculateWeeklyHolidayAllowance(wHours, emp.hourlyWage);
                const ratioDays = proRataDays[emp.id]?.[week.key] ?? 7;
                if (ratioDays < 7) {
                  wAllowance = Math.round(wAllowance * ratioDays / 7);
                }
                estHolidayAllowance += wAllowance;
              }
              totalHoursWorked += wHours;
            });

            return (
              <div key={emp.id} className="glass-card overflow-hidden bg-white rounded-2xl shadow-sm border border-slate-150">
                {/* Employee Profile Header */}
                <div className="p-6 bg-slate-50 border-b border-slate-150 flex flex-wrap justify-between items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-black text-lg shadow-md shadow-blue-100">
                      {emp.name[0]}
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2">
                        <h3 className="font-extrabold text-slate-900 text-lg">{emp.name}</h3>
                        <span className="text-xs bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-100">{emp.position}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 font-semibold">시급: <span className="font-mono">{emp.hourlyWage.toLocaleString()}원</span></p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6">
                    <div className="text-right border-r border-slate-200 pr-6">
                      <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">정산 대상 총근로</p>
                      <p className="text-lg font-black text-slate-800 font-mono mt-0.5">{formatWorkTime(totalHoursWorked)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">주휴수당 합산</p>
                      <p className={cn("text-lg font-black font-mono mt-0.5", estHolidayAllowance > 0 ? "text-blue-600" : "text-slate-400")}>
                        {estHolidayAllowance > 0 ? formatCurrency(estHolidayAllowance) : '0원'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Week-by-week Holiday Allowance Controls */}
                <div className="p-6 bg-slate-50/50 border-b border-slate-150 space-y-4">
                  <div className="flex flex-wrap justify-between items-center gap-3">
                    <div>
                      <span className="font-bold text-xs text-slate-700 block uppercase tracking-tight">주차별 주휴수당 지급 설정</span>
                      <span className="text-[11px] text-slate-500">아래 주차 카드의 선택지를 활용해 개별 지급 방식을 변경하거나 우측의 일괄 지정 버튼을 활용하세요.</span>
                    </div>
                    
                    {/* Bulk Action Pills */}
                    <div className="flex gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                      <button
                        onClick={() => {
                          const updated: Record<string, string> = {};
                          weeks.forEach(w => { updated[w.key] = 'YES'; });
                          setWeeklyHolidayStatus(prev => ({ ...prev, [emp.id]: updated }));
                        }}
                        className="px-3 py-1 bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 text-[10px] font-black rounded-lg transition-all shadow-sm"
                      >
                        주휴 일괄 지급(Y)
                      </button>
                      <button
                        onClick={() => {
                          const updated: Record<string, string> = {};
                          weeks.forEach(w => { updated[w.key] = 'NO'; });
                          setWeeklyHolidayStatus(prev => ({ ...prev, [emp.id]: updated }));
                        }}
                        className="px-3 py-1 bg-white hover:bg-red-50 text-red-650 border border-slate-200 text-[10px] font-black rounded-lg transition-all shadow-sm"
                      >
                        주휴 일괄 미지급(N)
                      </button>
                      <button
                        onClick={() => {
                          setWeeklyHolidayStatus(prev => {
                            const copy = { ...prev };
                            delete copy[emp.id];
                            return copy;
                          });
                        }}
                        className="px-3 py-1 bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 text-[10px] font-black rounded-lg transition-all shadow-sm"
                      >
                        자동 계산 적용
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-150">
                    {weeks.map(week => {
                      const wHours = getWeeklyHoursForEmployee(emp.id, week.key, attendance);
                      const isAutoEligible = wHours >= 15;
                      const currentSetting = weeklyHolidayStatus[emp.id]?.[week.key] || 'AUTO';
                      
                      const isPaid = currentSetting === 'YES' || (currentSetting === 'AUTO' && isAutoEligible);
                      let wAllowance = isPaid ? calculateWeeklyHolidayAllowance(wHours, emp.hourlyWage) : 0;
                      const ratioDays = proRataDays[emp.id]?.[week.key] ?? 7;
                      if (ratioDays < 7) {
                        wAllowance = Math.round(wAllowance * ratioDays / 7);
                      }

                      return (
                        <div key={week.key} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[11px] font-black text-slate-600 block">{week.label} 주차</span>
                              <span className="font-mono text-xs font-bold text-slate-800">{formatWorkTime(wHours)}</span>
                            </div>
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] font-black tracking-tight border",
                              isPaid ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-slate-100 text-slate-400 border-slate-200"
                            )}>
                              {isPaid ? `지급 (${formatCurrency(wAllowance)})` : "미지급"}
                            </span>
                          </div>

                          {/* Pro-rata Setting Stepper */}
                          {isPaid && (
                            <div className="p-1.5 bg-white border border-slate-150 rounded-lg flex items-center justify-between text-[10px]">
                              <span className="text-slate-500 font-bold">재직 일수(정상7)</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const curr = proRataDays[emp.id]?.[week.key] ?? 7;
                                    const next = Math.max(1, curr - 1);
                                    setProRataDays(prev => ({
                                      ...prev,
                                      [emp.id]: { ...(prev[emp.id] || {}), [week.key]: next }
                                    }));
                                  }}
                                  className="w-4.5 h-4.5 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center font-black text-slate-600 cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="font-mono font-black text-slate-800 w-5 text-center">{ratioDays}일</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const curr = proRataDays[emp.id]?.[week.key] ?? 7;
                                    const next = Math.min(7, curr + 1);
                                    setProRataDays(prev => ({
                                      ...prev,
                                      [emp.id]: { ...(prev[emp.id] || {}), [week.key]: next }
                                    }));
                                  }}
                                  className="w-4.5 h-4.5 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center font-black text-slate-600 cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-3 gap-0.5 bg-slate-200 p-0.5 rounded-lg border border-slate-300">
                            <button
                              onClick={() => {
                                setWeeklyHolidayStatus(prev => ({
                                  ...prev,
                                  [emp.id]: { ...(prev[emp.id] || {}), [week.key]: 'AUTO' }
                                }));
                              }}
                              className={cn(
                                "py-1 text-[9px] font-black rounded-md transition-all text-center",
                                currentSetting === 'AUTO' ? "bg-white text-slate-800 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-800"
                              )}
                            >
                              자동 {isAutoEligible ? 'Y' : 'N'}
                            </button>
                            <button
                              onClick={() => {
                                setWeeklyHolidayStatus(prev => ({
                                  ...prev,
                                  [emp.id]: { ...(prev[emp.id] || {}), [week.key]: 'YES' }
                                }));
                              }}
                              className={cn(
                                "py-1 text-[9px] font-black rounded-md transition-all text-center",
                                currentSetting === 'YES' ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-blue-600"
                              )}
                            >
                              지급 Y
                            </button>
                            <button
                              onClick={() => {
                                setWeeklyHolidayStatus(prev => ({
                                  ...prev,
                                  [emp.id]: { ...(prev[emp.id] || {}), [week.key]: 'NO' }
                                }));
                              }}
                              className={cn(
                                "py-1 text-[9px] font-black rounded-md transition-all text-center",
                                currentSetting === 'NO' ? "bg-red-650 text-white shadow-sm" : "text-slate-500 hover:text-red-650"
                              )}
                            >
                              미지급 N
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>



                {/* Daily Work Logs Table */}
                <div className="overflow-x-auto border border-slate-150 rounded-xl">
                  <table className="w-full min-w-[1050px] text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-150">
                        <th className="px-6 py-4 whitespace-nowrap">날짜</th>
                        <th className="px-6 py-4 whitespace-nowrap">출근</th>
                        <th className="px-6 py-4 whitespace-nowrap">퇴근</th>
                        <th className="px-6 py-4 whitespace-nowrap">휴게</th>
                        <th className="px-6 py-4 whitespace-nowrap">실근무</th>
                        <th className="px-6 py-4 whitespace-nowrap">추가유형</th>
                        <th className="px-6 py-4 whitespace-nowrap">상태</th>
                        <th className="px-6 py-4 whitespace-nowrap">당일 급여 (예상)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empRecords.map(record => {
                        const hours = calculateHours(record);
                        const dailyNight = (() => {
                          if (record.isPaidLeave || !record.clockIn || !record.clockOut) return 0;
                          const adjusted = getGraceAdjustedTimes(record);
                          return adjusted.clockIn && adjusted.clockOut 
                            ? calculateNightHours(adjusted.clockIn, adjusted.clockOut) 
                            : 0;
                        })();
                        const dailyWage = (() => {
                          if (record.isAbsence && !record.isPaidLeave) return 0;
                          let rate = 1.0;
                          if (record.isHolidayWork && !record.isPaidLeave) {
                            rate = 1.5;
                          }
                          const baseAndHoliday = Math.floor(hours * emp.hourlyWage * rate);
                          const nightPremium = (record.isNightWork && dailyNight > 0) 
                            ? Math.round(dailyNight * emp.hourlyWage * 0.5) 
                            : 0;
                          return baseAndHoliday + nightPremium;
                        })();
                        return (
                          <tr key={record.date} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100">
                            <td className="px-6 py-4 font-semibold text-slate-700 whitespace-nowrap">
                              {format(parse(record.date, 'yyyy-MM-dd', new Date()), 'MM/dd (eee)', { locale: ko })}
                            </td>
                            <td className="px-6 py-4 min-w-[130px] whitespace-nowrap">
                              {(() => {
                                const std = getStandardHoursForRecord(emp, record);
                                const displayIn = record.isPaidLeave ? std.start : (record.clockIn || '');
                                return (
                                  <input 
                                    type="time" 
                                    value={displayIn} 
                                    disabled={record.isPaidLeave}
                                    onChange={e => {
                                      const updatedIn = e.target.value;
                                      setAttendance(prev => prev.map(r => {
                                        if (r.date === record.date && r.employeeId === emp.id) {
                                          const nightHrs = (updatedIn && r.clockOut) ? calculateNightHours(updatedIn, r.clockOut) : 0;
                                          return {
                                            ...r,
                                            clockIn: updatedIn,
                                            isAbsence: !updatedIn || !r.clockOut,
                                            isNightWork: nightHrs > 0
                                          };
                                        }
                                        return r;
                                      }));
                                    }}
                                    className={cn(
                                      "bg-transparent border-none focus:ring-0 font-bold p-0 w-32 tracking-wider",
                                      record.isPaidLeave ? "text-slate-400 font-medium cursor-not-allowed" : "text-slate-900 font-extrabold"
                                    )}
                                  />
                                );
                              })()}
                            </td>
                            <td className="px-6 py-4 min-w-[130px] whitespace-nowrap">
                              {(() => {
                                const std = getStandardHoursForRecord(emp, record);
                                const displayOut = record.isPaidLeave ? std.end : (record.clockOut || '');
                                return (
                                  <input 
                                    type="time" 
                                    value={displayOut} 
                                    disabled={record.isPaidLeave}
                                    onChange={e => {
                                      const updatedOut = e.target.value;
                                      setAttendance(prev => prev.map(r => {
                                        if (r.date === record.date && r.employeeId === emp.id) {
                                          const nightHrs = (r.clockIn && updatedOut) ? calculateNightHours(r.clockIn, updatedOut) : 0;
                                          return {
                                            ...r,
                                            clockOut: updatedOut,
                                            isAbsence: !r.clockIn || !updatedOut,
                                            isNightWork: nightHrs > 0
                                          };
                                        }
                                        return r;
                                      }));
                                    }}
                                    className={cn(
                                      "bg-transparent border-none focus:ring-0 font-bold p-0 w-32 tracking-wider",
                                      record.isPaidLeave ? "text-slate-400 font-medium cursor-not-allowed" : "text-slate-900 font-extrabold"
                                    )}
                                  />
                                );
                              })()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <button 
                                onClick={() => toggleBreak(emp.id, record.date)}
                                className={cn(
                                  "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter transition-all whitespace-nowrap",
                                  record.hasBreak ? "bg-orange-100 text-orange-600 border border-orange-200" : "bg-slate-100 text-slate-400 border border-slate-200"
                                )}
                              >
                                {record.hasBreak ? 'Break Y' : 'Break N'}
                              </button>
                            </td>
                            <td className="px-6 py-4 font-extrabold text-slate-900 font-mono whitespace-nowrap">
                              {formatWorkTime(hours)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex gap-1">
                                <button
                                  onClick={() => {
                                    setAttendance(prev => prev.map(r => r.date === record.date && r.employeeId === emp.id ? { ...r, isHolidayWork: !r.isHolidayWork } : r));
                                  }}
                                  className={cn(
                                    "px-2 py-1 rounded-lg text-[10px] font-black transition-all border whitespace-nowrap",
                                    record.isHolidayWork 
                                      ? "bg-red-500 text-white border-red-650 shadow-xs" 
                                      : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                                  )}
                                >
                                  공휴일근로 (1.5x)
                                </button>
                                <button
                                  onClick={() => {
                                    setAttendance(prev => prev.map(r => r.date === record.date && r.employeeId === emp.id ? { ...r, isPaidLeave: !r.isPaidLeave, isAbsence: !r.isPaidLeave ? false : r.isAbsence } : r));
                                  }}
                                  className={cn(
                                    "px-2 py-1 rounded-lg text-[10px] font-black transition-all border whitespace-nowrap",
                                    record.isPaidLeave 
                                      ? "bg-purple-600 text-white border-purple-700 shadow-xs" 
                                      : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                                  )}
                                >
                                  유급 연차(Paid)
                                </button>
                                <button
                                  onClick={() => {
                                    setAttendance(prev => prev.map(r => r.date === record.date && r.employeeId === emp.id ? { ...r, isNightWork: !r.isNightWork } : r));
                                  }}
                                  className={cn(
                                    "px-2 py-1 rounded-lg text-[10px] font-black transition-all border whitespace-nowrap",
                                    record.isNightWork 
                                      ? "bg-amber-500 text-white border-amber-600 shadow-xs" 
                                      : "bg-white text-slate-300 border-slate-200 hover:bg-slate-50 text-slate-500"
                                  )}
                                >
                                  야간가산 (0.5x){dailyNight > 0 ? ` (${dailyNight.toFixed(1)}h)` : ''}
                                </button>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap min-w-[100px]">
                              {record.isPaidLeave ? (
                                <span className="px-2.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-black rounded-full border border-purple-200 inline-block whitespace-nowrap">유급연차</span>
                              ) : record.isAbsence ? (
                                <span className="px-2.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-black rounded-full border border-red-200 inline-block whitespace-nowrap">결석</span>
                              ) : (
                                <span className="px-2.5 py-0.5 bg-green-100 text-green-600 text-[10px] font-black rounded-full border border-green-200 inline-block whitespace-nowrap">정상</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap min-w-[120px]">
                              <span className={cn(
                                "font-extrabold font-mono text-xs tracking-tight whitespace-nowrap",
                                record.isPaidLeave ? "text-purple-600" :
                                record.isHolidayWork ? "text-red-500" :
                                dailyWage > 0 ? "text-slate-800" : "text-slate-400"
                              )}>
                                {dailyWage > 0 ? `${dailyWage.toLocaleString()}원` : '-'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    );
  };

  const computeEmployeePayroll = (emp: Employee) => {
    const weeks = getWeeksList();
    
    let totalHoursWorked = 0;
    let holidayAllowance = 0;
    let holidayWorkPremiumAllowance = 0;
    let paidLeaveAllowance = 0;

    // 1. Calculate base weekly hours and weekly holiday allowance
    weeks.forEach(week => {
      const wHours = getWeeklyHoursForEmployee(emp.id, week.key, attendance);
      const isAutoEligible = wHours >= 15;
      const currentSetting = weeklyHolidayStatus[emp.id]?.[week.key] || 'AUTO';
      
      const isPaid = currentSetting === 'YES' || (currentSetting === 'AUTO' && isAutoEligible);
      if (isPaid) {
        let weeklyAllowance = calculateWeeklyHolidayAllowance(wHours, emp.hourlyWage);
        const ratioDays = proRataDays[emp.id]?.[week.key] ?? 7;
        if (ratioDays < 7) {
          weeklyAllowance = Math.round(weeklyAllowance * ratioDays / 7);
        }
        holidayAllowance += weeklyAllowance;
      }
    });

    // 2. Daily calculations
    const personRecords = attendance.filter(r => r.employeeId === emp.id);
    const workDaysCount = personRecords.filter(r => !r.isAbsence && (r.clockIn && r.clockOut || r.isPaidLeave)).length;

    let actualMinutes = 0;
    let paidLeaveMinutes = 0;
    let overtimeHours = 0;
    let nightHours = 0;
    let holidayHours = 0;

    let overtimeAllowance = 0;
    let nightAllowance = 0;

    personRecords.forEach(record => {
      let dailyHours = 0;
      if (!record.isAbsence && (record.clockIn && record.clockOut || record.isPaidLeave)) {
        dailyHours = calculateHours(record);
        if (record.isPaidLeave) {
          paidLeaveMinutes += dailyHours * 60;
        } else {
          actualMinutes += dailyHours * 60;

          // Overtime calculation disabled as requested
          let dailyOvertime = 0;

          // Night hours (Calculated daily based on isNightWork status)
          let dailyNight = 0;
          const adjusted = getGraceAdjustedTimes(record);
          if (adjusted.clockIn && adjusted.clockOut && record.isNightWork) {
            const nHours = calculateNightHours(adjusted.clockIn, adjusted.clockOut);
            dailyNight = nHours;
            nightHours += nHours;
          }

          if (record.isNightWork) {
            nightAllowance += Math.round(dailyNight * emp.hourlyWage * 0.5);
          }

          // Holiday / weekend work count
          const rDate = parse(record.date, 'yyyy-MM-dd', new Date());
          const dayIndex = rDate.getDay();
          const isWeekend = dayIndex === 0 || dayIndex === 6;
          const daysStr = ['일', '월', '화', '수', '목', '금', '토'];
          const isCustomHoliday = daysStr[dayIndex] === emp.weeklyHoliday;

          if (isWeekend || isCustomHoliday) {
            holidayHours += dailyHours;
          }
        }
      }

      // Holiday work premium (public holiday work) - add 50% extra pay for worked hours
      if (record.isHolidayWork && !record.isPaidLeave && dailyHours > 0) {
        holidayWorkPremiumAllowance += dailyHours * emp.hourlyWage * 0.5;
      }
    });

    // Paid leave allowance based on standard contract hours
    paidLeaveAllowance = (paidLeaveMinutes / 60) * emp.hourlyWage;

    // average weekly hours over the period includes both actual and paid leave
    const totalMinutes = actualMinutes + paidLeaveMinutes;
    const totalHoursCalculated = totalMinutes / 60;
    const weeklyHours = totalHoursCalculated / Math.max(1, weeks.length);
    const baseSalary = Math.round((actualMinutes / 60) * emp.hourlyWage);

    const roundedHolidayAllowance = Math.round(holidayAllowance);
    const roundedOvertimeAllowance = Math.round(overtimeAllowance);
    const roundedNightAllowance = Math.round(nightAllowance);
    const roundedHolidayWorkPremiumAllowance = Math.round(holidayWorkPremiumAllowance);
    const roundedPaidLeaveAllowance = Math.round(paidLeaveAllowance);

    const allowanceOverride = employeeAllowanceOverrides[emp.id] || emp.allowances || {
      position: 0,
      qualification: 0,
      businessPromotion: 0,
      cashier: 0,
      meal: 0,
      other: 0,
      omitted: 0
    };

    const posAllowance = Math.round(Number(allowanceOverride.position || 0));
    const qualAllowance = Math.round(Number(allowanceOverride.qualification || 0));
    const bizAllowance = Math.round(Number(allowanceOverride.businessPromotion || 0));
    const cashAllowance = Math.round(Number(allowanceOverride.cashier || 0));
    const mealAllowance = Math.round(Number(allowanceOverride.meal || 0));
    const otherAllowance = Math.round(Number(allowanceOverride.other || 0));
    const omittedAllowance = Math.round(Number(allowanceOverride.omitted || 0));

    const totalAllowances = posAllowance + qualAllowance + bizAllowance + cashAllowance + mealAllowance + otherAllowance + omittedAllowance;
    
    // Add custom premium/annual leave allowance to gross! Include overtimeAllowance and nightAllowance
    const totalGross = Math.round(baseSalary + roundedHolidayAllowance + roundedOvertimeAllowance + roundedNightAllowance + totalAllowances + roundedHolidayWorkPremiumAllowance + roundedPaidLeaveAllowance);

    // Standard non-taxable meal limit is 200,000 KRW
    const nonTaxableAmount = Math.min(200000, mealAllowance);
    const taxableGross = Math.max(0, totalGross - nonTaxableAmount);

    let deductions: Record<string, number> = {};
    let totalDeduction = 0;

    const taxOverride = employeeTaxOverrides[emp.id] || {
      taxType: emp.taxType || 'FREELANCER',
      customTaxRate: emp.customTaxRate || 3.3
    };

    if (taxOverride.taxType === 'FREELANCER') {
      const incomeTax = Math.round(totalGross * 0.03);
      const localTax = Math.round(incomeTax * 0.1);
      deductions = {
        '소득세 (3.0%)': incomeTax,
        '지방소득세 (0.3%)': localTax,
      };
      totalDeduction = incomeTax + localTax;
    } else if (taxOverride.taxType === 'CUSTOM') {
      const rate = (taxOverride.customTaxRate || 0) / 100;
      const incomeTax = Math.round(totalGross * rate);
      const localTax = Math.round(incomeTax * 0.1);
      deductions = {
        [`소득세 (${taxOverride.customTaxRate}%)`]: incomeTax,
        '지방소득세 (10%)': localTax,
      };
      totalDeduction = incomeTax + localTax;
    } else {
      const np = Math.round(taxableGross * TAX_RATES_2026.FOUR_MAJOR.NATIONAL_PENSION);
      const hi = Math.round(taxableGross * TAX_RATES_2026.FOUR_MAJOR.HEALTH_INSURANCE);
      const ltc = Math.round(hi * TAX_RATES_2026.FOUR_MAJOR.LONG_TERM_CARE);
      const ei = Math.round(taxableGross * TAX_RATES_2026.FOUR_MAJOR.EMPLOYMENT_INSURANCE);

      deductions = {
        '국민연금 (4.5%)': np,
        '건강보험 (3.545%)': hi,
        '장기요양보험': ltc,
        '고용보험 (0.9%)': ei,
      };
      totalDeduction = np + hi + ltc + ei;
    }

    const netSalary = Math.round(totalGross - totalDeduction);

    return {
      employeeId: emp.id,
      name: emp.name,
      position: emp.position,
      weeklyHours,
      baseSalary,
      holidayAllowance: roundedHolidayAllowance,
      overtimeAllowance: roundedOvertimeAllowance,
      nightAllowance: roundedNightAllowance,
      allowancesAmount: totalAllowances + roundedHolidayWorkPremiumAllowance + roundedPaidLeaveAllowance,
      itemizedAllowances: {
        position: posAllowance,
        qualification: qualAllowance,
        businessPromotion: bizAllowance,
        cashier: cashAllowance,
        meal: mealAllowance,
        other: otherAllowance,
        omitted: omittedAllowance
      },
      holidayWorkPremiumAllowance: roundedHolidayWorkPremiumAllowance,
      paidLeaveAllowance: roundedPaidLeaveAllowance,
      totalGross,
      deductions,
      totalDeduction,
      netSalary,
      taxType: taxOverride.taxType,
      customTaxRate: taxOverride.customTaxRate,
      workDaysCount,
      totalMinutes,
      overtimeHours,
      nightHours,
      holidayHours
    };
  };

  const availableComparisonReports = reports
    .filter(r => !editReport || r.id !== editReport.id)
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  React.useEffect(() => {
    if (!comparisonReportId && availableComparisonReports.length > 0) {
      setComparisonReportId(availableComparisonReports[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports.length]);

  const computeDailyWage = (emp: Employee, record: AttendanceRecord) => {
    const hours = calculateHours(record);
    const adjusted = getGraceAdjustedTimes(record);
    const dailyNight = (!record.isPaidLeave && record.clockIn && record.clockOut && adjusted.clockIn && adjusted.clockOut)
      ? calculateNightHours(adjusted.clockIn, adjusted.clockOut)
      : 0;
    if (record.isAbsence && !record.isPaidLeave) return 0;
    let rate = 1.0;
    if (record.isHolidayWork && !record.isPaidLeave) rate = 1.5;
    const baseAndHoliday = Math.floor(hours * emp.hourlyWage * rate);
    const nightPremium = (record.isNightWork && dailyNight > 0) ? Math.round(dailyNight * emp.hourlyWage * 0.5) : 0;
    return baseAndHoliday + nightPremium;
  };

  const getAttendanceStatusLabel = (record: AttendanceRecord) => {
    if (record.isPaidLeave) return '유급휴가';
    if (record.isAbsence) return '결석';
    if (record.isHolidayWork) return '공휴근무';
    return '정상';
  };

  const getPeriodLabel = () => {
    const weeks = getWeeksList();
    if (weeks.length === 0) return '-';
    const first = weeks[0];
    const last = weeks[weeks.length - 1];
    return `${format(first.start, 'yyyy.MM.dd')} ~ ${format(last.end, 'yyyy.MM.dd')}`;
  };

  const handleExportExcel = async () => {
    if (isExportingExcel) return;
    setIsExportingExcel(true);
    try {
      const ledgerRows: ExcelPayrollRow[] = employees.map(emp => {
        const calc = computeEmployeePayroll(emp);
        let taxTypeLabel = '3.3% 프리랜서';
        let taxRateLabel = '3.3%';
        if (calc.taxType === 'FOUR_MAJOR') {
          taxTypeLabel = '4대보험 공제';
          taxRateLabel = '실시간 사회보험요율';
        } else if (calc.taxType === 'CUSTOM') {
          taxTypeLabel = '커스텀';
          taxRateLabel = `${calc.customTaxRate || 0}%`;
        }

        const incomeTax = calc.deductions['소득세 (3.0%)']
          ?? calc.deductions[`소득세 (${calc.customTaxRate}%)`]
          ?? 0;
        const localTax = calc.deductions['지방소득세 (0.3%)'] ?? calc.deductions['지방소득세 (10%)'] ?? 0;
        const nationalPension = calc.deductions['국민연금 (4.5%)'] || 0;
        const healthInsurance = calc.deductions['건강보험 (3.545%)'] || 0;
        const longTermCare = calc.deductions['장기요양보험'] || 0;
        const employmentInsurance = calc.deductions['고용보험 (0.9%)'] || 0;

        const bankLabel = (emp.bankName && emp.bankAccount) ? `${emp.bankName} ${emp.bankAccount}` : '-';

        return {
          employeeId: emp.id,
          name: calc.name,
          position: calc.position,
          bankLabel,
          workDaysCount: calc.workDaysCount,
          totalHours: Math.round((calc.totalMinutes / 60) * 10) / 10,
          baseSalary: calc.baseSalary,
          holidayAllowance: calc.holidayAllowance,
          nightAllowance: calc.nightAllowance || 0,
          holidayWorkPremiumAllowance: calc.holidayWorkPremiumAllowance || 0,
          paidLeaveAllowance: calc.paidLeaveAllowance || 0,
          positionAllowance: calc.itemizedAllowances.position || 0,
          qualificationAllowance: calc.itemizedAllowances.qualification || 0,
          businessPromotionAllowance: calc.itemizedAllowances.businessPromotion || 0,
          cashierAllowance: calc.itemizedAllowances.cashier || 0,
          mealAllowance: calc.itemizedAllowances.meal || 0,
          otherAllowance: calc.itemizedAllowances.other || 0,
          omittedAllowance: calc.itemizedAllowances.omitted || 0,
          totalGross: calc.totalGross,
          taxTypeLabel,
          taxRateLabel,
          incomeTax,
          localTax,
          nationalPension,
          healthInsurance,
          longTermCare,
          employmentInsurance,
          totalDeduction: calc.totalDeduction,
          netSalary: calc.netSalary,
          nightHours: Math.round(calc.nightHours * 10) / 10,
          holidayHours: Math.round(calc.holidayHours * 10) / 10,
        };
      });

      const attendanceRows: ExcelAttendanceRow[] = attendance
        .slice()
        .sort((a, b) => (a.employeeId + a.date).localeCompare(b.employeeId + b.date))
        .map(record => {
          const emp = employees.find(e => e.id === record.employeeId);
          if (!emp) return null;
          let dayOfWeek = '-';
          try {
            const d = parse(record.date, 'yyyy-MM-dd', new Date());
            if (isValid(d)) dayOfWeek = format(d, 'eee', { locale: ko });
          } catch (e) { /* ignore */ }

          return {
            name: emp.name,
            date: record.date,
            dayOfWeek,
            clockIn: record.clockIn || '',
            clockOut: record.clockOut || '',
            hasBreak: record.hasBreak,
            workedHours: Math.round(calculateHours(record) * 10) / 10,
            status: getAttendanceStatusLabel(record),
            isNightWork: !!record.isNightWork,
            isHolidayWork: !!record.isHolidayWork,
            dailyWage: computeDailyWage(emp, record),
          };
        })
        .filter((r): r is ExcelAttendanceRow => r !== null);

      const selectedComparisonReport = availableComparisonReports.find(r => r.id === comparisonReportId);
      let comparison: { previousPeriodLabel: string; rows: ExcelComparisonRow[] } | undefined;

      if (selectedComparisonReport) {
        const prevByEmployeeId = new Map(selectedComparisonReport.calculated.map(c => [c.employeeId, c]));
        const prevByName = new Map(selectedComparisonReport.calculated.map(c => [c.name, c]));
        const currByEmployeeId = new Map(ledgerRows.map(r => [r.employeeId, r]));

        const allKeys = new Set<string>([
          ...ledgerRows.map(r => r.employeeId),
          ...selectedComparisonReport.calculated.map(c => c.employeeId),
        ]);

        const comparisonRows: ExcelComparisonRow[] = Array.from(allKeys).map(empId => {
          const curr = currByEmployeeId.get(empId);
          const prev = prevByEmployeeId.get(empId) || (curr ? prevByName.get(curr.name) : undefined);
          return {
            name: curr?.name || prev?.name || '알 수 없음',
            position: curr?.position || prev?.position || '-',
            prevGross: prev ? prev.totalGross : null,
            currGross: curr ? curr.totalGross : null,
            prevNet: prev ? prev.netSalary : null,
            currNet: curr ? curr.netSalary : null,
          };
        }).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

        comparison = {
          previousPeriodLabel: format(new Date(selectedComparisonReport.createdAt), 'yyyy.MM.dd'),
          rows: comparisonRows,
        };
      }

      await exportPayrollWorkbook({
        academyName: academyName || '학원',
        periodLabel: getPeriodLabel(),
        generatedAt: new Date(),
        rows: ledgerRows,
        attendanceRows,
        comparison,
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleSaveAndExit = (shouldDownloadJSON: boolean) => {
    const reportCalculations = employees.map(emp => {
      return computeEmployeePayroll(emp);
    });

    const newReport: PayrollReport = {
      id: editReport ? editReport.id : crypto.randomUUID(),
      createdAt: editReport ? editReport.createdAt : new Date().toISOString(),
      academyName,
      employees,
      attendance,
      weeklyHolidayStatus,
      nightWorkStatus,
      proRataDays,
      graceMinutes,
      calculated: reportCalculations
    };

    onSaveReport(newReport);

    const downloadJsonPackage = () => {
      const stamped = stampReportForExport(newReport);
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(stamped, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `급여대장결과패키지_${academyName}_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      markBackupDone();
    };

    if (shouldDownloadJSON) {
      downloadJsonPackage();
    } else {
      // 데이터는 이 브라우저에만 저장되므로, 백업 없이 나가려는 경우 한 번 더 확인합니다.
      const wantsBackup = window.confirm(
        '💾 이 급여대장 데이터는 현재 브라우저에만 저장됩니다.\n' +
        '브라우저 캐시가 삭제되면 복구할 수 없어요.\n\n' +
        '지금 백업 파일(.json)을 다운로드하시겠어요?'
      );
      if (wantsBackup) {
        downloadJsonPackage();
      }
    }

    onBack();
  };

  const renderStep4 = () => {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-[1520px] mx-auto px-4 md:px-8 py-8 space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">세금 및 최종 급여 확인</h2>
            <p className="text-slate-500">지급 수치와 요율 및 공제 방식(3.3%, 4대보험, 커스텀)을 리뷰한 다음 지급 자격 검사를 마무리 하세요.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {availableComparisonReports.length > 0 && (
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
                🔀 전월 대비 비교 시트:
                <select
                  value={comparisonReportId}
                  onChange={(e) => setComparisonReportId(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 bg-white"
                >
                  <option value="">비교 안 함</option>
                  {availableComparisonReports.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.academyName} · {format(new Date(r.createdAt), 'yyyy.MM.dd')} 리포트
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex flex-wrap gap-2.5 justify-end">
              <button onClick={() => setStep(3)} className="px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-200 rounded-xl transition-all h-11 flex items-center">이전</button>
              <button
                onClick={() => setShowAllPayslips(true)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all h-11 flex items-center gap-1.5 shadow-sm shadow-indigo-100 cursor-pointer text-xs"
              >
                <FileText size={15} />
                전직원 명세서 / PDF 일괄저장
              </button>
              <button
                onClick={handleExportExcel}
                disabled={isExportingExcel}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all h-11 flex items-center gap-1.5 shadow-sm shadow-emerald-100 cursor-pointer text-xs"
              >
                <FileSpreadsheet size={15} />
                {isExportingExcel ? '엑셀 생성 중...' : '엑셀(.xlsx) 급여대장 내보내기'}
              </button>
              <button onClick={() => handleSaveAndExit(false)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl transition-all h-11 flex items-center gap-2 text-xs">
                <CheckCircle2 size={16} />
                저장 및 완료
              </button>
              <button onClick={() => handleSaveAndExit(true)} className="btn-3d px-6 py-2 h-11 flex items-center gap-2 text-xs">
                <Download size={16} />
                급여대장 패키지(.json) 내보내기 & 완료
              </button>
            </div>
          </div>
        </div>

        {showAllPayslips && (
          <WageStatementSheet
            allStatements={employees.map(emp => ({ employee: emp, calculated: computeEmployeePayroll(emp) }))}
            academyName={academyName}
            onClose={() => setShowAllPayslips(false)}
          />
        )}

        <div className="grid gap-6">
          {employees.map(emp => {
            const payroll = computeEmployeePayroll(emp);
            const activeTax = employeeTaxOverrides[emp.id] || { taxType: emp.taxType, customTaxRate: emp.customTaxRate || 3.3 };
            const activeAllowances = employeeAllowanceOverrides[emp.id] || {
              position: 0,
              qualification: 0,
              businessPromotion: 0,
              cashier: 0,
              meal: 0,
              other: 0,
              omitted: 0
            };

            return (
              <div key={emp.id} className="glass-card p-8 flex flex-col gap-6 relative overflow-hidden">
                {/* Employee badge header */}
                <div className="flex flex-wrap justify-between items-center gap-4 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-bold text-xl">
                      {emp.name[0]}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">{emp.name} <span className="text-xs text-slate-500 font-normal">{emp.position}</span></h3>
                      <p className="text-xs text-slate-400">주 주민등록 일련 생년정보: {emp.ssn.split('-')[0]}-*******</p>
                    </div>
                  </div>
                  
                  {/* Realtime Tax Selection Controller */}
                  <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                    <span className="text-[11px] font-bold text-slate-500 px-2">정산 세무 방식:</span>
                    <button
                      onClick={() => {
                        setEmployeeTaxOverrides(prev => {
                          const base = prev[emp.id] || { taxType: emp.taxType, customTaxRate: emp.customTaxRate || 3.3 };
                          return {
                            ...prev,
                            [emp.id]: { ...base, taxType: 'FREELANCER' }
                          };
                        });
                      }}
                      className={cn(
                        "px-3 py-1 bg-white text-xs font-black rounded-lg transition-all",
                        activeTax.taxType === 'FREELANCER' ? "bg-purple-600 text-white shadow-md shadow-purple-200" : "bg-transparent text-slate-500"
                      )}
                    >
                      3.3% 프리
                    </button>
                    <button
                      onClick={() => {
                        setEmployeeTaxOverrides(prev => {
                          const base = prev[emp.id] || { taxType: emp.taxType, customTaxRate: emp.customTaxRate || 3.3 };
                          return {
                            ...prev,
                            [emp.id]: { ...base, taxType: 'FOUR_MAJOR' }
                          };
                        });
                      }}
                      className={cn(
                        "px-3 py-1 bg-white text-xs font-black rounded-lg transition-all",
                        activeTax.taxType === 'FOUR_MAJOR' ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "bg-transparent text-slate-500"
                      )}
                    >
                      4대보험
                    </button>
                    <button
                      onClick={() => {
                        setEmployeeTaxOverrides(prev => {
                          const base = prev[emp.id] || { taxType: emp.taxType, customTaxRate: emp.customTaxRate || 3.3 };
                          return {
                            ...prev,
                            [emp.id]: { ...base, taxType: 'CUSTOM' }
                          };
                        });
                      }}
                      className={cn(
                        "px-3 py-1 bg-white text-xs font-black rounded-lg transition-all",
                        activeTax.taxType === 'CUSTOM' ? "bg-amber-600 text-white shadow-md shadow-amber-200" : "bg-transparent text-slate-500"
                      )}
                    >
                      커스텀 %
                    </button>

                    {activeTax.taxType === 'CUSTOM' && (
                      <div className="flex items-center gap-1 pl-1 border-l border-slate-300 ml-1">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={activeTax.customTaxRate}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 0;
                            setEmployeeTaxOverrides(prev => {
                              const base = prev[emp.id] || { taxType: emp.taxType, customTaxRate: emp.customTaxRate || 3.3 };
                              return {
                                ...prev,
                                [emp.id]: { ...base, customTaxRate: val }
                              };
                            });
                          }}
                          className="w-10 text-[11px] font-bold p-0.5 border border-slate-300 rounded text-center bg-white"
                        />
                        <span className="text-[10px] font-bold">%</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Grid content columns */}
                <div className="grid md:grid-cols-3 gap-6">
                  {/* Earnings Calculation summary */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      <Coins className="text-blue-500" size={14} />
                      지급 항목 리스트 (세전)
                    </h4>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">기본근무수당 ({payroll.weeklyHours.toFixed(1)}h)</span>
                        <span className="font-extrabold text-slate-900">{formatCurrency(payroll.baseSalary)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">주휴수당</span>
                        <span className="font-extrabold text-blue-600">+{formatCurrency(payroll.holidayAllowance)}</span>
                      </div>
                      {payroll.nightAllowance !== undefined && payroll.nightAllowance > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">야간근로수당 ({payroll.nightHours.toFixed(1)}h)</span>
                          <span className="font-extrabold text-violet-600">+{formatCurrency(payroll.nightAllowance)}</span>
                        </div>
                      )}
                      
                      {/* Allowances list */}
                      {payroll.allowancesAmount > 0 && (
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 space-y-1 text-xs">
                          {activeAllowances.position ? (
                            <div className="flex justify-between text-slate-600">
                              <span>직책수당:</span>
                              <span className="font-bold">+{formatCurrency(activeAllowances.position)}</span>
                            </div>
                          ) : null}
                          {activeAllowances.qualification ? (
                            <div className="flex justify-between text-slate-600">
                              <span>자격수당:</span>
                              <span className="font-bold">+{formatCurrency(activeAllowances.qualification)}</span>
                            </div>
                          ) : null}
                          {activeAllowances.businessPromotion ? (
                            <div className="flex justify-between text-slate-600">
                              <span>업무추진비:</span>
                              <span className="font-bold">+{formatCurrency(activeAllowances.businessPromotion)}</span>
                            </div>
                          ) : null}
                          {activeAllowances.cashier ? (
                            <div className="flex justify-between text-slate-600">
                              <span>출납수당:</span>
                              <span className="font-bold">+{formatCurrency(activeAllowances.cashier)}</span>
                            </div>
                          ) : null}
                          {activeAllowances.meal ? (
                            <div className="flex justify-between text-slate-600">
                              <span>식대(비과세):</span>
                              <span className="font-bold text-green-600">+{formatCurrency(activeAllowances.meal)}</span>
                            </div>
                          ) : null}
                          {activeAllowances.other ? (
                            <div className="flex justify-between text-slate-600">
                              <span>기타수당:</span>
                              <span className="font-bold">+{formatCurrency(activeAllowances.other)}</span>
                            </div>
                          ) : null}
                          {activeAllowances.omitted ? (
                            <div className="flex justify-between text-slate-600 text-red-500">
                              <span>수기 누락금:</span>
                              <span className="font-bold">+{formatCurrency(activeAllowances.omitted)}</span>
                            </div>
                          ) : null}
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-100 flex justify-between font-extrabold text-slate-900 text-base">
                        <span>세전 수령총액</span>
                        <span>{formatCurrency(payroll.totalGross)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Deductions breakdown */}
                  <div className="bg-slate-50 rounded-2xl p-6 space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">원천 징수 공제액 (Deductions)</h4>
                    {Object.entries(payroll.deductions).map(([name, amount]) => (
                      <div key={name} className="flex justify-between text-xs">
                        <span className="text-slate-600 font-semibold">{name}</span>
                        <span className="text-red-500 font-bold">-{formatCurrency(amount as number)}</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-slate-200 flex justify-between font-extrabold text-red-600 text-sm">
                      <span>공제 합계액</span>
                      <span>-{formatCurrency(payroll.totalDeduction)}</span>
                    </div>
                  </div>

                  {/* Interactive Allowance Editing Fields & Wage button */}
                  <div className="flex flex-col justify-between items-center md:items-end text-center md:text-right space-y-4">
                    <div className="space-y-1">
                      <p className="text-xs font-extrabold text-slate-400 uppercase">예상 매월 실수령액</p>
                      <p className="text-3xl font-black text-slate-950 tracking-tight">{formatCurrency(payroll.netSalary)}</p>
                    </div>

                    <div className="w-full space-y-2">
                      <button
                        onClick={() => setActivePayslipEmpId(emp.id)}
                        className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 transition-all shadow-sm"
                      >
                        <FileText size={14} className="text-blue-600" />
                        임금명세서 인쇄 및 PDF 저장
                      </button>
                    </div>
                  </div>
                </div>

                {/* Inline allowance editor drawer */}
                <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 mt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">이 직원만 당일 수당 수작업 조정 및 수기 지급</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 block">직책수당</span>
                      <input
                        type="number"
                        value={activeAllowances.position || 0}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setEmployeeAllowanceOverrides(prev => ({
                            ...prev,
                            [emp.id]: { ...activeAllowances, position: val }
                          }));
                        }}
                        className="w-full px-2 py-1 bg-white text-xs font-bold text-slate-800 rounded border border-slate-200 text-right"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 block">자격수당</span>
                      <input
                        type="number"
                        value={activeAllowances.qualification || 0}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setEmployeeAllowanceOverrides(prev => ({
                            ...prev,
                            [emp.id]: { ...activeAllowances, qualification: val }
                          }));
                        }}
                        className="w-full px-2 py-1 bg-white text-xs font-bold text-slate-800 rounded border border-slate-200 text-right"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 block">업무추진비</span>
                      <input
                        type="number"
                        value={activeAllowances.businessPromotion || 0}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setEmployeeAllowanceOverrides(prev => ({
                            ...prev,
                            [emp.id]: { ...activeAllowances, businessPromotion: val }
                          }));
                        }}
                        className="w-full px-2 py-1 bg-white text-xs font-bold text-slate-800 rounded border border-slate-200 text-right"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 block">출납수당</span>
                      <input
                        type="number"
                        value={activeAllowances.cashier || 0}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setEmployeeAllowanceOverrides(prev => ({
                            ...prev,
                            [emp.id]: { ...activeAllowances, cashier: val }
                          }));
                        }}
                        className="w-full px-2 py-1 bg-white text-xs font-bold text-slate-800 rounded border border-slate-200 text-right"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 block text-green-600 font-bold">식대(비과세)</span>
                      <input
                        type="number"
                        value={activeAllowances.meal || 0}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setEmployeeAllowanceOverrides(prev => ({
                            ...prev,
                            [emp.id]: { ...activeAllowances, meal: val }
                          }));
                        }}
                        className="w-full px-2 py-1 bg-white text-xs font-bold text-slate-800 rounded border border-slate-200 text-right"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 block">수당(기타)</span>
                      <input
                        type="number"
                        value={activeAllowances.other || 0}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setEmployeeAllowanceOverrides(prev => ({
                            ...prev,
                            [emp.id]: { ...activeAllowances, other: val }
                          }));
                        }}
                        className="w-full px-2 py-1 bg-white text-xs font-bold text-slate-800 rounded border border-slate-200 text-right"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-red-500 block font-bold">기 누락금</span>
                      <input
                        type="number"
                        value={activeAllowances.omitted || 0}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setEmployeeAllowanceOverrides(prev => ({
                            ...prev,
                            [emp.id]: { ...activeAllowances, omitted: val }
                          }));
                        }}
                        className="w-full px-2 py-1 bg-white text-xs font-bold text-slate-800 rounded border border-slate-200 text-right"
                      />
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-[1520px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <ChevronLeft size={24} className="text-slate-600" />
            </button>
            <span className="font-bold text-slate-900">급여 생성 마법사</span>
          </div>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map(s => (
              <div 
                key={s} 
                className={cn(
                  "w-8 h-1 rounded-full transition-all duration-500",
                  step >= s ? "bg-blue-600" : "bg-slate-200"
                )}
              />
            ))}
          </div>
        </div>
      </nav>

      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}

      {/* Wage Statement Popup Sheet */}
      {activePayslipEmpId && (() => {
        const emp = employees.find(e => e.id === activePayslipEmpId);
        if (!emp) return null;
        const computed = computeEmployeePayroll(emp);
        return (
          <WageStatementSheet
            employee={emp}
            calculated={computed}
            academyName={academyName}
            onClose={() => setActivePayslipEmpId(null)}
          />
        );
      })()}
    </div>
  );
}

