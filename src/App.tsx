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
import { db, handleFirestoreError, OperationType } from './firebase/config';
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
import { AuctionState, Player, Team, Bid, AuditLog, Season } from './types';
import {
  seedInitialTplData,
  ensureDefaultSeasonExists,
  DEFAULT_SEASON_2,
} from './services/auctionService';
import { EditableText } from './components/common/EditableText';
import { updateSeasonField } from './services/editService';
import { ensureRegistrationSettingsExists } from './services/registrationService';

function MainApp() {
  const { language, currentUser, isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState('auction');
  const [auctionState, setAuctionState] = useState<AuctionState | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([DEFAULT_SEASON_2]);
  const [currentSeasonId, setCurrentSeasonId] = useState<string>('season-2-2026');

  // Modals state
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isPlayerSelectModalOpen, setIsPlayerSelectModalOpen] = useState(false);
  const [isSeasonModalOpen, setIsSeasonModalOpen] = useState(false);

  // Initialize Registration Settings (Form numbering sequence)
  useEffect(() => {
    ensureRegistrationSettingsExists().catch(err => {
      console.warn('Auto ensure registration settings notice:', err);
    });
  }, []);

  // 1. Subscribe to Seasons collection (read is public)
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

          // If current season is not valid, switch to live active season or first
          if (!list.some(s => s.id === currentSeasonId)) {
            const activeSeason = list.find(s => s.isLiveAuctionActive) || list[0];
            if (activeSeason) {
              setCurrentSeasonId(activeSeason.id);
            }
          }
        } else {
          setSeasons([DEFAULT_SEASON_2]);
          if (isAdmin) {
            ensureDefaultSeasonExists(true);
          }
        }
      },
      error => {
        handleFirestoreError(error, OperationType.GET, 'seasons');
      }
    );

    return () => unsubSeasons();
  }, [currentSeasonId, isAdmin]);

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

  // 3. Subscribe to Live Bids for active auction
  useEffect(() => {
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
  }, []);

  // 4. Subscribe to Teams collection
  useEffect(() => {
    const unsubTeams = onSnapshot(
      collection(db, 'teams'),
      snap => {
        const list: Team[] = [];
        snap.forEach(docSnap => {
          list.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        setTeams(list);
      },
      error => {
        handleFirestoreError(error, OperationType.GET, 'teams');
      }
    );

    return () => unsubTeams();
  }, []);

  // 5. Subscribe to Players collection
  useEffect(() => {
    const unsubPlayers = onSnapshot(
      collection(db, 'players'),
      snap => {
        const list: Player[] = [];
        snap.forEach(docSnap => {
          list.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        setPlayers(list);
      },
      error => {
        handleFirestoreError(error, OperationType.GET, 'players');
      }
    );

    return () => unsubPlayers();
  }, []);

  // 6. Subscribe to Audit Logs (Admin Only)
  useEffect(() => {
    if (!isAdmin) {
      setAuditLogs([]);
      return;
    }

    const logsQuery = query(
      collection(db, 'auditLogs'),
      orderBy('timestamp', 'desc'),
      limit(100)
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
  }, [isAdmin]);

  // Trigger quick seed when requested
  const handleSeed = async () => {
    await seedInitialTplData(currentUser?.email || 'admin');
  };

  // Resolve current active Season object
  const currentSeason: Season =
    seasons.find(s => s.id === currentSeasonId) ||
    seasons[0] ||
    DEFAULT_SEASON_2;

  // Filter datasets strictly by selected Season (preserving Season 2 and all future seasons independently)
  const seasonTeams = teams.filter(t => (t.seasonId || 'season-2-2026') === currentSeasonId);
  const seasonPlayers = players.filter(p => (p.seasonId || 'season-2-2026') === currentSeasonId);
  const seasonApprovedPlayers = seasonPlayers.filter(p => p.approvalStatus === 'approved');
  const seasonLogs = auditLogs.filter(l => !l.seasonId || l.seasonId === currentSeasonId);

  // Live auction indicator check
  const isAuctionLive =
    auctionState?.status === 'active' &&
    (!auctionState.seasonId || auctionState.seasonId === currentSeasonId);

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
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* If database has no teams and no players in current season, show setup invitation */}
        {seasonTeams.length === 0 && seasonPlayers.length === 0 && (
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
            onOpenPlayerSelectModal={() => setIsPlayerSelectModalOpen(true)}
            currentSeason={currentSeason}
          />
        )}

        {/* Tab 2: Player Management & Draft Pool */}
        {activeTab === 'players' && (
          <PlayerManagement
            players={seasonPlayers}
            onOpenRegisterModal={() => setIsRegisterModalOpen(true)}
            onSelectForAuction={() => {
              setIsPlayerSelectModalOpen(true);
            }}
            currentSeason={currentSeason}
          />
        )}

        {/* Tab 3: Team Management & Budget Tracker */}
        {activeTab === 'teams' && (
          <TeamManagement
            teams={seasonTeams}
            players={seasonPlayers}
            currentSeasonId={currentSeasonId}
            currentSeason={currentSeason}
          />
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
      />

      <SeasonManagerModal
        isOpen={isSeasonModalOpen}
        onClose={() => setIsSeasonModalOpen(false)}
        seasons={seasons}
        currentSeasonId={currentSeasonId}
        onSelectSeason={setCurrentSeasonId}
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
