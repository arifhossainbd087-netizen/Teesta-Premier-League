import { PlayerPosition, ApprovalStatus, AuctionStatus, PaymentStatus } from '../types';

export function toBanglaNumeral(num: number | string): string {
  const banglaDigits: { [key: string]: string } = {
    '0': '০',
    '1': '১',
    '2': '২',
    '3': '৩',
    '4': '৪',
    '5': '৫',
    '6': '৬',
    '7': '৭',
    '8': '৮',
    '9': '৯',
  };
  return String(num).replace(/[0-9]/g, match => banglaDigits[match] || match);
}

/**
 * Format currency into Bangladeshi Taka with South Asian numbering system
 * e.g., 100000 -> ৳ 1,00,000
 */
export function formatBDT(amount: number | undefined | null, useBanglaDigits = false): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return useBanglaDigits ? '৳ ০' : '৳ 0';
  }

  const isNegative = amount < 0;
  const absVal = Math.round(Math.abs(amount));
  const s = absVal.toString();

  let formatted = '';
  if (s.length <= 3) {
    formatted = s;
  } else {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    const parts: string[] = [];
    for (let i = rest.length; i > 0; i -= 2) {
      const start = Math.max(0, i - 2);
      parts.unshift(rest.slice(start, i));
    }
    formatted = `${parts.join(',')},${last3}`;
  }

  if (isNegative) formatted = `-${formatted}`;

  if (useBanglaDigits) {
    return `৳ ${toBanglaNumeral(formatted)}`;
  }

  return `৳ ${formatted}`;
}

export function getPositionLabel(position: PlayerPosition, inBangla = true): string {
  if (!inBangla) return position;
  switch (position) {
    case 'Forward':
      return 'ফরোয়ার্ড';
    case 'Midfielder':
      return 'মিডফিল্ডার';
    case 'Defender':
      return 'ডিফেন্ডার';
    case 'Goalkeeper':
      return 'গোলকিপার';
    default:
      return position;
  }
}

export function getPositionBadgeColor(position: PlayerPosition): string {
  switch (position) {
    case 'Forward':
      return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    case 'Midfielder':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'Defender':
      return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    case 'Goalkeeper':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    default:
      return 'bg-slate-700 text-slate-300 border-slate-600';
  }
}

export function getAuctionStatusInfo(status: AuctionStatus): { label: string; labelEn: string; color: string } {
  switch (status) {
    case 'live':
      return { label: 'লাইভ নিলামে', labelEn: 'LIVE', color: 'bg-emerald-500 text-slate-950 font-bold animate-pulse' };
    case 'sold':
      return { label: 'বিক্রিত', labelEn: 'SOLD', color: 'bg-green-600 text-white font-semibold' };
    case 'unsold':
      return { label: 'অবিক্রিত', labelEn: 'UNSOLD', color: 'bg-red-600/90 text-white font-semibold' };
    case 'upcoming':
    default:
      return { label: 'অপেক্ষমাণ', labelEn: 'UPCOMING', color: 'bg-slate-700 text-slate-300' };
  }
}

export function getApprovalStatusInfo(status: ApprovalStatus): { label: string; color: string } {
  switch (status) {
    case 'approved':
      return { label: 'অনুমোদিত', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    case 'rejected':
      return { label: 'বাতিল', color: 'bg-red-500/20 text-red-400 border-red-500/30' };
    case 'pending':
    default:
      return { label: 'যাচাই বাকি', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
  }
}

export function getPaymentStatusInfo(status: PaymentStatus): { label: string; color: string } {
  switch (status) {
    case 'Paid':
      return { label: 'পরিশোধিত', color: 'bg-emerald-500/20 text-emerald-400' };
    case 'Refunded':
      return { label: 'রিফান্ড প্রদান', color: 'bg-purple-500/20 text-purple-400' };
    case 'Pending':
    default:
      return { label: 'অপেক্ষমাণ', color: 'bg-amber-500/20 text-amber-400' };
  }
}
