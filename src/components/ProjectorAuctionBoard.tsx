/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Trophy,
  X,
  Maximize2,
  Minimize2,
  Clock,
  TrendingUp,
  Shield,
  User,
  CheckCircle2,
  XCircle,
  Sparkles,
  Flame,
  Award,
  Zap,
} from 'lucide-react';
import { AuctionState, Player, Team, Bid, Season } from '../types';
import { formatBDT, getPositionBadgeColor, getPositionLabel } from '../utils/formatters';

interface ProjectorAuctionBoardProps {
  isOpen: boolean;
  onClose: () => void;
  auctionState: AuctionState | null;
  teams: Team[];
  approvedPlayers: Player[];
  allPlayers?: Player[];
  currentSeason?: Season;
}

export const ProjectorAuctionBoard: React.FC<ProjectorAuctionBoardProps> = ({
  isOpen,
  onClose,
  auctionState,
  teams,
  approvedPlayers,
  allPlayers,
  currentSeason,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Synchronized overall auction timer
  const [overallTimeLeft, setOverallTimeLeft] = useState<number>(() => {
    if (!auctionState) return 1800;
    if (auctionState.overallTimerStatus === 'running' && auctionState.overallTimerExpiresAt) {
      return Math.max(0, Math.ceil((auctionState.overallTimerExpiresAt - Date.now()) / 1000));
    }
    if (typeof auctionState.overallTimerRemaining === 'number') {
      return auctionState.overallTimerRemaining;
    }
    return auctionState.overallDurationSeconds || 1800;
  });

  useEffect(() => {
    if (!auctionState) return;

    if (auctionState.overallTimerStatus === 'running' && auctionState.overallTimerExpiresAt) {
      const updateRem = () => {
        const rem = Math.max(0, Math.ceil((auctionState.overallTimerExpiresAt! - Date.now()) / 1000));
        setOverallTimeLeft(rem);
      };
      updateRem();
      const interval = setInterval(updateRem, 250);
      return () => clearInterval(interval);
    } else if (auctionState.overallTimerStatus === 'paused' || auctionState.overallTimerStatus === 'idle') {
      const rem =
        typeof auctionState.overallTimerRemaining === 'number'
          ? auctionState.overallTimerRemaining
          : auctionState.overallDurationSeconds || 1800;
      setOverallTimeLeft(rem);
    } else if (auctionState.overallTimerStatus === 'expired') {
      setOverallTimeLeft(0);
    }
  }, [
    auctionState?.overallTimerExpiresAt,
    auctionState?.overallTimerStatus,
    auctionState?.overallTimerRemaining,
    auctionState?.overallDurationSeconds,
  ]);

  const formatOverallTimer = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Handle native browser fullscreen
  const toggleNativeFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Find authoritative Player & Team objects (with fallback to all registered players)
  const currentPlayerObj =
    approvedPlayers.find(p => p.id === auctionState?.currentPlayerId) ||
    (allPlayers && allPlayers.find(p => p.id === auctionState?.currentPlayerId));
  const leadingTeamObj = teams.find(t => t.id === auctionState?.highestBidderTeamId);

  const playerPhoto = auctionState?.currentPlayerPhoto || currentPlayerObj?.photoUrl;
  const playerName = auctionState?.currentPlayerName || currentPlayerObj?.name || 'খেলোয়াড় প্রস্তুত হচ্ছে';
  const playerPosition = auctionState?.currentPlayerPosition || currentPlayerObj?.position;
  const playerCategory = auctionState?.currentPlayerCategory || currentPlayerObj?.category || 'A';
  const playerAge = auctionState?.currentPlayerAge || currentPlayerObj?.age;
  const playerArea = auctionState?.currentPlayerArea || currentPlayerObj?.union || currentPlayerObj?.area;
  const formNumberDisplay =
    currentPlayerObj?.formNumber ||
    (typeof currentPlayerObj?.formNumericValue === 'number' && currentPlayerObj.formNumericValue > 0
      ? `ফরম নং ${currentPlayerObj.formNumericValue}`
      : auctionState?.currentPlayerFormNumber || 'ফরম নং ১');
  const playerIdDisplay =
    currentPlayerObj?.registrationNumber ||
    auctionState?.currentPlayerRegistrationNumber ||
    (currentPlayerObj?.id ? `TPL-S2-${currentPlayerObj.id.slice(-4).toUpperCase()}` : 'TPL-S2-001');

  const leadingTeamName = auctionState?.highestBidderTeamName || leadingTeamObj?.name;
  const leadingTeamLogo = leadingTeamObj?.logoUrl;
  const leadingTeamBudget = leadingTeamObj?.remainingBudget;
  const leadingTeamColor = leadingTeamObj?.color || '#06b6d4';

  const isSold = auctionState?.status === 'sold';
  const isUnsold = auctionState?.status === 'unsold';
  const isActive = auctionState?.status === 'active';
  const isPaused = auctionState?.status === 'paused';
  const isOverallExpired =
    auctionState?.overallTimerStatus === 'expired' ||
    (auctionState?.overallTimerStatus === 'running' && overallTimeLeft === 0);

  return (
    <div className="fixed inset-0 z-50 bg-[#040814] text-white flex flex-col overflow-y-auto animate-in fade-in select-none">
      {/* Stadium Beam & Metallic Blue Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-cyan-600/10 blur-[140px] rounded-full"></div>
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[400px] bg-blue-600/10 blur-[160px] rounded-full"></div>
        <div className="absolute -top-24 right-10 w-96 h-96 bg-red-600/10 blur-[130px] rounded-full"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(14,165,233,0.08)_0%,transparent_75%)]"></div>
      </div>

      {/* TOP BROADCAST BAR: Tournament Title, Overall Timer & Fullscreen Controls */}
      <header className="relative z-20 border-b-2 border-cyan-500/40 bg-[#050C1C]/90 backdrop-blur-md px-6 py-4 shadow-[0_4px_25px_rgba(0,0,0,0.6)] flex items-center justify-between gap-4">
        {/* Left: Tournament Identity */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-amber-400 p-0.5 shadow-[0_0_20px_rgba(6,182,212,0.4)] flex items-center justify-center">
            <div className="w-full h-full bg-[#050C1C] rounded-[14px] flex items-center justify-center">
              <Trophy className="w-6 h-6 text-amber-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base lg:text-lg font-black tracking-wider uppercase text-white drop-shadow-sm">
                {currentSeason?.name || 'TEESTA PREMIER LEAGUE SEASON 2 (২০২৬)'}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase font-mono tracking-widest bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                OFFICIAL AUCTION
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium tracking-wide">
              তিস্তা প্রিমিয়ার লীগ • অফিসিয়াল প্লেয়ার অকশন ব্রডকাস্ট ডিসপ্লে
            </p>
          </div>
        </div>

        {/* Center/Right: Live Status, Overall Countdown & Window Controls */}
        <div className="flex items-center gap-3">
          {/* Status Badge */}
          {isOverallExpired ? (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-500/20 border-2 border-rose-500 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.35)] animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
              <span className="text-xs sm:text-sm font-black uppercase tracking-widest">
                নিলামের সময় সমাপ্ত হয়েছে
              </span>
            </div>
          ) : isActive ? (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border-2 border-emerald-400/80 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.35)] animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="text-xs sm:text-sm font-black uppercase tracking-widest">
                LIVE AUCTION
              </span>
            </div>
          ) : isSold ? (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border-2 border-amber-400 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.35)]">
              <CheckCircle2 className="w-4 h-4 text-amber-400" />
              <span className="text-xs sm:text-sm font-black uppercase tracking-widest">
                SOLD / বিক্রিত
              </span>
            </div>
          ) : isUnsold ? (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-500/20 border-2 border-rose-500 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.35)]">
              <XCircle className="w-4 h-4 text-rose-400" />
              <span className="text-xs sm:text-sm font-black uppercase tracking-widest">
                UNSOLD / অবিক্রিত
              </span>
            </div>
          ) : auctionState?.currentPlayerId ? (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-950/70 border-2 border-cyan-500/60 text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span className="text-xs sm:text-sm font-black uppercase tracking-widest">
                {isPaused ? 'PAUSED / বিরতি' : 'READY / প্রস্তুত'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs sm:text-sm font-bold uppercase tracking-wider">
              <span>STANDBY</span>
            </div>
          )}

          {/* Synchronized Overall Auction Timer Display */}
          <div
            className={`flex items-center gap-2.5 px-4 py-1.5 rounded-2xl border-2 transition-all ${
              overallTimeLeft <= 60 && auctionState?.overallTimerStatus === 'running'
                ? 'bg-rose-950/80 border-rose-500 text-rose-300 animate-pulse shadow-[0_0_25px_rgba(244,63,94,0.5)]'
                : isOverallExpired
                ? 'bg-rose-950/90 border-rose-500 text-rose-400'
                : auctionState?.overallTimerStatus === 'paused'
                ? 'bg-amber-950/70 border-amber-500/60 text-amber-300'
                : 'bg-[#09152C] border-cyan-500/50 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
            }`}
          >
            <Clock className="w-4 h-4 text-cyan-400" />
            <div className="flex flex-col text-left">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                {isOverallExpired
                  ? 'নিলাম সমাপ্ত'
                  : auctionState?.overallTimerStatus === 'paused'
                  ? 'টাইমার বিরতি'
                  : 'সামগ্রিক সময়'}
              </span>
              <span className="font-mono font-black text-base sm:text-lg tracking-tight text-white leading-tight">
                {formatOverallTimer(overallTimeLeft)}
              </span>
            </div>
          </div>

          {/* Fullscreen Browser Toggle */}
          <button
            onClick={toggleNativeFullscreen}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 transition-colors cursor-pointer shadow-md"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Close Projector View */}
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-white border border-red-500/40 transition-colors cursor-pointer shadow-md"
            title="প্রজেক্টর ভিউ বন্ধ করুন (Close / Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* MAIN BROADCAST ARENA */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-center">
        {auctionState?.currentPlayerId ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
            {/* LEFT SIDE: Grand Player Photo Card with Metallic Blue Border */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center">
              <div className="w-full max-w-md bg-gradient-to-b from-[#09152E] via-[#050C1C] to-[#030712] border-2 border-cyan-500/70 shadow-[0_0_40px_rgba(6,182,212,0.3)] rounded-3xl p-4 sm:p-5 relative overflow-hidden flex flex-col items-center group">
                {/* Form Number and Category Badges at top of photo */}
                <div className="w-full flex items-center justify-between mb-3 z-20">
                  <span className="px-3 py-1 rounded-xl bg-[#030712]/90 backdrop-blur-md border border-cyan-500/40 text-cyan-300 font-mono font-black text-xs sm:text-sm shadow-md">
                    {formNumberDisplay}
                  </span>
                  <span className="px-3 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider shadow-md">
                    CATEGORY {playerCategory}
                  </span>
                </div>

                {/* Main Player Portrait Frame */}
                <div className="w-full aspect-[4/5] rounded-2xl bg-gradient-to-b from-slate-900 via-[#071126] to-[#02050e] border-2 border-cyan-500/40 relative overflow-hidden flex items-center justify-center shadow-inner">
                  {/* Silhouette Fallback */}
                  <div className="flex flex-col items-center justify-center text-slate-500 absolute inset-0">
                    <User className="w-28 h-28 text-slate-600 mb-2" />
                    <span className="text-xs font-black tracking-widest text-cyan-400 uppercase">
                      TPL S2 PLAYER
                    </span>
                  </div>

                  {/* High Quality Real Player Photo */}
                  {playerPhoto && (
                    <img
                      src={playerPhoto}
                      alt={playerName}
                      onError={e => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                      className="w-full h-full object-cover object-top relative z-10"
                    />
                  )}

                  {/* SOLD Celebration Overlay */}
                  {isSold && (
                    <div className="absolute inset-0 bg-emerald-950/90 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-4 text-center animate-in zoom-in-95">
                      <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-2 shadow-[0_0_25px_rgba(16,185,129,0.5)]">
                        <CheckCircle2 className="w-10 h-10 text-emerald-300" />
                      </div>
                      <span className="text-4xl sm:text-5xl font-black text-emerald-300 tracking-wider font-mono">
                        SOLD!
                      </span>
                      <span className="text-base sm:text-lg font-bold text-white mt-2 max-w-[220px] truncate">
                        {auctionState.highestBidderTeamName}
                      </span>
                      <span className="text-2xl font-mono font-black text-emerald-400 mt-1">
                        {formatBDT(auctionState.currentBid)}
                      </span>
                    </div>
                  )}

                  {/* UNSOLD Overlay */}
                  {isUnsold && (
                    <div className="absolute inset-0 bg-rose-950/90 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-4 text-center animate-in zoom-in-95">
                      <div className="w-16 h-16 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center mb-2 shadow-[0_0_25px_rgba(244,63,94,0.5)]">
                        <XCircle className="w-10 h-10 text-rose-300" />
                      </div>
                      <span className="text-4xl sm:text-5xl font-black text-rose-300 tracking-wider font-mono">
                        UNSOLD
                      </span>
                      <span className="text-xs text-rose-200 mt-2 font-medium">
                        রাউন্ড ২ এর ড্রাফটের জন্য সংরক্ষিত
                      </span>
                    </div>
                  )}
                </div>

                {/* Player Registration ID at bottom */}
                <div className="w-full text-center mt-3 pt-2 border-t border-cyan-500/20">
                  <span className="text-xs sm:text-sm font-mono font-black text-cyan-300 tracking-widest uppercase">
                    REGISTRATION: {playerIdDisplay}
                  </span>
                </div>
              </div>
            </div>

            {/* RIGHT SIDE: Structured Information Rows & Huge Red Highlight Bid Bar */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-4 sm:space-y-5">
              {/* Top Card: Player ID, Auction Status, Name & Tactical Badges */}
              <div className="bg-gradient-to-br from-[#09152E] via-[#050C1C] to-[#040814] border-2 border-cyan-500/60 rounded-3xl p-5 sm:p-6 shadow-[0_0_35px_rgba(6,182,212,0.2)] space-y-3.5">
                {/* Information Row: Player ID & Auction Status */}
                <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-cyan-500/20">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] sm:text-xs uppercase font-mono font-bold text-slate-400">
                      PLAYER ID:
                    </span>
                    <span className="px-2.5 py-0.5 rounded-lg bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 font-mono font-black text-xs sm:text-sm tracking-wider shadow-xs">
                      {playerIdDisplay}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] sm:text-xs uppercase font-mono font-bold text-slate-400">
                      STATUS:
                    </span>
                    {isActive ? (
                      <span className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-xs font-black uppercase tracking-wider animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                        LIVE AUCTION
                      </span>
                    ) : isSold ? (
                      <span className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 text-xs font-black uppercase tracking-wider">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                        SOLD / বিক্রিত
                      </span>
                    ) : isUnsold ? (
                      <span className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-rose-500/20 border border-rose-500 text-rose-300 text-xs font-black uppercase tracking-wider">
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                        UNSOLD / অবিক্রিত
                      </span>
                    ) : (
                      <span className="px-3 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs font-bold uppercase">
                        STANDBY
                      </span>
                    )}
                  </div>
                </div>

                {/* Tactical Badges: Position, Age, Area */}
                <div className="flex items-center gap-2 flex-wrap">
                  {playerPosition && (
                    <span
                      className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black border shadow-md ${getPositionBadgeColor(
                        playerPosition
                      )}`}
                    >
                      {getPositionLabel(playerPosition, true)}
                    </span>
                  )}
                  {playerAge && (
                    <span className="px-3 py-1 rounded-xl text-xs sm:text-sm font-bold bg-[#0a1730] border border-cyan-500/30 text-slate-300">
                      বয়স: {playerAge} বছর
                    </span>
                  )}
                  {playerArea && (
                    <span className="px-3 py-1 rounded-xl text-xs sm:text-sm font-bold bg-[#0a1730] border border-cyan-500/30 text-slate-300 truncate max-w-[200px]">
                      {playerArea}
                    </span>
                  )}
                </div>

                {/* Grand Player Name */}
                <div>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight uppercase leading-tight drop-shadow-md">
                    {playerName}
                  </h1>
                  {currentPlayerObj?.banglaName && currentPlayerObj.banglaName !== playerName && (
                    <p className="text-lg text-cyan-400 font-bold mt-0.5">
                      {currentPlayerObj.banglaName}
                    </p>
                  )}
                </div>
              </div>

              {/* Information Row: Base Price & Min Increment */}
              <div className="grid grid-cols-2 gap-4">
                {/* Base Price Card */}
                <div className="bg-gradient-to-b from-[#09152E] to-[#050C1C] border border-cyan-500/40 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
                  <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">
                    ভিত্তিমূল্য (BASE PRICE)
                  </span>
                  <span className="text-2xl sm:text-3xl font-black text-slate-100 font-mono mt-1">
                    {formatBDT(auctionState.currentBasePrice)}
                  </span>
                </div>

                {/* Minimum Step Increment */}
                <div className="bg-gradient-to-b from-[#09152E] to-[#050C1C] border border-cyan-500/40 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
                  <span className="text-xs uppercase tracking-wider text-cyan-400 font-bold">
                    ন্যূনতম বৃদ্ধি (MIN INCREMENT)
                  </span>
                  <span className="text-2xl sm:text-3xl font-black text-cyan-300 font-mono mt-1">
                    +{formatBDT(typeof auctionState.minIncrement === 'number' && auctionState.minIncrement >= 0 ? auctionState.minIncrement : 100)}
                  </span>
                </div>
              </div>

              {/* PROMINENT RED HIGHLIGHT BAR FOR CURRENT HIGHEST BID (Reference Image Style) */}
              <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 border-2 border-red-400/80 rounded-3xl p-5 sm:p-7 shadow-[0_0_40px_rgba(239,68,68,0.45)] relative overflow-hidden flex flex-col justify-center">
                {/* Background Glow */}
                <div className="absolute right-0 top-0 bottom-0 w-32 bg-white/10 blur-xl pointer-events-none"></div>

                <div className="flex items-center justify-between flex-wrap gap-2 text-white">
                  <span className="text-xs sm:text-sm uppercase font-black tracking-widest flex items-center gap-2 drop-shadow">
                    <TrendingUp className="w-5 h-5 text-white" />
                    <span>CURRENT HIGHEST BID / বর্তমান সর্বোচ্চ ডাক</span>
                  </span>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-black/30 backdrop-blur-xs font-mono uppercase tracking-wider border border-white/20">
                    {isActive ? 'LIVE BID' : 'FINAL BID'}
                  </span>
                </div>

                {/* Monumental Red Bar Typography */}
                <div className="text-5xl sm:text-6xl lg:text-7xl font-black font-mono text-white tracking-tight mt-1 drop-shadow-lg">
                  {formatBDT(auctionState.currentBid)}
                </div>
              </div>

              {/* Highest Bidding Team Showcase Row */}
              <div className="bg-gradient-to-r from-[#09152E] via-[#071126] to-[#050C1C] border-2 border-cyan-500/50 rounded-3xl p-4 sm:p-5 shadow-xl flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3.5">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center p-1.5 border-2 shadow-inner shrink-0"
                    style={{
                      backgroundColor: `${leadingTeamColor}20`,
                      borderColor: `${leadingTeamColor}80`,
                    }}
                  >
                    {leadingTeamLogo ? (
                      <img
                        src={leadingTeamLogo}
                        alt={leadingTeamName || 'Team'}
                        className="w-full h-full object-contain rounded-xl"
                      />
                    ) : (
                      <Shield className="w-7 h-7" style={{ color: leadingTeamColor }} />
                    )}
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
                      শীর্ষ ডাকদাতা দল (HIGHEST BIDDING TEAM)
                    </span>
                    <span className="text-lg sm:text-xl font-black text-white truncate max-w-[240px] block">
                      {leadingTeamName || (
                        <span className="text-slate-500 font-normal italic">
                          কোনো ডাক আসেনি (No Bids Yet)
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Team Remaining Purse */}
                {typeof leadingTeamBudget === 'number' && (
                  <div className="text-right">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                      দলের অবশিষ্ট বাজেট (REMAINING PURSE)
                    </span>
                    <span className="text-lg sm:text-xl font-mono font-black text-cyan-300 block">
                      {formatBDT(leadingTeamBudget)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Standby Screen when no player is loaded */
          <div className="text-center py-20 px-6 max-w-xl mx-auto space-y-5 bg-gradient-to-b from-[#09152E] to-[#040814] border-2 border-cyan-500/40 rounded-3xl p-8 shadow-2xl">
            <div className="w-24 h-24 mx-auto rounded-3xl bg-cyan-500/10 border-2 border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.3)]">
              <Trophy className="w-12 h-12 text-amber-400" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-wide uppercase">
              {currentSeason?.name || 'TPL SEASON 2 (২০২৬)'}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              লাইভ অকশন স্টেজ প্রস্তুত রয়েছে। পরবর্তী খেলোয়াড় স্টেজে এলে প্রজেক্টর ডিসপ্লে স্বয়ংক্রিয়ভাবে হালনাগাদ হবে।
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold uppercase tracking-widest">
              WAITING FOR NEXT PLAYER...
            </div>
          </div>
        )}
      </main>

      {/* FOOTER TICKER: Tournament Sponsors / Status Notice */}
      <footer className="relative z-20 border-t border-cyan-500/30 bg-[#040916]/95 px-6 py-2.5 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span className="font-bold text-slate-300">টিস্তা প্রিমিয়ার লীগ ২০২৬</span>
          <span>•</span>
          <span>অফিসিয়াল প্লেয়ার অকশন বোর্ড</span>
          <span>•</span>
          <span className="text-cyan-400 font-mono">লাইভ ক্লাউড ডেটাবেস সিঙ্ক</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500">
          <span>ESC বা বাটন চেপে প্রজেক্টর ভিউ থেকে বের হতে পারবেন</span>
        </div>
      </footer>
    </div>
  );
};
