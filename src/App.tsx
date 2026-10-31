/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, isQuotaExceededError } from './firebase/config';
import { ShieldAlert } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { LiveAuctionRoom } from './components/LiveAuctionRoom';
import { PlayerManagement } from './components/PlayerManagement';
import { TeamManagement } from './components/TeamManagement';
import { FeeAndRefundReport } from './components/FeeAndRefundReport';
import { AuditLogViewer } from './components/AuditLogViewer';
import { SetupAndTestingGuide } from './components/SetupAndTestingGuide';
import { PlayerRegistrationModal } from './components/PlayerRegistrationModal';
import { LoginModal } from './components/LoginModal';
import { PlayerSelectModal } from './components/PlayerSelectModal';
import { SeasonManagerModal } from './components/SeasonManagerModal';
import { ProjectorAuctionBoard } from './components/ProjectorAuctionBoard';
import { AdminManagementSection } from './components/AdminManagementSection';
import { TeamSquadScoreboard } from './components/TeamSquadScoreboard';
import { PosterGallery } from './components/PosterGallery';
import { AuctionState, Player, Team, Bid, AuditLog, Season } from './types';
import {
  seedInitialTplData,
  ensureDefaultSeasonExists,
  DEFAULT_SEASON_2,
} from './services/auctionService';
import { EditableText } from './components/common/EditableText';
import { updateSeasonField } from './services/editService';
import { ensureRegistrationSettingsExists, parseNumericFormValue } from './services/registrationService';

