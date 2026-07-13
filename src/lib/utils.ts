import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  const rounded = Math.round(value || 0);
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rounded);
}

export function calculateWeeklyHolidayAllowance(weeklyHours: number, hourlyWage: number) {
  // 주휴수당: (1주 총 근로시간 / 40시간) * 8시간 * 시급
  // 단, 1주 15시간 이상 근무 시 발생
  if (weeklyHours < 15) return 0;
  const cappedHours = Math.min(weeklyHours, 40);
  return (cappedHours / 40) * 8 * hourlyWage;
}

export function normalizeTimeToHHMM(val: any): string | undefined {
  if (val === undefined || val === null) return undefined;
  
  let str = String(val).trim();
  if (!str || str === '-') return undefined;

  // Let's check if it's a fractional number (Excel time format, e.g. 0.375)
  if (!isNaN(Number(str))) {
    const num = Number(str);
    if (num > 0 && num < 1) {
      const totalSeconds = Math.round(num * 24 * 60 * 60);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      return `${String(hours % 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    // If it's a solid integer like 9 or 18 (some users type hours directly)
    if (Number.isInteger(num)) {
      if (num >= 0 && num < 24) {
        return `${String(num).padStart(2, '0')}:00`;
      }
      // If it's 900 or 1830
      if (num >= 100 && num <= 2400) {
        const hh = Math.floor(num / 100);
        const mm = num % 100;
        if (hh < 24 && mm < 60) {
          return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        }
      }
    }
  }

  // Handle Korean style meridiem strings like "오전 9시", "오후 6시 30분", "오후 6:15"
  const isPM = str.includes('오후') || str.toLowerCase().includes('pm');
  const isAM = str.includes('오전') || str.toLowerCase().includes('am');
  
  // Clean up non-digits except dots or colons for further parse
  let cleaned = str.replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g, ' ').trim();
  // Remove duplicate spaces
  cleaned = cleaned.replace(/\s+/g, ' ');

  // Look for patterns like HH:MM or HH:MM:SS
  const colonMatch = cleaned.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (colonMatch) {
    let hh = parseInt(colonMatch[1], 10);
    let mm = parseInt(colonMatch[2], 10);
    if (isPM && hh < 12) hh += 12;
    if (isAM && hh === 12) hh = 0;
    return `${String(hh % 24).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
  }

  // Look for single hours pattern, e.g. "9" or "18" after stripping Korean characters
  const numbers = cleaned.split(/\s+/).map(Number).filter(n => !isNaN(n));
  if (numbers.length >= 1) {
    let hh = numbers[0];
    let mm = numbers[1] || 0;
    if (isPM && hh < 12) hh += 12;
    if (isAM && hh === 12) hh = 0;
    if (hh >= 0 && hh < 24 && mm >= 0 && mm < 60) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  return undefined;
}

export function calculateNightHours(clockIn?: string, clockOut?: string): number {
  if (!clockIn || !clockOut) return 0;
  const parseTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const startMin = parseTime(clockIn);
  let endMin = parseTime(clockOut);

  if (endMin < startMin) {
    endMin += 24 * 60; // crossed midnight
  }

  let nightMin = 0;
  for (let m = startMin; m < endMin; m++) {
    const minOfDay = m % (24 * 60);
    // Night is 22:00 (1320 min) to 06:00 (360 min)
    if (minOfDay >= 22 * 60 || minOfDay < 6 * 60) {
      nightMin++;
    }
  }
  return nightMin / 60;
}
