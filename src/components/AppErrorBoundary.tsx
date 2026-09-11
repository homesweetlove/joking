import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

const STORAGE_KEYS = [
  'payroll_employees_v2',
  'payroll_reports_v2',
  'payroll_employees',
  'payroll_reports',
];

export default class AppErrorBoundary extends Component<Props, State> {
  private readonly childContent: ReactNode;

  constructor(props: Props) {
    super(props);
    this.childContent = props.children;
    this.state = {
      hasError: false,
      message: '',
    };
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Payroll Manager runtime error', error, info);
  }

  private reload = () => {
    window.location.reload();
  };

  private clearLocalData = () => {
    const confirmed = window.confirm(
      '브라우저에 저장된 직원/급여대장 데이터를 삭제하고 앱을 초기화할까요?\n\n중요한 데이터가 있다면 먼저 이 화면을 닫고 백업 가능 여부를 확인해주세요.',
    );
    if (!confirmed) return;

    try {
      STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    } finally {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) return this.childContent;

    return (
      <div className="min-h-screen bg-slate-50 px-6 py-16 text-slate-900">
        <div className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-white p-8 shadow-xl">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-red-600">Runtime recovery</p>
          <h1 className="mt-3 text-2xl font-bold">앱 실행 중 오류가 발생했습니다.</h1>
          <p className="mt-3 leading-relaxed text-slate-600">
            저장된 이전 데이터 형식이나 브라우저 저장 상태 때문에 화면이 중단됐을 수 있습니다.
            먼저 새로고침을 시도하고, 반복되면 저장 데이터를 초기화할 수 있습니다.
          </p>

          {this.state.message && (
            <pre className="mt-6 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
              {this.state.message}
            </pre>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={this.reload}
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              새로고침
            </button>
            <button
              type="button"
              onClick={this.clearLocalData}
              className="rounded-xl border border-red-300 px-5 py-3 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              저장 데이터 초기화
            </button>
          </div>
        </div>
      </div>
    );
  }
}
