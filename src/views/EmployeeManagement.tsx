import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Edit2, Save, X, UserPlus, Calendar, Clock, CreditCard, Users, Download, Upload, Check, Building2, AlertCircle, Bell, FileText, Printer } from 'lucide-react';
import { Employee, DayOfWeek } from '../types';
import { DAYS_OF_WEEK, WORK_DAYS } from '../constants';
import { cn } from '../lib/utils';
import { safeParseJSON, validateEmployeeBackupPayload, wrapEmployeeBackupForExport, markBackupDone } from '../lib/dataValidation';

interface EmployeeManagementProps {
  employees: Employee[];
  onAddEmployee: (employee: Employee) => void;
  onUpdateEmployee?: (employee: Employee) => void;
  onDeleteEmployee: (id: string) => void;
  onBack: () => void;
  onImportEmployees: (employees: Employee[]) => void;
}

export default function EmployeeManagement({ employees, onAddEmployee, onUpdateEmployee, onDeleteEmployee, onBack, onImportEmployees }: EmployeeManagementProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [successMsg, setSuccessMsg] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newEmployee, setNewEmployee] = useState<Partial<Employee>>({
    name: '',
    position: '조교',
    ssn: '',
    hourlyWage: 10030, // 2025 최저시급 기준
    weeklyHoliday: '일',
    hireDate: new Date().toISOString().split('T')[0],
    payday: 10,
    bankName: '',
    bankAccount: '',
    taxType: 'FREELANCER',
    customTaxRate: 3.3,
    allowances: {
      position: 0,
      qualification: 0,
      businessPromotion: 0,
      cashier: 0,
      meal: 0,
      other: 0,
      omitted: 0,
    },
    standardWorkHours: {
      '월': { start: '14:00', end: '22:00' },
      '화': { start: '14:00', end: '22:00' },
      '수': { start: '14:00', end: '22:00' },
      '목': { start: '14:05', end: '22:00' }, // standard defaults
      '금': { start: '14:00', end: '22:00' },
    }
  });

  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupTarget, setBackupTarget] = useState<'all' | 'selected'>('all');
  const [selectedBackupIds, setSelectedBackupIds] = useState<Record<string, boolean>>({});

  // Resignation Notification & Mutual Contract Dissolution States
  const [editingResignationEmpId, setEditingResignationEmpId] = useState<string | null>(null);
  const [resignationNoticeDate, setResignationNoticeDate] = useState('');
  const [resignationTargetDate, setResignationTargetDate] = useState('');
  const [printResignationEmpId, setPrintResignationEmpId] = useState<string | null>(null);
  const [resignationReason, setResignationReason] = useState('개인 사정 및 학업 전념');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEmployee.name && newEmployee.ssn) {
      onAddEmployee({
        ...newEmployee,
        id: crypto.randomUUID(),
      } as Employee);
      setIsAdding(false);
      setNewEmployee({
        name: '',
        position: '조교',
        ssn: '',
        hourlyWage: 10030,
        weeklyHoliday: '일',
        hireDate: new Date().toISOString().split('T')[0],
        payday: 10,
        bankName: '',
        bankAccount: '',
        taxType: 'FREELANCER',
        customTaxRate: 3.3,
        allowances: {
          position: 0,
          qualification: 0,
          businessPromotion: 0,
          cashier: 0,
          meal: 0,
          other: 0,
          omitted: 0,
        },
        standardWorkHours: {
          '월': { start: '14:00', end: '22:00' },
          '화': { start: '14:00', end: '22:00' },
          '수': { start: '14:00', end: '22:00' },
          '목': { start: '14:00', end: '22:00' },
          '금': { start: '14:00', end: '22:00' },
        }
      });
    }
  };

  const handleSaveResignation = (empId: string) => {
    const emp = employees.find(e => e.id === empId);
    if (!emp || !onUpdateEmployee) return;

    onUpdateEmployee({
      ...emp,
      resignationNoticeDate: resignationNoticeDate || undefined,
      resignationTargetDate: resignationTargetDate || undefined,
    });
    setEditingResignationEmpId(null);
  };

  const handleCancelResignation = (empId: string) => {
    const emp = employees.find(e => e.id === empId);
    if (!emp || !onUpdateEmployee) return;

    onUpdateEmployee({
      ...emp,
      resignationNoticeDate: undefined,
      resignationTargetDate: undefined,
    });
  };

  const openBackupModal = () => {
    if (employees.length === 0) {
      alert("백업할 조교 데이터가 없습니다. 먼저 조교를 등록해주세요!");
      return;
    }
    const initialMap: Record<string, boolean> = {};
    employees.forEach(emp => {
      initialMap[emp.id] = true;
    });
    setSelectedBackupIds(initialMap);
    setBackupTarget('all');
    setShowBackupModal(true);
  };

  const handleExport = () => {
    const listToExport = backupTarget === 'all'
      ? employees
      : employees.filter(emp => selectedBackupIds[emp.id]);

    if (listToExport.length === 0) {
      alert("선택된 조교가 없습니다. 최소 한 명 이상의 조교를 선택해주세요.");
      return;
    }

    const backupPayload = wrapEmployeeBackupForExport(listToExport);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupPayload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `조교급여대장_백업_${backupTarget === 'all' ? '전체' : '선택'}_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    markBackupDone();
    setShowBackupModal(false);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const parseResult = safeParseJSON(evt.target?.result as string);
      if (!parseResult.ok) {
        alert(`❌ 파일을 열 수 없습니다\n\n${parseResult.error}`);
        return;
      }

      const validation = validateEmployeeBackupPayload(parseResult.data);
      if (!validation.valid) {
        alert(`❌ 올바르지 않은 백업 파일입니다\n\n${validation.errors.map(e => `· ${e}`).join('\n')}\n\n조교 관리 화면에서 내보낸 .json 백업 파일이 맞는지 확인해주세요.`);
        return;
      }

      onImportEmployees(validation.data!);
      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 3000);

      if (validation.warnings && validation.warnings.length > 0) {
        alert(`✅ 불러오기 완료 (${validation.data!.length}명)\n\n참고사항:\n${validation.warnings.map(w => `· ${w}`).join('\n')}`);
      }
    };
    reader.onerror = () => {
      alert('❌ 파일을 읽는 중 문제가 발생했습니다. 파일이 손상되었을 수 있습니다. 다시 시도해주세요.');
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 relative">
      {/* 백업 옵션 선택 모달 */}
      <AnimatePresence>
        {showBackupModal && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="space-y-1">
                  <span className="px-2.5 py-0.5 bg-blue-600 font-extrabold rounded text-[10px] uppercase tracking-wide">BACKUP RANGE</span>
                  <h3 className="text-xl font-black">조교 데이터 백업</h3>
                </div>
                <button
                  onClick={() => setShowBackupModal(false)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-705 text-slate-300 hover:text-white rounded-lg transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                <div className="space-y-3">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-wider block">백업 대상 범위 설정</span>
                  
                  {/* Two Main Options */}
                  <div className="grid grid-cols-1 gap-3">
                    <button
                      type="button"
                      onClick={() => setBackupTarget('all')}
                      className={cn(
                        "w-full text-left p-4 rounded-xl border-2 transition-all flex items-start gap-3 cursor-pointer",
                        backupTarget === 'all'
                          ? "bg-blue-50/50 border-blue-600 shadow-xs"
                          : "bg-white border-slate-100 hover:border-slate-300"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-full border flex items-center justify-center mt-0.5",
                        backupTarget === 'all' ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"
                      )}>
                        {backupTarget === 'all' && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-extrabold text-slate-800 block text-sm">전체 조교 백업</span>
                        <span className="text-xs text-slate-500 mt-1 block">현재 등록된 모든 조교(총 {employees.length}명)의 마스터 데이터를 전면 백업합니다.</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setBackupTarget('selected')}
                      className={cn(
                        "w-full text-left p-4 rounded-xl border-2 transition-all flex items-start gap-3 cursor-pointer",
                        backupTarget === 'selected'
                          ? "bg-blue-50/50 border-blue-600 shadow-xs"
                          : "bg-white border-slate-100 hover:border-slate-300"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-full border flex items-center justify-center mt-0.5",
                        backupTarget === 'selected' ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"
                      )}>
                        {backupTarget === 'selected' && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-extrabold text-slate-800 block text-sm">특정 조교 선택 백업</span>
                        <span className="text-xs text-slate-500 mt-1 block">필요한 조교원만 아래의 리스트에서 개별 체크하여 선택 백업을 구성합니다.</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Checklist shown when backupTarget === 'selected' */}
                <AnimatePresence>
                  {backupTarget === 'selected' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3 overflow-hidden"
                    >
                      <div className="flex justify-between items-center px-1">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-wider block">인원 선택 목록</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const updated: Record<string, boolean> = {};
                              employees.forEach(e => updated[e.id] = true);
                              setSelectedBackupIds(updated);
                            }}
                            className="text-[10px] font-black text-blue-600 hover:underline cursor-pointer"
                          >
                            전체 선택
                          </button>
                          <span className="text-slate-300 text-[10px]">|</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated: Record<string, boolean> = {};
                              employees.forEach(e => updated[e.id] = false);
                              setSelectedBackupIds(updated);
                            }}
                            className="text-[10px] font-black text-rose-500 hover:underline cursor-pointer"
                          >
                            전체 해제
                          </button>
                        </div>
                      </div>

                      <div className="border border-slate-150 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-150 bg-slate-50">
                        {employees.map(emp => {
                          const isChecked = !!selectedBackupIds[emp.id];
                          return (
                            <label
                              key={emp.id}
                              className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-slate-100/70 transition-colors select-none"
                            >
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    setSelectedBackupIds(prev => ({
                                      ...prev,
                                      [emp.id]: !isChecked
                                    }));
                                  }}
                                  className="rounded text-blue-600 focus:ring-blue-500 border-slate-300 h-4 w-4"
                                />
                                <div className="text-xs">
                                  <span className="font-extrabold text-slate-800">{emp.name}</span>
                                  <span className="text-slate-400 font-medium ml-1.5 bg-slate-100 border border-slate-200 text-[10px] px-1 py-0.5 rounded">{emp.position}</span>
                                </div>
                              </div>
                              <span className="font-mono text-[10px] text-slate-400 font-semibold">{emp.ssn.split('-')[0]}-*******</span>
                            </label>
                          );
                        })}
                      </div>
                      
                      <span className="text-[11px] text-slate-500 block px-1">
                        총 선택인원 : <strong className="text-blue-600 font-black">{employees.filter(e => selectedBackupIds[e.id]).length}명</strong> / {employees.length}명
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom Footer Actions */}
              <div className="p-4 bg-slate-50 border-t border-slate-150 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowBackupModal(false)}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={backupTarget === 'selected' && employees.filter(e => selectedBackupIds[e.id]).length === 0}
                  className={cn(
                    "px-5 py-2 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer",
                    backupTarget === 'selected' && employees.filter(e => selectedBackupIds[e.id]).length === 0
                      ? "bg-slate-300 cursor-not-allowed text-slate-400 border border-slate-200"
                      : "bg-blue-600 hover:bg-blue-700 active:scale-95"
                  )}
                >
                  <Download size={13} />
                  내보내기 실행
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 font-black tracking-tight">조교 정보 관리</h1>
          <p className="text-slate-500">학원에 소속된 조교들의 정보를 등록하고 관리하세요.</p>
        </div>
        <div className="flex gap-4">
          <button onClick={onBack} className="px-6 py-2 font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer">
            뒤로가기
          </button>
          <button
            onClick={() => setIsAdding(true)}
            className="btn-3d px-6 py-2"
          >
            <UserPlus className="w-5 h-5 mr-2" />
            조교 추가
          </button>
        </div>
      </div>

      {/* Backup & Import Session Section */}
      <div className="bg-slate-50 border border-slate-150 rounded-2xl p-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Users size={18} className="text-blue-600" />
            직원 데이터 가져오기 & 백업 내보내기
          </h3>
          <p className="text-xs text-slate-500">
            기기가 바뀌거나 데이터를 보관하고 싶을 때 조교 리스트를 안전하게 가져오거나 백업 파일(.json)로 저장할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={openBackupModal}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-800 text-sm font-bold border border-slate-200 rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <Download size={14} className="text-slate-600" />
            직원 데이터 백업
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl transition-all shadow-md cursor-pointer"
          >
            <Upload size={14} className="text-emerald-400" />
            백업 파일 가져오기
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            accept=".json"
            className="hidden"
          />
          <AnimatePresence>
            {successMsg && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl flex items-center gap-1"
              >
                <Check size={12} />
                데이터 복원 성공!
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Resignation Registry & Termination Advance Notice Alert Engine Dashboard */}
      {(() => {
        const resigningEmployees = employees.filter(e => e.resignationTargetDate);
        const getDaysDiff = (d1Str: string, d2Str: string) => {
          try {
            const d1 = new Date(d1Str);
            const d2 = new Date(d2Str);
            const diffTime = d2.getTime() - d1.getTime();
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          } catch(e) {
            return 0;
          }
        };

        const today = "2026-06-08";

        return (
          <div className="mb-8">
            {resigningEmployees.length === 0 ? (
              <div className="bg-white border border-slate-150 rounded-2xl p-5 flex items-center justify-between gap-4 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 text-slate-400 rounded-xl">
                    <Bell size={20} className="text-slate-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800">사직 대기 및 퇴사 통보 조교 없음</h4>
                    <p className="text-[11px] text-slate-400 font-semibold">현재 근로계약 해지 예정인 조교가 없으며, 정규 학원 보조 인력이 안정적으로 확보되어 있습니다.</p>
                  </div>
                </div>
                <span className="text-[10px] uppercase font-black tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full leading-none hidden sm:inline-block">
                  STAFFING SECURED
                </span>
              </div>
            ) : (
              <div className="bg-orange-50/40 border-2 border-orange-200 p-6 rounded-2xl shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                      <Bell size={18} className="text-orange-500 animate-bounce" />
                      조교 사직 의사 등록 및 계약 해지 기한 알리미
                    </h3>
                    <p className="text-xs text-slate-600 font-semibold">
                      근로기준법 제26조(사전 30일 해공예고/해약통무의무) 기준 및 인수계획 완수 여부를 실시간으로 판별해 알립니다. (기준일자: {today})
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-orange-600 text-white font-black rounded text-[10px] uppercase tracking-wider">
                    {resigningEmployees.length}건 진행중
                  </span>
                </div>

                <div className="grid gap-3">
                  {resigningEmployees.map(emp => {
                    const TargetExit = emp.resignationTargetDate || '';
                    const NoticeDate = emp.resignationNoticeDate || '';
                    const daysToExit = getDaysDiff(today, TargetExit);
                    const noticePeriod = getDaysDiff(NoticeDate, TargetExit);
                    const isLawCompliant = noticePeriod >= 30;

                    let ddayLabel = "";
                    let ddayClass = "";
                    if (daysToExit > 0) {
                      ddayLabel = `사직 종료까지 D-${daysToExit}일`;
                      ddayClass = daysToExit < 15 ? "text-red-700 bg-red-100/80 animate-pulse border-red-200" : "text-orange-800 bg-orange-100 border-orange-200";
                    } else if (daysToExit === 0) {
                      ddayLabel = "오늘 자 계약합의 종료 지정일";
                      ddayClass = "text-red-100 bg-red-650 border-red-700 font-extrabold";
                    } else {
                      ddayLabel = `사직 처리 완료 (${Math.abs(daysToExit)}일 경과)`;
                      ddayClass = "text-slate-500 bg-slate-100 border-slate-200";
                    }

                    return (
                      <div key={emp.id} className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs hover:border-orange-300 transition-colors">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2.5">
                            <span className="font-black text-slate-800 text-sm leading-none">{emp.name}</span>
                            <span className="text-[10px] bg-slate-100 text-slate-650 px-2 py-0.5 rounded font-bold">{emp.position}</span>
                            <span className={cn("text-[9px] font-black px-2 py-0.5 rounded border leading-none", ddayClass)}>
                              {ddayLabel}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span>의사통보 표명일: <strong className="text-slate-700 font-bold">{NoticeDate}</strong></span>
                            <span className="text-slate-350">|</span>
                            <span>근로 예정 종료일: <strong className="text-slate-700 font-bold">{TargetExit}</strong></span>
                          </div>

                          {/* Law Compliance Badge */}
                          <div className="flex items-center gap-2">
                            {isLawCompliant ? (
                              <div className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-150 px-2.5 py-1 rounded-lg flex items-center gap-1 leading-none">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                30일 사전통지 요건 완수함 (합의 간격: {noticePeriod}일) - 법적 공제/정합성 안전구역
                              </div>
                            ) : (
                              <div className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-150 px-2.5 py-1 rounded-lg flex items-center gap-1 leading-none">
                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                                30일 사전통보 미달 (합의 간격: {noticePeriod}일) - 고용주 추가 해고예고 관련 및 빠른 보조인력 승계 권장!
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <button
                            onClick={() => {
                              setPrintResignationEmpId(emp.id);
                              setResignationReason('개인 사정 및 학업 전념');
                            }}
                            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <FileText size={12} className="text-orange-400" />
                            사직서/계약종료합의서 출력
                          </button>
                          <button
                            onClick={() => handleCancelResignation(emp.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-150 hover:border-red-200 rounded-lg transition-all cursor-pointer"
                            title="등록 취소"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="glass-card p-8 mb-8 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-2 h-full bg-blue-600"></div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">이름</label>
                  <input
                    required
                    type="text"
                    value={newEmployee.name}
                    onChange={e => setNewEmployee({ ...newEmployee, name: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="홍길동"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">직급</label>
                  <input
                    required
                    type="text"
                    value={newEmployee.position}
                    onChange={e => setNewEmployee({ ...newEmployee, position: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="조교 / 팀장"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">주민등록번호</label>
                  <input
                    required
                    type="text"
                    value={newEmployee.ssn}
                    onChange={e => setNewEmployee({ ...newEmployee, ssn: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="000000-0000000"
                  />
                </div>
              </div>

              {/* 은행 및 계좌 정보 입력 (신규 추가) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <Building2 size={15} className="text-slate-400" />
                    정산 계좌 은행명 (선택)
                  </label>
                  <input
                    type="text"
                    value={newEmployee.bankName || ''}
                    onChange={e => setNewEmployee({ ...newEmployee, bankName: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                    placeholder="예: 국민은행, 신한은행, 카카오뱅크"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <CreditCard size={15} className="text-slate-400" />
                    정산 계좌번호 (선택)
                  </label>
                  <input
                    type="text"
                    value={newEmployee.bankAccount || ''}
                    onChange={e => setNewEmployee({ ...newEmployee, bankAccount: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                    placeholder="예: 123-456-789012"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">시급 (원)</label>
                  <input
                    required
                    type="number"
                    value={newEmployee.hourlyWage}
                    onChange={e => setNewEmployee({ ...newEmployee, hourlyWage: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">주휴일</label>
                  <select
                    value={newEmployee.weeklyHoliday}
                    onChange={e => setNewEmployee({ ...newEmployee, weeklyHoliday: e.target.value as DayOfWeek })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  >
                    {DAYS_OF_WEEK.map(day => (
                      <option key={day} value={day}>{day}요일</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">입사일</label>
                  <input
                    required
                    type="date"
                    value={newEmployee.hireDate}
                    onChange={e => setNewEmployee({ ...newEmployee, hireDate: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">급여지급일 (매달)</label>
                  <input
                    required
                    type="number"
                    min="1"
                    max="31"
                    value={newEmployee.payday}
                    onChange={e => setNewEmployee({ ...newEmployee, payday: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Advanced tax and default/fixed allowances settings */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-1">
                    <CreditCard size={18} className="text-blue-600" />
                    급여 공제(세금) 및 고정 수당 기본값 설정
                  </h3>
                  <p className="text-xs text-slate-500">정산 시 매월 자동으로 기본 반영될 세금 유형과 수당 값들을 미리 설정해 둘 수 있습니다.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">기본 세금 유형</label>
                    <select
                      value={newEmployee.taxType}
                      onChange={e => setNewEmployee({ ...newEmployee, taxType: e.target.value as any })}
                      className="w-full px-4 py-2 bg-white rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-slate-800"
                    >
                      <option value="FREELANCER">3.3% 프리랜서 사업소득세</option>
                      <option value="FOUR_MAJOR">4대 보험 세율 규정 계산</option>
                      <option value="CUSTOM">커스텀 임의 요율 설정 (%)</option>
                    </select>
                  </div>

                  {newEmployee.taxType === 'CUSTOM' && (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">커스텀 원천징수 요율 (%)</label>
                      <input
                        required
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={newEmployee.customTaxRate || 3.3}
                        onChange={e => setNewEmployee({ ...newEmployee, customTaxRate: parseFloat(e.target.value) })}
                        className="w-full px-4 py-2 bg-white rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold"
                        placeholder="예: 5.5"
                      />
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200/60 pt-4">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-4">고정 매월 수당 (원화)</span>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 block">직책수당</label>
                      <input
                        type="number"
                        value={newEmployee.allowances?.position || 0}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setNewEmployee(prev => ({
                            ...prev,
                            allowances: { ...prev.allowances, position: val }
                          }));
                        }}
                        className="w-full px-3 py-1.5 bg-white text-xs font-semibold text-slate-800 rounded-lg border border-slate-200"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 block">자격수당</label>
                      <input
                        type="number"
                        value={newEmployee.allowances?.qualification || 0}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setNewEmployee(prev => ({
                            ...prev,
                            allowances: { ...prev.allowances, qualification: val }
                          }));
                        }}
                        className="w-full px-3 py-1.5 bg-white text-xs font-semibold text-slate-800 rounded-lg border border-slate-200"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 block">업무추진비</label>
                      <input
                        type="number"
                        value={newEmployee.allowances?.businessPromotion || 0}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setNewEmployee(prev => ({
                            ...prev,
                            allowances: { ...prev.allowances, businessPromotion: val }
                          }));
                        }}
                        className="w-full px-3 py-1.5 bg-white text-xs font-semibold text-slate-800 rounded-lg border border-slate-200"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 block">출납수당</label>
                      <input
                        type="number"
                        value={newEmployee.allowances?.cashier || 0}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setNewEmployee(prev => ({
                            ...prev,
                            allowances: { ...prev.allowances, cashier: val }
                          }));
                        }}
                        className="w-full px-3 py-1.5 bg-white text-xs font-semibold text-slate-800 rounded-lg border border-slate-200"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 block">식대(비과세)</label>
                      <input
                        type="number"
                        value={newEmployee.allowances?.meal || 0}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setNewEmployee(prev => ({
                            ...prev,
                            allowances: { ...prev.allowances, meal: val }
                          }));
                        }}
                        className="w-full px-3 py-1.5 bg-white text-xs font-semibold text-slate-800 rounded-lg border border-slate-200"
                        placeholder="최대 20만원 비과세"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 block">기타수당</label>
                      <input
                        type="number"
                        value={newEmployee.allowances?.other || 0}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setNewEmployee(prev => ({
                            ...prev,
                            allowances: { ...prev.allowances, other: val }
                          }));
                        }}
                        className="w-full px-3 py-1.5 bg-white text-xs font-semibold text-slate-800 rounded-lg border border-slate-200"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 block text-red-500">기존누락분</label>
                      <input
                        type="number"
                        value={newEmployee.allowances?.omitted || 0}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setNewEmployee(prev => ({
                            ...prev,
                            allowances: { ...prev.allowances, omitted: val }
                          }));
                        }}
                        className="w-full px-3 py-1.5 bg-white text-xs font-semibold text-slate-800 rounded-lg border border-slate-200"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">

                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Clock size={18} className="text-blue-600" />
                  표준 근무 시간 설정 (월~금)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                  {WORK_DAYS.map(day => (
                    <div key={day} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="text-sm font-bold text-slate-600 mb-2">{day}요일</div>
                      <div className="space-y-2">
                        <input
                          type="time"
                          value={newEmployee.standardWorkHours?.[day]?.start}
                          onChange={e => {
                            const hours = { ...newEmployee.standardWorkHours };
                            hours[day] = { ...hours[day]!, start: e.target.value };
                            setNewEmployee({ ...newEmployee, standardWorkHours: hours });
                          }}
                          className="w-full text-xs px-2 py-1 rounded border border-slate-200"
                        />
                        <input
                          type="time"
                          value={newEmployee.standardWorkHours?.[day]?.end}
                          onChange={e => {
                            const hours = { ...newEmployee.standardWorkHours };
                            hours[day] = { ...hours[day]!, end: e.target.value };
                            setNewEmployee({ ...newEmployee, standardWorkHours: hours });
                          }}
                          className="w-full text-xs px-2 py-1 rounded border border-slate-200"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-6 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-8 py-2 bg-blue-600 text-white font-bold rounded-lg shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"
                >
                  저장하기
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-4">
        {employees.length === 0 ? (
          <div className="text-center py-20 glass-card">
            <Users size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium">등록된 조교가 없습니다. 새로운 조교를 추가해보세요!</p>
          </div>
        ) : (
          employees.map(emp => (
            <motion.div
              layout
              key={emp.id}
              className="glass-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-blue-200 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xl">
                  {emp.name[0]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">{emp.name}</h3>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-bold rounded">
                      {emp.position}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">{emp.ssn.split('-')[0]}-*******</p>
                  {emp.bankName && (
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-slate-100/80 border border-slate-200/50 rounded-lg px-2.5 py-1 mt-1.5 inline-flex w-fit">
                      <Building2 size={11} className="text-slate-500" />
                      <span>{emp.bankName}</span>
                      <span className="text-slate-300">|</span>
                      <span className="font-mono text-[10px] text-slate-500">{emp.bankAccount}</span>
                    </div>
                  )}

                  {emp.resignationTargetDate && (
                    <div className="mt-2.5 p-2 bg-orange-50 border border-orange-200/60 rounded-xl text-[11px] text-orange-850 font-bold flex flex-col gap-1 w-full max-w-sm">
                      <div className="flex items-center gap-1.5">
                        <AlertCircle size={13} className="text-orange-500 animate-pulse" />
                        <span>사직 확정: <strong className="text-orange-950 font-black">{emp.resignationTargetDate}</strong> 예정</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold pl-4.5 flex justify-between items-center gap-3">
                        <span>의사통보: {emp.resignationNoticeDate}</span>
                        <button
                          onClick={() => {
                            setPrintResignationEmpId(emp.id);
                            setResignationReason('개인 사정 및 학업 전념');
                          }}
                          className="px-2 py-0.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-[10px] font-black transition-all cursor-pointer"
                        >
                          사직서 양식 생성
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">시급</p>
                  <p className="font-bold text-slate-700">{emp.hourlyWage.toLocaleString()}원</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">세금유형</p>
                  <p className="font-bold text-blue-600 text-sm">
                    {emp.taxType === 'FREELANCER' ? '3.3% 프리랜서' : emp.taxType === 'CUSTOM' ? `커스텀 (${emp.customTaxRate || 3.3}%)` : '4대보험'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">입사일</p>
                  <p className="font-bold text-slate-700 text-sm">{emp.hireDate}</p>
                </div>
                <div className="hidden lg:block">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">지급일</p>
                  <p className="font-bold text-slate-700 text-sm">매달 {emp.payday}일</p>
                </div>
              </div>

              <div className="flex gap-2">
                {emp.resignationTargetDate ? (
                  <button
                    onClick={() => handleCancelResignation(emp.id)}
                    className="p-2 text-orange-600 hover:text-orange-850 hover:bg-orange-50 rounded-lg transition-all flex items-center justify-center cursor-pointer"
                    title="사직 의사 철회"
                  >
                    <Bell size={18} className="text-orange-500 hover:scale-105 transition-transform" />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setEditingResignationEmpId(emp.id);
                      setResignationNoticeDate(new Date().toISOString().split('T')[0]);
                      setResignationTargetDate('');
                    }}
                    className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-55 rounded-lg transition-all flex items-center justify-center cursor-pointer"
                    title="사직 의사 등록"
                  >
                    <Bell size={18} />
                  </button>
                )}
                <button
                  onClick={() => onDeleteEmployee(emp.id)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* 1. Resignation Notice Registration Modal Overlay */}
      <AnimatePresence>
        {editingResignationEmpId && (() => {
          const emp = employees.find(e => e.id === editingResignationEmpId);
          if (!emp) return null;

          const getDaysDiff = (d1Str: string, d2Str: string) => {
            try {
              const d1 = new Date(d1Str);
              const d2 = new Date(d2Str);
              const diffTime = d2.getTime() - d1.getTime();
              return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            } catch(e) {
              return 0;
            }
          };

          const diffVal = resignationNoticeDate && resignationTargetDate 
            ? getDaysDiff(resignationNoticeDate, resignationTargetDate) 
            : 0;
          const isCompliant = diffVal >= 30;

          return (
            <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
              >
                <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
                  <div className="space-y-1">
                    <span className="px-2 py-0.5 bg-orange-600 font-black rounded text-[9px] uppercase tracking-wider">RESIGNATION MANAGER</span>
                    <h3 className="text-lg font-black">{emp.name} 조교 사직 일정 감시 등록</h3>
                  </div>
                  <button
                    onClick={() => setEditingResignationEmpId(null)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-lg transition-all cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  <div className="space-y-3.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 block">사직(퇴사) 의사 최초 전달일</label>
                      <input
                        type="date"
                        value={resignationNoticeDate}
                        onChange={(e) => setResignationNoticeDate(e.target.value)}
                        className="w-full text-xs font-semibold p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 block">최종 근로 및 계약 합의 해지일 (종료 예정일)</label>
                      <input
                        type="date"
                        value={resignationTargetDate}
                        onChange={(e) => setResignationTargetDate(e.target.value)}
                        className="w-full text-xs font-semibold p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                  </div>

                  {resignationNoticeDate && resignationTargetDate ? (
                    <div className="p-4 rounded-xl border space-y-2.5">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-slate-500">사전 통보 여유 기한</span>
                        <span className={cn("text-sm font-black font-mono px-2 py-0.5 rounded", isCompliant ? "text-emerald-700 bg-emerald-100" : "text-rose-700 bg-rose-100")}>
                          {diffVal}일 간격
                        </span>
                      </div>

                      {isCompliant ? (
                        <p className="text-[10px] text-emerald-800 font-bold bg-emerald-50/50 p-2 rounded-lg border border-emerald-150 leading-normal">
                          ✓ 근로기준법상 해고/해약의 사전 30일 통보의무 규정에 충족되어 법정 리스크가 없으며, 정규 후임 조교를 선발하고 인수인계를 진행하기에 충분한 안전 구역입니다.
                        </p>
                      ) : (
                        <p className="text-[10px] text-rose-800 font-bold bg-rose-50/50 p-2 rounded-lg border border-rose-150 leading-normal">
                          ⚠ 30일 기준을 준수하지 못했습니다. 상호 합의에 의한 사직이 아닐 경우 잔여 근태 처리에 주의해야 합니다. 업무 인계 공백을 막을 후임자 즉각 배치가 강력히 조언됩니다.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-400 font-semibold">
                      날짜 정보를 모두 등록하시면 30일 법정 통보 요건 검증이 개시됩니다.
                    </div>
                  )}
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-150 flex justify-end gap-3.5">
                  <button
                    onClick={() => setEditingResignationEmpId(null)}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => handleSaveResignation(emp.id)}
                    disabled={!resignationNoticeDate || !resignationTargetDate}
                    className={cn(
                      "px-5 py-2 text-white text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer",
                      (!resignationNoticeDate || !resignationTargetDate)
                        ? "bg-slate-350 cursor-not-allowed border border-slate-300"
                        : "bg-orange-600 hover:bg-orange-700"
                    )}
                  >
                    사직 일정 저장
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* 2. Written Resignation & Mutual Agreement Form Print Preview Modal */}
      <AnimatePresence>
        {printResignationEmpId && (() => {
          const emp = employees.find(e => e.id === printResignationEmpId);
          if (!emp) return null;

          return (
            <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col my-8"
              >
                <div className="p-5 bg-slate-900 text-white flex justify-between items-center no-print">
                  <div className="space-y-1">
                    <span className="px-2.5 py-0.5 bg-orange-600 font-black rounded text-[9px] uppercase tracking-wider">OFFICIAL FORM</span>
                    <h3 className="text-lg font-black">사직원 및 근로계약 합의정리서 인쇄 출력</h3>
                  </div>
                  <button
                    onClick={() => setPrintResignationEmpId(null)}
                    className="p-1.5 bg-slate-805 hover:bg-slate-700 text-slate-350 hover:text-white rounded-lg transition-all cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="p-6 bg-slate-55 flex flex-col gap-4 border-b border-slate-200 no-print">
                  <div className="space-y-1.5 max-w-sm">
                    <label className="text-xs font-bold text-slate-500 block">공식 사직 사유 선택</label>
                    <select
                      value={resignationReason}
                      onChange={(e) => setResignationReason(e.target.value)}
                      className="w-full text-xs font-bold bg-white text-slate-800 p-2 border border-slate-200 rounded-lg cursor-pointer"
                    >
                      <option value="개인 사정 및 학업 전념">개인 사정 및 학업 전념</option>
                      <option value="타 대학/원 진학 및 유학">타 대학/원 진학 및 유학</option>
                      <option value="근로 시간 단축 및 타 학무 이전">근로 시간 단축 및 타 학무 이전</option>
                      <option value="전공 실무 전향 및 일신상의 사유">전공 실무 전향 및 일신상의 사유</option>
                      <option value="상호 합의에 의한 근로계약 만료">상호 합의에 의한 근로계약 만료</option>
                    </select>
                  </div>
                </div>

                {/* Printable Document Box */}
                <div className="p-12 overflow-y-auto bg-white flex-1 max-h-[60vh] text-slate-900" id="resignation-print-area">
                  <div className="border-[3px] border-double border-slate-800 p-8 max-w-xl mx-auto space-y-8 bg-white min-h-[500px]">
                    <h2 className="text-3xl font-serif font-black text-center tracking-[12px] underline block mb-10 text-slate-950">사 직 원</h2>

                    <table className="w-full border-collapse border border-slate-400 text-xs">
                      <tbody>
                        <tr>
                          <td className="border border-slate-400 bg-slate-50 p-2.5 font-bold text-center w-24">소 속 / 학 원</td>
                          <td className="border border-slate-400 p-2.5 font-semibold">동명 가맹 학원 주식회사</td>
                          <td className="border border-slate-400 bg-slate-50 p-2.5 font-bold text-center w-24">직 급</td>
                          <td className="border border-slate-400 p-2.5 font-semibold">{emp.position}</td>
                        </tr>
                        <tr>
                          <td className="border border-slate-400 bg-slate-50 p-2.5 font-bold text-center">성 명</td>
                          <td className="border border-slate-400 p-2.5 font-semibold">{emp.name}</td>
                          <td className="border border-slate-400 bg-slate-50 p-2.5 font-bold text-center">생 년 월 일</td>
                          <td className="border border-slate-400 p-2.5 font-semibold font-mono">{emp.ssn.split('-')[0]}-*******</td>
                        </tr>
                        <tr>
                          <td className="border border-slate-400 bg-slate-50 p-2.5 font-bold text-center">최초 입사 명일</td>
                          <td className="border border-slate-400 p-2.5 font-semibold font-mono">{emp.hireDate}</td>
                          <td className="border border-slate-400 bg-slate-50 p-2.5 font-bold text-center">사직 의사 등록</td>
                          <td className="border border-slate-400 p-2.5 font-semibold font-mono">{emp.resignationNoticeDate}</td>
                        </tr>
                        <tr>
                          <td className="border border-slate-400 bg-slate-50 p-2.5 font-bold text-center">계약 해지 예정일</td>
                          <td className="border border-slate-400 p-2.5 font-black text-slate-950 font-mono" colSpan={3}>
                            {emp.resignationTargetDate}
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-slate-400 bg-slate-50 p-2.5 font-bold text-center">사 직 사 유</td>
                          <td className="border border-slate-400 p-2.5 text-xs font-semibold leading-relaxed" colSpan={3}>
                            {resignationReason} (에 의한 일신상의 자발적인 합의 계약 정리)
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="space-y-4 pt-4 text-xs leading-relaxed text-slate-700">
                      <p>
                        상기 본인은 위와 기재한 일신상의 사유로 인하여 주식회사 가맹 및 소속 지부와의 체결된 고용 약정을 성실히 정리하고 합의 해지하기 위하여 사직원을 제출합니다.
                      </p>
                      <p>
                        또한, 해당 계약 해지 예정일에 따른 최종 잔여 급여 대장이 법정 세율 및 휴일근로수당 공식을 준용하였음을 사전에 완전히 설명받고 합의하였기에, 퇴사 이후 일체의 민·형사상 및 고용노동청 추가 수당과 이의제기를 청구하지 않기로 조건 없는 부제소 특약을 합의합니다.
                      </p>
                    </div>

                    <div className="text-right text-xs pr-6 pt-6 font-semibold">
                      신고인 및 제출일: 2026년 6월 8일
                    </div>

                    <div className="flex justify-between items-end pt-12 text-sm font-bold">
                      <div className="text-left space-y-1">
                        <p>소속 학원 대리인: (주) 가맹학원 지부장</p>
                        <p className="text-xs text-slate-400">대표 확인 날인: _________________ (인)</p>
                      </div>
                      <div className="text-right space-y-1">
                        <p>사직 신고 소득자: {emp.name}</p>
                        <p className="text-xs text-slate-400">본인 서명 날인: _________________ (인)</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-150 flex justify-end gap-3.5 no-print">
                  <button
                    onClick={() => setPrintResignationEmpId(null)}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    닫기
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer size={13} />
                    합의정리 합의서 즉시 인쇄
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
