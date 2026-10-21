import React, { useState, useEffect } from 'react';
import {
  FileText,
  Settings,
  X,
  Save,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Hash,
  Eye,
  Layers,
  Sparkles,
} from 'lucide-react';
import { RegistrationSettings } from '../types';
import {
  DEFAULT_REGISTRATION_SETTINGS,
  formatFormDisplay,
  getRegistrationSettings,
  updateRegistrationSettings,
  checkFormNumberConflict,
  toBengaliDigits,
} from '../services/registrationService';

interface RegistrationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'bn' | 'en';
  currentUserEmail?: string;
  onSettingsSaved?: (newSettings: RegistrationSettings) => void;
}

export const RegistrationSettingsModal: React.FC<RegistrationSettingsModalProps> = ({
  isOpen,
  onClose,
  language,
  currentUserEmail = 'admin',
  onSettingsSaved,
}) => {
  const [settings, setSettings] = useState<RegistrationSettings>(DEFAULT_REGISTRATION_SETTINGS);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // Form local state
  const [startNum, setStartNum] = useState<number>(1);
  const [nextNum, setNextNum] = useState<number>(1);
  const [labelBn, setLabelBn] = useState<string>('ফরম নং:- ');
  const [labelEn, setLabelEn] = useState<string>('Form No. ');
  const [digitFormat, setDigitFormat] = useState<'bn' | 'en'>('bn');

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const data = await getRegistrationSettings();
      setSettings(data);
      setStartNum(data.startFormNumber || 1);
      setNextNum(data.nextFormNumber || 1);
      setLabelBn(data.labelBn || data.prefix || 'ফরম নং:- ');
      setLabelEn(data.labelEn || 'Form No. ');
      setDigitFormat(data.digitFormat || 'bn');
    } catch (err: any) {
      setErrorMessage(err?.message || 'সেটিংস লোড করতে ব্যর্থ হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  // Check for conflicts whenever nextNum changes
  useEffect(() => {
    let active = true;
    const checkConflict = async () => {
      if (nextNum < 1) {
        setConflictWarning(language === 'bn' ? 'ফরম নম্বর অবশ্যই ১ বা তার বেশি হতে হবে।' : 'Form number must be >= 1');
        return;
      }

      const res = await checkFormNumberConflict(nextNum);
      if (active) {
        if (res.hasConflict && res.conflictingPlayer) {
          setConflictWarning(
            language === 'bn'
              ? `সতর্কতা: ফরম নং ${nextNum} ইতোমধ্যে খেলোয়াড় "${res.conflictingPlayer.name}" এর জন্য ব্যবহৃত হয়েছে!`
              : `Warning: Form No. ${nextNum} is already assigned to player "${res.conflictingPlayer.name}"!`
          );
        } else {
          setConflictWarning(null);
        }
      }
    };

    checkConflict();
    return () => {
      active = false;
    };
  }, [nextNum, language]);

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    if (startNum < 1) {
      setErrorMessage(
        language === 'bn'
          ? 'প্রারম্ভিক ফরম নম্বর অবশ্যই ১ বা তার বেশি হতে হবে।'
          : 'Starting form number must be 1 or higher.'
      );
      setSaving(false);
      return;
    }

    if (nextNum < 1) {
      setErrorMessage(
        language === 'bn'
          ? 'পরবর্তী ফরম নম্বর অবশ্যই ১ বা তার বেশি হতে হবে।'
          : 'Next form number must be 1 or higher.'
      );
      setSaving(false);
      return;
    }

    try {
      const result = await updateRegistrationSettings(
        {
          startFormNumber: Number(startNum),
          nextFormNumber: Number(nextNum),
          prefix: labelBn.trim() || 'ফরম নং:- ',
          labelBn: labelBn.trim() || 'ফরম নং:- ',
          labelEn: labelEn.trim() || 'Form No. ',
          digitFormat,
        },
        currentUserEmail
      );

      if (result.success && result.settings) {
        setSettings(result.settings);
        setSuccessMessage(
          language === 'bn'
            ? 'রেজিস্ট্রেশন ফরম সেটিংস সফলভাবে সেভ হয়েছে।'
            : 'Registration settings successfully saved.'
        );
        if (onSettingsSaved) {
          onSettingsSaved(result.settings);
        }
        setTimeout(() => {
          setSuccessMessage(null);
        }, 3000);
      } else {
        setErrorMessage(result.error || 'সেটিংস আপডেট ব্যর্থ হয়েছে');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'ত্রুটি দেখা দিয়েছে');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = () => {
    setStartNum(1);
    setNextNum(1);
    setLabelBn('ফরম নং:- ');
    setLabelEn('Form No. ');
    setDigitFormat('bn');
    setErrorMessage(null);
    setConflictWarning(null);
  };

  if (!isOpen) return null;

  // Mock preview values
  const previewSampleNum = nextNum || 1;
  const previewFormattedBn = formatFormDisplay(
    previewSampleNum,
    { labelBn, labelEn, prefix: labelBn, digitFormat },
    'bn'
  );
  const previewFormattedEn = formatFormDisplay(
    previewSampleNum,
    { labelBn, labelEn, prefix: labelBn, digitFormat },
    'en'
  );
  const previewSerialCode = `TPL-S2-${String(previewSampleNum).padStart(3, '0')}`;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-xl w-full p-5 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-emerald-500 text-slate-950 flex items-center justify-center shadow-md font-bold">
              <Settings className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold font-mono">
                  Admin Control
                </span>
                <span className="text-[10px] text-slate-400 font-semibold">TPL Season 2</span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white mt-0.5">
                {language === 'bn'
                  ? 'খেলোয়াড় নিবন্ধন ও ফরম নম্বর সেটিংস'
                  : 'Player Registration & Form Number Settings'}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-2"></div>
            <span>{language === 'bn' ? 'সেটিংস লোড হচ্ছে...' : 'Loading settings...'}</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
            {/* Feedback Banners */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {conflictWarning && (
              <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{conflictWarning}</span>
              </div>
            )}

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 block font-medium">
                  {language === 'bn' ? 'প্রারম্ভিক ফরম' : 'Start Number'}
                </span>
                <span className="text-sm font-bold text-amber-400 font-mono">
                  {settings.startFormNumber || 1}
                </span>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 block font-medium">
                  {language === 'bn' ? 'পরবর্তী ফরম নং' : 'Next Form No'}
                </span>
                <span className="text-sm font-bold text-emerald-400 font-mono">
                  {settings.nextFormNumber || 1}
                </span>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 block font-medium">
                  {language === 'bn' ? 'মোট নিবন্ধন' : 'Total Regs'}
                </span>
                <span className="text-sm font-bold text-cyan-400 font-mono">
                  {settings.totalRegistrations || 0}
                </span>
              </div>
            </div>

            {/* Live Visual Preview Box */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border border-emerald-500/30 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-400">
                <span className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'লাইভ প্রিভিউ (ফরম প্রদর্শন)' : 'Live Preview'}</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {language === 'bn' ? 'পরবর্তী আবেদনকারী যা দেখবেন' : 'Next registrant view'}
                </span>
              </div>

              {/* Form Header Preview */}
              <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold font-mono">
                    {previewFormattedBn}
                  </span>
                  <span className="text-white font-bold text-xs">
                    {language === 'bn' ? 'খেলোয়াড় নিবন্ধন আবেদন ফরম' : 'Player Registration Form'}
                  </span>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono font-semibold">TPL S2</span>
              </div>

              {/* Form Official Field Preview */}
              <div className="p-2 bg-slate-950 rounded-lg border border-slate-800/80 flex items-center justify-between text-[11px] text-slate-300">
                <span>
                  {language === 'bn' ? 'অফিসিয়াল ফরম:' : 'Official Form:'}{' '}
                  <strong className="text-amber-300 font-mono">{previewFormattedBn}</strong>
                </span>
                <span className="text-slate-400 font-mono">
                  সিরিয়াল: <strong className="text-emerald-400">{previewSerialCode}</strong>
                </span>
              </div>
            </div>

            {/* Input Controls */}
            <div className="space-y-3.5">
              {/* 1. Starting Form Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    {language === 'bn' ? 'প্রারম্ভিক ফরম নম্বর:' : 'Starting Form Number:'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={startNum}
                    onChange={e => setStartNum(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    placeholder="1"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    {language === 'bn' ? 'ডিফল্ট মান: ১ (Starting base)' : 'Default: 1'}
                  </span>
                </div>

                {/* 2. Next Registration Number */}
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    {language === 'bn' ? 'পরবর্তী ফরম নম্বর (Next):' : 'Next Registration Number:'}
                  </label>
                  <input
                    type="number"
                    min={startNum}
                    value={nextNum}
                    onChange={e => setNextNum(parseInt(e.target.value, 10) || 1)}
                    className={`w-full bg-slate-950 border rounded-xl p-2.5 text-white font-mono focus:outline-none ${
                      conflictWarning
                        ? 'border-amber-500 text-amber-300 focus:border-amber-400'
                        : 'border-slate-700 focus:border-emerald-500'
                    }`}
                    placeholder="1"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    {language === 'bn'
                      ? 'স্বয়ংক্রিয়ভাবে প্রতি নিবন্ধনে +১ বাড়বে'
                      : 'Auto-increments by 1 on each registration'}
                  </span>
                </div>
              </div>

              {/* 3. Prefix & Label Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    {language === 'bn' ? 'বাংলা লেবেল / প্রিফিক্স:' : 'Bangla Prefix / Label:'}
                  </label>
                  <input
                    type="text"
                    value={labelBn}
                    onChange={e => setLabelBn(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500"
                    placeholder="ফরম নং:- "
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    {language === 'bn' ? 'যেমন: ফরম নং:- ১' : 'e.g. ফরম নং:- ১'}
                  </span>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    {language === 'bn' ? 'ইংরেজি লেবেল / প্রিফিক্স:' : 'English Prefix / Label:'}
                  </label>
                  <input
                    type="text"
                    value={labelEn}
                    onChange={e => setLabelEn(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500"
                    placeholder="Form No. "
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    {language === 'bn' ? 'যেমন: Form No. 1' : 'e.g. Form No. 1'}
                  </span>
                </div>
              </div>

              {/* 4. Digit Format Selection */}
              <div>
                <label className="text-slate-300 font-medium block mb-1.5">
                  {language === 'bn' ? 'সংখ্যার ফরম্যাট (Digit Style):' : 'Number Digit Style:'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDigitFormat('bn')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      digitFormat === 'bn'
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{language === 'bn' ? 'বাংলা সংখ্যা (১, ২, ৩)' : 'Bengali Digits (১, ২, ৩)'}</span>
                      {digitFormat === 'bn' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDigitFormat('en')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      digitFormat === 'en'
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{language === 'bn' ? 'ইংরেজি সংখ্যা (1, 2, 3)' : 'English Digits (1, 2, 3)'}</span>
                      {digitFormat === 'en' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="border-t border-slate-800 pt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs font-medium cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'রিসেট (Form 1)' : 'Reset Default'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              {language === 'bn' ? 'বাতিল' : 'Cancel'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-950 transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {saving
                  ? language === 'bn'
                    ? 'সেভ হচ্ছে...'
                    : 'Saving...'
                  : language === 'bn'
                  ? 'সেটিংস সেভ করুন'
                  : 'Save Settings'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
