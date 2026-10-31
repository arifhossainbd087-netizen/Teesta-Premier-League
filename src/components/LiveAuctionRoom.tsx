/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
  Sliders,
  Maximize2,
  Minimize2,
  Award,
  Flame,
  FileText,
  Tag,
  Trophy,
  LogOut,
  UserMinus,
} from 'lucide-react';
import { AuctionState, Player, Team, Bid, Season, AuctionDisplayConfig } from '../types';
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
  toggleAuctionPause,
  resetAuctionTimer,
  executeFinalCallAndAdvance,
  cleanCurrentPlayerBids,
  updateAuctionTimerDuration,
  startAuctionCountdown,
  removePlayerFromAuctionBoard,
  startOverallAuctionTimer,
  pauseOverallAuctionTimer,
  resumeOverallAuctionTimer,
  setOverallAuctionDuration,
  markOverallAuctionExpired,
} from '../services/auctionService';
import {
  DEFAULT_AUCTION_DISPLAY_CONFIG,
  listenToAuctionDisplayConfig,
} from '../services/auctionDisplayService';
import { AuctionDisplayCustomizerModal } from './AuctionDisplayCustomizerModal';
import { ProjectorAuctionBoard } from './ProjectorAuctionBoard';

interface LiveAuctionRoomProps {
  auctionState: AuctionState | null;
  bids: Bid[];
  teams: Team[];
  approvedPlayers: Player[];
  allPlayers?: Player[];
  onOpenPlayerSelectModal: () => void;
  currentSeason?: Season;
  onOpenProjectorBoard?: () => void;
}

