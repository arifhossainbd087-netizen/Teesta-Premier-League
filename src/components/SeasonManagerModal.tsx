import React, { useState } from 'react';
import {
  Calendar,
  Plus,
  Edit2,
  Archive,
  CheckCircle2,
  Copy,
  Clock,
  DollarSign,
  AlertCircle,
  X,
  Sparkles,
  Shield,
  FileText,
} from 'lucide-react';
import { Season } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  createSeason,
  activateSeason,
  archiveSeason,
  updateSeasonConfig,
} from '../services/auctionService';
import { formatBDT } from '../utils/formatters';
import { EditableText } from './common/EditableText';
import { updateSeasonField } from '../services/editService';

interface SeasonManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  seasons: Season[];
  currentSeasonId: string;
  onSelectSeason: (seasonId: string) => void;
}

export const SeasonManagerModal: React.FC<SeasonManagerModalProps> = ({
  isOpen,
  onClose,
  seasons,
  currentSeasonId,
  onSelectSeason,
}) => {
  const { language, currentUser } = useAuth();

  const [activeView, setActiveView] = useState<'list' | 'create' | 'edit'>('list');
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);

  // Form states for Create/Edit
  const [seasonName, setSeasonName] = useState('');
  const [seasonCode, setSeasonCode] = useState('S3');
  const [seasonYear, setSeasonYear] = useState<number>(new Date().getFullYear() + 1);
  const [defaultBudget, setDefaultBudget] = useState<number>(100000);
  const [defaultBasePrice, setDefaultBasePrice] = useState<number>(2500);
  const [defaultMinIncrement, setDefaultMinIncrement] = useState<number>(1000);
  const [defaultTimerSeconds, setDefaultTimerSeconds] = useState<number>(20);
  const [maxSquadSize, setMaxSquadSize] = useState<number>(15);
  const [regFeeAmount, setRegFeeAmount] = useState<number>(500);
  const [bKashNumber, setBKashNumber] = useState('01712-345678');
  const [nagadNumber, setNagadNumber] = useState('01912-345678');
  const [rocketNumber, setRocketNumber] = useState('01812-345678');
  const [tournamentRules, setTournamentRules] = useState('');
  const [copyTeamsFromSeasonId, setCopyTeamsFromSeasonId] = useState<string>('season-2-2026');
  const [shouldCopyTeams, setShouldCopyTeams] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleOpenCreate = () => {
    setSeasonName(`Teesta Premier League Season 3 (${seasonYear})`);
    setSeasonCode('S3');
    setSeasonYear(2027);
    setDefaultBudget(120000);
    setDefaultBasePrice(2500);
    setDefaultMinIncrement(1000);
    setDefaultTimerSeconds(20);
    setMaxSquadSize(15);
    setRegFeeAmount(500);
    setTournamentRules('তিস্তা প্রিমিয়ার লীগ সিজন ৩ এর নিয়মাবলী ও বাইলজ।');
    setShouldCopyTeams(true);
    if (seasons.length > 0) {
      setCopyTeamsFromSeasonId(seasons[0].id);
    }
    setActiveView('create');
  };

  const handleOpenEdit = (season: Season) => {
    setEditingSeason(season);
    setSeasonName(season.name);
    setSeasonCode(season.code);
    setSeasonYear(season.year);
    setDefaultBudget(season.defaultBudget);
    setDefaultBasePrice(season.defaultBasePrice);
    setDefaultMinIncrement(season.defaultMinIncrement);
    setDefaultTimerSeconds(season.defaultTimerSeconds);
    setMaxSquadSize(season.maxSquadSize);
    setRegFeeAmount(season.regFeeAmount);
    setBKashNumber(season.bKashNumber || '');
    setNagadNumber(season.nagadNumber || '');
    setRocketNumber(season.rocketNumber || '');
    setTournamentRules(season.tournamentRules || '');
    setActiveView('edit');
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedbackMessage(null);

    const result = await createSeason(
      {
        name: seasonName.trim(),
        code: seasonCode.trim().toUpperCase(),
        year: Number(seasonYear),
        status: 'draft',
        isLiveAuctionActive: false,
        defaultBudget: Number(defaultBudget),
        defaultBasePrice: Number(defaultBasePrice),
        defaultMinIncrement: Number(defaultMinIncrement),
        defaultTimerSeconds: Number(defaultTimerSeconds),
        maxSquadSize: Number(maxSquadSize),
        regFeeAmount: Number(regFeeAmount),
        bKashNumber: bKashNumber.trim(),
        nagadNumber: nagadNumber.trim(),
        rocketNumber: rocketNumber.trim(),
        tournamentRules: tournamentRules.trim(),
      },
      shouldCopyTeams ? copyTeamsFromSeasonId : undefined,
      currentUser?.email || 'admin'
    );

    setIsSubmitting(false);
    if (result.success) {
      setFeedbackMessage({ type: 'success', text: result.message });
      onSelectSeason(result.seasonId);
      setTimeout(() => {
        setActiveView('list');
        setFeedbackMessage(null);
      }, 1500);
    } else {
      setFeedbackMessage({ type: 'error', text: result.message });
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSeason) return;

    setIsSubmitting(true);
    setFeedbackMessage(null);

    const result = await updateSeasonConfig(
      editingSeason.id,
      {
        name: seasonName.trim(),
        code: seasonCode.trim().toUpperCase(),
        year: Number(seasonYear),
        defaultBudget: Number(defaultBudget),
        defaultBasePrice: Number(defaultBasePrice),
        defaultMinIncrement: Number(defaultMinIncrement),
        defaultTimerSeconds: Number(defaultTimerSeconds),
        maxSquadSize: Number(maxSquadSize),
        regFeeAmount: Number(regFeeAmount),
        bKashNumber: bKashNumber.trim(),
        nagadNumber: nagadNumber.trim(),
        rocketNumber: rocketNumber.trim(),
        tournamentRules: tournamentRules.trim(),
      },
      currentUser?.email || 'admin'
    );

    setIsSubmitting(false);
    if (result.success) {
      setFeedbackMessage({ type: 'success', text: result.message });
      setTimeout(() => {
        setActiveView('list');
        setFeedbackMessage(null);
      }, 1500);
    } else {
      setFeedbackMessage({ type: 'error', text: result.message });
    }
  };

  const handleActivate = async (seasonId: string) => {
    if (!window.confirm(language === 'bn' ? 'এই সিজনটিকে লাইভ অকশনের জন্য সক্রিয় করতে চান?' : 'Activate this season for live auction?')) return;
    const res = await activateSeason(seasonId, currentUser?.email || 'admin');
    if (res.success) {
      onSelectSeason(seasonId);
    } else {
      alert(res.message);
    }
  };

  const handleArchive = async (seasonId: string) => {
    if (!window.confirm(language === 'bn' ? 'এই সিজনটি আর্কাইভ করতে চান? আর্কাইভ সিজনে নতুন কোনো বিড দেওয়া যাবে না।' : 'Archive this season? Bidding will be locked.')) return;
    const res = await archiveSeason(seasonId, currentUser?.email || 'admin');
    if (!res.success) {
      alert(res.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[85vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {language === 'bn'
                  ? 'মাল্টি-সিজন টুর্নামেন্ট ম্যানেজমেন্ট'
                  : 'Multi-Season Tournament Management'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {language === 'bn'
                  ? 'সিজন ২ (২০২৬), সিজন ৩ (২০২৭) এবং ভবিষ্যতের সিজনসমূহ নিয়ন্ত্রণ ও সংরক্ষণ'
                  : 'Create, configure, activate and archive tournament seasons permanently'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedbackMessage && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{feedbackMessage.text}</span>
          </div>
        )}

        {/* View 1: Seasons List */}
        {activeView === 'list' && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {language === 'bn' ? 'মোট সিজন:' : 'Total Seasons:'} {seasons.length}
              </span>
              <button
                onClick={handleOpenCreate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{language === 'bn' ? 'নতুন সিজন তৈরি করুন' : 'Create New Season'}</span>
              </button>
            </div>

            <div className="space-y-3">
              {seasons.map(s => {
                const isCurrentViewing = s.id === currentSeasonId;
                const isLive = s.isLiveAuctionActive;

                return (
                  <div
                    key={s.id}
                    className={`p-4 rounded-2xl border transition-all space-y-3 ${
                      isCurrentViewing
                        ? 'bg-slate-950 border-emerald-500/50 shadow-lg'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <EditableText
                            value={s.name}
                            onSave={async (val) => {
                              await updateSeasonField(s.id, 'name', val, currentUser?.email || 'admin');
                            }}
                            label={language === 'bn' ? 'সিজনের নাম' : 'Season Name'}
                          >
                            <span className="text-sm font-bold text-white">{s.name}</span>
                          </EditableText>

                          <div className="flex items-center gap-1 font-mono text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                            <EditableText
                              value={s.code}
                              onSave={async (val) => {
                                await updateSeasonField(s.id, 'code', val, currentUser?.email || 'admin');
                              }}
                              label={language === 'bn' ? 'সিজন কোড' : 'Season Code'}
                              pencilClassName="text-amber-400 hover:text-amber-300"
                            >
                              <span className="font-bold">{s.code}</span>
                            </EditableText>

                            <span>•</span>

                            <EditableText
                              value={s.year}
                              type="number"
                              min={2020}
                              max={2050}
                              onSave={async (val) => {
                                await updateSeasonField(s.id, 'year', Number(val), currentUser?.email || 'admin');
                              }}
                              label={language === 'bn' ? 'সিজনের বছর' : 'Season Year'}
                              pencilClassName="text-slate-400 hover:text-amber-300"
                            >
                              <span>{s.year}</span>
                            </EditableText>
                          </div>

                          {isLive && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse">
                              {language === 'bn' ? '● লাইভ অকশন সক্রিয়' : '● Live Auction Active'}
                            </span>
                          )}
                          {s.status === 'archived' && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                              {language === 'bn' ? 'আর্কাইভকৃত' : 'Archived'}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2 text-[11px] text-slate-400">
                          <div className="flex items-center gap-1">
                            <span>{language === 'bn' ? 'বাজেট:' : 'Budget:'}</span>
                            <EditableText
                              value={s.defaultBudget}
                              type="number"
                              min={1000}
                              onSave={async (val) => {
                                await updateSeasonField(s.id, 'defaultBudget', Number(val), currentUser?.email || 'admin');
                              }}
                              label={language === 'bn' ? 'ডিফল্ট বাজেট' : 'Default Budget'}
                              pencilClassName="text-emerald-400 hover:text-emerald-300"
                            >
                              <strong className="text-slate-200 font-mono">{formatBDT(s.defaultBudget)}</strong>
                            </EditableText>
                          </div>

                          <div className="flex items-center gap-1">
                            <span>{language === 'bn' ? 'ভিত্তিমূল্য:' : 'Base:'}</span>
                            <EditableText
                              value={s.defaultBasePrice}
                              type="number"
                              min={500}
                              onSave={async (val) => {
                                await updateSeasonField(s.id, 'defaultBasePrice', Number(val), currentUser?.email || 'admin');
                              }}
                              label={language === 'bn' ? 'ডিফল্ট ভিত্তিমূল্য' : 'Default Base Price'}
                              pencilClassName="text-slate-400 hover:text-emerald-400"
                            >
                              <strong className="text-slate-200 font-mono">{formatBDT(s.defaultBasePrice)}</strong>
                            </EditableText>
                          </div>

                          <div className="flex items-center gap-1">
                            <span>{language === 'bn' ? 'ফি:' : 'Fee:'}</span>
                            <EditableText
                              value={typeof s.regFeeAmount === 'number' ? s.regFeeAmount : 500}
                              type="number"
                              min={0}
                              onSave={async (val) => {
                                await updateSeasonField(s.id, 'regFeeAmount', Number(val), currentUser?.email || 'admin');
                              }}
                              label={language === 'bn' ? 'নির্ধারিত নিবন্ধন ফি (টাকা)' : 'Registration Fee Amount'}
                              pencilClassName="text-slate-400 hover:text-emerald-400"
                            >
                              <strong className="text-slate-200 font-mono">{formatBDT(typeof s.regFeeAmount === 'number' ? s.regFeeAmount : 500)}</strong>
                            </EditableText>
                          </div>

                          <div className="flex items-center gap-1">
                            <span>{language === 'bn' ? 'টাইমার:' : 'Timer:'}</span>
                            <EditableText
                              value={s.defaultTimerSeconds}
                              type="number"
                              min={5}
                              max={120}
                              onSave={async (val) => {
                                await updateSeasonField(s.id, 'defaultTimerSeconds', Number(val), currentUser?.email || 'admin');
                              }}
                              label={language === 'bn' ? 'কাউন্টডাউন টাইমার' : 'Timer Duration'}
                              pencilClassName="text-slate-400 hover:text-emerald-400"
                            >
                              <strong className="text-slate-200 font-mono">{s.defaultTimerSeconds}s</strong>
                            </EditableText>
                          </div>

                          <div className="flex items-center gap-1">
                            <span>{language === 'bn' ? 'স্কোয়াড:' : 'Squad:'}</span>
                            <EditableText
                              value={s.maxSquadSize || 15}
                              type="number"
                              min={5}
                              max={30}
                              onSave={async (val) => {
                                await updateSeasonField(s.id, 'maxSquadSize', Number(val), currentUser?.email || 'admin');
                              }}
                              label={language === 'bn' ? 'সর্বোচ্চ স্কোয়াড' : 'Max Squad Limit'}
                              pencilClassName="text-slate-400 hover:text-emerald-400"
                            >
                              <strong className="text-slate-200 font-mono">{s.maxSquadSize || 15}</strong>
                            </EditableText>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleOpenEdit(s)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                        title="সম্পাদনা"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Actions Bar */}
                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap text-xs">
                      <button
                        onClick={() => onSelectSeason(s.id)}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                          isCurrentViewing
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                        }`}
                      >
                        {isCurrentViewing
                          ? language === 'bn'
                            ? '✓ বর্তমানে নির্বাচিত'
                            : '✓ Selected'
                          : language === 'bn'
                          ? 'এই সিজন দেখুন'
                          : 'View Season'}
                      </button>

                      <div className="flex items-center gap-1.5 ml-auto">
                        {!isLive && s.status !== 'archived' && (
                          <button
                            onClick={() => handleActivate(s.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 font-semibold border border-emerald-500/40 transition-colors cursor-pointer"
                          >
                            {language === 'bn' ? 'লাইভ সক্রিয় করুন' : 'Activate Live'}
                          </button>
                        )}

                        {s.status !== 'archived' && (
                          <button
                            onClick={() => handleArchive(s.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 font-semibold border border-slate-700 transition-colors cursor-pointer"
                            title="আর্কাইভ ও সমাপ্ত ঘোষণা করুন"
                          >
                            {language === 'bn' ? 'আর্কাইভ' : 'Archive'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* View 2: Create Season Form */}
        {activeView === 'create' && (
          <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs">
              {language === 'bn'
                ? 'নতুন সিজন তৈরি করলে পূর্ববর্তী কোনো সিজনের খেলোয়াড়, বিড বা আর্থিক হিসাব মুছবে না। এটি সম্পূর্ণ আলাদাভাবে সংরক্ষিত হবে।'
                : 'Creating a new season will never delete or overwrite historical data from previous seasons.'}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-slate-300 block mb-1 font-semibold">
                  {language === 'bn' ? 'সিজনের পুরো নাম' : 'Season Title'} *
                </label>
                <input
                  type="text"
                  required
                  value={seasonName}
                  onChange={e => setSeasonName(e.target.value)}
                  placeholder="e.g. Teesta Premier League Season 3 (২০২৭)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">
                  {language === 'bn' ? 'কোড ও বছর' : 'Code & Year'} *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={seasonCode}
                    onChange={e => setSeasonCode(e.target.value)}
                    className="w-20 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono uppercase"
                  />
                  <input
                    type="number"
                    required
                    value={seasonYear}
                    onChange={e => setSeasonYear(parseInt(e.target.value, 10) || 2027)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Financial & Auction Parameters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div>
                <label className="text-slate-300 block mb-1 font-semibold">
                  {language === 'bn' ? 'দল বাজেট (৳)' : 'Team Budget'}
                </label>
                <input
                  type="number"
                  value={defaultBudget}
                  onChange={e => setDefaultBudget(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">
                  {language === 'bn' ? 'ভিত্তিমূল্য (৳)' : 'Base Price'}
                </label>
                <input
                  type="number"
                  value={defaultBasePrice}
                  onChange={e => setDefaultBasePrice(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">
                  {language === 'bn' ? 'ন্যূনতম বৃদ্ধি (৳)' : 'Min Increment'}
                </label>
                <input
                  type="number"
                  value={defaultMinIncrement}
                  onChange={e => setDefaultMinIncrement(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">
                  {language === 'bn' ? 'টাইমার (সেকেন্ড)' : 'Timer Seconds'}
                </label>
                <input
                  type="number"
                  value={defaultTimerSeconds}
                  onChange={e => setDefaultTimerSeconds(parseInt(e.target.value, 10) || 20)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                />
              </div>
            </div>

            {/* Squad & Fee */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-slate-300 block mb-1 font-semibold">
                  {language === 'bn' ? 'সর্বোচ্চ স্কোয়াড' : 'Max Squad Capacity'}
                </label>
                <input
                  type="number"
                  value={maxSquadSize}
                  onChange={e => setMaxSquadSize(parseInt(e.target.value, 10) || 15)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">
                  {language === 'bn' ? 'নিবন্ধন ফি (৳)' : 'Player Fee (BDT)'}
                </label>
                <input
                  type="number"
                  min={0}
                  value={regFeeAmount}
                  onChange={e => setRegFeeAmount(e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                />
              </div>
            </div>

            {/* Copy Teams Option */}
            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-200">
                <input
                  type="checkbox"
                  checked={shouldCopyTeams}
                  onChange={e => setShouldCopyTeams(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 bg-slate-900 border-slate-700 cursor-pointer"
                />
                <span>
                  {language === 'bn'
                    ? 'পূর্ববর্তী সিজন থেকে দলের টেমপ্লেট কপি করুন (রিসেট বাজেট সহ)'
                    : 'Copy team templates from previous season (with fresh 0 spent budgets)'}
                </span>
              </label>

              {shouldCopyTeams && (
                <div className="pl-6 pt-1">
                  <label className="text-slate-400 block mb-1">
                    {language === 'bn' ? 'কোন সিজন থেকে কপি করবেন?' : 'Source Season:'}
                  </label>
                  <select
                    value={copyTeamsFromSeasonId}
                    onChange={e => setCopyTeamsFromSeasonId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white cursor-pointer"
                  >
                    {seasons.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveView('list')}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700 cursor-pointer"
              >
                {language === 'bn' ? 'ফিরে যান' : 'Back'}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (language === 'bn' ? 'তৈরি হচ্ছে...' : 'Creating...') : (language === 'bn' ? 'সিজন তৈরি সম্পন্ন করুন' : 'Create Season')}
              </button>
            </div>
          </form>
        )}

        {/* View 3: Edit Season Form */}
        {activeView === 'edit' && editingSeason && (
          <form onSubmit={handleEditSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
            <div>
              <label className="text-slate-300 block mb-1 font-semibold">
                {language === 'bn' ? 'সিজনের পুরো নাম' : 'Season Title'}
              </label>
              <input
                type="text"
                required
                value={seasonName}
                onChange={e => setSeasonName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-slate-300 block mb-1 font-semibold">
                  {language === 'bn' ? 'দল বাজেট (৳)' : 'Team Budget'}
                </label>
                <input
                  type="number"
                  value={defaultBudget}
                  onChange={e => setDefaultBudget(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">
                  {language === 'bn' ? 'ভিত্তিমূল্য (৳)' : 'Base Price'}
                </label>
                <input
                  type="number"
                  value={defaultBasePrice}
                  onChange={e => setDefaultBasePrice(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">
                  {language === 'bn' ? 'ন্যূনতম বৃদ্ধি (৳)' : 'Min Increment'}
                </label>
                <input
                  type="number"
                  value={defaultMinIncrement}
                  onChange={e => setDefaultMinIncrement(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">
                  {language === 'bn' ? 'টাইমার (সেকেন্ড)' : 'Timer'}
                </label>
                <input
                  type="number"
                  value={defaultTimerSeconds}
                  onChange={e => setDefaultTimerSeconds(parseInt(e.target.value, 10) || 20)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 block mb-1 font-semibold">
                  {language === 'bn' ? 'সর্বোচ্চ স্কোয়াড' : 'Max Squad'}
                </label>
                <input
                  type="number"
                  value={maxSquadSize}
                  onChange={e => setMaxSquadSize(parseInt(e.target.value, 10) || 15)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">
                  {language === 'bn' ? 'নিবন্ধন ফি (৳)' : 'Registration Fee'}
                </label>
                <input
                  type="number"
                  min={0}
                  value={regFeeAmount}
                  onChange={e => setRegFeeAmount(e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveView('list')}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700 cursor-pointer"
              >
                {language === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (language === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...') : (language === 'bn' ? 'সংরক্ষণ করুন' : 'Save Changes')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
