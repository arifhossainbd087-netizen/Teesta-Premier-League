import React, { useState, useEffect } from 'react';
import { X, UserPlus, CheckCircle2, ShieldAlert, CreditCard, Sparkles, FileText, Phone, MapPin, Settings } from 'lucide-react';
import { PlayerPosition, PlayerCategory, PaymentMethod, RegistrationSettings } from '../types';
import { doc, collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { formatBDT } from '../utils/formatters';
import { PlayerPhotoUploader } from './PlayerPhotoUploader';
import { useAuth } from '../context/AuthContext';
import { EditableText } from './common/EditableText';
import { updateSeasonField } from '../services/editService';
import {
  DEFAULT_REGISTRATION_SETTINGS,
  formatFormDisplay,
  registerPlayerWithAtomicFormNumber,
} from '../services/registrationService';
import { RegistrationSettingsModal } from './RegistrationSettingsModal';

interface PlayerRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'bn' | 'en';
  onSuccess: () => void;
  currentSeasonId?: string;
  seasonFee?: number;
  seasonName?: string;
}

export const PlayerRegistrationModal: React.FC<PlayerRegistrationModalProps> = ({
  isOpen,
  onClose,
  language,
  onSuccess,
  currentSeasonId = 'season-2-2026',
  seasonFee = 500,
  seasonName,
}) => {
  const { isAdmin, currentUser } = useAuth();
  const [name, setName] = useState('');
  const [age, setAge] = useState<number>(20);
  const [position, setPosition] = useState<PlayerPosition>('Forward');
  const [phone, setPhone] = useState('');
  const [union, setUnion] = useState('');
  const [category, setCategory] = useState<PlayerCategory>('B');
  const [area, setArea] = useState('');
  const [jerseySize, setJerseySize] = useState('L');
  const [prevClub, setPrevClub] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bKash');
  const [paymentTrxId, setPaymentTrxId] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [regSettings, setRegSettings] = useState<RegistrationSettings>(DEFAULT_REGISTRATION_SETTINGS);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [registeredPlayerInfo, setRegisteredPlayerInfo] = useState<{
    id: string;
    regNo: string;
    name: string;
    formNumber: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Subscribe to authoritative registration settings & sequential counter
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'registration'),
      snap => {
        if (snap.exists()) {
          setRegSettings({ ...DEFAULT_REGISTRATION_SETTINGS, ...(snap.data() as RegistrationSettings) });
        }
      },
      err => {
        console.warn('Registration settings listener notice:', err);
      }
    );
    return () => unsub();
  }, []);

  const currentDisplayFormNumber = formatFormDisplay(
    regSettings.nextFormNumber || 1,
    regSettings,
    language
  );

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanPhone = phone.trim().replace(/\D/g, '');
    const cleanUnion = union.trim();

    if (!cleanName) {
      setErrorMessage(language === 'bn' ? 'অনুগ্রহ করে খেলোয়াড়ের নাম লিখুন।' : 'Please enter player name.');
      return;
    }

    if (age < 12 || age > 50) {
      setErrorMessage(language === 'bn' ? 'খেলোয়াড়ের বয়স ১২ থেকে ৫০ বছরের মধ্যে হতে হবে।' : 'Age must be between 12 and 50.');
      return;
    }

    if (cleanPhone.length !== 11 || !cleanPhone.startsWith('01')) {
      setErrorMessage(language === 'bn' ? 'সঠিক ১১ ডিজিটের মোবাইল নম্বর প্রদান করুন (যেমন: 017XXXXXXXX)।' : 'Please provide a valid 11-digit mobile number.');
      return;
    }

    if (!cleanUnion) {
      setErrorMessage(language === 'bn' ? 'অনুগ্রহ করে ইউনিয়ন উল্লেখ করুন।' : 'Please enter union name.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // Duplicate registration check by phone number within the season
      const dupQuery = query(
        collection(db, 'players'),
        where('phone', '==', cleanPhone),
        where('seasonId', '==', currentSeasonId)
      );
      const dupSnap = await getDocs(dupQuery);
      if (!dupSnap.empty) {
        setIsSubmitting(false);
        setErrorMessage(
          language === 'bn'
            ? `এই মোবাইল নম্বর (${cleanPhone}) দিয়ে ইতোমধ্যেই এই সিজনে একজন খেলোয়াড় নিবন্ধিত হয়েছেন।`
            : `A player with phone ${cleanPhone} is already registered in this season.`
        );
        return;
      }

      // Base price based on category
      const calculatedBasePrice =
        category === 'A' ? 4000 : category === 'B' ? 3000 : category === 'C' ? 2000 : 1500;

      const playerPayload = {
        name: cleanName,
        banglaName: cleanName,
        age: Number(age),
        position,
        category,
        phone: cleanPhone,
        union: cleanUnion,
        area: cleanUnion + (area.trim() ? `, ${area.trim()}` : ''),
        jerseySize,
        prevClub: prevClub.trim() || 'স্থানীয় ফুটবলার',
        regFee: typeof seasonFee === 'number' && !isNaN(seasonFee) ? seasonFee : 500,
        paymentMethod,
        paymentTrxId: paymentTrxId.trim() || '',
        paymentStatus: paymentMethod === 'Cash' ? 'Pending' as const : paymentTrxId.trim() ? 'Paid' as const : 'Pending' as const,
        approvalStatus: 'pending' as const,
        basePrice: calculatedBasePrice,
        auctionStatus: 'upcoming' as const,
        round: 1,
        photoUrl: photoUrl.trim() || '',
      };

      // Atomic, Concurrency-Safe Sequential Form Numbering via Firestore Transaction
      const regResult = await registerPlayerWithAtomicFormNumber(playerPayload, currentSeasonId);

      if (!regResult.success || !regResult.player) {
        setIsSubmitting(false);
        setErrorMessage(
          regResult.error ||
            (language === 'bn'
              ? 'নিবন্ধন সম্পন্ন করতে ব্যর্থ হয়েছে। অনুগ্রহ করে ইন্টারনেট কানেকশন যাচাই করে পুনরায় চেষ্টা করুন।'
              : 'Registration failed. Please check network connection and try again.')
        );
        return;
      }

      setRegisteredPlayerInfo({
        id: regResult.player.id,
        regNo: regResult.registrationNumber || regResult.player.registrationNumber || '',
        name: cleanName,
        formNumber: regResult.assignedFormNumber || currentDisplayFormNumber,
      });
      setIsSubmitting(false);
      setSubmitted(true);
      onSuccess();
    } catch (err: any) {
      console.error('Registration error:', err);
      setIsSubmitting(false);
      setErrorMessage(
        err?.message ||
          (language === 'bn'
            ? 'নিবন্ধন সম্পন্ন করতে ব্যর্থ হয়েছে। অনুগ্রহ করে ইন্টারনেট কানেকশন যাচাই করে পুনরায় চেষ্টা করুন।'
            : 'Registration failed. Please check network connection and try again.')
      );
    }
  };

  const handleReset = () => {
    setName('');
    setPhone('');
    setUnion('');
    setArea('');
    setPrevClub('');
    setPaymentTrxId('');
    setPhotoUrl('');
    setSubmitted(false);
    setRegisteredPlayerInfo(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header - Sequential Form Official Branding */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold font-mono">
                  {currentDisplayFormNumber}
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold">{seasonName || 'TPL S2'}</span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-emerald-400 bg-slate-800/80 hover:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 transition-colors cursor-pointer"
                    title={language === 'bn' ? 'ফরম নম্বর সেটিংস পরিবর্তন' : 'Configure Form Number'}
                  >
                    <Settings className="w-3 h-3" />
                    <span>{language === 'bn' ? 'সেটিংস' : 'Settings'}</span>
                  </button>
                )}
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white mt-0.5">
                {language === 'bn'
                  ? 'খেলোয়াড় নিবন্ধন আবেদন ফরম'
                  : `Player Registration Form (${currentDisplayFormNumber})`}
              </h3>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="py-6 text-center space-y-3.5">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-950">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold font-mono">
                {registeredPlayerInfo?.formNumber || currentDisplayFormNumber} সফলভাবে গৃহীত
              </span>
              <h4 className="text-lg font-bold text-white mt-1">
                {registeredPlayerInfo?.name || name}
              </h4>
              <p className="text-xs text-slate-400 font-mono">
                রেজিস্ট্রেশন নম্বর: <strong className="text-emerald-400">{registeredPlayerInfo?.regNo}</strong>
              </p>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
              {language === 'bn'
                ? 'আপনার আবেদনটি টুর্নামেন্ট কমিটির কাছে জমা হয়েছে। যাচাই ও কমিটি অনুমোদনের পর প্লেয়ার নিলাম পুলে আপনার নাম অন্তর্ভুক্ত হবে।'
                : 'Your registration has been submitted. After committee approval, your profile will be active in the live auction draft pool.'}
            </div>
            <button
              onClick={handleReset}
              className="mt-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              {language === 'bn' ? 'সম্পন্ন (Done)' : 'Done'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-xs">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Official Notice */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
              <span>{language === 'bn' ? 'অফিসিয়াল ফরম:' : 'Official Form:'} <strong className="text-amber-300 font-mono">{currentDisplayFormNumber}</strong></span>
              <span>{language === 'bn' ? 'টুর্নামেন্ট:' : 'Tournament:'} <strong className="text-emerald-400">{seasonName || 'TPL Season 2'}</strong></span>
            </div>

            {/* ১. নাম:- */}
            <div>
              <label className="text-slate-300 font-medium block mb-1">
                নাম:- <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="খেলোয়াড়ের পূর্ণ নাম লিখুন (e.g. Arif Hossain)"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* ২. বয়স:- ও পজিশন:- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  বয়স:- <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  min={12}
                  max={50}
                  required
                  value={age}
                  onChange={e => setAge(parseInt(e.target.value, 10) || 18)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  পজিশন:- <span className="text-rose-400">*</span>
                </label>
                <select
                  value={position}
                  onChange={e => setPosition(e.target.value as PlayerPosition)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="Goalkeeper">গোলকিপার</option>
                  <option value="Defender">ডিফেন্ডার</option>
                  <option value="Midfielder">মিডফিল্ডার</option>
                  <option value="Forward">স্ট্রাইকার</option>
                </select>
              </div>
            </div>

            {/* ৩. মোবাইল:- ও ইউনিয়ন:- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-medium block mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-emerald-400" />
                  <span>মোবাইল:-</span> <span className="text-rose-400">*</span>
                </label>
                <input
                  type="tel"
                  required
                  maxLength={11}
                  placeholder="01XXXXXXXXX"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-emerald-400" />
                  <span>ইউনিয়ন:-</span> <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="যেমন: বালাপাড়া / টেপামধুপুর"
                  value={union}
                  onChange={e => setUnion(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* ৪. ক্যাটাগরি: Selection */}
            <div>
              <label className="text-slate-300 font-medium block mb-1.5">
                ক্যাটাগরি: <span className="text-rose-400">*</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['A', 'B', 'C', 'D'] as PlayerCategory[]).map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`py-2 px-3 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer flex flex-col items-center justify-center ${
                      category === cat
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-950 scale-102'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span>ক্যাটাগরি {cat}</span>
                    <span className="text-[10px] opacity-80 font-mono mt-0.5">
                      {cat === 'A' ? '৳৪,০০০' : cat === 'B' ? '৳৩,০০০' : cat === 'C' ? '৳২,০০০' : '৳১,৫০০'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* অন্যান্য তথ্য (ঐচ্ছিক): এলাকা / গ্রাম / জার্সি */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-slate-400 font-medium block mb-1">
                  গ্রাম / এলাকা (ঐচ্ছিক):
                </label>
                <input
                  type="text"
                  placeholder="গ্রাম / ডাকঘর"
                  value={area}
                  onChange={e => setArea(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-slate-400 font-medium block mb-1">
                  বিগত ক্লাব / অভিজ্ঞতা:
                </label>
                <input
                  type="text"
                  placeholder="যেমন: তিস্তা একাদশ"
                  value={prevClub}
                  onChange={e => setPrevClub(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Player Photo Upload */}
            <div className="pt-1">
              <label className="text-slate-300 font-medium block mb-1">
                খেলোয়াড়ের ছবি (ঐচ্ছিক):
              </label>
              <PlayerPhotoUploader
                currentPhotoUrl={photoUrl}
                onPhotoChanged={setPhotoUrl}
                playerId="draft"
                seasonId={currentSeasonId}
                language={language}
                isAdmin={isAdmin}
                allowPublicUpload={true}
              />
            </div>

            {/* Registration Fee & Payment Details */}
            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  <span>নিবন্ধন ফি</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-sm text-emerald-400">
                    {formatBDT(typeof seasonFee === 'number' && !isNaN(seasonFee) ? seasonFee : 500)}
                  </span>
                  {isAdmin && (
                    <EditableText
                      value={typeof seasonFee === 'number' ? seasonFee : 500}
                      type="number"
                      min={0}
                      onSave={async (val) => {
                        const num = Number(val);
                        if (isNaN(num) || num < 0) {
                          throw new Error(
                            language === 'bn'
                              ? 'নিবন্ধন ফি অবশ্যই ০ বা তার বেশি সংখ্যা হতে হবে।'
                              : 'Fee must be a valid number (0 or higher).'
                          );
                        }
                        await updateSeasonField(currentSeasonId, 'regFeeAmount', num, currentUser?.email || 'admin');
                      }}
                      label={language === 'bn' ? 'নির্ধারিত নিবন্ধন ফি পরিবর্তন' : 'Change Registration Fee'}
                      pencilClassName="text-emerald-400 hover:text-emerald-300"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {(['bKash', 'Nagad', 'Rocket', 'Cash'] as PaymentMethod[]).map(method => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      paymentMethod === method
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>

              {paymentMethod !== 'Cash' ? (
                <div>
                  <div className="text-[11px] text-slate-400 mb-1">
                    কমিটির {paymentMethod} নম্বরে সেন্ড মানি করে TrxID দিন:
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. BK9A8872X"
                    value={paymentTrxId}
                    onChange={e => setPaymentTrxId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono placeholder-slate-600"
                  />
                </div>
              ) : (
                <div className="text-[11px] text-amber-400/90 italic">
                  ক্যাশ পেমেন্ট টুর্নামেন্ট কমিটির কাছে সরাসরি পরিশোধ করে অনুমোদন গ্রহণ করতে হবে।
                </div>
              )}
            </div>

            {/* Submit Action */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700 cursor-pointer"
              >
                বাতিল (Cancel)
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold shadow-lg shadow-emerald-950 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting
                  ? language === 'bn'
                    ? 'যাচাই ও জমা হচ্ছে...'
                    : 'Submitting...'
                  : language === 'bn'
                  ? `${currentDisplayFormNumber} জমা দিন`
                  : `Submit ${currentDisplayFormNumber}`}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Admin Registration Settings Modal */}
      {isAdmin && (
        <RegistrationSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          language={language}
          currentUserEmail={currentUser?.email || 'admin'}
          onSettingsSaved={newSettings => setRegSettings(newSettings)}
        />
      )}
    </div>
  );
};