export const LiveAuctionRoom: React.FC<LiveAuctionRoomProps> = ({
  auctionState,
  bids,
  teams,
  approvedPlayers,
  allPlayers,
  onOpenPlayerSelectModal,
  currentSeason,
  onOpenProjectorBoard,
}) => {
  const { userRole, isAdmin, activeTeam, language, currentUser } = useAuth();

  const [customBidAmount, setCustomBidAmount] = useState<string>('');
  const [bidError, setBidError] = useState<string | null>(null);
  const [isBidding, setIsBidding] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isCleaningBid, setIsCleaningBid] = useState(false);
  const [isCleanConfirmModalOpen, setIsCleanConfirmModalOpen] = useState(false);
  const [isUpdatingTimer, setIsUpdatingTimer] = useState(false);
  const [customDurationInput, setCustomDurationInput] = useState<string>('');
  const [isRemovingFromBoard, setIsRemovingFromBoard] = useState(false);
  const [isRemoveFromBoardModalOpen, setIsRemoveFromBoardModalOpen] = useState(false);

  // Synchronized overall auction timer state (Requirement: shared time reference across devices)
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

  // Display Customization State
  const [displayConfig, setDisplayConfig] = useState<AuctionDisplayConfig>(DEFAULT_AUCTION_DISPLAY_CONFIG);
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);
  const [isProjectorMode, setIsProjectorMode] = useState(false);
  const [isInternalProjectorOpen, setIsInternalProjectorOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const hasMarkedExpiredRef = useRef(false);
  const lastExpiredAttemptTimeRef = useRef<number>(0);

  // Listen to Firestore auctionDisplay settings
  useEffect(() => {
    const unsub = listenToAuctionDisplayConfig(config => {
      setDisplayConfig(config);
    });
    return () => unsub();
  }, []);

  // Trigger confetti when player is marked as sold
  useEffect(() => {
    if (auctionState?.status === 'sold') {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#f97316'],
      });
    }
  }, [auctionState?.status]);

  // Real-time Overall Auction Timer ticker (Shared countdown reference across devices)
  useEffect(() => {
    if (!auctionState) return;

    if (auctionState.overallTimerStatus === 'running' && auctionState.overallTimerExpiresAt) {
      const updateTicker = () => {
        const rem = Math.max(0, Math.ceil((auctionState.overallTimerExpiresAt! - Date.now()) / 1000));
        setOverallTimeLeft(rem);
        if (rem === 0 && isAdmin) {
          const now = Date.now();
          if (!hasMarkedExpiredRef.current || now - lastExpiredAttemptTimeRef.current > 6000) {
            hasMarkedExpiredRef.current = true;
            lastExpiredAttemptTimeRef.current = now;
            markOverallAuctionExpired().catch(err => {
              console.warn('Notice setting overall auction expired:', err);
            });
          }
        } else if (rem > 0) {
          hasMarkedExpiredRef.current = false;
        }
      };
      updateTicker();
      const interval = setInterval(updateTicker, 250);
      return () => clearInterval(interval);
    } else if (auctionState.overallTimerStatus === 'paused' || auctionState.overallTimerStatus === 'idle') {
      hasMarkedExpiredRef.current = false;
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
    isAdmin,
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

  // Overall auction time expiration and pause state (shared across devices)
  const isOverallExpired =
    auctionState?.overallTimerStatus === 'expired' ||
    (auctionState?.overallTimerStatus === 'running' && overallTimeLeft <= 0);
  const isOverallPaused = auctionState?.overallTimerStatus === 'paused';

  // Find authoritative Player & Team objects (with fallback to all registered players)
  const currentPlayerObj =
    approvedPlayers.find(p => p.id === auctionState?.currentPlayerId) ||
    (allPlayers && allPlayers.find(p => p.id === auctionState?.currentPlayerId));
  const leadingTeamObj = teams.find(t => t.id === auctionState?.highestBidderTeamId);

  // Quick Bid (+200, +500, +1000)
  const handleQuickBid = async (incrementAmount: number) => {
    if (!activeTeam) {
      setBidError(language === 'bn' ? 'ডাক দিতে দল নির্বাচন করুন।' : 'Select a team to place a bid.');
      return;
    }

    if (isOverallExpired) {
      setBidError(
        language === 'bn'
          ? 'নিলামের সময় সমাপ্ত হয়েছে! আর কোনো নতুন ডাক গ্রহণ করা হবে না।'
          : 'Auction time has expired. No further bids can be accepted.'
      );
      return;
    }

    if (isOverallPaused) {
      setBidError(
        language === 'bn'
          ? 'নিলাম সাময়িক স্থগিত (Paused) রয়েছে। ডাক দেওয়া বন্ধ আছে।'
          : 'Auction is currently paused. Bidding is disabled.'
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

    if (isBidding) return;

    const currentBid = auctionState?.currentBid || 0;
    const targetBid = currentBid + incrementAmount;
    await executeBid(targetBid);
  };

  // Custom Bid Form
  const handleCustomBidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isOverallExpired) {
      setBidError(
        language === 'bn'
          ? 'নিলামের সময় সমাপ্ত হয়েছে! আর কোনো নতুন ডাক গ্রহণ করা হবে না।'
          : 'Auction time has expired. No further bids can be accepted.'
      );
      return;
    }

    if (isOverallPaused) {
      setBidError(
        language === 'bn'
          ? 'নিলাম সাময়িক স্থগিত (Paused) রয়েছে। ডাক দেওয়া বন্ধ আছে।'
          : 'Auction is currently paused. Bidding is disabled.'
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

    if (isOverallExpired) {
      setBidError(
        language === 'bn'
          ? 'নিলামের সময় সমাপ্ত হয়েছে! আর কোনো নতুন ডাক গ্রহণ করা হবে না।'
          : 'Auction time has expired. No further bids can be accepted.'
      );
      return;
    }

    if (isOverallPaused) {
      setBidError(
        language === 'bn'
          ? 'নিলাম সাময়িক স্থগিত (Paused) রয়েছে। ডাক দেওয়া বন্ধ আছে।'
          : 'Auction is currently paused. Bidding is disabled.'
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

    // Role check: General spectators cannot bid
    if (!isAdmin && userRole === 'viewer') {
      setBidError(
        language === 'bn'
          ? 'সাধারণ দর্শক হিসেবে আপনি ডাক দিতে পারবেন না। ডাক দেওয়ার জন্য আপনার দলের অনুমোদিত Gmail অ্যাকাউন্ট দিয়ে লগইন করুন।'
          : 'Public viewers cannot place bids. Please log in with the assigned team Gmail.'
      );
      return;
    }

    // Team Manager email validation: Must match the assigned team Gmail
    const userEmail = (currentUser.email || '').trim().toLowerCase();
    const assignedTeamEmail = (activeTeam.loginEmail || activeTeam.userEmail || '').trim().toLowerCase();

    if (!isAdmin) {
      if (!assignedTeamEmail) {
        setBidError(
          language === 'bn'
            ? `"${activeTeam.name}" দলের জন্য কোনো ম্যানেজার ইমেইল বরাদ্দ করা নেই। অ্যাডমিন কর্তৃক লগইন ইমেইল নির্ধারণ না করা পর্যন্ত ডাক প্রদান নিষ্ক্রিয় থাকবে।`
            : `No manager email is assigned to "${activeTeam.name}". Bidding is disabled.`
        );
        return;
      }
      if (userEmail !== assignedTeamEmail) {
        setBidError(
          language === 'bn'
            ? 'আপনার অ্যাকাউন্টে বরাদ্দকৃত দল ছাড়া অন্য দলের হয়ে ডাক দেওয়া যাবে না।'
            : 'You cannot place bids for a team not assigned to your account.'
        );
        return;
      }
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

  // Master "শেষ ডাক!" Workflow with Automatic Advance
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
      ? language === 'bn'
        ? `খেলোয়াড় '${auctionState?.currentPlayerName || ''}'-কে ৳${(auctionState?.currentBid || 0).toLocaleString()} মূল্যে '${auctionState?.highestBidderTeamName || ''}' দলের কাছে বিক্রিত (SOLD) ঘোষণা করতে চান?`
        : `Declare SOLD to ${auctionState?.highestBidderTeamName} for ৳${(auctionState?.currentBid || 0).toLocaleString()}?`
      : language === 'bn'
      ? `খেলোয়াড় '${auctionState?.currentPlayerName || ''}'-কে অবিক্রিত (UNSOLD) ঘোষণা করতে চান?`
      : `Declare UNSOLD?`;

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
            particleCount: 110,
            spread: 80,
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

  // Admin Clean / Re-auction Action (Requirement 3)
  const handleCleanMistakenBid = () => {
    if (!currentUser && !isAdmin) {
      alert(
        language === 'bn'
          ? 'শুধুমাত্র অনুমোদিত অ্যাডমিন ক্লিন বা রি-অকশন করতে পারবেন।'
          : 'Only authorized administrators can perform clean or re-auction.'
      );
      return;
    }

    if (!auctionState?.currentPlayerId) {
      alert(
        language === 'bn'
          ? 'স্টেজে কোনো খেলোয়াড় উপস্থিত নেই।'
          : 'No player on auction stage.'
      );
      return;
    }

    // Open detailed confirmation modal identifying player, status, budget changes
    setIsCleanConfirmModalOpen(true);
  };

  const executeCleanConfirm = async () => {
    setIsCleaningBid(true);
    setBidError(null);

    try {
      const res = await cleanCurrentPlayerBids(
        currentUser?.email || 'admin',
        currentSeason?.id || 'season-2-2026'
      );
      if (res.success) {
        setIsCleanConfirmModalOpen(false);
        setActionSuccessMessage(res.message);
        setTimeout(() => setActionSuccessMessage(null), 6000);
      } else {
        setBidError(res.message);
      }
    } catch (err: any) {
      setBidError(err?.message || 'ক্লিন / রি-অকশন করতে ত্রুটি হয়েছে');
    } finally {
      setIsCleaningBid(false);
    }
  };

  // Admin Overall Auction Duration Setting (Requirement: presets 10m, 30m, 1h, or custom)
  const handleSetOverallDuration = async (seconds: number) => {
    if (!isAdmin) {
      alert(
        language === 'bn'
          ? 'শুধুমাত্র অনুমোদিত অ্যাডমিন সামগ্রিক নিলাম সময়কাল নির্ধারণ করতে পারবেন।'
          : 'Only authorized administrators can configure overall auction duration.'
      );
      return;
    }
    setIsUpdatingTimer(true);
    setBidError(null);
    try {
      const res = await setOverallAuctionDuration(
        seconds,
        currentUser?.email || 'admin',
        currentSeason?.id || 'season-2-2026'
      );
      if (res.success) {
        setActionSuccessMessage(res.message);
        setTimeout(() => setActionSuccessMessage(null), 4000);
      } else {
        setBidError(res.message);
      }
    } catch (err: any) {
      setBidError(err?.message || 'সময়কাল পরিবর্তন করতে ত্রুটি হয়েছে');
    } finally {
      setIsUpdatingTimer(false);
    }
  };

  const handleStartOverallAuction = async (durationSeconds?: number) => {
    if (!isAdmin) return;
    setIsUpdatingTimer(true);
    setBidError(null);
    try {
      const res = await startOverallAuctionTimer(
        durationSeconds,
        currentUser?.email || 'admin',
        currentSeason?.id || 'season-2-2026'
      );
      if (res.success) {
        setActionSuccessMessage(res.message);
        setTimeout(() => setActionSuccessMessage(null), 4000);
      } else {
        setBidError(res.message);
      }
    } catch (err: any) {
      setBidError(err?.message || 'নিলাম শুরু করতে সমস্যা হয়েছে');
    } finally {
      setIsUpdatingTimer(false);
    }
  };

  const handlePauseOverallAuction = async () => {
    if (!isAdmin) return;
    setIsUpdatingTimer(true);
    setBidError(null);
    try {
      const res = await pauseOverallAuctionTimer(
        currentUser?.email || 'admin',
        currentSeason?.id || 'season-2-2026'
      );
      if (res.success) {
        setActionSuccessMessage(res.message);
        setTimeout(() => setActionSuccessMessage(null), 4000);
      } else {
        setBidError(res.message);
      }
    } catch (err: any) {
      setBidError(err?.message || 'বিরতি দিতে সমস্যা হয়েছে');
    } finally {
      setIsUpdatingTimer(false);
    }
  };

  const handleResumeOverallAuction = async () => {
    if (!isAdmin) return;
    setIsUpdatingTimer(true);
    setBidError(null);
    try {
      const res = await resumeOverallAuctionTimer(
        currentUser?.email || 'admin',
        currentSeason?.id || 'season-2-2026'
      );
      if (res.success) {
        setActionSuccessMessage(res.message);
        setTimeout(() => setActionSuccessMessage(null), 4000);
      } else {
        setBidError(res.message);
      }
    } catch (err: any) {
      setBidError(err?.message || 'পুনরায় শুরু করতে সমস্যা হয়েছে');
    } finally {
      setIsUpdatingTimer(false);
    }
  };

  // Legacy helper mapping
  const handleSetTimerDuration = handleSetOverallDuration;

  // Admin Remove Player from Auction Board (Requirement 2)
  const handleConfirmRemoveFromBoard = async () => {
    if (!isAdmin) {
      alert(
        language === 'bn'
          ? 'শুধুমাত্র অনুমোদিত অ্যাডমিন বোর্ড থেকে খেলোয়াড় সরাতে পারবেন।'
          : 'Only authorized administrators can remove a player from the board.'
      );
      return;
    }

    setIsRemovingFromBoard(true);
    setBidError(null);
    try {
      const res = await removePlayerFromAuctionBoard(
        currentUser?.email || 'admin',
        currentSeason?.id || 'season-2-2026'
      );
      if (res.success) {
        setIsRemoveFromBoardModalOpen(false);
        setActionSuccessMessage(res.message);
        setTimeout(() => setActionSuccessMessage(null), 5000);
      } else {
        setBidError(res.message);
      }
    } catch (err: any) {
      setBidError(err?.message || 'বোর্ড থেকে সরাতে ত্রুটি হয়েছে');
    } finally {
      setIsRemovingFromBoard(false);
    }
  };

  const isCurrentLeader = Boolean(activeTeam && auctionState?.highestBidderTeamId === activeTeam.id);
  const minIncrement =
    typeof auctionState?.minIncrement === 'number' && auctionState.minIncrement >= 0
      ? auctionState.minIncrement
      : (typeof currentSeason?.defaultMinIncrement === 'number' && currentSeason.defaultMinIncrement >= 0
          ? currentSeason.defaultMinIncrement
          : 100);
  const currentHighestBid = auctionState?.currentBid || 0;
  const nextMinBid = currentHighestBid + minIncrement;

  // Open full-screen projector broadcast board
  const handleOpenProjector = () => {
    if (onOpenProjectorBoard) {
      onOpenProjectorBoard();
    } else {
      setIsInternalProjectorOpen(true);
    }
  };

  // Helper classes for theme modes
  const getThemeClasses = () => {
    switch (displayConfig.themeMode) {
      case 'midnight-navy':
        return 'bg-gradient-to-br from-slate-950 via-[#0a1628] to-slate-950 border-cyan-500/30';
      case 'emerald-glow':
        return 'bg-gradient-to-br from-slate-950 via-[#06241a] to-slate-950 border-emerald-500/40';
      case 'onyx-gold':
        return 'bg-gradient-to-br from-[#0c0d12] via-[#1a1711] to-[#0c0d12] border-amber-500/40';
      case 'deep-slate':
        return 'bg-slate-900 border-slate-800';
      case 'dark-stadium':
      default:
        return 'bg-gradient-to-b from-[#0b101b] via-[#091316] to-[#080d14] border-slate-800';
    }
  };

  // Helper classes for accent color
  const getAccentTextClass = () => {
    switch (displayConfig.accentColor) {
      case 'amber':
        return 'text-amber-400';
      case 'cyan':
        return 'text-cyan-400';
      case 'rose':
        return 'text-rose-400';
      case 'purple':
        return 'text-purple-400';
      case 'blue':
        return 'text-blue-400';
      case 'emerald':
      default:
        return 'text-emerald-400';
    }
  };

  const getAccentGlowBorderClass = () => {
    switch (displayConfig.accentColor) {
      case 'amber':
        return 'border-amber-400/50 shadow-amber-500/20';
      case 'cyan':
        return 'border-cyan-400/50 shadow-cyan-500/20';
      case 'rose':
        return 'border-rose-400/50 shadow-rose-500/20';
      case 'purple':
        return 'border-purple-400/50 shadow-purple-500/20';
      case 'blue':
        return 'border-blue-400/50 shadow-blue-500/20';
      case 'emerald':
      default:
        return 'border-emerald-400/50 shadow-emerald-500/20';
    }
  };

  // Helper for Bid Typography
  const getBidTypographyClass = () => {
    switch (displayConfig.bidTypographySize) {
      case 'large':
        return 'text-4xl sm:text-5xl';
      case 'huge':
        return 'text-5xl sm:text-6xl';
      case 'monumental':
        return 'text-6xl sm:text-7xl lg:text-8xl';
      case 'jumbo':
      default:
        return 'text-5xl sm:text-6xl lg:text-7xl';
    }
  };

  // Helper for Photo Dimensions
  const getPhotoDimensionsClass = () => {
    switch (displayConfig.photoSize) {
      case 'normal':
        return 'w-40 h-48 sm:w-48 sm:h-56';
      case 'large':
        return 'w-48 h-56 sm:w-56 sm:h-64';
      case 'full':
        return 'w-full h-72 sm:h-96';
      case 'xlarge':
      default:
        return 'w-52 h-64 sm:w-64 sm:h-80';
    }
  };

  // Player portrait photo fallback
  const playerPhoto = auctionState?.currentPlayerPhoto || currentPlayerObj?.photoUrl;
  const playerName = auctionState?.currentPlayerName || currentPlayerObj?.name || 'খেলোয়াড় লোড হচ্ছে';
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
    (currentPlayerObj?.id ? `ID: ${currentPlayerObj.id.slice(-6).toUpperCase()}` : 'TPL-S2-001');

  // Leading Team details
  const leadingTeamName = auctionState?.highestBidderTeamName || leadingTeamObj?.name;
  const leadingTeamLogo = leadingTeamObj?.logoUrl;
  const leadingTeamBudget = leadingTeamObj?.remainingBudget;
  const leadingTeamColor = leadingTeamObj?.color || '#10b981';

  return (
    <div
      ref={stageRef}
      className={`space-y-6 transition-all duration-300 ${
        isProjectorMode ? 'fixed inset-0 z-50 overflow-y-auto bg-slate-950 p-4 sm:p-8' : ''
      }`}
    >
      {/* Top Banner Alert / Success Notice */}
      {actionSuccessMessage && (
        <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-4 py-2.5 rounded-xl flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button
            onClick={() => setActionSuccessMessage(null)}
            className="text-xs text-emerald-400 hover:underline cursor-pointer"
          >
            {language === 'bn' ? 'বন্ধ করুন' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* OVERALL AUCTION TIME EXPIRED BANNER (Requirement 2) */}
      {isOverallExpired && (
        <div className="bg-red-500/20 border-2 border-red-500/70 text-red-200 px-5 py-3 rounded-2xl flex items-center justify-between shadow-2xl animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/30 border border-red-400/50 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <span className="font-black text-base sm:text-lg block tracking-wide text-white">
                নিলামের সময় সমাপ্ত হয়েছে
              </span>
              <span className="text-xs text-red-300/90">
                {language === 'bn'
                  ? 'নির্ধারিত সামগ্রিক নিলাম সময়কাল সমাপ্ত হয়েছে। আর কোনো নতুন ডাক গ্রহণ করা হবে না।'
                  : 'Overall auction duration has reached its limit. New bids are closed.'}
              </span>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-red-950/80 border border-red-500 text-red-300 text-xs font-mono font-bold uppercase">
            EXPIRED
          </span>
        </div>
      )}

      {/* STADIUM TOP BAR: Projector Mode, Customizer Button, Overall Timer & Status */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-slate-900/90 border border-slate-800 p-3 sm:p-4 rounded-2xl shadow-xl backdrop-blur-md">
        {/* Left: Tournament Badge & Live Bidding Status */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-amber-400 p-0.5 shadow flex items-center justify-center">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Trophy className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                {auctionState?.status === 'active' && !isOverallExpired && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    isOverallExpired
                      ? 'bg-rose-500'
                      : auctionState?.status === 'active'
                      ? 'bg-emerald-500'
                      : auctionState?.status === 'sold'
                      ? 'bg-amber-400'
                      : auctionState?.status === 'unsold'
                      ? 'bg-rose-500'
                      : 'bg-slate-600'
                  }`}
                ></span>
              </span>
              <span className="text-xs font-black uppercase tracking-wider text-white">
                {currentSeason?.name || 'TPL SEASON 2 (২০২৬)'} •{' '}
                <span className={getAccentTextClass()}>
                  {isOverallExpired
                    ? language === 'bn'
                      ? 'নিলাম সমাপ্ত'
                      : 'AUCTION CLOSED'
                    : auctionState?.status === 'active'
                    ? language === 'bn'
                      ? 'লাইভ অকশন স্টেজ'
                      : 'LIVE AUCTION STAGE'
                    : auctionState?.status === 'sold'
                    ? language === 'bn'
                      ? 'বিক্রিত (SOLD)'
                      : 'SOLD'
                    : auctionState?.status === 'unsold'
                    ? language === 'bn'
                      ? 'অবিক্রিত (UNSOLD)'
                      : 'UNSOLD'
                    : language === 'bn'
                    ? 'প্রস্তুত'
                    : 'READY'}
                </span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              {language === 'bn'
                ? 'তিস্তা প্রিমিয়ার লীগ অফিসিয়াল ফুটবলার অকশন ডিসপ্লে'
                : 'Official Teesta Premier League Live Football Auction Display'}
            </p>
          </div>
        </div>

        {/* Right: Overall Auction Countdown, Projector Toggle & Admin Customizer */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Synchronized Overall Auction Countdown Timer */}
          <div
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border transition-all ${
              overallTimeLeft <= 60 && auctionState?.overallTimerStatus === 'running'
                ? 'bg-rose-950/80 border-rose-500 text-rose-300 animate-pulse shadow-lg shadow-rose-950/50'
                : isOverallExpired
                ? 'bg-rose-950/90 border-rose-500 text-rose-400'
                : auctionState?.overallTimerStatus === 'paused'
                ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
                : 'bg-slate-950 border-slate-700 text-emerald-400'
            }`}
            title="সামগ্রিক নিলাম সময়সীমা (সকল ডিভাইসে সিঙ্ক করা)"
          >
            <Clock className="w-4 h-4 text-emerald-400" />
            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold leading-none">
                {isOverallExpired
                  ? 'নিলাম সমাপ্ত'
                  : auctionState?.overallTimerStatus === 'paused'
                  ? 'বিরতি'
                  : 'সামগ্রিক সময়'}
              </span>
              <span className="font-mono font-black text-sm sm:text-base tracking-tight text-white leading-tight">
                {formatOverallTimer(overallTimeLeft)}
              </span>
            </div>
            {auctionState?.overallTimerStatus === 'running' && !isOverallExpired && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            )}
          </div>

          {/* Projector / Big Screen Broadcast View Button */}
          <button
            onClick={handleOpenProjector}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600/30 to-blue-600/30 hover:from-cyan-600/45 hover:to-blue-600/45 text-cyan-300 border border-cyan-500/50 text-xs font-bold transition-all cursor-pointer shadow-md shadow-cyan-950/40 hover:border-cyan-400"
            title={language === 'bn' ? 'প্রজেক্টর ভিউ (ফুলস্ক্রিন ব্রডকাস্ট বোর্ড)' : 'Projector View (Fullscreen Broadcast Board)'}
          >
            <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              {language === 'bn' ? 'প্রজেক্টর ভিউ' : 'Projector View'}
            </span>
          </button>

          {/* Admin Display Customizer Gear Button */}
          {isAdmin && (
            <button
              onClick={() => setIsCustomizerOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-900/60 to-indigo-900/60 hover:from-purple-800/80 hover:to-indigo-800/80 text-purple-200 border border-purple-500/40 text-xs font-bold shadow-md shadow-purple-950 transition-all cursor-pointer"
              title="ডিসপ্লে লেআউট ও কালার কাস্টমাইজ করুন"
            >
              <Sliders className="w-3.5 h-3.5 text-purple-300" />
              <span>{language === 'bn' ? 'ডিসপ্লে কাস্টমাইজ' : 'Customize Display'}</span>
            </button>
          )}
        </div>
      </div>

      {/* MAIN STADIUM AUCTION ARENA (Layout matching the reference image) */}
      <div className={`grid grid-cols-1 ${displayConfig.showBidsFeed || displayConfig.showTeamsPurse ? 'lg:grid-cols-12' : ''} gap-6`}>
        {/* HERO PLAYER DISPLAY STAGE */}
        <div className={`${displayConfig.showBidsFeed || displayConfig.showTeamsPurse ? 'lg:col-span-8' : 'w-full'} space-y-6`}>
          <div
            className={`border-2 rounded-3xl overflow-hidden shadow-2xl relative transition-all duration-300 ${getThemeClasses()} ${
              displayConfig.photoBorderAccent ? getAccentGlowBorderClass() : ''
            }`}
          >
            {/* Watermark crest subtle background */}
            {displayConfig.showProjectorWatermark && (
              <div className="absolute -right-12 -bottom-12 opacity-[0.04] pointer-events-none select-none">
                <Flame className="w-96 h-96 text-white" />
              </div>
            )}

            {auctionState?.currentPlayerId ? (
              <div className="p-6 sm:p-8 lg:p-10 relative z-10">
                {/* 2-Column Stadium Display: Left = Prominent Player Portrait, Right = Details & Massive Bidding Info */}
                <div
                  className={`grid grid-cols-1 ${
                    displayConfig.photoPlacement === 'center'
                      ? 'items-center text-center'
                      : 'md:grid-cols-12 gap-8 lg:gap-10 items-stretch'
                  }`}
                >
                  {/* LEFT COLUMN: Prominent Portrait of Player */}
                  <div
                    className={`${
                      displayConfig.photoPlacement === 'center'
                        ? 'flex flex-col items-center justify-center mb-6'
                        : 'md:col-span-5 flex flex-col items-center justify-center'
                    }`}
                  >
                    <div
                      className={`relative rounded-3xl bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 border-2 shadow-2xl overflow-hidden group flex items-center justify-center ${getPhotoDimensionsClass()} ${
                        displayConfig.photoBorderAccent ? getAccentGlowBorderClass() : 'border-slate-700'
                      }`}
                    >
                      {/* Top Badges: Form Number (e.g. ফরম নং ১) & Category */}
                      <div className="absolute top-3 inset-x-3 flex items-center justify-between z-20 pointer-events-none">
                        {displayConfig.visibleFields.formNumber && (
                          <span className="px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-white/20 text-white font-mono font-black text-xs shadow-md">
                            {formNumberDisplay}
                          </span>
                        )}

                        {displayConfig.visibleFields.category && (
                          <span className="px-2.5 py-1 rounded-lg bg-amber-500/90 text-slate-950 font-black text-xs shadow-md uppercase tracking-wider">
                            {language === 'bn' ? `ক্যাটাগরি ${playerCategory}` : `CAT ${playerCategory}`}
                          </span>
                        )}
                      </div>

                      {/* Fallback Graphic if no photo */}
                      <div className="flex flex-col items-center justify-center text-slate-500 absolute inset-0">
                        <User className="w-24 h-24 text-slate-600 mb-2" />
                        <span className="text-xs font-bold text-slate-400 tracking-wider">
                          {currentSeason?.code || 'TPL S2'} PLAYER
                        </span>
                      </div>

                      {/* High-Resolution Portrait Photo */}
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

                      {/* Bottom Registration ID Badge */}
                      {displayConfig.visibleFields.playerId && (
                        <div className="absolute bottom-3 inset-x-3 z-20 pointer-events-none flex justify-center">
                          <span className="px-3 py-1 rounded-full bg-slate-950/85 backdrop-blur-md border border-slate-700 text-slate-300 font-mono text-[11px] font-bold shadow-md">
                            {playerIdDisplay}
                          </span>
                        </div>
                      )}

                      {/* Status Overlay: SOLD */}
                      {auctionState.status === 'sold' && (
                        <div className="absolute inset-0 bg-emerald-950/90 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-4 text-center animate-in zoom-in-95">
                          <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-2 shadow-lg shadow-emerald-500/30">
                            <CheckCircle2 className="w-9 h-9 text-emerald-300" />
                          </div>
                          <span className="text-3xl font-black text-emerald-300 tracking-wider font-mono">
                            SOLD!
                          </span>
                          <span className="text-sm font-bold text-white mt-1.5 max-w-[200px] truncate">
                            {auctionState.highestBidderTeamName}
                          </span>
                          <span className="text-lg font-mono font-black text-emerald-400 mt-1">
                            {formatBDT(auctionState.currentBid)}
                          </span>
                        </div>
                      )}

                      {/* Status Overlay: UNSOLD */}
                      {auctionState.status === 'unsold' && (
                        <div className="absolute inset-0 bg-rose-950/90 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-4 text-center animate-in zoom-in-95">
                          <div className="w-14 h-14 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center mb-2 shadow-lg shadow-rose-500/30">
                            <XCircle className="w-9 h-9 text-rose-300" />
                          </div>
                          <span className="text-3xl font-black text-rose-300 tracking-wider font-mono">
                            UNSOLD
                          </span>
                          <span className="text-xs text-rose-200 mt-2 font-medium">
                            {language === 'bn' ? 'পরবর্তী রাউন্ড ড্রাফটের জন্য সংরক্ষিত' : 'Reserved for Next Round'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Player Information, Base Price & Monumental Highest Bid */}
                  <div
                    className={`${
                      displayConfig.photoPlacement === 'center'
                        ? 'w-full'
                        : 'md:col-span-7 flex flex-col justify-between'
                    } space-y-5`}
                  >
                    {/* Header: Player Name & Tactical Badges */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {displayConfig.visibleFields.position && playerPosition && (
                          <span
                            className={`px-3 py-1 rounded-lg text-xs font-extrabold border shadow-sm ${getPositionBadgeColor(
                              playerPosition
                            )}`}
                          >
                            {getPositionLabel(playerPosition, language === 'bn')}
                          </span>
                        )}

                        {displayConfig.visibleFields.age && playerAge && (
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800/80 border border-slate-700 text-slate-300">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {playerAge} {language === 'bn' ? 'বছর' : 'years'}
                            </span>
                          </span>
                        )}

                        {displayConfig.visibleFields.area && playerArea && (
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800/80 border border-slate-700 text-slate-300">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span>{playerArea}</span>
                          </span>
                        )}

                        {displayConfig.visibleFields.prevClub && currentPlayerObj?.prevClub && (
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800/80 border border-slate-700 text-slate-300">
                            <Award className="w-3.5 h-3.5 text-amber-400" />
                            <span>{currentPlayerObj.prevClub}</span>
                          </span>
                        )}
                      </div>

                      {/* Prominent Player Name (High-Contrast, Projector-Grade) */}
                      <div>
                        {isAdmin ? (
                          <EditableText
                            value={playerName}
                            onSave={async val => {
                              if (auctionState.currentPlayerId) {
                                await updatePlayerField(
                                  auctionState.currentPlayerId,
                                  'name',
                                  val,
                                  currentUser?.email || 'admin'
                                );
                              }
                              await updateAuctionCurrentPlayerName(String(val), currentUser?.email || 'admin');
                            }}
                            label={language === 'bn' ? 'খেলোয়াড়ের নাম' : 'Player Name'}
                            pencilClassName="text-slate-400 hover:text-emerald-400"
                          >
                            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
                              {playerName}
                            </h1>
                          </EditableText>
                        ) : (
                          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
                            {playerName}
                          </h1>
                        )}
                        {currentPlayerObj?.banglaName && currentPlayerObj.banglaName !== playerName && (
                          <p className="text-base text-slate-400 font-medium mt-1">
                            {currentPlayerObj.banglaName}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Information Strip: Base Price & Min Increment */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      {displayConfig.visibleFields.basePrice && (
                        <div className="bg-slate-950/80 border border-slate-800/90 p-3.5 rounded-2xl flex flex-col justify-between shadow-inner">
                          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                            {language === 'bn' ? 'ভিত্তিমূল্য (Base Price)' : 'Base Price'}
                          </span>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-lg sm:text-xl font-black text-slate-200 font-mono">
                              {formatBDT(auctionState.currentBasePrice)}
                            </span>
                            {isAdmin && (
                              <EditableText
                                value={auctionState.currentBasePrice}
                                type="number"
                                min={0}
                                onSave={async val => {
                                  await updateAuctionSetting(
                                    'currentBasePrice',
                                    Number(val),
                                    currentSeason?.id,
                                    currentUser?.email || 'admin'
                                  );
                                }}
                                label={language === 'bn' ? 'ভিত্তিমূল্য পরিবর্তন' : 'Edit Base Price'}
                                pencilClassName="text-slate-500 hover:text-emerald-400"
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {displayConfig.visibleFields.minIncrement && (
                        <div className="bg-slate-950/80 border border-slate-800/90 p-3.5 rounded-2xl flex flex-col justify-between shadow-inner">
                          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                            {language === 'bn' ? 'ন্যূনতম বৃদ্ধি (Min Step)' : 'Min Increment'}
                          </span>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-lg sm:text-xl font-black text-emerald-400 font-mono">
                              +{formatBDT(minIncrement)}
                            </span>
                            {isAdmin && (
                              <EditableText
                                value={typeof auctionState?.minIncrement === 'number' ? auctionState.minIncrement : minIncrement}
                                type="number"
                                min={0}
                                onSave={async val => {
                                  await updateAuctionSetting(
                                    'minIncrement',
                                    Math.max(0, Math.floor(Number(val) || 0)),
                                    currentSeason?.id,
                                    currentUser?.email || 'admin'
                                  );
                                }}
                                label={language === 'bn' ? 'ন্যূনতম ডাক বৃদ্ধি ধাপ' : 'Min Increment'}
                                pencilClassName="text-slate-500 hover:text-emerald-400"
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* CURRENT HIGHEST BID STADIUM BOX (Red Highlight Bar matching reference) */}
                    <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 border-2 border-red-400/80 shadow-[0_0_35px_rgba(239,68,68,0.35)] relative overflow-hidden">
                      <div className="absolute right-0 top-0 bottom-0 w-32 bg-white/10 blur-xl pointer-events-none"></div>

                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
                        {/* Huge Bid Readout */}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs uppercase font-extrabold tracking-widest text-white/90 flex items-center gap-1.5 drop-shadow">
                              <TrendingUp className="w-4 h-4 text-white" />
                              {language === 'bn'
                                ? 'বর্তমান সর্বোচ্চ ডাক (CURRENT HIGHEST BID)'
                                : 'CURRENT HIGHEST BID'}
                            </span>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-black/30 backdrop-blur-xs font-mono uppercase tracking-wider border border-white/20 text-white">
                              {auctionState.status === 'active' ? 'LIVE' : 'FINAL'}
                            </span>
                          </div>
                          <div
                            className={`font-black text-white font-mono tracking-tight mt-1 drop-shadow-md ${getBidTypographyClass()}`}
                          >
                            {formatBDT(auctionState.currentBid)}
                          </div>
                        </div>

                        {/* Leading Team Crest & Remaining Budget */}
                        <div className="w-full sm:w-auto bg-slate-950/85 backdrop-blur-md border border-white/20 p-3.5 rounded-2xl flex items-center gap-3.5 shadow-lg">
                          {/* Team Logo / Badge */}
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center p-1 border shadow-inner shrink-0"
                            style={{
                              backgroundColor: `${leadingTeamColor}20`,
                              borderColor: `${leadingTeamColor}70`,
                            }}
                          >
                            {leadingTeamLogo ? (
                              <img
                                src={leadingTeamLogo}
                                alt={leadingTeamName || 'Team'}
                                className="w-full h-full object-contain rounded-lg"
                              />
                            ) : (
                              <Shield className="w-6 h-6" style={{ color: leadingTeamColor }} />
                            )}
                          </div>

                          {/* Team Info & Purse */}
                          <div className="min-w-[130px]">
                            <div className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">
                              {language === 'bn' ? 'শীর্ষে থাকা দল' : 'Leading Team'}
                            </div>
                            <div className="text-sm font-extrabold text-white truncate max-w-[170px]">
                              {leadingTeamName || (
                                <span className="text-slate-400 font-normal italic">
                                  {language === 'bn' ? 'কোনো ডাক আসেনি' : 'No bids yet'}
                                </span>
                              )}
                            </div>
                            {typeof leadingTeamBudget === 'number' && (
                              <div className="text-[11px] font-mono font-bold text-cyan-300 mt-0.5">
                                {language === 'bn' ? 'অবশিষ্ট বাজেট: ' : 'Purse: '}
                                {formatBDT(leadingTeamBudget)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : auctionState?.status === 'completed' ? (
              /* Completed State */
              <div className="p-12 sm:p-16 text-center space-y-4">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-amber-300 shadow-2xl">
                  <Sparkles className="w-10 h-10 text-amber-400 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-extrabold uppercase tracking-wider font-mono">
                    {language === 'bn' ? 'অকশন সমাপ্ত (AUCTION COMPLETED)' : 'AUCTION COMPLETED'}
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-black text-white">
                    {language === 'bn'
                      ? 'অভিনন্দন! তিস্তা প্রিমিয়ার লীগ লাইভ অকশন সমাপ্ত'
                      : 'Congratulations! TPL Live Auction Completed'}
                  </h3>
                  <p className="text-sm text-slate-400 max-w-lg mx-auto">
                    {language === 'bn'
                      ? 'এই সিজনের অনুমোদিত সকল খেলোয়াড়ের নিলাম সম্পন্ন হয়েছে। চূড়ান্ত স্কোয়াড ও দল দেখতে "দলের তালিকা" ট্যাব ব্যবহার করুন।'
                      : 'All players for this season have concluded bidding. Check the Teams tab for final rosters and purses.'}
                  </p>
                </div>
                {isAdmin && (
                  <div className="pt-2">
                    <button
                      onClick={onOpenPlayerSelectModal}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      <User className="w-4 h-4 text-emerald-400" />
                      <span>{language === 'bn' ? 'অতিরিক্ত খেলোয়াড় লোড' : 'Draft More Players'}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Idle / No player loaded State */
              <div className="p-12 sm:p-16 text-center space-y-4">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 shadow-xl">
                  <Gavel className="w-10 h-10 text-amber-400" />
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  {language === 'bn' ? 'নিলাম স্টেজে কোনো খেলোয়াড় নেই' : 'No Player on Auction Stage'}
                </h3>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  {language === 'bn'
                    ? 'অ্যাডমিনিস্ট্রেটর ড্রাফট পুল থেকে যেকোনো অনুমোদিত খেলোয়াড় নির্বাচন করে লাইভ নিলাম শুরু করতে পারবেন।'
                    : 'Administrator can select a player from the approved draft list to start the live bidding.'}
                </p>
                {isAdmin && (
                  <button
                    onClick={onOpenPlayerSelectModal}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm shadow-xl shadow-emerald-950 transition-all cursor-pointer"
                  >
                    <User className="w-4 h-4" />
                    <span>{language === 'bn' ? 'খেলোয়াড় নির্বাচন করুন' : 'Select Player to Auction'}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* INTERACTIVE BIDDING CONSOLE (For Teams) */}
          {displayConfig.showQuickBidButtons &&
            auctionState?.status === 'active' &&
            currentSeason?.status !== 'archived' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-400" />
                    <h3 className="text-base font-bold text-white">
                      {language === 'bn' ? 'লাইভ বিডিং কনসোল' : 'Live Bidding Console'}
                    </h3>
                  </div>

                  {activeTeam ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-xs bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300">
                        <span className="text-slate-400">{language === 'bn' ? 'দল:' : 'Team:'} </span>
                        <strong className="text-emerald-400">{activeTeam.name}</strong>
                        <span className="mx-2 text-slate-600">|</span>
                        <span className="text-slate-400">{language === 'bn' ? 'অবশিষ্ট বাজেট:' : 'Purse:'} </span>
                        <strong className="text-white font-mono">{formatBDT(activeTeam.remainingBudget)}</strong>
                      </div>
                      {!Boolean((activeTeam.loginEmail || activeTeam.userEmail || '').trim()) && (
                        <span className="text-[11px] bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2.5 py-1 rounded-md font-semibold">
                          ⚠️ {language === 'bn' ? 'ম্যানেজার ইমেইল বরাদ্দ নেই — ডাক প্রদান নিষ্ক্রিয়' : 'No manager email — Bidding disabled'}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-amber-400/90 font-medium">
                      {userRole === 'viewer'
                        ? language === 'bn'
                          ? 'সাধারণ দর্শক মোড (ডাক দেওয়ার জন্য দলের অনুমোদিত Gmail দিয়ে লগইন করুন)'
                          : 'Viewer mode (Sign in with assigned team Gmail to bid)'
                        : language === 'bn'
                        ? 'ডাক দেওয়ার জন্য আপনার দলের অনুমোদিত Gmail দিয়ে লগইন করুন'
                        : 'Sign in with your assigned team Gmail to place bids'}
                    </span>
                  )}
                </div>

                {bidError && (
                  <div className="p-3 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{bidError}</span>
                  </div>
                )}

                {/* Team manager authorization & unassigned email checks */}
                {(() => {
                  const userAuthEmail = (currentUser?.email || '').trim().toLowerCase();
                  const assignedTeamEmail = (activeTeam?.loginEmail || activeTeam?.userEmail || '').trim().toLowerCase();
                  const hasManagerEmail = Boolean(assignedTeamEmail);
                  const isManagerAuthorizedForActiveTeam =
                    isAdmin ||
                    (userRole === 'team' && Boolean(activeTeam) && hasManagerEmail && userAuthEmail === assignedTeamEmail);
                  const isBiddingForbidden =
                    !currentUser ||
                    userRole === 'viewer' ||
                    !activeTeam ||
                    !hasManagerEmail ||
                    !isManagerAuthorizedForActiveTeam ||
                    isOverallExpired ||
                    isOverallPaused;

                  return (
                    <>
                      {/* Overall Auction Expired / Paused Notices in Bidding Console */}
                      {isOverallExpired && (
                        <div className="p-3 rounded-xl bg-rose-500/20 border-2 border-rose-500/70 text-rose-300 font-bold text-center text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg">
                          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                          <span>
                            {language === 'bn'
                              ? '⚠️ নিলামের সময় সমাপ্ত হয়েছে। আর কোনো নতুন ডাক গ্রহণ করা হবে না।'
                              : '⚠️ Auction time has expired. No new bids can be accepted.'}
                          </span>
                        </div>
                      )}

                      {isOverallPaused && !isOverallExpired && (
                        <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-center text-xs flex items-center justify-center gap-2">
                          <Pause className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>
                            {language === 'bn'
                              ? '⏸️ নিলাম সাময়িক স্থগিত (Paused) রয়েছে। ডাক দেওয়া বন্ধ আছে।'
                              : '⏸️ Auction is currently paused. Bidding is disabled.'}
                          </span>
                        </div>
                      )}

                      {/* Quick Bid Increment Buttons: +৳ 200, +৳ 500, +৳ 1000 */}
                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-2">
                          <span>{language === 'bn' ? 'এক ক্লিকে দ্রুত ডাক (Quick Bid):' : 'Quick Bid Increment:'}</span>
                          <span className="text-[11px] text-emerald-400 font-mono">
                            {language === 'bn' ? 'বর্তমান ডাক:' : 'Current Bid:'} {formatBDT(currentHighestBid)}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 sm:gap-3">
                          {[200, 500, 1000].map(inc => {
                            const candidateBid = currentHighestBid + inc;
                            const canAfford = activeTeam && activeTeam.remainingBudget >= candidateBid;
                            const isBelowMinIncrement = currentHighestBid > 0 && inc < minIncrement;
                            const isDisabled =
                              isBiddingForbidden ||
                              !activeTeam ||
                              !canAfford ||
                              isBelowMinIncrement ||
                              isBidding ||
                              isCurrentLeader ||
                              auctionState?.status !== 'active';
                            const quickBidLabel =
                              language === 'bn'
                                ? inc === 200
                                  ? '+৳ ২০০'
                                  : inc === 500
                                  ? '+৳ ৫০০'
                                  : '+৳ ১,০০০'
                                : `+৳ ${inc.toLocaleString()}`;

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
                                  !currentUser
                                    ? language === 'bn' ? 'ডাক দিতে প্রথমে আপনার দলের Gmail দিয়ে লগইন করুন' : 'Log in to place bids'
                                    : userRole === 'viewer'
                                    ? language === 'bn' ? 'সাধারণ দর্শক হিসেবে ডাক দেওয়া যাবে না' : 'Spectators cannot place bids'
                                    : !activeTeam
                                    ? language === 'bn' ? 'কোনো দল নির্বাচিত নেই' : 'No team selected'
                                    : !hasManagerEmail
                                    ? language === 'bn' ? 'এই দলের জন্য কোনো ম্যানেজার ইমেইল বরাদ্দ নেই (ডাক প্রদান নিষ্ক্রিয়)' : 'No manager email assigned'
                                    : !isManagerAuthorizedForActiveTeam
                                    ? language === 'bn' ? 'আপনার অ্যাকাউন্টে বরাদ্দকৃত দল ছাড়া অন্য দলের হয়ে ডাক দেওয়া যাবে না' : 'Cannot bid for a team not assigned to you'
                                    : !canAfford
                                    ? language === 'bn' ? 'পর্যাপ্ত বাজেট নেই' : 'Insufficient purse'
                                    : isBelowMinIncrement
                                    ? language === 'bn' ? `ন্যূনতম বৃদ্ধি ৳${minIncrement.toLocaleString()} নির্ধারিত রয়েছে` : `Below min increment of ৳${minIncrement.toLocaleString()}`
                                    : isCurrentLeader
                                    ? language === 'bn' ? 'আপনার দল বর্তমানে সর্বোচ্চ ডাকে রয়েছে' : 'Your team is leading'
                                    : language === 'bn' ? `${quickBidLabel} বৃদ্ধি (মোট ৳${candidateBid.toLocaleString()})` : `+৳${inc.toLocaleString()}`
                                }
                              >
                                <span className="text-xs sm:text-sm font-black text-emerald-400 font-mono tracking-tight">
                                  {quickBidLabel}
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
                          step={1}
                          placeholder={`ন্যূনতম ৳${nextMinBid.toLocaleString()}`}
                          value={customBidAmount}
                          onChange={e => setCustomBidAmount(e.target.value)}
                          disabled={isBiddingForbidden || isBidding || isCurrentLeader || auctionState?.status !== 'active'}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono disabled:opacity-50"
                        />
                        <button
                          type="submit"
                          disabled={
                            isBiddingForbidden ||
                            !activeTeam ||
                            isBidding ||
                            isCurrentLeader ||
                            !customBidAmount ||
                            auctionState?.status !== 'active'
                          }
                          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-950 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                        >
                          {isBidding
                            ? language === 'bn'
                              ? 'ডাক গৃহীত হচ্ছে...'
                              : 'Submitting...'
                            : language === 'bn'
                            ? 'ডাক দিন'
                            : 'Bid Now'}
                        </button>
                      </form>

                      {/* Spectator Notice */}
                      {userRole === 'viewer' && (
                        <div className="text-xs text-center text-slate-400 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                          {language === 'bn'
                            ? '👀 আপনি সাধারণ দর্শক হিসেবে লাইভ নিলাম দেখছেন। শুধুমাত্র দলের অনুমোদিত ম্যানেজার তাদের বরাদ্দকৃত Gmail দিয়ে লগইন করে ডাক দিতে পারবেন।'
                            : '👀 Spectator Mode: Only authorized team managers logged in with their assigned Gmail can place bids.'}
                        </div>
                      )}

                      {/* Unassigned Manager Email Notice */}
                      {activeTeam && !hasManagerEmail && (
                        <div className="text-xs text-center text-amber-300 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/30 font-semibold">
                          {language === 'bn'
                            ? `⚠️ "${activeTeam.name}" দলের জন্য কোনো ম্যানেজার ইমেইল বরাদ্দ করা নেই। অ্যাডমিন কর্তৃক লগইন ইমেইল নির্ধারণ না করা পর্যন্ত ডাক প্রদান নিষ্ক্রিয় থাকবে।`
                            : `⚠️ No manager email is assigned to "${activeTeam.name}". Bidding is disabled until an admin sets a login email.`}
                        </div>
                      )}
                    </>
                  );
                })()}

                {isCurrentLeader && (
                  <div className="text-xs text-center text-emerald-400 bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 font-semibold">
                    {language === 'bn'
                      ? '✓ আপনার দল বর্তমানে সর্বোচ্চ ডাকে শীর্ষে রয়েছে!'
                      : '✓ Your team is currently leading the bid!'}
                  </div>
                )}
              </div>
            )}

          {/* ADMIN LIVE AUCTION CONTROLS (Final Call Hammer, Timer & Change Player) */}
          {isAdmin && (
            <div className="bg-slate-900 border border-purple-500/40 rounded-2xl p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2 text-purple-300 text-sm font-bold">
                  <Gavel className="w-4 h-4" />
                  <span>{language === 'bn' ? 'অ্যাডমিন নিলাম কন্ট্রোল' : 'Admin Auction Controls'}</span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  {currentUser?.email || (language === 'bn' ? 'মাস্টার এডমিন' : 'Master Admin')}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                {/* Select / Change Player */}
                <button
                  onClick={onOpenPlayerSelectModal}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                >
                  <User className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{language === 'bn' ? 'খেলোয়াড় পরিবর্তন / ড্রাফট' : 'Change/Draft Player'}</span>
                </button>

                {/* Remove Player from Auction Board (Requirement 2) */}
                {auctionState?.currentPlayerId && (
                  <button
                    onClick={() => setIsRemoveFromBoardModalOpen(true)}
                    disabled={isRemovingFromBoard || isFinalizing}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-rose-500/30 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    title={
                      language === 'bn'
                        ? 'বর্তমান খেলোয়াড়কে নিলাম বোর্ড থেকে সরিয়ে ড্রাফট তালিকায় ফেরত নিন'
                        : 'Remove current player from auction board'
                    }
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-400" />
                    <span>{language === 'bn' ? 'নিলাম বোর্ড থেকে সরান' : 'Remove from Board'}</span>
                  </button>
                )}

                {/* When player auction is finalized (SOLD or UNSOLD): show clear result and next player button */}
                {auctionState?.currentPlayerId && (auctionState.status === 'sold' || auctionState.status === 'unsold') && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <div
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-2 border shadow-md ${
                        auctionState.status === 'sold'
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                          : 'bg-rose-500/20 border-rose-500 text-rose-300'
                      }`}
                    >
                      {auctionState.status === 'sold' ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>
                            {language === 'bn'
                              ? `চূড়ান্ত বিক্রিত: ${auctionState.highestBidderTeamName || 'দল'} (${formatBDT(auctionState.currentBid || 0)})`
                              : `SOLD to ${auctionState.highestBidderTeamName} (${formatBDT(auctionState.currentBid || 0)})`}
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-rose-400" />
                          <span>{language === 'bn' ? 'চূড়ান্ত অবিক্রিত (UNSOLD)' : 'Final: UNSOLD'}</span>
                        </>
                      )}
                    </div>

                    <button
                      onClick={onOpenPlayerSelectModal}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-xl shadow-emerald-950 transition-all cursor-pointer ring-2 ring-emerald-400/40 animate-pulse"
                      title={language === 'bn' ? 'ড্রাফট পুল থেকে পরবর্তী খেলোয়াড় নির্বাচন করে তুলুন' : 'Select next player to auction'}
                    >
                      <User className="w-4 h-4" />
                      <span>{language === 'bn' ? 'পরবর্তী খেলোয়াড় তুলুন (Next Player)' : 'Select Next Player'}</span>
                    </button>

                    {/* Clean / Re-auction Action for SOLD or UNSOLD players (Requirement 3) */}
                    <button
                      onClick={handleCleanMistakenBid}
                      disabled={isCleaningBid || isFinalizing}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600/30 to-rose-600/30 hover:from-amber-600/45 hover:to-rose-600/45 text-amber-200 hover:text-amber-100 border-2 border-amber-500/60 hover:border-amber-400 text-xs font-black transition-all shadow-lg shadow-amber-950/40 cursor-pointer disabled:opacity-50 active:scale-95 ring-1 ring-amber-400/30"
                      title={
                        language === 'bn'
                          ? auctionState.status === 'sold'
                            ? 'বিক্রয় বাতিল করে দলের বাজেট ফেরত দিন এবং পুনরায় এই খেলোয়াড়ের নিলাম শুরু করুন'
                            : 'অবিক্রিত অবস্থা বাতিল করে পুনরায় এই খেলোয়াড়ের নিলাম শুরু করুন'
                          : 'Clean / Re-auction this player'
                      }
                    >
                      <RotateCcw className={`w-3.5 h-3.5 text-amber-300 ${isCleaningBid ? 'animate-spin' : ''}`} />
                      <span>
                        {isCleaningBid
                          ? language === 'bn'
                            ? 'রিসেট হচ্ছে...'
                            : 'Resetting...'
                          : language === 'bn'
                          ? 'ক্লিন / রি-অকশন রিসেট'
                          : 'Clean / Re-auction'}
                      </span>
                    </button>
                  </div>
                )}

                {/* Overall Auction Start / Pause / Resume & Status Controls */}
                <div className="flex items-center gap-2">
                  {auctionState?.overallTimerStatus === 'running' ? (
                    <button
                      onClick={handlePauseOverallAuction}
                      disabled={isUpdatingTimer}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all cursor-pointer shadow-md shadow-amber-950/40"
                      title={language === 'bn' ? 'সামগ্রিক নিলাম সময় সাময়িক স্থগিত (Pause) করুন' : 'Pause auction'}
                    >
                      <Pause className="w-3.5 h-3.5 text-amber-400" />
                      <span>{language === 'bn' ? 'বিরতি (Pause)' : 'Pause'}</span>
                    </button>
                  ) : auctionState?.overallTimerStatus === 'paused' ? (
                    <button
                      onClick={handleResumeOverallAuction}
                      disabled={isUpdatingTimer}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-400/50 text-xs font-black transition-all cursor-pointer shadow-lg shadow-emerald-950 animate-pulse"
                      title={language === 'bn' ? 'স্থগিত সময় থেকে নিলাম পুনরায় চালু করুন' : 'Resume auction'}
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>{language === 'bn' ? 'পুনরায় শুরু (Resume)' : 'Resume'}</span>
                    </button>
                  ) : isOverallExpired ? (
                    <button
                      onClick={() => handleStartOverallAuction(auctionState?.overallDurationSeconds || 1800)}
                      disabled={isUpdatingTimer}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white text-xs font-black shadow-lg cursor-pointer"
                      title={language === 'bn' ? 'নতুন করে নিলাম শুরু করুন' : 'Restart auction'}
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>{language === 'bn' ? 'নিলাম শুরু করুন' : 'Start Auction'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStartOverallAuction(auctionState?.overallDurationSeconds || 1800)}
                      disabled={isUpdatingTimer}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-black border border-emerald-400/60 shadow-lg shadow-emerald-950/60 transition-all cursor-pointer ring-2 ring-emerald-400/40 animate-pulse active:scale-95"
                      title={language === 'bn' ? 'নির্ধারিত সামগ্রিক সময়সীমার লাইভ নিলাম শুরু করুন' : 'Start live auction'}
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>{language === 'bn' ? 'নিলাম শুরু করুন' : 'Start Auction'}</span>
                    </button>
                  )}
                </div>

                {/* Current Active Player Actions (Clean Mistaken Bid, Final Call SOLD, Declare UNSOLD) */}
                {auctionState?.currentPlayerId && auctionState.status !== 'sold' && auctionState.status !== 'unsold' && (
                  <>
                    {/* Clean / Bid Reset Button: clearly visible for correcting accidental bids */}
                    <button
                      onClick={handleCleanMistakenBid}
                      disabled={isCleaningBid || isFinalizing}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-600/30 to-rose-600/30 hover:from-amber-600/45 hover:to-rose-600/45 text-amber-200 hover:text-amber-100 border-2 border-amber-500/60 hover:border-amber-400 text-xs font-black transition-all shadow-lg shadow-amber-950/40 cursor-pointer disabled:opacity-50 active:scale-95 ring-1 ring-amber-400/30"
                      title={
                        language === 'bn'
                          ? 'ভুল বা অনাকাঙ্ক্ষিত ডাক বাতিল করে প্রারম্ভিক ভিত্তিমূল্যে ফিরিয়ে নিন'
                          : 'Clean and reset mistaken bids to starting base price'
                      }
                    >
                      <RotateCcw className={`w-3.5 h-3.5 text-amber-300 ${isCleaningBid ? 'animate-spin' : ''}`} />
                      <span>
                        {isCleaningBid
                          ? language === 'bn'
                            ? 'রিসেট হচ্ছে...'
                            : 'Resetting...'
                          : language === 'bn'
                          ? 'ক্লিন / বিড রিসেট'
                          : 'Clean / Reset Bids'}
                      </span>
                    </button>

                    <div className="flex-1"></div>

                    {/* Master "শেষ ডাক!" Button (SOLD or UNSOLD) */}
                    <button
                      onClick={() => handleFinalCall(false)}
                      disabled={isFinalizing}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs shadow-xl transition-all cursor-pointer ${
                        auctionState.highestBidderTeamId
                          ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-950 scale-102 hover:scale-105 ring-2 ring-emerald-400/40'
                          : 'bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white shadow-amber-950'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      title={
                        language === 'bn'
                          ? 'শেষ ডাক নিশ্চিত করে খেলোয়াড় চূড়ান্ত করুন'
                          : 'Finalize call for this player'
                      }
                    >
                      <Gavel className="w-4 h-4" />
                      <span>
                        {isFinalizing
                          ? language === 'bn'
                            ? 'প্রক্রিয়াধীন...'
                            : 'Saving...'
                          : language === 'bn'
                          ? auctionState.highestBidderTeamId
                            ? 'শেষ ডাক! (বিক্রিত ঘোষণা)'
                            : 'শেষ ডাক! (অবিক্রিত ঘোষণা)'
                          : 'শেষ ডাক! (Final Call)'}
                      </span>
                    </button>

                    {/* Declare Unsold */}
                    <button
                      onClick={() => handleFinalCall(true)}
                      disabled={isFinalizing}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800 text-xs font-semibold transition-all cursor-pointer"
                      title={language === 'bn' ? 'অবিক্রিত (UNSOLD) হিসেবে শেষ করুন' : 'Declare UNSOLD'}
                    >
                      <XCircle className="w-3.5 h-3.5 text-rose-400" />
                      <span>{language === 'bn' ? 'অবিক্রিত ঘোষণা' : 'Declare Unsold'}</span>
                    </button>
                  </>
                )}
              </div>

              {/* Admin-Configurable Overall Auction Duration Panel (Presets: 10m, 30m, 1h, Custom - Persistent in Firebase) */}
              <div className="pt-3.5 mt-2 border-t border-slate-800/80 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-200 font-bold">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <span>
                      {language === 'bn'
                        ? 'সামগ্রিক নিলাম সময়সীমা নির্ধারণ (কমিটি নিয়ন্ত্রণ):'
                        : 'Overall Auction Duration Setting (Admin):'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-300">
                    <span>{language === 'bn' ? 'বর্তমান নির্ধারিত সামগ্রিক সময়:' : 'Configured Duration:'}</span>
                    <span className="text-emerald-400 font-mono font-black text-xs px-2.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/50 shadow-sm">
                      {Math.round((auctionState?.overallDurationSeconds || 1800) / 60)} {language === 'bn' ? 'মিনিট' : 'min'}
                    </span>
                    <span className="text-[10px] text-cyan-400/90 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded">
                      Firebase এ সংরক্ষিত
                    </span>
                  </div>
                </div>

                <div className="flex items-center flex-wrap gap-2">
                  {[
                    { label: '১০ মিনিট', labelEn: '10 min', seconds: 600 },
                    { label: '৩০ মিনিট', labelEn: '30 min', seconds: 1800 },
                    { label: '১ ঘণ্টা', labelEn: '1 hour', seconds: 3600 },
                  ].map(preset => {
                    const isSelected = (auctionState?.overallDurationSeconds || 1800) === preset.seconds;
                    return (
                      <button
                        key={preset.seconds}
                        type="button"
                        disabled={isUpdatingTimer}
                        onClick={() => handleSetOverallDuration(preset.seconds)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950 ring-2 ring-emerald-400/60 scale-105'
                            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
                        }`}
                        title={`${language === 'bn' ? preset.label : preset.labelEn} নির্বাচন ও Firebase-এ সংরক্ষণ করুন`}
                      >
                        <span>{language === 'bn' ? preset.label : preset.labelEn}</span>
                        {isSelected && <span className="text-[10px]">✓</span>}
                      </button>
                    );
                  })}

                  {/* Custom Duration in Minutes Input Form */}
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      const val = parseInt(customDurationInput, 10);
                      if (!isNaN(val) && val >= 1 && val <= 480) {
                        handleSetOverallDuration(val * 60);
                        setCustomDurationInput('');
                      } else {
                        setBidError(
                          language === 'bn'
                            ? 'কাস্টম সময় ১ থেকে ৪৮০ মিনিটের মধ্যে দিন'
                            : 'Enter duration between 1 and 480 minutes'
                        );
                      }
                    }}
                    className="flex items-center gap-1.5 ml-1"
                  >
                    <input
                      type="number"
                      min={1}
                      max={480}
                      placeholder={language === 'bn' ? 'কাস্টম মিনিট...' : 'Custom min...'}
                      value={customDurationInput}
                      onChange={e => setCustomDurationInput(e.target.value)}
                      className="w-28 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={!customDurationInput || isUpdatingTimer}
                      className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 border border-slate-700 text-xs font-bold transition-colors cursor-pointer disabled:opacity-40"
                    >
                      {language === 'bn' ? 'সেট' : 'Set'}
                    </button>
                  </form>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {language === 'bn'
                    ? '• সামগ্রিক নিলাম সময়সীমা সরাসরি Firebase ডেটাবেসে স্থায়ীভাবে সংরক্ষিত থাকে (রিফ্রেশ বা পুনরায় লগইনেও বজায় থাকে)।\n• প্রতিটি খেলোয়াড়ের জন্য আলাদা কাউন্টডাউন নেই—অ্যাডমিন "নিলাম শুরু করুন" ক্লিক করলে সার্বিক সময় গণনা শুরু হয় এবং অ্যাডমিনের চূড়ান্ত ডাক ("শেষ ডাক!") দ্বারা খেলোয়াড় বিক্রি বা অবিক্রিত নির্ধারিত হয়।'
                    : '• The overall auction duration is persistently saved in Firebase Firestore and synchronized across devices.\n• There is no per-player countdown timer; the committee controls the overall auction time and finalizes each player manually.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* AUXILIARY COLUMNS: Live Bids Ticker & Teams Purse (Configurable Visibility) */}
        {(displayConfig.showBidsFeed || displayConfig.showTeamsPurse || displayConfig.showRulesCard) && (
          <div className="lg:col-span-4 space-y-6">
            {/* Real-time Bidding Feed */}
            {displayConfig.showBidsFeed && (
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
                          <div className="text-[10px] text-slate-500 font-mono">
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
            )}

            {/* Teams Purse & Squad Summary */}
            {displayConfig.showTeamsPurse && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-bold text-white">
                      {language === 'bn' ? 'দলের বাজেট ও স্কোয়াড' : 'Team Purses & Squads'}
                    </h3>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
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
                              <strong className="text-slate-200 font-mono">
                                {language === 'bn'
                                  ? `${team.squadCount || 0} জন খেলোয়াড়`
                                  : `${team.squadCount || 0} players`}
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
            )}

            {/* Tournament Rules & Announcement Card */}
            {displayConfig.showRulesCard && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>
                      {language === 'bn' ? 'টুর্নামেন্ট নিয়মাবলী ও ঘোষণা' : 'Tournament Rules & Notice'}
                    </span>
                  </span>
                  {currentSeason && (
                    <EditableText
                      value={
                        currentSeason.tournamentRules ||
                        'তিস্তা প্রিমিয়ার লীগ সিজন ২ এর প্রতিটি দল যে কোনো সংখ্যক খেলোয়াড় ড্রাফট করতে পারবে। সর্বোচ্চ বাজেট ১ লক্ষ টাকা।'
                      }
                      type="textarea"
                      onSave={async val => {
                        await updateSeasonField(
                          currentSeason.id,
                          'tournamentRules',
                          val,
                          currentUser?.email || 'admin'
                        );
                      }}
                      label={language === 'bn' ? 'টুর্নামেন্ট নিয়মাবলী সম্পাদনা' : 'Tournament Rules'}
                      pencilClassName="text-emerald-400 hover:text-emerald-300"
                    />
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">
                  {currentSeason?.tournamentRules ||
                    (language === 'bn'
                      ? 'তিস্তা প্রিমিয়ার লীগ সিজন ২ এর প্রতিটি দল যে কোনো সংখ্যক খেলোয়াড় ড্রাফট করতে পারবে। সর্বোচ্চ বাজেট ১ লক্ষ টাকা।'
                      : 'Each team can draft any number of players without squad limits in Teesta Premier League. Maximum squad budget is 100,000 BDT.')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Admin Confirmation Modal for Clean / Re-auction (Requirement 3) */}
      {isCleanConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 border-2 border-amber-500/60 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl shadow-amber-950/50 space-y-5 text-white">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-amber-400">
                <RotateCcw className="w-5 h-5" />
                <h3 className="text-base sm:text-lg font-black tracking-wide">
                  {language === 'bn' ? 'ক্লিন / রি-অকশন নিশ্চিতকরণ' : 'Clean & Re-auction Confirmation'}
                </h3>
              </div>
              <button
                onClick={() => setIsCleanConfirmModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Details Box */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2.5 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">{language === 'bn' ? 'খেলোয়াড়ের নাম:' : 'Player Name:'}</span>
                <span className="font-bold text-white text-sm">{playerName}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">{language === 'bn' ? 'বর্তমান অকশন স্ট্যাটাস:' : 'Current Status:'}</span>
                <span
                  className={`font-black uppercase px-2 py-0.5 rounded text-[11px] ${
                    auctionState?.status === 'sold'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : auctionState?.status === 'unsold'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {auctionState?.status === 'sold'
                    ? language === 'bn' ? 'বিক্রিত (SOLD)' : 'SOLD'
                    : auctionState?.status === 'unsold'
                    ? language === 'bn' ? 'অবিক্রিত (UNSOLD)' : 'UNSOLD'
                    : language === 'bn' ? 'ডাক চলমান (IN PROGRESS)' : 'IN PROGRESS'}
                </span>
              </div>
              {auctionState?.status === 'sold' && (
                <>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">{language === 'bn' ? 'বিজয়ী দল:' : 'Assigned Team:'}</span>
                    <span className="font-bold text-emerald-400">{leadingTeamName || 'দল'}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">{language === 'bn' ? 'চূড়ান্ত বিক্রয়মূল্য:' : 'Final Price:'}</span>
                    <span className="font-mono font-black text-amber-300">{formatBDT(currentHighestBid)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Impact Explanation */}
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 space-y-2 text-xs text-amber-200">
              <strong className="block text-amber-300 font-bold mb-1">
                {language === 'bn' ? 'সংশোধন ও বাজেট সমন্বয় বিবরণী:' : 'Action & Budget Reconciliation Impact:'}
              </strong>
              {auctionState?.status === 'sold' ? (
                <ul className="space-y-1.5 list-disc list-inside text-amber-200/90 leading-relaxed">
                  <li>
                    <strong className="text-emerald-300">দলের বাজেট ফেরত:</strong>{' '}
                    {leadingTeamName || 'বিজয়ী দল'}-এর অবশিষ্ট বাজেটে <strong>+{formatBDT(currentHighestBid)}</strong> ফেরত প্রদান করা হবে।
                  </li>
                  <li>
                    <strong className="text-amber-300">স্কোয়াড সমন্বয়:</strong> দল থেকে খেলোয়াড়কে প্রত্যাহার করে স্কোয়াড সংখ্যা ১ জন কমানো হবে।
                  </li>
                  <li>
                    <strong className="text-cyan-300">রি-অকশন প্রস্তুতি:</strong> খেলোয়াড়কে পুনরায় নিলামের জন্য প্রারম্ভিক ভিত্তিমূল্যে ({formatBDT(currentPlayerObj?.basePrice || auctionState?.currentBasePrice || 2000)}) স্টেজে প্রস্তুত করা হবে।
                  </li>
                  <li>
                    <strong className="text-slate-300">ডেটা সুরক্ষা:</strong> খেলোয়াড়ের কোনো তথ্য বা পূর্বের অডিট হিস্ট্রি মুছে ফেলা হবে না।
                  </li>
                </ul>
              ) : auctionState?.status === 'unsold' ? (
                <ul className="space-y-1.5 list-disc list-inside text-amber-200/90 leading-relaxed">
                  <li>
                    <strong className="text-emerald-300">বাজেট সমন্বয়:</strong> কোনো দলের বাজেট পরিবর্তন হবে না (৳০)।
                  </li>
                  <li>
                    <strong className="text-cyan-300">রি-অকশন প্রস্তুতি:</strong> খেলোয়াড়কে পুনরায় নিলামের জন্য প্রারম্ভিক ভিত্তিমূল্যে প্রস্তুত করা হবে।
                  </li>
                </ul>
              ) : (
                <ul className="space-y-1.5 list-disc list-inside text-amber-200/90 leading-relaxed">
                  <li>
                    <strong className="text-rose-300">ভুল ডাক বাতিল:</strong> বর্তমান সর্বোচ্চ ডাক ({formatBDT(currentHighestBid)}) বাতিল হবে।
                  </li>
                  <li>
                    <strong className="text-emerald-300">ভিত্তিমূল্যে প্রত্যাবর্তন:</strong> ডাক প্রারম্ভিক ভিত্তিমূল্য ({formatBDT(currentPlayerObj?.basePrice || auctionState?.currentBasePrice || 2000)})-এ ফিরে যাবে।
                  </li>
                  <li>
                    <strong className="text-amber-300">কাউন্টডাউন স্ট্যান্ডবাই:</strong> চলমান কাউন্টডাউন বাতিল হবে। অ্যাডমিন চাইলে নতুন করে শুরু করতে পারবেন।
                  </li>
                </ul>
              )}
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isCleaningBid}
                onClick={() => setIsCleanConfirmModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                {language === 'bn' ? 'বাতিল করুন' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={isCleaningBid}
                onClick={executeCleanConfirm}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 via-rose-600 to-amber-600 hover:from-amber-500 hover:to-rose-500 text-white text-xs font-black shadow-lg shadow-amber-950 transition-all cursor-pointer flex items-center gap-2"
              >
                {isCleaningBid && <RotateCcw className="w-4 h-4 animate-spin text-white" />}
                <span>
                  {isCleaningBid
                    ? language === 'bn' ? 'প্রক্রিয়াধীন...' : 'Processing...'
                    : language === 'bn' ? 'হ্যাঁ, নিশ্চিত করুন (ক্লিন ও রি-অকশন)' : 'Confirm Clean & Re-auction'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Remove Player From Board (Requirement 2) */}
      {isRemoveFromBoardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-white">
                নিলাম বোর্ড থেকে সরানোর নিশ্চিতকরণ
              </h3>
              <p className="text-xs text-slate-400">
                আপনি কি নিশ্চিত যে বর্তমান খেলোয়াড়কে নিলাম বোর্ড থেকে সরাতে চান?
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden shrink-0 flex items-center justify-center">
                {playerPhoto ? (
                  <img src={playerPhoto} alt={playerName} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-6 h-6 text-slate-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-white text-sm truncate">{playerName}</div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                  <span>{formNumberDisplay}</span>
                  <span>•</span>
                  <span>ক্যাটেগরি {playerCategory}</span>
                  <span>•</span>
                  <span className="font-mono text-emerald-400">{formatBDT(auctionState?.currentBasePrice || 0)}</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-950/20 border border-blue-500/30 rounded-xl p-3 text-[11px] text-blue-200 leading-relaxed space-y-1">
              <p className="font-semibold text-blue-300">নিশ্চিতকরণ তথ্য:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[10px] text-slate-300">
                <li>খেলোয়াড় পুনরায় ড্রাফট / উপলব্ধ তালিকায় (upcoming) ফিরে যাবেন।</li>
                <li>খেলোয়াড়ের কোনো তথ্য, ছবি বা রেজিস্ট্রেশন মুছে যাবে না।</li>
                <li>খেলোয়াড়কে SOLD বা UNSOLD হিসেবে চিহ্নিত করা হবে না।</li>
                <li>দলের কোনো বাজেট কাটা বা ফেরত দেওয়া হবে না।</li>
              </ul>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsRemoveFromBoardModalOpen(false)}
                disabled={isRemovingFromBoard}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveFromBoard}
                disabled={isRemovingFromBoard}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-xs font-semibold text-white shadow-lg shadow-rose-950 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isRemovingFromBoard ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    <span>সরানো হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>হ্যাঁ, বোর্ড থেকে সরান</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Display Customizer Modal */}
      <AuctionDisplayCustomizerModal
        isOpen={isCustomizerOpen}
        onClose={() => setIsCustomizerOpen(false)}
        config={displayConfig}
        onConfigChange={newCfg => setDisplayConfig(newCfg)}
      />

      {/* Fullscreen Broadcast Player Auction Board */}
      <ProjectorAuctionBoard
        isOpen={isInternalProjectorOpen}
        onClose={() => setIsInternalProjectorOpen(false)}
        auctionState={auctionState}
        teams={teams}
        approvedPlayers={approvedPlayers}
        currentSeason={currentSeason}
      />
    </div>
  );
};
