import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  CheckCircle,
  Clock,
  RotateCcw,
  Search,
  Filter,
  DollarSign,
  Printer,
  AlertCircle,
  CreditCard,
  User,
  Phone,
  HelpCircle,
  FileText,
  ShieldAlert,
  Settings,
} from 'lucide-react';
import { Player, PaymentStatus, Season, RegistrationSettings } from '../types';
import { formatBDT, getPaymentStatusInfo } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, collection, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { EditableText } from './common/EditableText';
import { updateSeasonField, updatePlayerField } from '../services/editService';
import {
  DEFAULT_REGISTRATION_SETTINGS,
  formatFormDisplay,
} from '../services/registrationService';
import { RegistrationSettingsModal } from './RegistrationSettingsModal';

interface FeeAndRefundReportProps {
  players: Player[];
  currentSeason?: Season;
}

export const FeeAndRefundReport: React.FC<FeeAndRefundReportProps> = ({ players, currentSeason }) => {
  const { isAdmin, language, currentUser } = useAuth();

  const [statusFilter, setStatusFilter] = useState<'all' | 'Paid' | 'Pending' | 'Refunded'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [regSettings, setRegSettings] = useState<RegistrationSettings>(DEFAULT_REGISTRATION_SETTINGS);
  const [isRegSettingsModalOpen, setIsRegSettingsModalOpen] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'registration'),
      snap => {
        if (snap.exists()) {
          setRegSettings({ ...DEFAULT_REGISTRATION_SETTINGS, ...(snap.data() as RegistrationSettings) });
        }
      },
      err => {
        console.warn('Registration settings listener in fee report:', err);
      }
    );
    return () => unsub();
  }, []);

  // Authoritative standard registration fee for the current season
  const standardFee = typeof currentSeason?.regFeeAmount === 'number' ? currentSeason.regFeeAmount : 500;
  const getPlayerFee = (p: Player) => (typeof p.regFee === 'number' && !isNaN(p.regFee) ? p.regFee : standardFee);

  // Financial aggregates calculated with preserved historical player fees
  const totalCollected = players
    .filter(p => p.paymentStatus === 'Paid')
    .reduce((sum, p) => sum + getPlayerFee(p), 0);

  const totalPending = players
    .filter(p => p.paymentStatus === 'Pending')
    .reduce((sum, p) => sum + getPlayerFee(p), 0);

  const totalRefunded = players
    .filter(p => p.paymentStatus === 'Refunded')
    .reduce((sum, p) => sum + getPlayerFee(p), 0);

  const paidCount = players.filter(p => p.paymentStatus === 'Paid').length;
  const pendingCount = players.filter(p => p.paymentStatus === 'Pending').length;
  const refundedCount = players.filter(p => p.paymentStatus === 'Refunded').length;

  // Non-admin security barrier: directly prevent rendering sensitive financial tables
  if (!isAdmin) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-4 max-w-md mx-auto my-8">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-950/40">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-white">
          {language === 'bn' ? 'অনুমতি প্রয়োজন (Admin Only)' : 'Restricted Access'}
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          {language === 'bn'
            ? 'ফি ও রিফান্ড সংক্রান্ত আর্থিক হিসাব শুধুমাত্র টুর্নামেন্টের অনুমোদিত অ্যাডমিন দেখতে পারবেন।'
            : 'Fee and refund financial details are strictly restricted to authorized administrators.'}
        </p>
      </div>
    );
  }

  const filteredPlayers = players.filter(p => {
    if (statusFilter !== 'all' && p.paymentStatus !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchPhone = p.phone?.includes(q);
      const matchTrx = p.paymentTrxId?.toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchTrx) return false;
    }
    return true;
  });

  const handleUpdatePaymentStatus = async (
    playerId: string,
    playerName: string,
    newStatus: PaymentStatus
  ) => {
    if (!currentUser) {
      alert(
        language === 'bn'
          ? 'পেমেন্ট স্ট্যাটাস পরিবর্তন করতে প্রথমে Google অ্যাডমিন অ্যাকাউন্ট (arifhossainbd087@gmail.com) দিয়ে লগইন করুন।'
          : 'Please sign in with your admin account to update payment status.'
      );
      return;
    }
    try {
      await updateDoc(doc(db, 'players', playerId), {
        paymentStatus: newStatus,
        updatedAt: new Date().toISOString(),
      });

      // Audit log
      const auditRef = doc(collection(db, 'auditLogs'));
      await setDoc(auditRef, {
        action: `PAYMENT_STATUS_${newStatus.toUpperCase()}`,
        actorEmail: currentUser?.email || 'admin',
        actorRole: 'admin',
        details: `${playerName} এর নিবন্ধন ফি স্ট্যাটাস '${newStatus}' করা হয়েছে।`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error updating payment status:', err);
      alert('পেমেন্ট স্ট্যাটাস আপডেট করতে সমস্যা হয়েছে');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
            <span>{language === 'bn' ? 'নিবন্ধন ফি ও রিফান্ড রিপোর্ট' : 'Registration Fees & Refund Report'}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
            <span>
              {language === 'bn'
                ? 'খেলোয়াড়দের নিবন্ধন ফি ট্র্যাকিং, যাচাইকরণ এবং বাতিল আবেদনের রিফান্ড হিসাব'
                : 'Player fee audit ledger, manual verification, and refund reconciliations'}
            </span>
            {currentSeason && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px] font-semibold">
                {currentSeason.name}
              </span>
            )}
          </p>
        </div>

        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
        >
          <Printer className="w-4 h-4 text-emerald-400" />
          <span>{language === 'bn' ? 'রিপোর্ট প্রিন্ট / PDF' : 'Print / Export PDF'}</span>
        </button>
      </div>

      {/* Fee Settings, Payment Numbers & Refund Policy Controls */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">
              {language === 'bn' ? 'ফি নির্ধারণ, পেমেন্ট নম্বর ও রিফান্ড নীতিমালা' : 'Fee Settings, Payment Numbers & Refund Policy'}
            </h3>
          </div>
          {currentSeason && (
            <span className="text-xs text-slate-400 font-mono">
              {currentSeason.code} ({currentSeason.year})
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          {/* Default Registration Fee */}
          <div className="bg-slate-950/80 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 block">
                {language === 'bn' ? 'নির্ধারিত নিবন্ধন ফি' : 'Standard Reg Fee'}
              </span>
              <span className="text-base font-bold text-emerald-400 font-mono">
                {formatBDT(standardFee)}
              </span>
            </div>
            {currentSeason && (
              <EditableText
                value={standardFee}
                type="number"
                min={0}
                onSave={async (val) => {
                  const num = Number(val);
                  if (isNaN(num) || num < 0) {
                    throw new Error(
                      language === 'bn'
                        ? 'নিবন্ধন ফি অবশ্যই ০ বা তার বেশি বৈধ সংখ্যা হতে হবে।'
                        : 'Registration fee must be a valid number (0 or higher).'
                    );
                  }
                  await updateSeasonField(currentSeason.id, 'regFeeAmount', num, currentUser?.email || 'admin');
                }}
                label={language === 'bn' ? 'নির্ধারিত নিবন্ধন ফি (টাকা)' : 'Registration Fee Amount'}
                pencilClassName="text-emerald-400 hover:text-emerald-300"
              />
            )}
          </div>

          {/* bKash Number */}
          <div className="bg-slate-950/80 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
            <div className="truncate pr-1">
              <span className="text-[10px] text-pink-400 block font-semibold">bKash (বিকাশ)</span>
              <span className="text-xs font-mono text-slate-200">
                {currentSeason?.bKashNumber || '01712-345678'}
              </span>
            </div>
            {currentSeason && (
              <EditableText
                value={currentSeason.bKashNumber || '01712-345678'}
                onSave={async (val) => {
                  await updateSeasonField(currentSeason.id, 'bKashNumber', val, currentUser?.email || 'admin');
                }}
                label="bKash Number"
                pencilClassName="text-pink-400 hover:text-pink-300"
              />
            )}
          </div>

          {/* Nagad Number */}
          <div className="bg-slate-950/80 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
            <div className="truncate pr-1">
              <span className="text-[10px] text-amber-400 block font-semibold">Nagad (নগদ)</span>
              <span className="text-xs font-mono text-slate-200">
                {currentSeason?.nagadNumber || '01912-345678'}
              </span>
            </div>
            {currentSeason && (
              <EditableText
                value={currentSeason.nagadNumber || '01912-345678'}
                onSave={async (val) => {
                  await updateSeasonField(currentSeason.id, 'nagadNumber', val, currentUser?.email || 'admin');
                }}
                label="Nagad Number"
                pencilClassName="text-amber-400 hover:text-amber-300"
              />
            )}
          </div>

          {/* Rocket Number */}
          <div className="bg-slate-950/80 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
            <div className="truncate pr-1">
              <span className="text-[10px] text-purple-400 block font-semibold">Rocket (রকেট)</span>
              <span className="text-xs font-mono text-slate-200">
                {currentSeason?.rocketNumber || '01812-345678'}
              </span>
            </div>
            {currentSeason && (
              <EditableText
                value={currentSeason.rocketNumber || '01812-345678'}
                onSave={async (val) => {
                  await updateSeasonField(currentSeason.id, 'rocketNumber', val, currentUser?.email || 'admin');
                }}
                label="Rocket Number"
                pencilClassName="text-purple-400 hover:text-purple-300"
              />
            )}
          </div>
        </div>

        {/* Refund Policy Description */}
        <div className="bg-slate-950/80 border border-slate-800/80 p-3 rounded-xl space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-purple-400" />
              <span>{language === 'bn' ? 'রিফান্ড ও প্রত্যাহার নীতিমালা' : 'Refund & Withdrawal Policy'}</span>
            </span>
            {currentSeason && (
              <EditableText
                value={
                  currentSeason.refundPolicy ||
                  (language === 'bn'
                    ? 'নিলামে অবিক্রিত বা টুর্নামেন্ট শুরুর পূর্বে স্বেচ্ছায় প্রত্যাহারের ক্ষেত্রে ৫০% নিবন্ধন ফি রিফান্ডযোগ্য।'
                    : '50% of the registration fee is refundable if a player remains unsold or withdraws prior to season start.')
                }
                type="textarea"
                onSave={async (val) => {
                  await updateSeasonField(currentSeason.id, 'refundPolicy', val, currentUser?.email || 'admin');
                }}
                label={language === 'bn' ? 'রিফান্ড নীতিমালা' : 'Refund Policy'}
                pencilClassName="text-purple-400 hover:text-purple-300"
              />
            )}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">
            {currentSeason?.refundPolicy ||
              (language === 'bn'
                ? 'নিলামে অবিক্রিত বা টুর্নামেন্ট শুরুর পূর্বে স্বেচ্ছায় প্রত্যাহারের ক্ষেত্রে ৫০% নিবন্ধন ফি রিফান্ডযোগ্য।'
                : '50% of the registration fee is refundable if a player remains unsold or withdraws prior to season start.')}
          </p>
        </div>

        {/* Registration Form & Sequential Number Settings Section */}
        <div className="bg-slate-950/80 border border-slate-800/80 p-4 rounded-xl space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center font-bold">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                  <span>{language === 'bn' ? 'খেলোয়াড় নিবন্ধন ও ফরম নম্বর কন্ট্রোল' : 'Registration Form & Number Settings'}</span>
                  <span className="text-[10px] text-amber-400 font-mono font-normal bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                    {formatFormDisplay(regSettings.nextFormNumber || 1, regSettings, language)}
                  </span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  {language === 'bn'
                    ? 'অনলাইন ফরম নম্বর অনুক্রম (ডিফল্ট: ১ থেকে শুরু), প্রিফিক্স ও সিকোয়েন্সিয়াল কাউন্টার'
                    : 'Configure starting number, prefix, and sequential registration counter'}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsRegSettingsModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-amber-400" />
              <span>{language === 'bn' ? 'ফরম সেটিংস পরিবর্তন' : 'Configure Settings'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-900 text-[11px]">
            <div className="bg-slate-900/70 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block">{language === 'bn' ? 'প্রারম্ভিক ফরম নং' : 'Starting Number'}</span>
              <span className="font-mono font-bold text-slate-200 text-xs">{regSettings.startFormNumber || 1}</span>
            </div>
            <div className="bg-slate-900/70 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block">{language === 'bn' ? 'পরবর্তী ফরম নং' : 'Next Form No'}</span>
              <span className="font-mono font-bold text-emerald-400 text-xs">{regSettings.nextFormNumber || 1}</span>
            </div>
            <div className="bg-slate-900/70 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block">{language === 'bn' ? 'লাইভ প্রিভিউ' : 'Live Form Label'}</span>
              <span className="font-mono font-bold text-amber-300 text-xs">{formatFormDisplay(regSettings.nextFormNumber || 1, regSettings, language)}</span>
            </div>
            <div className="bg-slate-900/70 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block">{language === 'bn' ? 'মোট গৃহীত ফরম' : 'Total Registrations'}</span>
              <span className="font-mono font-bold text-cyan-400 text-xs">{regSettings.totalRegistrations || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Aggregate Financial Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Paid / Collected */}
        <div className="bg-slate-900 border border-emerald-500/30 p-5 rounded-2xl shadow-xl space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-emerald-400">
              {language === 'bn' ? 'মোট সংগৃহীত ফি' : 'Total Collected Fees'}
            </span>
            <CheckCircle className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
            {formatBDT(totalCollected)}
          </div>
          <div className="text-xs text-slate-400">
            {paidCount} {language === 'bn' ? 'জন খেলোয়াড় পরিশোধ করেছেন' : 'players confirmed'}
          </div>
        </div>

        {/* Pending */}
        <div className="bg-slate-900 border border-amber-500/30 p-5 rounded-2xl shadow-xl space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-amber-400">
              {language === 'bn' ? 'অপেক্ষমাণ পেমেন্ট' : 'Pending Verification'}
            </span>
            <Clock className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-300 font-mono">
            {formatBDT(totalPending)}
          </div>
          <div className="text-xs text-slate-400">
            {pendingCount} {language === 'bn' ? 'জন খেলোয়াড়ের যাচাই বাকি' : 'players pending'}
          </div>
        </div>

        {/* Refunded */}
        <div className="bg-slate-900 border border-purple-500/30 p-5 rounded-2xl shadow-xl space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-purple-400">
              {language === 'bn' ? 'রিফান্ড প্রদান সম্পন্ন' : 'Total Refunded'}
            </span>
            <RotateCcw className="w-5 h-5 text-purple-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-purple-300 font-mono">
            {formatBDT(totalRefunded)}
          </div>
          <div className="text-xs text-slate-400">
            {refundedCount} {language === 'bn' ? 'জন খেলোয়াড়কে রিফান্ড প্রদান' : 'players refunded'}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {[
            { id: 'all', label: language === 'bn' ? 'সকল' : 'All' },
            { id: 'Paid', label: language === 'bn' ? 'পরিশোধিত (Paid)' : 'Paid' },
            { id: 'Pending', label: language === 'bn' ? 'অপেক্ষমাণ (Pending)' : 'Pending' },
            { id: 'Refunded', label: language === 'bn' ? 'রিফান্ড (Refunded)' : 'Refunded' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={
              language === 'bn'
                ? 'নাম, মোবাইল বা ট্রানজেকশন আইডি...'
                : 'Search name, phone or TrxID...'
            }
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Transaction Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800 font-semibold">
              <tr>
                <th className="py-3.5 px-4">#</th>
                <th className="py-3.5 px-4">{language === 'bn' ? 'খেলোয়াড়ের নাম' : 'Player'}</th>
                <th className="py-3.5 px-4">{language === 'bn' ? 'ফোন নম্বর' : 'Phone'}</th>
                <th className="py-3.5 px-4">{language === 'bn' ? 'ফি (৳)' : 'Fee'}</th>
                <th className="py-3.5 px-4">{language === 'bn' ? 'মেথড' : 'Method'}</th>
                <th className="py-3.5 px-4">{language === 'bn' ? 'ট্রানজেকশন আইডি' : 'TrxID'}</th>
                <th className="py-3.5 px-4">{language === 'bn' ? 'স্ট্যাটাস' : 'Status'}</th>
                {isAdmin && <th className="py-3.5 px-4 text-right">{language === 'bn' ? 'অ্যাকশন' : 'Action'}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 italic">
                    {language === 'bn' ? 'কোনো রেকর্ড পাওয়া যায়নি' : 'No records found'}
                  </td>
                </tr>
              ) : (
                filteredPlayers.map((player, idx) => {
                  const statusInfo = getPaymentStatusInfo(player.paymentStatus);
                  return (
                    <tr key={player.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-3 px-4 font-medium text-white">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0 relative">
                            <User className="w-3.5 h-3.5 text-slate-500 absolute" />
                            {player.photoUrl && (
                              <img
                                src={player.photoUrl}
                                alt={player.name}
                                onError={e => {
                                  (e.currentTarget as HTMLElement).style.display = 'none';
                                }}
                                className="w-full h-full object-cover relative z-10"
                              />
                            )}
                          </div>
                          <EditableText
                            value={player.name}
                            onSave={async (val) => {
                              await updatePlayerField(player.id, 'name', val, currentUser?.email || 'admin');
                            }}
                            label={language === 'bn' ? 'খেলোয়াড়ের নাম' : 'Player Name'}
                          >
                            <span className="flex items-center gap-1.5 flex-wrap">
                              <span>{player.name}</span>
                              {player.formNumber && (
                                <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20 font-normal">
                                  {player.formNumber}
                                </span>
                              )}
                            </span>
                          </EditableText>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        <EditableText
                          value={player.phone || ''}
                          required={false}
                          onSave={async (val) => {
                            await updatePlayerField(player.id, 'phone', val, currentUser?.email || 'admin');
                          }}
                          label={language === 'bn' ? 'মোবাইল নম্বর' : 'Phone'}
                        >
                          <span>{player.phone || 'N/A'}</span>
                        </EditableText>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                        <EditableText
                          value={typeof player.regFee === 'number' ? player.regFee : standardFee}
                          type="number"
                          min={0}
                          onSave={async (val) => {
                            await updatePlayerField(player.id, 'regFee', val, currentUser?.email || 'admin');
                          }}
                          label={language === 'bn' ? 'নিবন্ধন ফি (টাকা)' : 'Fee Amount'}
                          pencilClassName="text-emerald-400 hover:text-emerald-300"
                        >
                          <span>{formatBDT(typeof player.regFee === 'number' ? player.regFee : standardFee)}</span>
                        </EditableText>
                      </td>
                      <td className="py-3 px-4">
                        <EditableText
                          value={player.paymentMethod || 'Cash'}
                          type="select"
                          options={[
                            { value: 'bKash', label: 'bKash (বিকাশ)' },
                            { value: 'Nagad', label: 'Nagad (নগদ)' },
                            { value: 'Rocket', label: 'Rocket (রকেট)' },
                            { value: 'Cash', label: 'Cash (ক্যাশ)' },
                          ]}
                          onSave={async (val) => {
                            await updatePlayerField(player.id, 'paymentMethod', val, currentUser?.email || 'admin');
                          }}
                          label={language === 'bn' ? 'পেমেন্ট মাধ্যম' : 'Payment Method'}
                          pencilClassName="text-slate-400 hover:text-emerald-400"
                        >
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                            {player.paymentMethod || 'Cash'}
                          </span>
                        </EditableText>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        <EditableText
                          value={player.paymentTrxId || ''}
                          required={false}
                          onSave={async (val) => {
                            await updatePlayerField(player.id, 'paymentTrxId', val, currentUser?.email || 'admin');
                          }}
                          label={language === 'bn' ? 'ট্রানজেকশন আইডি (TrxID)' : 'Transaction ID'}
                          placeholder="TrxID (e.g. 9J821KL9)"
                          pencilClassName="text-slate-400 hover:text-sky-400"
                        >
                          {player.paymentTrxId ? (
                            <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                              {player.paymentTrxId}
                            </span>
                          ) : (
                            <span className="text-slate-600 italic">N/A</span>
                          )}
                        </EditableText>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {player.paymentStatus !== 'Paid' && (
                              <button
                                onClick={() =>
                                  handleUpdatePaymentStatus(player.id, player.name, 'Paid')
                                }
                                className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold transition-colors cursor-pointer"
                                title="পরিশোধ নিশ্চিত করুন"
                              >
                                {language === 'bn' ? 'পরিশোধিত' : 'Mark Paid'}
                              </button>
                            )}

                            {player.paymentStatus !== 'Refunded' && (
                              <button
                                onClick={() =>
                                  handleUpdatePaymentStatus(player.id, player.name, 'Refunded')
                                }
                                className="px-2 py-1 rounded bg-purple-600/30 hover:bg-purple-600 text-purple-300 hover:text-white text-[10px] font-semibold transition-colors cursor-pointer"
                                title="রিফান্ড প্রদান সম্পন্ন"
                              >
                                {language === 'bn' ? 'রিফান্ড' : 'Refund'}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin Registration Settings Modal */}
      {isAdmin && (
        <RegistrationSettingsModal
          isOpen={isRegSettingsModalOpen}
          onClose={() => setIsRegSettingsModalOpen(false)}
          language={language}
          currentUserEmail={currentUser?.email || 'admin'}
          onSettingsSaved={newSettings => setRegSettings(newSettings)}
        />
      )}
    </div>
  );
};
