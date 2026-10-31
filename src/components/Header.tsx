import React, { useState } from 'react';
import {
  Trophy,
  Users,
  Shield,
  ShieldCheck,
  FileSpreadsheet,
  History,
  HelpCircle,
  LogIn,
  LogOut,
  UserCheck,
  ChevronDown,
  Sparkles,
  PlayCircle,
  UserPlus,
  Calendar,
  Layers,
  Settings,
  Maximize2,
  Image as ImageIcon,
} from 'lucide-react';
import { useAuth, BOOTSTRAP_ADMIN_EMAIL } from '../context/AuthContext';
import { Team, UserRole, Season } from '../types';
import { formatBDT } from '../utils/formatters';
import { EditableText } from './common/EditableText';
import { updateSeasonField } from '../services/editService';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  teams: Team[];
  seasons: Season[];
  currentSeasonId: string;
  onSelectSeason: (seasonId: string) => void;
  onOpenSeasonManager: () => void;
  onOpenRegisterModal: () => void;
  onOpenLoginModal: () => void;
  onSeedData: () => void;
  auctionLive: boolean;
  onOpenProjectorBoard?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  teams,
  seasons,
  currentSeasonId,
  onSelectSeason,
  onOpenSeasonManager,
  onOpenRegisterModal,
  onOpenLoginModal,
  onSeedData,
  auctionLive,
  onOpenProjectorBoard,
}) => {
  const {
    currentUser,
    userRole,
    isAdmin,
    isSuperAdmin,
    isPrimaryAdmin,
    verifiedAdminRole,
    activeTeam,
    logout,
    setTestSimulatedRole,
    isSimulated,
    language,
    setLanguage,
  } = useAuth();

  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showSeasonMenu, setShowSeasonMenu] = useState(false);

  const canSwitchRole =
    !!currentUser &&
    (verifiedAdminRole === 'primary' ||
      verifiedAdminRole === 'assistant' ||
      (currentUser.email || '').trim().toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase());

  const currentSeason = seasons.find(s => s.id === currentSeasonId) || seasons[0];

  // Dynamically configure accessible navigation tabs strictly based on verified user role
  const navItems = [
    {
      id: 'auction',
      label: language === 'bn' ? 'লাইভ নিলাম' : 'Live Auction',
      icon: PlayCircle,
      badge: auctionLive ? (language === 'bn' ? 'লাইভ' : 'LIVE') : null,
    },
    {
      id: 'lineup',
      label: language === 'bn' ? 'স্কোয়াড ও লাইনআপ' : 'Squad & Lineup',
      icon: Trophy,
    },
    {
      id: 'posters',
      label: language === 'bn' ? 'পোস্টার গ্যালারি' : 'Poster Gallery',
      icon: ImageIcon,
    },
    // Players & Teams tabs are restricted to Team Managers and Authorized Admins ONLY
    ...(userRole === 'team' || isAdmin
      ? [
          {
            id: 'players',
            label: language === 'bn' ? 'খেলোয়াড় তালিকা' : 'Players',
            icon: Users,
          },
          {
            id: 'teams',
            label: language === 'bn' ? 'দল ও বাজেট' : 'Teams & Purse',
            icon: Shield,
          },
        ]
      : []),
    // Admin management, financial reports, audit logs, and setup guide are restricted to Admins ONLY
    ...(isAdmin
      ? [
          {
            id: 'admin-management',
            label: language === 'bn' ? 'অ্যাডমিন ম্যানেজমেন্ট' : 'Admin Management',
            icon: ShieldCheck,
          },
          {
            id: 'fees',
            label: language === 'bn' ? 'ফি ও রিফান্ড' : 'Fee Records',
            icon: FileSpreadsheet,
          },
          {
            id: 'audit',
            label: language === 'bn' ? 'অডিট লগ' : 'Audit Logs',
            icon: History,
          },
          {
            id: 'guide',
            label: language === 'bn' ? 'সেটআপ ও নির্দেশিকা' : 'Setup Guide',
            icon: HelpCircle,
          },
        ]
      : []),
  ];

  return (
    <header className="bg-slate-900/95 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md">
      {/* Top Bar: Brand, Season Selector, Quick Test Switcher, Language & Auth */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-2">
          {/* Logo & League Branding */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-amber-400 p-0.5 shadow-lg shadow-emerald-950/50 flex items-center justify-center cursor-pointer group"
              onClick={() => setActiveTab('auction')}
            >
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center group-hover:scale-105 transition-transform">
                <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <EditableText
                  value={currentSeason ? currentSeason.name : (language === 'bn' ? 'তিস্তা প্রিমিয়ার লীগ' : 'Teesta Premier League')}
                  onSave={async (val) => {
                    if (currentSeason?.id) {
                      await updateSeasonField(currentSeason.id, 'name', val, currentUser?.email || 'admin');
                    }
                  }}
                  label={language === 'bn' ? 'টুর্নামেন্টের নাম' : 'Tournament Name'}
                  pencilClassName="text-amber-400 hover:text-amber-300"
                >
                  <h1
                    className="text-base sm:text-xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-200 to-amber-300 bg-clip-text text-transparent cursor-pointer"
                    onClick={() => setActiveTab('auction')}
                  >
                    {currentSeason ? currentSeason.name : (language === 'bn' ? 'তিস্তা প্রিমিয়ার লীগ' : 'Teesta Premier League')}
                  </h1>
                </EditableText>

                {/* Season Dropdown Selector */}
                <div className="relative flex items-center gap-1">
                  <button
                    onClick={() => setShowSeasonMenu(!showSeasonMenu)}
                    className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors cursor-pointer"
                    title="সিজন পরিবর্তন করুন / Switch Season"
                  >
                    <span>{currentSeason ? currentSeason.code : 'S2'}</span>
                    {currentSeason?.status === 'archived' && (
                      <span className="text-[9px] bg-slate-800 text-slate-400 px-1 rounded">Archived</span>
                    )}
                    <ChevronDown className="w-3 h-3 text-amber-400" />
                  </button>

                  {/* Season Code Quick Pencil */}
                  {currentSeason && (
                    <EditableText
                      value={currentSeason.code}
                      onSave={async (val) => {
                        await updateSeasonField(currentSeason.id, 'code', val, currentUser?.email || 'admin');
                      }}
                      label={language === 'bn' ? 'সিজন কোড (যেমন: S2, S3)' : 'Season Code'}
                      pencilClassName="text-amber-400 hover:text-amber-300"
                    />
                  )}

                  {/* Season Year Quick Pencil */}
                  {currentSeason && (
                    <div className="hidden md:flex items-center text-xs text-slate-400 font-mono">
                      <span>(</span>
                      <EditableText
                        value={currentSeason.year}
                        type="number"
                        min={2020}
                        max={2050}
                        onSave={async (val) => {
                          await updateSeasonField(currentSeason.id, 'year', Number(val), currentUser?.email || 'admin');
                        }}
                        label={language === 'bn' ? 'সিজনের বছর' : 'Season Year'}
                        pencilClassName="text-slate-400 hover:text-amber-400"
                      >
                        <span className="text-slate-300 font-bold">{currentSeason.year}</span>
                      </EditableText>
                      <span>)</span>
                    </div>
                  )}

                  {/* Season Dropdown Menu */}
                  {showSeasonMenu && (
                    <div className="absolute left-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in">
                      <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-800 flex items-center justify-between">
                        <span>{language === 'bn' ? 'টুর্নামেন্ট সিজন নির্বাচন:' : 'Select Season:'}</span>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setShowSeasonMenu(false);
                              onOpenSeasonManager();
                            }}
                            className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5"
                          >
                            <Settings className="w-3 h-3" />
                            <span>ম্যানেজ</span>
                          </button>
                        )}
                      </div>

                      <div className="space-y-1 mt-1 max-h-56 overflow-y-auto">
                        {seasons.map(s => (
                          <button
                            key={s.id}
                            onClick={() => {
                              onSelectSeason(s.id);
                              setShowSeasonMenu(false);
                            }}
                            className={`w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                              s.id === currentSeasonId
                                ? 'bg-emerald-600/30 text-emerald-300 font-bold'
                                : 'hover:bg-slate-800 text-slate-300'
                            }`}
                          >
                            <div className="truncate pr-2">
                              <div>{s.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                বাজেট: {formatBDT(s.defaultBudget)} • {s.year}
                              </div>
                            </div>

                            <div className="shrink-0 flex items-center gap-1">
                              {s.isLiveAuctionActive && (
                                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" title="Live"></span>
                              )}
                              {s.status === 'archived' && (
                                <span className="text-[9px] bg-slate-800 text-slate-400 px-1 rounded">আর্কাইভ</span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>

                      {isAdmin && (
                        <div className="pt-2 border-t border-slate-800 mt-1">
                          <button
                            onClick={() => {
                              setShowSeasonMenu(false);
                              onOpenSeasonManager();
                            }}
                            className="w-full py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Layers className="w-3.5 h-3.5" />
                            <span>{language === 'bn' ? 'সিজন তৈরি ও কনফিগার' : 'Manage / Create Seasons'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="hidden sm:block">
                <EditableText
                  value={
                    currentSeason?.announcement ||
                    (currentSeason
                      ? `${currentSeason.name} • ${currentSeason.year}`
                      : language === 'bn'
                      ? 'অফিসিয়াল ফুটবল প্লেয়ার অকশন'
                      : 'Official Football Player Auction')
                  }
                  onSave={async (val) => {
                    if (currentSeason?.id) {
                      await updateSeasonField(currentSeason.id, 'announcement', val, currentUser?.email || 'admin');
                    }
                  }}
                  label={language === 'bn' ? 'সাবটাইটেল / ঘোষণা' : 'Subtitle / Announcement'}
                  pencilClassName="text-slate-500 hover:text-emerald-400"
                >
                  <p className="text-[11px] sm:text-xs text-slate-400 font-medium">
                    {currentSeason?.announcement ||
                      (currentSeason
                        ? `${currentSeason.name} • ${currentSeason.year}`
                        : language === 'bn'
                        ? 'অফিসিয়াল ফুটবল প্লেয়ার অকশন'
                        : 'Official Football Player Auction')}
                  </p>
                </EditableText>
              </div>
            </div>
          </div>

          {/* Right Action Area */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Player Register Button */}
            <button
              onClick={onOpenRegisterModal}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-900/40 transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? 'খেলোয়াড় নিবন্ধন' : 'Register Player'}</span>
            </button>

            {/* Public View / Projector Board Quick Button */}
            {onOpenProjectorBoard && (
              <button
                onClick={onOpenProjectorBoard}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600/20 to-blue-600/20 hover:from-cyan-600/35 hover:to-blue-600/35 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition-all cursor-pointer shadow-sm hover:border-cyan-400"
                title={language === 'bn' ? 'পাবলিক ভিউ / প্রজেক্টর ভিউ (ফুলস্ক্রিন ব্রডকাস্ট)' : 'Public View / Projector View (Fullscreen Broadcast)'}
              >
                <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">{language === 'bn' ? 'পাবলিক / প্রজেক্টর ভিউ' : 'Public / Projector View'}</span>
              </button>
            )}

            {/* Language Toggle */}
            <button
              onClick={() => setLanguage(language === 'bn' ? 'en' : 'bn')}
              className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800/80 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
              title="ভাষা পরিবর্তন / Switch Language"
            >
              {language === 'bn' ? 'ENG' : 'বাং'}
            </button>

            {/* Verified Auth Role Badge & Interactive Dropdown Controls */}
            {currentUser ? (
              <div className="relative">
                {canSwitchRole ? (
                  <>
                    <button
                      onClick={() => setShowRoleMenu(!showRoleMenu)}
                      className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                        userRole === 'admin'
                          ? isSuperAdmin || verifiedAdminRole === 'primary'
                            ? 'bg-amber-950/60 border-amber-500/50 text-amber-300 shadow-sm shadow-amber-950'
                            : 'bg-teal-950/60 border-teal-500/50 text-teal-300 shadow-sm shadow-teal-950'
                          : userRole === 'team'
                          ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-950'
                          : 'bg-blue-950/60 border-blue-500/50 text-blue-300 shadow-sm shadow-blue-950'
                      }`}
                      title={language === 'bn' ? 'রোল ও দৃষ্টিকোণ পরিবর্তন করুন' : 'Switch Role & Perspective'}
                    >
                      {userRole === 'admin' ? (
                        isSuperAdmin || verifiedAdminRole === 'primary' ? (
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                        )
                      ) : userRole === 'team' ? (
                        <Shield className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                      )}

                      <span className="hidden sm:inline">
                        {userRole === 'admin'
                          ? isSuperAdmin || verifiedAdminRole === 'primary'
                            ? (language === 'bn' ? 'সুপার অ্যাডমিন' : 'Super Admin')
                            : (language === 'bn' ? 'সহকারী অ্যাডমিন' : 'Assistant Admin')
                          : userRole === 'team'
                          ? `${activeTeam ? activeTeam.name : (language === 'bn' ? 'দল ম্যানেজার' : 'Team Manager')} (${language === 'bn' ? 'প্রিভিউ' : 'Preview'})`
                          : `${language === 'bn' ? 'পাবলিক ভিউ' : 'Public View'} (${language === 'bn' ? 'প্রিভিউ' : 'Preview'})`}
                      </span>
                      <span className="sm:hidden">
                        {userRole === 'admin'
                          ? isSuperAdmin || verifiedAdminRole === 'primary' ? 'Super' : 'Admin'
                          : userRole === 'team'
                          ? 'Team'
                          : 'Public'}
                      </span>
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>

                    {/* Role & Perspective Switcher Dropdown (Accessible to authenticated administrators) */}
                    {showRoleMenu && (
                      <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2.5 z-50 animate-in fade-in slide-in-from-top-2">
                        <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-800 flex items-center justify-between">
                          <span>{language === 'bn' ? 'প্রশাসনিক অ্যাকাউন্ট:' : 'Administrative Account:'}</span>
                          <span className="text-[10px] text-amber-400 font-bold uppercase font-mono">
                            {verifiedAdminRole === 'primary' ? 'Super Admin' : 'Admin'}
                          </span>
                        </div>
                        <div className="px-2 py-1.5 text-xs text-amber-300 font-mono truncate">
                          {currentUser.email}
                        </div>

                        <div className="space-y-1.5 pt-1">
                          {/* Option 1: Super Admin / Admin Mode */}
                          <button
                            onClick={() => {
                              setTestSimulatedRole('admin', null, verifiedAdminRole === 'primary');
                              setShowRoleMenu(false);
                              setActiveTab('auction');
                            }}
                            className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-all ${
                              userRole === 'admin'
                                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 font-bold shadow-sm'
                                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {verifiedAdminRole === 'primary' ? (
                                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                              ) : (
                                <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
                              )}
                              <div>
                                <div className="font-bold">
                                  {verifiedAdminRole === 'primary'
                                    ? (language === 'bn' ? 'সুপার অ্যাডমিন মোড' : 'Super Admin Mode')
                                    : (language === 'bn' ? 'অ্যাডমিন মোড' : 'Admin Mode')}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {language === 'bn' ? 'পূর্ণাঙ্গ প্রশাসনিক নিয়ন্ত্রণ ও সমস্ত সেটিংস' : 'Full administrative controls'}
                                </div>
                              </div>
                            </div>
                            {userRole === 'admin' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-300 font-mono font-bold">
                                Active
                              </span>
                            )}
                          </button>

                          {/* Option 2: Public View (General Viewer) */}
                          <button
                            onClick={() => {
                              setTestSimulatedRole('viewer');
                              setShowRoleMenu(false);
                              setActiveTab('auction');
                            }}
                            className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-all ${
                              userRole === 'viewer'
                                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 font-bold shadow-sm'
                                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <PlayCircle className="w-4 h-4 text-cyan-400 shrink-0" />
                              <div>
                                <div className="font-bold">
                                  {language === 'bn' ? 'পাবলিক ভিউ (সাধারণ দর্শক)' : 'Public View (General Viewer)'}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {language === 'bn' ? 'শুধুমাত্র লাইভ নিলাম স্টেজ (পাবলিক)' : 'Live auction stage only'}
                                </div>
                              </div>
                            </div>
                            {userRole === 'viewer' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/30 text-cyan-300 font-mono font-bold">
                                Active
                              </span>
                            )}
                          </button>

                          {/* Section 3: Team Manager Perspectives */}
                          <div className="pt-2 border-t border-slate-800">
                            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                              <span>{language === 'bn' ? 'দলের দৃষ্টিকোণ থেকে প্রিভিউ:' : 'Preview As Team Manager:'}</span>
                              <span className="text-[10px] text-slate-500 font-mono">{teams.length}টি দল</span>
                            </div>

                            <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                              {teams.length === 0 ? (
                                <div className="px-2 py-2 text-xs text-slate-500 italic">
                                  {language === 'bn' ? 'এই সিজনে কোনো দল নেই' : 'No teams in this season'}
                                </div>
                              ) : (
                                teams.map(team => (
                                  <button
                                    key={team.id}
                                    onClick={() => {
                                      setTestSimulatedRole('team', team);
                                      setShowRoleMenu(false);
                                      setActiveTab('auction');
                                    }}
                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                                      userRole === 'team' && activeTeam?.id === team.id
                                        ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/40 font-bold'
                                        : 'hover:bg-slate-800 text-slate-300'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate pr-2">
                                      <span
                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: team.color || '#10b981' }}
                                      />
                                      <span className="truncate">{team.name}</span>
                                    </div>
                                    <span className="text-[10px] text-emerald-400 font-mono shrink-0">
                                      {formatBDT(team.remainingBudget)}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : userRole === 'team' ? (
                  <div
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-300 text-xs font-semibold"
                    title={currentUser.email || 'Team Manager'}
                  >
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="hidden sm:inline">
                      {activeTeam ? activeTeam.name : (language === 'bn' ? 'দল ম্যানেজার' : 'Team Manager')}
                    </span>
                    <span className="sm:hidden">Team</span>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-xs font-medium"
                    title={currentUser.email || 'Viewer'}
                  >
                    <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                    <span className="hidden sm:inline">{language === 'bn' ? 'দর্শক' : 'Viewer'}</span>
                    <span className="sm:hidden">View</span>
                  </div>
                )}
              </div>
            ) : null}

            {/* Auth Action Button */}
            {currentUser ? (
              <button
                onClick={logout}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:text-rose-400 hover:bg-slate-700 transition-colors cursor-pointer"
                title="লগআউট / Logout"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{language === 'bn' ? 'লগআউট' : 'Logout'}</span>
              </button>
            ) : (
              <button
                onClick={onOpenLoginModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-md shadow-emerald-950 transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'লগইন' : 'Login'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-slate-800/80">
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto py-2 scrollbar-none">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-950'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
