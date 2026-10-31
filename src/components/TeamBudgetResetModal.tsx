import React, { useState, useEffect } from 'react';
import {
  X,
  RotateCcw,
  Wallet,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { Team } from '../types';
import { formatBDT } from '../utils/formatters';
import { doc, updateDoc, collection, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';

interface TeamBudgetResetModalProps {
  team: Team | null;
  isOpen: boolean;
  onClose: () => void;
  onBudgetUpdated?: (teamId: string, newRemaining: number, newSpent: number) => void;
}

export const TeamBudgetResetModal: React.FC<TeamBudgetResetModalProps> = ({
  team,
  isOpen,
  onClose,
  onBudgetUpdated,
}) => {
  const { language, currentUser, isAdmin } = useAuth();

  const [mode, setMode] = useState<'reset' | 'manual'>('reset');
  const [refundAmount, setRefundAmount] = useState<number | ''>('');
  const [customRemaining, setCustomRemaining] = useState<number>(0);
  const [customSpent, setCustomSpent] = useState<number>(0);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (team) {
      setCustomRemaining(team.remainingBudget ?? team.totalBudget);
      setCustomSpent(team.spentBudget ?? 0);
      setRefundAmount('');
      setIsConfirming(false);
      setErrorMessage(null);
      setSuccessMessage(null);
      setMode('reset');
    }
  }, [team, isOpen]);

  if (!isOpen || !team) return null;

  const currentTotal = team.totalBudget || 0;
  const currentSpent = team.spentBudget || 0;
  const currentRemaining = team.remainingBudget ?? (currentTotal - currentSpent);

  // Compute targets based on active mode
  let targetRemaining = currentTotal;
  let targetSpent = 0;

  if (mode === 'reset') {
    targetRemaining = currentTotal;
    targetSpent = 0;
  } else {
    targetRemaining = Number(customRemaining) || 0;
    targetSpent = Number(customSpent) || 0;
  }

  const remainingDiff = targetRemaining - currentRemaining;

  const handleApplyRefundAmount = (amount: number) => {
    const safeAmount = Math.max(0, amount);
    const newSpent = Math.max(0, currentSpent - safeAmount);
    const newRemaining = currentRemaining + safeAmount;
    setCustomSpent(newSpent);
    setCustomRemaining(newRemaining);
  };

  const handleExecuteUpdate = async () => {
    if (!isAdmin || !currentUser) {
      setErrorMessage(
        language === 'bn'
          ? 'শুধুমাত্র অনুমোদিত অ্যাডমিন বাজেট রিসেট বা সংশোধন করতে পারবেন।'
          : 'Only authorized admins can reset or modify budgets.'
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const teamRef = doc(db, 'teams', team.id);
      await updateDoc(teamRef, {
        remainingBudget: targetRemaining,
        spentBudget: targetSpent,
        updatedAt: new Date().toISOString(),
      });

      // Audit Log for financial transparency
      const auditRef = doc(collection(db, 'auditLogs'));
      await setDoc(auditRef, {
        action: mode === 'reset' ? 'TEAM_BUDGET_RESET' : 'TEAM_BUDGET_CORRECTED',
        actorEmail: currentUser.email || 'admin',
        actorRole: 'admin',
        details: `${team.name} দলের বাজেট ${mode === 'reset' ? 'সম্পূর্ণ রিসেট' : 'সংশোধন'} করা হয়েছে। আগের অবশিষ্ট: ৳${currentRemaining.toLocaleString()}, নতুন অবশিষ্ট: ৳${targetRemaining.toLocaleString()} (ব্যয়: ৳${targetSpent.toLocaleString()})`,
        teamId: team.id,
        teamName: team.name,
        previousRemaining: currentRemaining,
        newRemaining: targetRemaining,
        previousSpent: currentSpent,
        newSpent: targetSpent,
        timestamp: new Date().toISOString(),
      });

      setSuccessMessage(
        language === 'bn'
          ? `${team.name} দলের বাজেট সফলভাবে হালনাগাদ করা হয়েছে!`
          : `Budget updated successfully for ${team.name}!`
      );

      onBudgetUpdated?.(team.id, targetRemaining, targetSpent);

      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      console.error('Error updating team budget:', err);
      setErrorMessage(
        err?.message ||
          (language === 'bn' ? 'বাজেট আপডেট করতে সমস্যা হয়েছে।' : 'Failed to update team budget.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>{language === 'bn' ? 'দলের বাজেট রিসেট ও সংশোধন' : 'Team Budget Reset & Adjust'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 uppercase font-mono font-bold">
                  Admin Only
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                {team.name} {team.banglaName ? `(${team.banglaName})` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current State Summary Banner */}
        <div className="p-4 bg-slate-950/50 border-b border-slate-800/80">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-emerald-400" />
            <span>{language === 'bn' ? 'বর্তমান বাজেট অবস্থা:' : 'Current Budget Status:'}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
              <div className="text-[10px] text-slate-400 font-medium">{language === 'bn' ? 'মোট বরাদ্দ' : 'Total Purse'}</div>
              <div className="text-xs sm:text-sm font-bold text-white font-mono mt-0.5">{formatBDT(currentTotal)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
              <div className="text-[10px] text-slate-400 font-medium">{language === 'bn' ? 'ব্যয় হয়েছে' : 'Spent'}</div>
              <div className="text-xs sm:text-sm font-bold text-rose-400 font-mono mt-0.5">{formatBDT(currentSpent)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
              <div className="text-[10px] text-slate-400 font-medium">{language === 'bn' ? 'অবশিষ্ট বাজেট' : 'Remaining'}</div>
              <div className="text-xs sm:text-sm font-bold text-emerald-400 font-mono mt-0.5">{formatBDT(currentRemaining)}</div>
            </div>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-4 pt-2 gap-2 text-xs font-semibold">
          <button
            onClick={() => {
              setMode('reset');
              setIsConfirming(false);
            }}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-all ${
              mode === 'reset'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? '১০০% বাজেট রিসেট (সম্পূর্ণ ফেরত)' : '100% Full Reset'}</span>
          </button>
          <button
            onClick={() => {
              setMode('manual');
              setIsConfirming(false);
            }}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-all ${
              mode === 'manual'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'টেস্ট কর্তন সংশোধন / ম্যানুয়াল অ্যাডজাস্ট' : 'Manual / Test Correction'}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {mode === 'reset' ? (
            <div className="space-y-3">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                  <RotateCcw className="w-4 h-4" />
                  <span>{language === 'bn' ? 'বাজেট সম্পূর্ণ রিসেটের বিবরণ:' : 'Full Reset Details:'}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {language === 'bn'
                    ? `এই অপশনটি নির্বাচন করলে ${team.name} দলের ব্যয়কৃত অর্থ শূন্য (০) হবে এবং অবশিষ্ট বাজেট পূর্ণ ৳${currentTotal.toLocaleString()} এ পুনরুদ্ধার করা হবে।`
                    : `This will reset spent amount to ৳0 and restore remaining budget to ৳${currentTotal.toLocaleString()}.`}
                </p>
                <div className="text-[11px] text-amber-300/90 font-medium">
                  {language === 'bn'
                    ? '✓ কোনো পূর্ববর্তী নিলাম রেকর্ড বা প্লেয়ার তথ্য ডিলিট হবে না।'
                    : '✓ Existing player auction history will not be deleted.'}
                </div>
              </div>

              {/* Comparison Preview */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span>{language === 'bn' ? 'অবশিষ্ট বাজেট পরিবর্তন:' : 'Remaining Purse Change:'}</span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-slate-400">{formatBDT(currentRemaining)}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-emerald-400 font-bold">{formatBDT(currentTotal)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>{language === 'bn' ? 'ব্যয়কৃত অর্থ পরিবর্তন:' : 'Spent Amount Change:'}</span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-rose-400">{formatBDT(currentSpent)}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-slate-300 font-bold">৳ ০</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">
                  {language === 'bn'
                    ? '১. টেস্ট কর্তন দ্রুত ফেরত দিন (Quick Test Refund):'
                    : 'Quick Refund Accidental Test Deduction:'}
                </label>
                <p className="text-[11px] text-slate-400">
                  {language === 'bn'
                    ? 'পরীক্ষামূলক বা ভুল নিলামে যে পরিমাণ টাকা কাটা গেছে তা লিখুন (যেমন ২% = ৳২,০০০):'
                    : 'Enter the accidental test deduction amount to add back:'}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 2000"
                    value={refundAmount}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                      setRefundAmount(val);
                    }}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof refundAmount === 'number' && refundAmount > 0) {
                        handleApplyRefundAmount(refundAmount);
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer shrink-0"
                  >
                    {language === 'bn' ? 'যোগ করুন' : 'Apply Refund'}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-300 block">
                  {language === 'bn'
                    ? '২. অথবা সরাসরি অবশিষ্ট ও ব্যয়কৃত অর্থ নির্ধারণ করুন:'
                    : 'Or Specify Target Purse Directly:'}
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">
                      {language === 'bn' ? 'নতুন অবশিষ্ট বাজেট (৳):' : 'New Remaining Purse (৳):'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={customRemaining}
                      onChange={(e) => {
                        const rem = parseInt(e.target.value, 10) || 0;
                        setCustomRemaining(rem);
                        setCustomSpent(Math.max(0, currentTotal - rem));
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-emerald-400 font-mono font-bold focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">
                      {language === 'bn' ? 'নতুন ব্যয়কৃত অর্থ (৳):' : 'New Spent Purse (৳):'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={customSpent}
                      onChange={(e) => {
                        const sp = parseInt(e.target.value, 10) || 0;
                        setCustomSpent(sp);
                        setCustomRemaining(Math.max(0, currentTotal - sp));
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-300 font-mono font-bold focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Difference Preview */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">{language === 'bn' ? 'অবশিষ্ট বাজেট পার্থক্য:' : 'Purse Difference:'}</span>
                  <span
                    className={`font-mono font-bold ${
                      remainingDiff > 0 ? 'text-emerald-400' : remainingDiff < 0 ? 'text-rose-400' : 'text-slate-300'
                    }`}
                  >
                    {remainingDiff > 0 ? `+${formatBDT(remainingDiff)}` : formatBDT(remainingDiff)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Confirmation Checkbox Box */}
          {isConfirming && (
            <div className="p-4 bg-red-950/40 border-2 border-red-500/50 rounded-2xl space-y-2 animate-fadeIn">
              <div className="flex items-center gap-2 text-red-300 font-bold text-xs">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span>{language === 'bn' ? 'চূড়ান্ত নিশ্চিতকরণ' : 'Final Confirmation'}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {language === 'bn'
                  ? `আপনি কি নিশ্চিত যে ${team.name} দলের অবশিষ্ট বাজেট ৳${currentRemaining.toLocaleString()} থেকে পরিবর্তন করে ৳${targetRemaining.toLocaleString()} করবেন?`
                  : `Are you sure you want to change ${team.name}'s remaining budget from ৳${currentRemaining.toLocaleString()} to ৳${targetRemaining.toLocaleString()}?`}
              </p>
              <div className="text-[11px] text-slate-400 font-medium">
                {language === 'bn'
                  ? 'এই পরিবর্তন অবিলম্বে ফায়ারবেস ডাটাবেজ ও অডিট লগে সংরক্ষিত হবে।'
                  : 'This change will be recorded immediately to Firebase and Audit Logs.'}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-950/70">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            {language === 'bn' ? 'বাতিল' : 'Cancel'}
          </button>

          {!isConfirming ? (
            <button
              onClick={() => setIsConfirming(true)}
              className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow-lg shadow-amber-900/30 flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? 'পরিবর্তন পর্যালোচনা ও নিশ্চিত করুন' : 'Review & Confirm'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsConfirming(false)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
              >
                {language === 'bn' ? 'পিছনে' : 'Back'}
              </button>
              <button
                onClick={handleExecuteUpdate}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-lg shadow-red-900/40 flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmitting ? (
                  <span>{language === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...'}</span>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'হ্যাঁ, বাজেট আপডেট করুন' : 'Yes, Update Budget'}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
