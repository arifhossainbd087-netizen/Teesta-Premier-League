import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  Gavel,
  Clock,
  TrendingUp,
  AlertCircle,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Shield,
  User,
  MapPin,
  Calendar,
  Sparkles,
  Zap,
  ArrowRight,
  ChevronRight,
  Flame,
  FileText,
} from 'lucide-react';
import { AuctionState, Player, Team, Bid, Season } from '../types';
import { formatBDT, getPositionBadgeColor, getPositionLabel } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { EditableText } from './common/EditableText';
import {
  updateAuctionSetting,
  updateSeasonField,
  updatePlayerField,
  updateAuctionCurrentPlayerName,
} from '../services/editService';
import {
  placeAtomicBid,
  markCurrentPlayerSold,
  markCurrentPlayerUnsold,
  loadPlayerToAuction,
  toggleAuctionPause,
  resetAuctionTimer,
  executeFinalCallAndAdvance,
} from '../services/auctionService';

interface LiveAuctionRoomProps {
  auctionState: AuctionState | null;
  bids: Bid[];
  teams: Team[];
  approvedPlayers: Player[];
  onOpenPlayerSelectModal: () => void;
  currentSeason?: Season;
}

export const LiveAuctionRoom: React.FC<LiveAuctionRoomProps> = ({
  auctionState,
  bids,
  teams,
  approvedPlayers,
  onOpenPlayerSelectModal,
  currentSeason,
}) => {
  const { userRole, isAdmin, activeTeam, language, currentUser } = useAuth();

  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [customBidAmount, setCustomBidAmount] = useState<string>('');
  const [bidError, setBidError] = useState<string | null>(null);
  const [isBidding, setIsBidding] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Trigger confetti when player is marked as sold
  useEffect(() => {
    if (auctionState?.status === 'sold') {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#10b981', '#f59e0b', '#3b82f6', '#ec4899'],
      });
    }
  }, [auctionState?.status]);

  // Real-time Countdown timer calculation
  useEffect(() => {
    if (!auctionState || auctionState.status !== 'active' || !auctionState.timerExpiresAt) {
      if (auctionState?.status === 'paused') {
        // preserve current display
      } else {
        setTimeLeft(0);
      }
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((auctionState.timerExpiresAt! - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [auctionState?.timerExpiresAt, auctionState?.status]);

  // Handle Quick Bid (+20, +40, +50)
  const handleQuickBid = async (incrementAmount: number) => {
    if (!activeTeam) {
      setBidError(language === 'bn' ? 'ডাক দিতে দল নির্বাচন করুন।' : 'Select a team to place a bid.');
      return;
    }

    if (auctionState?.status !== 'active') {
      setBidError(
        language === 'bn'
          ? 'শেষ ডাক সম্পন্ন হয়েছে! এখন আর কোনো নতুন ডাক দেওয়া যাবে না।'
          : 'Bidding is closed after final call.'
      );
      return;
    }

    if (isBidding) return;

    const currentBid = auctionState?.currentBid || 0;
    const targetBid = currentBid + incrementAmount;

    await executeBid(targetBid);
  };

  // Handle Custom Bid
  const handleCustomBidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (auctionState?.status !== 'active') {
      setBidError(
        language === 'bn'
          ? 'শেষ ডাক সম্পন্ন হয়েছে! এখন আর কোনো নতুন ডাক দেওয়া যাবে না।'
          : 'Bidding is closed after final call.'
      );
      return;
    }
    const amount = parseInt(customBidAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      setBidError(language === 'bn' ? 'সঠিক টাকার পরিমাণ দিন' : 'Enter a valid amount');
      return;
    }
    await executeBid(amount);
  };

  const executeBid = async (amount: number) => {
    if (!activeTeam) return;
    if (isBidding) return;

    if (!currentUser) {
      setBidError(
        language === 'bn'
          ? 'ডাক দেওয়ার জন্য প্রথমে উপরে "লগইন" বাটনে ক্লিক করে সাইন ইন করুন।'
          : 'Please log in before submitting bids.'
      );
      return;
    }

    if (auctionState?.status !== 'active') {
      setBidError(
        language === 'bn'
          ? 'শেষ ডাক সম্পন্ন হয়েছে! এখন আর কোনো নতুন ডাক দেওয়া যাবে না।'
          : 'Bidding is closed after final call.'
      );
      return;
    }

    setBidError(null);
    setIsBidding(true);

    try {
      const result = await placeAtomicBid(
        activeTeam.id,
        activeTeam.name,
        amount,
        currentUser.email || activeTeam.name
      );

      if (!result.success) {
        setBidError(result.message);
      } else {
        setCustomBidAmount('');
        setActionSuccessMessage(result.message);
        setTimeout(() => setActionSuccessMessage(null), 3500);
      }
    } catch (err: any) {
      setBidError(err?.message || 'ডাক প্রদানে ত্রুটি হয়েছে');
    } finally {
      setIsBidding(false);
    }
  };

  const [isFinalizing, setIsFinalizing] = useState(false);

  // Admin Controls: Master "শেষ ডাক!" Workflow with Automatic Advance
  const handleFinalCall = async (forceUnsold: boolean = false) => {
    if (!currentUser) {
      alert(
        language === 'bn'
          ? 'শেষ ডাক নিশ্চিত করতে প্রথমে আপনার Google অ্যাডমিন অ্যাকাউন্ট (arifhossainbd087@gmail.com) দিয়ে লগইন করুন।'
          : 'Please sign in with your Google admin account to execute final call.'
      );
      return;
    }

    if (isFinalizing) return;

    const hasBid = Boolean(auctionState?.highestBidderTeamId && (auctionState.currentBid || 0) > 0);
    const willBeSold = !forceUnsold && hasBid;

    const confirmMsg = willBeSold
      ? (language === 'bn'
          ? `খেলোয়াড় '${auctionState?.currentPlayerName || ''}'-কে ৳${(auctionState?.currentBid || 0).toLocaleString()} মূল্যে '${auctionState?.highestBidderTeamName || ''}' দলের কাছে বিক্রিত ঘোষণা করে স্বয়ংক্রিয়ভাবে পরবর্তী খেলোয়াড়ে যেতে চান?`
          : `Declare SOLD to ${auctionState?.highestBidderTeamName} for ৳${(auctionState?.currentBid || 0).toLocaleString()} and advance to next player?`)
      : (language === 'bn'
          ? `খেলোয়াড় '${auctionState?.currentPlayerName || ''}'-কে অবিক্রিত (UNSOLD) ঘোষণা করে পরবর্তী খেলোয়াড়ে যেতে চান?`
          : `Declare UNSOLD and advance to next player?`);

    if (!window.confirm(confirmMsg)) return;

    setIsFinalizing(true);
    setBidError(null);

    try {
      const res = await executeFinalCallAndAdvance(
        currentUser.email || 'admin',
        currentSeason?.id || 'season-2-2026',
        forceUnsold
      );

      if (!res.success) {
        setBidError(res.message);
      } else {
        if (res.result === 'sold') {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
          });
        }
        setActionSuccessMessage(res.message);
        setTimeout(() => setActionSuccessMessage(null), 6000);
      }
    } catch (err: any) {
      setBidError(err?.message || 'শেষ ডাক প্রক্রিয়াকরণে ত্রুটি হয়েছে');
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleAdminSold = async () => {
    await handleFinalCall(false);
  };

  const handleAdminUnsold = async () => {
    await handleFinalCall(true);
  };

  const isCurrentLeader = Boolean(activeTeam && auctionState?.highestBidderTeamId === activeTeam.id);
  const minIncrement = auctionState?.minIncrement && auctionState.minIncrement <= 20 ? auctionState.minIncrement : 20;
  const currentHighestBid = auctionState?.currentBid || 0;
  const nextMinBid = currentHighestBid + minIncrement;

  return (
    <div className="space-y-6">
      {/* Top Banner Alert / Announcement */}
      {actionSuccessMessage && (
        <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-4 py-2.5 rounded-xl flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button
            onClick={() => setActionSuccessMessage(null)}
            className="text-xs text-emerald-400 hover:underline"
          >
            বন্ধ
          </button>
        </div>
      )}

      {/* Main Live Stage Layout: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Player Card & Live Hammer Stage (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Main Stage Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative">
            {/* Stage Spotlight Header */}
            <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 relative">
                  {auctionState?.status === 'active' && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-3 w-3 ${
                      auctionState?.status === 'active'
                        ? 'bg-emerald-500'
                        : auctionState?.status === 'sold'
                        ? 'bg-amber-400'
                        : auctionState?.status === 'unsold'
                        ? 'bg-rose-500'
                        : 'bg-slate-600'
                    }`}
                  ></span>
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  {auctionState?.status === 'active'
                    ? language === 'bn'
                      ? 'লাইভ নিলাম কক্ষ (LIVE BIDDING)'
                      : 'LIVE BIDDING ROOM'
                    : auctionState?.status === 'sold'
                    ? language === 'bn'
                      ? 'বিক্রিত ঘোষিত (SOLD)'
                      : 'PLAYER SOLD'
                    : auctionState?.status === 'unsold'
                    ? language === 'bn'
                      ? 'অবিক্রিত (UNSOLD)'
                      : 'PLAYER UNSOLD'
                    : language === 'bn'
                    ? 'নিলাম স্টেজ প্রস্তুত'
                    : 'AUCTION STAGE IDLE'}
                </span>
              </div>

              {/* Countdown Timer Display & Admin Setting */}
              <div className="flex items-center gap-2">
                {auctionState?.status === 'active' && (
                  <div
                    className={`flex items-center gap-2 px-3 py-1 rounded-full border ${
                      timeLeft <= 5
                        ? 'bg-rose-950/60 border-rose-500 text-rose-300 animate-pulse'
                        : 'bg-slate-800 border-slate-700 text-emerald-400'
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-mono font-bold">
                      {timeLeft}s{' '}
                      {timeLeft <= 5 && (
                        <span className="text-xs text-rose-400 font-sans ml-1">
                          {language === 'bn' ? 'শেষ ডাক!' : 'Last Call!'}
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {isAdmin && (
                  <EditableText
                    value={auctionState?.timerSeconds || currentSeason?.defaultTimerSeconds || 20}
                    type="number"
                    min={5}
                    max={120}
                    onSave={async (val) => {
                      await updateAuctionSetting('timerSeconds', Number(val), currentSeason?.id, currentUser?.email || 'admin');
                    }}
                    label={language === 'bn' ? 'কাউন্টডাউন টাইমার সময়কাল (সেকেন্ড)' : 'Countdown Duration (Seconds)'}
                    pencilClassName="text-slate-400 hover:text-emerald-400"
                  />
                )}
              </div>
            </div>

            {/* Active Player Showcase */}
            {auctionState?.currentPlayerId ? (
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                  {/* Player Avatar / Jersey Graphic */}
                  <div className="md:col-span-4 flex flex-col items-center">
                    <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl bg-gradient-to-b from-slate-800 to-slate-950 border-2 border-slate-700 p-2 shadow-xl relative overflow-hidden flex items-center justify-center group">
                      <div className="flex flex-col items-center justify-center text-slate-500 absolute">
                        <User className="w-16 h-16 text-slate-400 mb-1" />
                        <span className="text-[11px] font-semibold text-emerald-400">
                          TPL S2
                        </span>
                      </div>
                      {auctionState.currentPlayerPhoto && (
                        <img
                          src={auctionState.currentPlayerPhoto}
                          alt={auctionState.currentPlayerName}
                          onError={e => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                          className="w-full h-full object-cover rounded-xl relative z-10"
                        />
                      )}
                      {/* Sold / Unsold Overlay Badge */}
                      {auctionState.status === 'sold' && (
                        <div className="absolute inset-0 bg-emerald-950/85 backdrop-blur-xs flex flex-col items-center justify-center text-center p-2">
                          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center mb-1 text-emerald-400">
                            <CheckCircle2 className="w-7 h-7" />
                          </div>
                          <span className="text-xl font-extrabold text-emerald-300 tracking-wider">
                            SOLD!
                          </span>
                          <span className="text-xs text-emerald-200 mt-1 font-medium">
                            {auctionState.highestBidderTeamName}
                          </span>
                        </div>
                      )}
                      {auctionState.status === 'unsold' && (
                        <div className="absolute inset-0 bg-rose-950/85 backdrop-blur-xs flex flex-col items-center justify-center text-center p-2">
                          <XCircle className="w-10 h-10 text-rose-400 mb-1" />
                          <span className="text-xl font-extrabold text-rose-300 tracking-wider">
                            UNSOLD
                          </span>
                          <span className="text-[11px] text-rose-200 mt-1">
                            {language === 'bn' ? 'রাউন্ড ২ এর জন্য রাখা হয়েছে' : 'Saved for Round 2'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Player Details & Base Price */}
                  <div className="md:col-span-8 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {auctionState.currentPlayerPosition && (
                        <span
                          className={`text-xs px-2.5 py-1 rounded-md font-semibold border ${getPositionBadgeColor(
                            auctionState.currentPlayerPosition
                          )}`}
                        >
                          {getPositionLabel(auctionState.currentPlayerPosition, language === 'bn')}
                        </span>
                      )}
                      {auctionState.currentPlayerArea && (
                        <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {auctionState.currentPlayerArea}
                        </span>
                      )}
                      {auctionState.currentPlayerAge && (
                        <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {auctionState.currentPlayerAge} {language === 'bn' ? 'বছর' : 'years'}
                        </span>
                      )}
                    </div>

                    {auctionState.currentPlayerName && (
                      <EditableText
                        value={auctionState.currentPlayerName}
                        onSave={async (val) => {
                          if (auctionState.currentPlayerId) {
                            await updatePlayerField(auctionState.currentPlayerId, 'name', val, currentUser?.email || 'admin');
                          }
                          await updateAuctionCurrentPlayerName(String(val), currentUser?.email || 'admin');
                        }}
                        label={language === 'bn' ? 'খেলোয়াড়ের নাম' : 'Player Name'}
                        pencilClassName="text-slate-400 hover:text-emerald-400"
                      >
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                          {auctionState.currentPlayerName}
                        </h2>
                      </EditableText>
                    )}

                    {/* Price Cards Grid */}
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl flex flex-col justify-between">
                        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                          {language === 'bn' ? 'ভিত্তিমূল্য (Base Price)' : 'Base Price'}
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="text-base sm:text-lg font-bold text-slate-300">
                            {formatBDT(auctionState.currentBasePrice)}
                          </span>
                          <EditableText
                            value={auctionState.currentBasePrice}
                            type="number"
                            min={500}
                            onSave={async (val) => {
                              await updateAuctionSetting('currentBasePrice', Number(val), currentSeason?.id, currentUser?.email || 'admin');
                            }}
                            label={language === 'bn' ? 'নিলামের ভিত্তিমূল্য' : 'Base Price'}
                            pencilClassName="text-slate-400 hover:text-emerald-400"
                          />
                        </div>
                      </div>

                      <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl flex flex-col justify-between">
                        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                          {language === 'bn' ? 'ন্যূনতম বৃদ্ধি (Min Step)' : 'Min Increment'}
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="text-base sm:text-lg font-bold text-emerald-400">
                            +{formatBDT(auctionState.minIncrement)}
                          </span>
                          <EditableText
                            value={auctionState.minIncrement}
                            type="number"
                            min={100}
                            step={500}
                            onSave={async (val) => {
                              await updateAuctionSetting('minIncrement', Number(val), currentSeason?.id, currentUser?.email || 'admin');
                            }}
                            label={language === 'bn' ? 'ন্যূনতম ডাক বৃদ্ধি (Min Increment)' : 'Min Bid Increment'}
                            pencilClassName="text-emerald-400 hover:text-emerald-300"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Big Live Bid Screen Box */}
                <div className="mt-6 p-6 rounded-2xl bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border-2 border-emerald-500/40 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-10">
                    <Flame className="w-32 h-32 text-emerald-400" />
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <span className="text-xs uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4" />
                        {language === 'bn' ? 'বর্তমান সর্বোচ্চ ডাক (CURRENT HIGHEST BID)' : 'CURRENT HIGHEST BID'}
                      </span>
                      <div className="text-4xl sm:text-5xl font-black text-white font-mono tracking-tight mt-1">
                        {formatBDT(auctionState.currentBid)}
                      </div>
                    </div>

                    {/* Leading Team Banner */}
                    <div className="w-full sm:w-auto bg-slate-900/90 border border-slate-700/80 p-3.5 rounded-xl flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                          {language === 'bn' ? 'শীর্ষে থাকা দল' : 'Leading Team'}
                        </div>
                        <div className="text-sm font-bold text-emerald-300">
                          {auctionState.highestBidderTeamName || (
                            <span className="text-slate-400 italic font-normal">
                              {language === 'bn' ? 'কোনো ডাক আসেনি' : 'No bids yet'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : auctionState?.status === 'completed' ? (
              /* Auction Completed State */
              <div className="p-12 text-center space-y-4">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-emerald-600/30 via-teal-500/20 to-amber-500/30 border border-emerald-500/40 flex items-center justify-center text-amber-300 shadow-2xl shadow-emerald-950/60">
                  <Sparkles className="w-10 h-10 text-amber-400 animate-pulse" />
                </div>
                <div className="space-y-1.5">
                  <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider font-mono">
                    {language === 'bn' ? 'অকশন সমাপ্ত (AUCTION COMPLETED)' : 'AUCTION COMPLETED'}
                  </span>
                  <h3 className="text-2xl font-extrabold text-white mt-2">
                    {language === 'bn'
                      ? 'অভিনন্দন! লাইভ অকশন সফলভাবে সমাপ্ত হয়েছে'
                      : 'Congratulations! Live Auction Completed'}
                  </h3>
                  <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
                    {language === 'bn'
                      ? `সিজন ${currentSeason?.name || 'TPL S2'} এর অনুমোদিত সকল খেলোয়াড়ের নিলাম সম্পন্ন হয়েছে। চূড়ান্ত স্কোয়াড ও বাজেট হিসেব দেখতে "দলের তালিকা" অথবা "রিপোর্ট" ট্যাব ব্যবহার করুন।`
                      : `All approved players for ${currentSeason?.name || 'TPL S2'} have concluded bidding. Final rosters and financial records are preserved across teams and reports.`}
                  </p>
                </div>
                {isAdmin && (
                  <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
                    <button
                      onClick={onOpenPlayerSelectModal}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      <User className="w-4 h-4 text-emerald-400" />
                      <span>{language === 'bn' ? 'অতিরিক্ত খেলোয়াড় ড্রাফট' : 'Draft Extra Player'}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Idle Stage / No player loaded */
              <div className="p-12 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
                  <Gavel className="w-8 h-8 text-amber-400" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  {language === 'bn'
                    ? 'নিলাম স্টেজে কোনো খেলোয়াড় নেই'
                    : 'No player on auction stage'}
                </h3>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  {language === 'bn'
                    ? 'অ্যাডমিনিস্ট্রেটর অনুমোদিত খেলোয়াড় তালিকা থেকে যেকোনো খেলোয়াড় নির্বাচন করে লাইভ নিলাম শুরু করতে পারবেন।'
                    : 'Administrator can select any player from approved draft list to start the live bidding.'}
                </p>
                {isAdmin && (
                  <button
                    onClick={onOpenPlayerSelectModal}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-950 transition-all cursor-pointer"
                  >
                    <User className="w-4 h-4" />
                    <span>
                      {language === 'bn' ? 'খেলোয়াড় নির্বাচন করুন' : 'Select Player to Auction'}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Archived Season Notice */}
          {currentSeason?.status === 'archived' && (
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
                <span>
                  {language === 'bn'
                    ? `সিজন ${currentSeason.name} সমাপ্ত ও আর্কাইভ করা হয়েছে। আপনি ঐতিহাসিক ফলাফল ও স্কোয়াড দেখছেন।`
                    : `Season ${currentSeason.name} is archived. Displaying historical results and rosters.`}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[10px]">ARCHIVED</span>
            </div>
          )}

          {/* Interactive Bidding Action Console (For Teams) */}
          {auctionState?.status === 'active' && currentSeason?.status !== 'archived' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">
                    {language === 'bn' ? 'লাইভ বিডিং কনসোল' : 'Live Bidding Console'}
                  </h3>
                </div>

                {activeTeam ? (
                  <div className="text-xs bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300">
                    <span className="text-slate-400">{language === 'bn' ? 'দল:' : 'Team:'} </span>
                    <strong className="text-emerald-400">{activeTeam.name}</strong>
                    <span className="mx-2 text-slate-600">|</span>
                    <span className="text-slate-400">{language === 'bn' ? 'অবশিষ্ট বাজেট:' : 'Purse:'} </span>
                    <strong className="text-white font-mono">{formatBDT(activeTeam.remainingBudget)}</strong>
                  </div>
                ) : (
                  <span className="text-xs text-amber-400/90 font-medium">
                    {language === 'bn'
                      ? 'ডাক দেওয়ার জন্য হেডার থেকে দল নির্বাচন বা লগইন করুন'
                      : 'Select or log in as a team to place bids'}
                  </span>
                )}
              </div>

              {/* Error Message */}
              {bidError && (
                <div className="p-3 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{bidError}</span>
                </div>
              )}

              {/* Quick Bid Increment Buttons: +20, +40, +50 */}
              <div>
                <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-2">
                  <span>{language === 'bn' ? 'দ্রুত ডাক বাটন (Quick Bid):' : 'Quick Bid Increment:'}</span>
                  <span className="text-[11px] text-emerald-400 font-mono">
                    {language === 'bn' ? 'বর্তমান ডাক:' : 'Current Bid:'} {formatBDT(currentHighestBid)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {[20, 40, 50].map(inc => {
                    const candidateBid = currentHighestBid + inc;
                    const canAfford = activeTeam && activeTeam.remainingBudget >= candidateBid;
                    const isDisabled =
                      !activeTeam ||
                      !canAfford ||
                      isBidding ||
                      isCurrentLeader ||
                      auctionState?.status !== 'active';
                    return (
                      <button
                        key={inc}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => handleQuickBid(inc)}
                        className={`p-3 rounded-xl border text-center font-bold text-sm transition-all cursor-pointer flex flex-col items-center justify-center active:scale-95 ${
                          isDisabled
                            ? 'bg-slate-800/40 border-slate-800 text-slate-600 cursor-not-allowed opacity-60'
                            : 'bg-emerald-600/20 hover:bg-emerald-600/40 border-emerald-500/40 text-emerald-300 hover:scale-[1.02] shadow-sm'
                        }`}
                        title={
                          !activeTeam
                            ? (language === 'bn' ? 'ডাক দিতে দল নির্বাচন করুন' : 'Select team to bid')
                            : !canAfford
                            ? (language === 'bn' ? 'পর্যাপ্ত বাজেট নেই' : 'Insufficient purse')
                            : isCurrentLeader
                            ? (language === 'bn' ? 'আপনার দল বর্তমানে সর্বোচ্চ ডাকে রয়েছে' : 'Your team is currently leading')
                            : (language === 'bn' ? `+৳${inc} বৃদ্ধি (মোট ৳${candidateBid.toLocaleString()})` : `+৳${inc} increment`)
                        }
                      >
                        <span className="text-xs font-semibold text-emerald-400 font-mono">
                          +{formatBDT(inc)}
                        </span>
                        <span className="text-white font-mono font-extrabold text-sm sm:text-base mt-0.5">
                          {formatBDT(candidateBid)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Bid Input Form */}
              <form onSubmit={handleCustomBidSubmit} className="flex gap-2 pt-1">
                <input
                  type="number"
                  min={nextMinBid}
                  step={10}
                  placeholder={`ন্যূনতম ৳${nextMinBid.toLocaleString()}`}
                  value={customBidAmount}
                  onChange={e => setCustomBidAmount(e.target.value)}
                  disabled={!activeTeam || isBidding || isCurrentLeader || auctionState?.status !== 'active'}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <button
                  type="submit"
                  disabled={!activeTeam || isBidding || isCurrentLeader || !customBidAmount || auctionState?.status !== 'active'}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-950 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  {isBidding ? (language === 'bn' ? 'ডাক গৃহীত হচ্ছে...' : 'Submitting...') : (language === 'bn' ? 'ডাক দিন' : 'Bid Now')}
                </button>
              </form>

              {isCurrentLeader && (
                <div className="text-xs text-center text-emerald-400 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                  {language === 'bn'
                    ? '✓ আপনার দল বর্তমানে সর্বোচ্চ ডাকে রয়েছে!'
                    : '✓ Your team is currently the highest bidder!'}
                </div>
              )}
            </div>
          )}

          {/* Admin Live Auction Controls Toolbar */}
          {isAdmin && (
            <div className="bg-slate-900 border border-purple-500/30 rounded-2xl p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2 text-purple-300 text-sm font-bold">
                  <Gavel className="w-4 h-4" />
                  <span>{language === 'bn' ? 'অ্যাডমিন নিলাম কন্ট্রোল' : 'Admin Auction Controls'}</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  {currentUser?.email || (language === 'bn' ? 'সিমুলেশন মোড' : 'Simulation Mode')}
                </span>
              </div>

              {!currentUser && (
                <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/30 text-purple-200 text-xs flex items-center justify-between">
                  <span>
                    {language === 'bn'
                      ? 'ক্লাউড ফায়ারস্টোরে সংরক্ষিত পরিবর্তন করতে উপরে "লগইন" থেকে Google দিয়ে সাইন ইন করুন।'
                      : 'To persist changes to live Firestore, please sign in with Google.'}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                {/* Select Next Player */}
                <button
                  onClick={onOpenPlayerSelectModal}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                >
                  <User className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{language === 'bn' ? 'খেলোয়াড় পরিবর্তন / লোড' : 'Change/Load Player'}</span>
                </button>

                {/* Pause / Resume */}
                {auctionState?.status === 'active' && (
                  <button
                    onClick={() => toggleAuctionPause(auctionState.status, timeLeft || 15)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/30 transition-colors cursor-pointer"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'বিরতি (Pause)' : 'Pause'}</span>
                  </button>
                )}

                {auctionState?.status === 'paused' && (
                  <button
                    onClick={() => toggleAuctionPause(auctionState.status, 15)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold border border-emerald-500/30 transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'পুনরায় শুরু (Resume)' : 'Resume'}</span>
                  </button>
                )}

                {/* Reset Timer */}
                {auctionState?.currentPlayerId && (
                  <button
                    onClick={() => resetAuctionTimer(20)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? '+২০ সে: রিস্টার্ট' : '+20s Timer'}</span>
                  </button>
                )}

                <div className="flex-1"></div>

                {/* Master "শেষ ডাক!" Button with Automatic Next Player Advance */}
                {auctionState?.currentPlayerId && (
                  <button
                    onClick={() => handleFinalCall(false)}
                    disabled={isFinalizing}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-extrabold text-xs shadow-xl transition-all cursor-pointer ${
                      auctionState.highestBidderTeamId
                        ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-950 scale-102 hover:scale-105 ring-2 ring-emerald-400/40'
                        : 'bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white shadow-amber-950'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={language === 'bn' ? 'শেষ ডাক নিশ্চিত করে স্বয়ংক্রিয়ভাবে পরবর্তী খেলোয়াড়ে যান' : 'Finalize call and auto-advance to next player'}
                  >
                    <Gavel className="w-4 h-4" />
                    <span>
                      {isFinalizing
                        ? (language === 'bn' ? 'প্রক্রিয়াধীন...' : 'Saving...')
                        : (language === 'bn'
                            ? auctionState.highestBidderTeamId
                              ? 'শেষ ডাক! (বিক্রিত ও পরবর্তী খেলোয়াড়)'
                              : 'শেষ ডাক! (অবিক্রিত ও পরবর্তী)'
                            : 'শেষ ডাক! (Final Call & Next)')}
                    </span>
                  </button>
                )}

                {/* Optional explicit Unsold override button */}
                {auctionState?.currentPlayerId && (
                  <button
                    onClick={() => handleFinalCall(true)}
                    disabled={isFinalizing}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800 text-xs font-semibold transition-all cursor-pointer"
                    title={language === 'bn' ? 'অবিক্রিত (UNSOLD) হিসেবে সমাপ্ত করে পরবর্তী খেলোয়াড়ে যান' : 'Declare UNSOLD and advance'}
                  >
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>{language === 'bn' ? 'অবিক্রিত ঘোষণা' : 'Declare Unsold'}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Bidding History Ticker & Team Purse Leaderboard (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Real-time Bidding Feed */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  {language === 'bn' ? 'লাইভ বিডিং হিস্টোরি' : 'Live Bids Ticker'}
                </h3>
              </div>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
                {bids.length} {language === 'bn' ? 'টি ডাক' : 'bids'}
              </span>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
              {bids.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500 italic">
                  {language === 'bn' ? 'এখনো কোনো ডাক দেওয়া হয়নি' : 'No bids registered yet'}
                </div>
              ) : (
                bids.map((bid, idx) => (
                  <div
                    key={bid.id || idx}
                    className={`p-2.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
                      idx === 0
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-400'
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="font-semibold text-slate-200 truncate">
                        {bid.teamName}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(bid.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-sm text-emerald-400">
                      {formatBDT(bid.amount)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Teams Purse & Squad Summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">
                  {language === 'bn' ? 'দলের বাজেট ও স্কোয়াড' : 'Team Purses & Squads'}
                </h3>
              </div>
              <span className="text-[10px] text-slate-400">
                {teams.length} {language === 'bn' ? 'দল' : 'teams'}
              </span>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {teams.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500">
                  {language === 'bn' ? 'কোনো দল পাওয়া যায়নি' : 'No teams found'}
                </div>
              ) : (
                teams.map(team => {
                  const spentPercent = Math.min(
                    100,
                    Math.round(((team.spentBudget || 0) / (team.totalBudget || 100000)) * 100)
                  );
                  return (
                    <div
                      key={team.id}
                      className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200 truncate max-w-[170px]">
                          {team.name}
                        </span>
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {formatBDT(team.remainingBudget)}
                        </span>
                      </div>

                      {/* Budget Progress Bar */}
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${100 - spentPercent}%` }}
                        ></div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>
                          {language === 'bn' ? 'স্কোয়াড:' : 'Squad:'}{' '}
                          <strong className="text-slate-300">
                            {team.squadCount || 0}/{team.maxSquad || 15}
                          </strong>
                        </span>
                        <span>
                          {language === 'bn' ? 'ব্যয়:' : 'Spent:'}{' '}
                          {formatBDT(team.spentBudget || 0)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Tournament Rules & Announcement Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>{language === 'bn' ? 'টুর্নামেন্ট নিয়মাবলী ও ঘোষণা' : 'Tournament Rules & Notice'}</span>
              </span>
              {currentSeason && (
                <EditableText
                  value={
                    currentSeason.tournamentRules ||
                    'তিস্তা প্রিমিয়ার লীগ সিজন ২ এর প্রতিটি দল ১৫ জন খেলোয়াড় ড্রাফট করতে পারবে। সর্বোচ্চ বাজেট ১ লক্ষ টাকা।'
                  }
                  type="textarea"
                  onSave={async (val) => {
                    await updateSeasonField(currentSeason.id, 'tournamentRules', val, currentUser?.email || 'admin');
                  }}
                  label={language === 'bn' ? 'টুর্নামেন্ট নিয়মাবলী সম্পাদনা' : 'Tournament Rules'}
                  pencilClassName="text-emerald-400 hover:text-emerald-300"
                />
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">
              {currentSeason?.tournamentRules ||
                (language === 'bn'
                  ? 'তিস্তা প্রিমিয়ার লীগ সিজন ২ এর প্রতিটি দল ১৫ জন খেলোয়াড় ড্রাফট করতে পারবে। সর্বোচ্চ বাজেট ১ লক্ষ টাকা।'
                  : 'Each team can draft up to 15 players in Teesta Premier League. Maximum squad budget is 100,000 BDT.')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
