import React, { useState } from 'react';
import {
  Trophy,
  Users,
  Shield,
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
}) => {
  const {
    currentUser,
    userRole,
    isAdmin,
    activeTeam,
    logout,
    setTestSimulatedRole,
    isSimulated,
    language,
    setLanguage,
  } = useAuth();

  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showSeasonMenu, setShowSeasonMenu] = useState(false);

  const currentSeason = seasons.find(s => s.id === currentSeasonId) || seasons[0];

  const navItems = [
    {
      id: 'auction',
      label: language === 'bn' ? 'লাইভ নিলাম' : 'Live Auction',
      icon: PlayCircle,
      badge: auctionLive ? (language === 'bn' ? 'লাইভ' : 'LIVE') : null,
    },
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
    ...(isAdmin
      ? [
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
        ]
      : []),
    {
      id: 'guide',
      label: language === 'bn' ? 'সেটআপ ও নির্দেশিকা' : 'Setup Guide',
      icon: HelpCircle,
    },
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

            {/* Language Toggle */}
            <button
              onClick={() => setLanguage(language === 'bn' ? 'en' : 'bn')}
              className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800/80 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
              title="ভাষা পরিবর্তন / Switch Language"
            >
              {language === 'bn' ? 'ENG' : 'বাং'}
            </button>

            {/* Quick Testing Role Switcher */}
            <div className="relative">
              <button
                onClick={() => setShowRoleMenu(!showRoleMenu)}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                  isAdmin
                    ? 'bg-purple-950/40 border-purple-500/40 text-purple-300 hover:bg-purple-900/50'
                    : userRole === 'team'
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/50'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
                title="রোল নির্বাচন / Role Selector"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {isAdmin
                    ? language === 'bn'
                      ? 'অ্যাডমিন মোড'
                      : 'Admin'
                    : userRole === 'team' && activeTeam
                    ? activeTeam.name.split(' ')[0]
                    : language === 'bn'
                    ? 'দর্শক'
                    : 'Viewer'}
                </span>
                <span className="sm:hidden">
                  {isAdmin ? 'Admin' : userRole === 'team' ? 'Team' : 'View'}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {/* Role Dropdown */}
              {showRoleMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                    {language === 'bn' ? 'টেস্টিং রোল নির্বাচন করুন:' : 'Testing Role:'}
                  </div>

                  {/* Option 1: Admin */}
                  <button
                    onClick={() => {
                      setTestSimulatedRole('admin', null);
                      setShowRoleMenu(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 mt-1 rounded-lg text-xs flex items-center justify-between cursor-pointer ${
                      isAdmin ? 'bg-purple-600/30 text-purple-200' : 'hover:bg-slate-800 text-slate-200'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-purple-300">
                        {language === 'bn' ? 'অ্যাডমিনিস্ট্রেটর' : 'Administrator'}
                      </div>
                      <div className="text-[10px] text-slate-400">{BOOTSTRAP_ADMIN_EMAIL}</div>
                    </div>
                    {isAdmin && <span className="text-[10px] bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded">Active</span>}
                  </button>

                  {/* Team Options */}
                  <div className="px-2 pt-2 text-[10px] uppercase tracking-wider text-slate-400">
                    {language === 'bn' ? 'দলের ম্যানেজার হিসেবে বিড টেস্ট:' : 'Test As Team:'}
                  </div>
                  {teams.length === 0 ? (
                    <div className="px-2 py-1 text-xs text-slate-500 italic">
                      {language === 'bn' ? 'এই সিজনে কোনো দল নেই' : 'No teams in this season'}
                    </div>
                  ) : (
                    teams.slice(0, 5).map(team => (
                      <button
                        key={team.id}
                        onClick={() => {
                          setTestSimulatedRole('team', team);
                          setShowRoleMenu(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer ${
                          userRole === 'team' && activeTeam?.id === team.id
                            ? 'bg-emerald-600/30 text-emerald-200'
                            : 'hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <span className="font-medium">{team.name}</span>
                        </div>
                        <span className="text-[10px] text-emerald-400 font-mono">
                          ৳{(team.remainingBudget / 1000).toFixed(0)}k
                        </span>
                      </button>
                    ))
                  )}

                  {/* Viewer option */}
                  <button
                    onClick={() => {
                      setTestSimulatedRole('viewer', null);
                      setShowRoleMenu(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 mt-1 rounded-lg text-xs cursor-pointer ${
                      userRole === 'viewer'
                        ? 'bg-slate-800 text-amber-300'
                        : 'hover:bg-slate-800 text-slate-400'
                    }`}
                  >
                    {language === 'bn' ? 'সাধারণ দর্শক (Public Viewer)' : 'Public Viewer'}
                  </button>
                </div>
              )}
            </div>

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