function MainApp() {
  const { language, currentUser, isAdmin, userRole, allTeams } = useAuth();
  const teams = allTeams;

  const [activeTab, setActiveTab] = useState('auction');
  const [auctionState, setAuctionState] = useState<AuctionState | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);

  // Strict role-based navigation protection
  useEffect(() => {
    if (userRole === 'viewer' && !['auction', 'lineup', 'posters'].includes(activeTab)) {
      setActiveTab('auction');
    } else if (userRole === 'team' && !['auction', 'players', 'teams', 'lineup', 'posters'].includes(activeTab)) {
      setActiveTab('auction');
    }
  }, [userRole, activeTab]);

  const [players, setPlayers] = useState<Player[]>(() => {
    try {
      const cached = localStorage.getItem('tpl_cached_players');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [seasons, setSeasons] = useState<Season[]>(() => {
    try {
      const cached = localStorage.getItem('tpl_cached_seasons');
      return cached ? JSON.parse(cached) : [DEFAULT_SEASON_2];
    } catch {
      return [DEFAULT_SEASON_2];
    }
  });
  const [currentSeasonId, setCurrentSeasonId] = useState<string>('season-2-2026');

  // Listen to Firestore Quota notices and local player updates
  useEffect(() => {
    const handleQuota = () => setIsQuotaExceeded(true);
    const handlePlayersUpdated = (e: CustomEvent<Player[]>) => {
      if (Array.isArray(e.detail) && e.detail.length > 0) {
        setPlayers(e.detail);
      }
    };
    window.addEventListener('tpl:quota-exceeded', handleQuota);
    window.addEventListener('tpl:players-updated', handlePlayersUpdated as EventListener);
    return () => {
      window.removeEventListener('tpl:quota-exceeded', handleQuota);
      window.removeEventListener('tpl:players-updated', handlePlayersUpdated as EventListener);
    };
  }, []);

  // Modals state
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isPlayerSelectModalOpen, setIsPlayerSelectModalOpen] = useState(false);
  const [isSeasonModalOpen, setIsSeasonModalOpen] = useState(false);
  const [isProjectorBoardOpen, setIsProjectorBoardOpen] = useState(false);

  // Initialize Registration Settings (Only for admins and only if not cached locally)
  useEffect(() => {
    if (isAdmin && !localStorage.getItem('tpl_cached_settings')) {
      ensureRegistrationSettingsExists().catch(err => {
        console.warn('Auto ensure registration settings notice:', err);
      });
    }
  }, [isAdmin]);

  // 1. Subscribe to Seasons collection (read is public, run once to prevent re-subscription churn)
  useEffect(() => {
    const unsubSeasons = onSnapshot(
      collection(db, 'seasons'),
      snap => {
        const list: Season[] = [];
        snap.forEach(docSnap => {
          list.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });

        if (list.length > 0) {
          // Sort seasons: active ones first, then newest year first
          list.sort((a, b) => (b.year || 0) - (a.year || 0));
          setSeasons(list);
          try {
            localStorage.setItem('tpl_cached_seasons', JSON.stringify(list));
          } catch {}

          // If current season is not valid, switch to live active season or first
          setCurrentSeasonId(prevSeasonId => {
            if (!list.some(s => s.id === prevSeasonId)) {
              const activeSeason = list.find(s => s.isLiveAuctionActive) || list[0];
              return activeSeason ? activeSeason.id : prevSeasonId;
            }
            return prevSeasonId;
          });
        } else {
          setSeasons([DEFAULT_SEASON_2]);
        }
      },
      error => {
        handleFirestoreError(error, OperationType.GET, 'seasons');
      }
    );

    return () => unsubSeasons();
  }, []);

  // 2. Subscribe to Live Auction State
  useEffect(() => {
    const unsubAuction = onSnapshot(
      doc(db, 'auction', 'current'),
      snap => {
        if (snap.exists()) {
          setAuctionState(snap.data() as AuctionState);
        } else {
          setAuctionState(null);
        }
      },
      error => {
        handleFirestoreError(error, OperationType.GET, 'auction/current');
      }
    );

    return () => unsubAuction();
  }, []);

  // 3. Subscribe to Live Bids for active auction (Only when on live auction tab or projector board)
  useEffect(() => {
    if (activeTab !== 'auction' && !isProjectorBoardOpen) {
      return;
    }

    const bidsQuery = query(
      collection(db, 'auction', 'current', 'bids'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubBids = onSnapshot(
      bidsQuery,
      snap => {
        const list: Bid[] = [];
        snap.forEach(docSnap => {
          list.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        setBids(list);
      },
      error => {
        handleFirestoreError(error, OperationType.GET, 'auction/current/bids');
      }
    );

    return () => unsubBids();
  }, [activeTab, isProjectorBoardOpen]);

  // 4. Subscribe to Players collection
  useEffect(() => {
    const unsubPlayers = onSnapshot(
      collection(db, 'players'),
      snap => {
        const list: Player[] = [];
        snap.forEach(docSnap => {
          list.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        if (list.length > 0) {
          // Sort players naturally by form number ascending (with fallback to creation order)
          list.sort((a, b) => {
            const numA =
              typeof a.formNumericValue === 'number' && a.formNumericValue > 0
                ? a.formNumericValue
                : parseNumericFormValue(a.formNumber);
            const numB =
              typeof b.formNumericValue === 'number' && b.formNumericValue > 0
                ? b.formNumericValue
                : parseNumericFormValue(b.formNumber);
            if (numA > 0 && numB > 0) return numA - numB;
            if (numA > 0) return -1;
            if (numB > 0) return 1;
            return (a.createdAt || '').localeCompare(b.createdAt || '');
          });
          setPlayers(list);
          try {
            // Store lightweight player cache to preserve 5MB browser localStorage quota
            const lightList = list.slice(0, 100).map(p => ({
              ...p,
              photoUrl: p.photoUrl && p.photoUrl.length > 256 ? undefined : p.photoUrl,
            }));
            localStorage.setItem('tpl_cached_players', JSON.stringify(lightList));
          } catch {
            try {
              localStorage.removeItem('tpl_cached_players');
            } catch {}
          }
        }
      },
      error => {
        if (isQuotaExceededError(error)) {
          try {
            const cached = localStorage.getItem('tpl_cached_players');
            if (cached) {
              setPlayers(JSON.parse(cached));
            }
          } catch {}
        }
        handleFirestoreError(error, OperationType.GET, 'players');
      }
    );

    return () => unsubPlayers();
  }, []);

  // 6. Subscribe to Audit Logs (Admin Only & only when viewing relevant management tabs)
  useEffect(() => {
    if (!isAdmin || (activeTab !== 'audit' && activeTab !== 'settings')) {
      return;
    }

    const logsQuery = query(
      collection(db, 'auditLogs'),
      orderBy('timestamp', 'desc'),
      limit(25)
    );

    const unsubLogs = onSnapshot(
      logsQuery,
      snap => {
        const list: AuditLog[] = [];
        snap.forEach(docSnap => {
          list.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        setAuditLogs(list);
      },
      error => {
        handleFirestoreError(error, OperationType.GET, 'auditLogs');
      }
    );

    return () => unsubLogs();
  }, [isAdmin, activeTab]);

  // Trigger quick seed when requested
  const handleSeed = async () => {
    await seedInitialTplData(currentUser?.email || 'admin');
  };

  // Resolve current active Season object
  const currentSeason: Season =
    seasons.find(s => s.id === currentSeasonId) ||
    seasons[0] ||
    DEFAULT_SEASON_2;

  // Synchronize viewers to the active auction season if an auction is loaded with a valid seasonId
  useEffect(() => {
    if (auctionState?.currentPlayerId && auctionState.seasonId && auctionState.seasonId !== currentSeasonId) {
      if (seasons.some(s => s.id === auctionState.seasonId)) {
        setCurrentSeasonId(auctionState.seasonId);
      }
    }
  }, [auctionState?.currentPlayerId, auctionState?.seasonId, seasons, currentSeasonId]);

  // Filter datasets strictly by selected Season (preserving Season 2 and all future seasons independently)
  const seasonTeams = teams.filter(t => (t.seasonId || 'season-2-2026') === currentSeasonId);
  const seasonPlayers = players.filter(p => (p.seasonId || 'season-2-2026') === currentSeasonId);
  const seasonApprovedPlayers = seasonPlayers.filter(p => p.approvalStatus === 'approved');
  const seasonLogs = auditLogs.filter(l => !l.seasonId || l.seasonId === currentSeasonId);

  // Live auction indicator check: active if auction is running with a player on stage
  const isAuctionLive =
    Boolean(auctionState?.currentPlayerId) &&
    (auctionState?.status === 'active' || auctionState?.overallTimerStatus === 'running') &&
    (!auctionState?.seasonId || auctionState?.seasonId === currentSeasonId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Header with Season Selector, Live Indicator, Tabs & Admin Tools */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        teams={seasonTeams}
        seasons={seasons}
        currentSeasonId={currentSeasonId}
        onSelectSeason={setCurrentSeasonId}
        onOpenSeasonManager={() => setIsSeasonModalOpen(true)}
        onOpenRegisterModal={() => setIsRegisterModalOpen(true)}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onSeedData={handleSeed}
        auctionLive={isAuctionLive}
        onOpenProjectorBoard={() => setIsProjectorBoardOpen(true)}
      />

      {/* Persistent Quota Reassurance Alert Banner */}
      {isQuotaExceeded && (
        <div className="bg-gradient-to-r from-amber-950/90 via-slate-900 to-amber-950/90 border-b border-amber-500/40 px-4 py-3 text-amber-200 text-sm shadow-xl backdrop-blur-md">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="p-1 px-2.5 rounded-lg bg-amber-500/20 text-amber-300 font-bold text-xs shrink-0 border border-amber-500/40">
                ⚠️ নোটিশ
              </span>
              <div>
                <p className="font-semibold text-amber-100 text-sm">
                  গুগল ফায়ারবেস ফ্রি দৈনিক রিড কোটা সীমা (Daily Read Quota Limit - ৫০,০০০ রিডস) অতিক্রম করেছে।
                </p>
                <p className="text-xs text-amber-300/85 mt-0.5 leading-relaxed">
                  আপনার পূর্বে নিবন্ধিত খেলোয়াড়, দল ও বাজেটের সমস্ত ডাটা গুগল ক্লাউডে ১০০% সুরক্ষিত রয়েছে—কোনো তথ্য মুছে যায়নি। কোটা আগামীকাল স্বয়ংক্রিয়ভাবে রিসেট হবে অথবা তাৎক্ষণিক কোটা মুক্ত করতে ফায়ারবেস কনসোল থেকে আপগ্রেড করতে পারেন।
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2 flex-wrap">
              <a
                href="https://console.firebase.google.com/project/subtle-genius-3k8sk/firestore/databases/ai-studio-teestapremierlea-1deff6e9-8e69-4cc6-9065-36654a824afb/data?openUpgradeDialog=true"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow transition-colors cursor-pointer"
              >
                আপগ্রেড করুন (Upgrade)
              </a>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium">
                ✓ ডাটাবেজ সুরক্ষিত
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* If database has no teams and no players in current season, show setup invitation (suppressed if quota is exceeded) */}
        {!isQuotaExceeded && seasonTeams.length === 0 && seasonPlayers.length === 0 && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-950 border border-emerald-500/40 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
            <div className="text-xs text-slate-200">
              <strong className="text-emerald-400 block text-sm">
                {language === 'bn'
                  ? `স্বাগতম ${currentSeason.name} এ!`
                  : `Welcome to ${currentSeason.name}!`}
              </strong>
              {language === 'bn'
                ? 'এই সিজনে এখনো কোনো দল বা খেলোয়াড় যুক্ত করা হয়নি। আপনি নতুন দল তৈরি করতে পারেন অথবা ডেমো ডেটা দিয়ে শুরু করতে পারেন।'
                : 'No teams or players are registered in this season yet. You can create teams or seed starter demo data.'}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSeed}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer whitespace-nowrap"
              >
                {language === 'bn' ? '১-ক্লিকে ডেমো লোড করুন' : 'Seed Starter Data'}
              </button>
            </div>
          </div>
        )}

        {/* Tab 1: Live Auction Room */}
        {activeTab === 'auction' && (
          <LiveAuctionRoom
            auctionState={auctionState}
            bids={bids}
            teams={seasonTeams}
            approvedPlayers={seasonApprovedPlayers}
            allPlayers={players}
            onOpenPlayerSelectModal={() => setIsPlayerSelectModalOpen(true)}
            currentSeason={currentSeason}
            onOpenProjectorBoard={() => setIsProjectorBoardOpen(true)}
          />
        )}

        {/* Tab: Team Squad Scoreboard & Lineup (Real Sociedad Inspired) */}
        {activeTab === 'lineup' && (
          <TeamSquadScoreboard
            teams={seasonTeams}
            players={seasonPlayers}
            currentSeason={currentSeason}
          />
        )}

        {/* Tab: Dedicated Automatic SOLD & UNSOLD Poster Gallery */}
        {activeTab === 'posters' && (
          <PosterGallery
            currentSeason={currentSeason}
            teams={seasonTeams}
            players={seasonPlayers}
          />
        )}

        {/* Tab 2: Player Management & Draft Pool (Team Managers and Admins only) */}
        {activeTab === 'players' && (
          userRole === 'team' || isAdmin ? (
            <PlayerManagement
              players={seasonPlayers}
              onOpenRegisterModal={() => setIsRegisterModalOpen(true)}
              onSelectForAuction={() => {
                setIsPlayerSelectModalOpen(true);
              }}
              currentSeason={currentSeason}
            />
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-4 max-w-md mx-auto my-8">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-950/40">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">
                {language === 'bn' ? 'অনুমতি প্রয়োজন (Restricted Access)' : 'Restricted Access'}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {language === 'bn'
                  ? 'খেলোয়াড় তালিকা শুধুমাত্র অনুমোদিত অ্যাডমিন এবং দল ম্যানেজারদের জন্য সংরক্ষিত।'
                  : 'Player roster is restricted to authorized team managers and administrators.'}
              </p>
              <button
                onClick={() => setActiveTab('auction')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
              >
                {language === 'bn' ? 'লাইভ নিলামে ফিরে যান' : 'Back to Live Auction'}
              </button>
            </div>
          )
        )}

        {/* Tab 3: Team Management & Budget Tracker (Team Managers and Admins only) */}
        {activeTab === 'teams' && (
          userRole === 'team' || isAdmin ? (
            <TeamManagement
              teams={seasonTeams}
              players={seasonPlayers}
              currentSeasonId={currentSeasonId}
              currentSeason={currentSeason}
            />
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-4 max-w-md mx-auto my-8">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-950/40">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">
                {language === 'bn' ? 'অনুমতি প্রয়োজন (Restricted Access)' : 'Restricted Access'}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {language === 'bn'
                  ? 'দল ও বাজেট সংক্রান্ত তথ্য শুধুমাত্র অনুমোদিত অ্যাডমিন এবং দল প্রতিনিধিদের জন্য সংরক্ষিত।'
                  : 'Team rosters and budgets are restricted to authorized team managers and administrators.'}
              </p>
              <button
                onClick={() => setActiveTab('auction')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
              >
                {language === 'bn' ? 'লাইভ নিলামে ফিরে যান' : 'Back to Live Auction'}
              </button>
            </div>
          )
        )}

        {/* Tab: Admin Management (Admin Only) */}
        {activeTab === 'admin-management' && (
          isAdmin ? (
            <AdminManagementSection />
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-4 max-w-md mx-auto my-8">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-950/40">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">
                {language === 'bn' ? 'অনুমতি প্রয়োজন (Admin Only)' : 'Restricted Access'}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {language === 'bn'
                  ? 'অ্যাডমিন ম্যানেজমেন্ট শুধুমাত্র প্ল্যাটফর্ম অ্যাডমিনের জন্য সংরক্ষিত।'
                  : 'Admin management is restricted to authorized platform administrators.'}
              </p>
              <button
                onClick={() => setActiveTab('auction')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
              >
                {language === 'bn' ? 'লাইভ নিলামে ফিরে যান' : 'Back to Live Auction'}
              </button>
            </div>
          )
        )}

        {/* Tab 4: Fee & Refund Report (Admin Only) */}
        {activeTab === 'fees' && (
          isAdmin ? (
            <FeeAndRefundReport
              players={seasonPlayers}
              currentSeason={currentSeason}
            />
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-4 max-w-md mx-auto my-8">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-950/40">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">
                {language === 'bn' ? 'অনুমতি প্রয়োজন (Admin Only)' : 'Restricted Access'}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {language === 'bn'
                  ? 'ফি ও রিফান্ড সংক্রান্ত আর্থিক হিসাব এবং ট্রানজ্যাকশন রিপোর্ট শুধুমাত্র অনুমোদিত অ্যাডমিনের জন্য সংরক্ষিত।'
                  : 'Financial fee reports and refund records are strictly restricted to authorized platform administrators.'}
              </p>
              <button
                onClick={() => setActiveTab('auction')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
              >
                {language === 'bn' ? 'লাইভ নিলামে ফিরে যান' : 'Back to Live Auction'}
              </button>
            </div>
          )
        )}

        {/* Tab 5: Audit Logs (Admin Only) */}
        {activeTab === 'audit' && (
          isAdmin ? (
            <AuditLogViewer logs={seasonLogs} />
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-4 max-w-md mx-auto my-8">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">
                {language === 'bn' ? 'অনুমতি প্রয়োজন (Admin Only)' : 'Restricted Access'}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {language === 'bn'
                  ? 'অডিট লগ শুধুমাত্র প্ল্যাটফর্ম অ্যাডমিন দেখতে পারবেন।'
                  : 'Audit logs are restricted to authorized administrators.'}
              </p>
            </div>
          )
        )}

        {/* Tab 6: Setup & Testing Guide */}
        {activeTab === 'guide' && (
          <SetupAndTestingGuide onSeeded={handleSeed} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center flex-wrap gap-2 justify-center sm:justify-start">
            <EditableText
              value={currentSeason.name}
              onSave={async (val) => {
                await updateSeasonField(currentSeason.id, 'name', val, currentUser?.email || 'admin');
              }}
              label={language === 'bn' ? 'ফুটার সিজনের নাম' : 'Footer Season Name'}
              pencilClassName="text-slate-500 hover:text-emerald-400"
            >
              <span className="font-semibold text-slate-400">{currentSeason.name}</span>
            </EditableText>

            <span className="text-slate-700">•</span>

            <EditableText
              value={
                currentSeason.footerText ||
                (language === 'bn' ? 'অফিসিয়াল অকশন পোর্টাল' : 'Official Auction System')
              }
              onSave={async (val) => {
                await updateSeasonField(currentSeason.id, 'footerText', val, currentUser?.email || 'admin');
              }}
              label={language === 'bn' ? 'ফুটার নোটিশ / ট্যাগলাইন' : 'Footer Tagline'}
              pencilClassName="text-slate-500 hover:text-emerald-400"
            >
              <span>
                {currentSeason.footerText ||
                  (language === 'bn' ? 'অফিসিয়াল অকশন পোর্টাল' : 'Official Auction System')}
              </span>
            </EditableText>

            <span className="text-slate-700">•</span>

            <EditableText
              value={currentSeason.contactEmail || 'arifhossainbd087@gmail.com'}
              onSave={async (val) => {
                await updateSeasonField(currentSeason.id, 'contactEmail', val, currentUser?.email || 'admin');
              }}
              label={language === 'bn' ? 'এডমিন হেল্পলাইন ইমেইল' : 'Admin Contact Email'}
              pencilClassName="text-slate-500 hover:text-sky-400"
            >
              <span className="text-slate-400">{currentSeason.contactEmail || 'arifhossainbd087@gmail.com'}</span>
            </EditableText>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-slate-600">
            <span>Bangladeshi Taka (৳)</span>
            <span>Multi-Season Architecture</span>
            <span>Cloud Firestore Verified</span>
            <span>Role-Based Access Control</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <PlayerRegistrationModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        language={language}
        onSuccess={() => {}}
        currentSeasonId={currentSeasonId}
        seasonFee={typeof currentSeason?.regFeeAmount === 'number' ? currentSeason.regFeeAmount : 500}
        seasonName={currentSeason.name}
      />

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        language={language}
      />

      <PlayerSelectModal
        isOpen={isPlayerSelectModalOpen}
        onClose={() => setIsPlayerSelectModalOpen(false)}
        players={seasonApprovedPlayers}
        language={language}
        savedTimerSeconds={auctionState?.timerSeconds || currentSeason?.defaultTimerSeconds || 20}
        savedMinIncrement={
          typeof auctionState?.minIncrement === 'number' && auctionState.minIncrement >= 0
            ? auctionState.minIncrement
            : currentSeason?.defaultMinIncrement ?? 100
        }
      />

      <SeasonManagerModal
        isOpen={isSeasonModalOpen}
        onClose={() => setIsSeasonModalOpen(false)}
        seasons={seasons}
        currentSeasonId={currentSeasonId}
        onSelectSeason={setCurrentSeasonId}
      />

      {/* Full-Screen Broadcast Player Auction Board (Projector / Big Screen View) */}
      <ProjectorAuctionBoard
        isOpen={isProjectorBoardOpen}
        onClose={() => setIsProjectorBoardOpen(false)}
        auctionState={auctionState}
        teams={seasonTeams}
        approvedPlayers={seasonApprovedPlayers}
        allPlayers={players}
        currentSeason={currentSeason}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
