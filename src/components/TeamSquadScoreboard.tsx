/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Shield,
  Users,
  Trophy,
  Edit3,
  Save,
  X,
  Camera,
  Maximize2,
  Minimize2,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Crown,
  Award,
  Sparkles,
  User,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  HelpCircle,
  Shirt,
  Info,
  RefreshCw,
  Search,
  Filter,
} from 'lucide-react';
import { Team, Player, PlayerPosition, TeamLineup, Season } from '../types';
import { formatBDT, getPositionBadgeColor, getPositionLabel } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { listenToTeamLineup, saveTeamLineup, buildDefaultLineup, getFormationSlots } from '../services/lineupService';
import { toBengaliDigits } from '../services/registrationService';
import { TeamLogoModal } from './TeamLogoModal';
import { PlayerPhotoUploader } from './PlayerPhotoUploader';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

interface TeamSquadScoreboardProps {
  teams: Team[];
  players: Player[];
  currentSeason?: Season;
}

export const TeamSquadScoreboard: React.FC<TeamSquadScoreboardProps> = ({
  teams,
  players,
  currentSeason,
}) => {
  const { isAdmin, language, currentUser } = useAuth();

  // Active Team Selection
  const [selectedTeamId, setSelectedTeamId] = useState<string>(teams[0]?.id || '');
  const activeTeam = useMemo(() => {
    return teams.find(t => t.id === selectedTeamId) || teams[0];
  }, [teams, selectedTeamId]);

  // Keep selectedTeamId synced if teams change
  useEffect(() => {
    if (!selectedTeamId && teams.length > 0) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  // Real-time lineup for active team
  const [lineup, setLineup] = useState<TeamLineup | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [editedLineup, setEditedLineup] = useState<TeamLineup | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Logo edit modal state
  const [logoModalTeam, setLogoModalTeam] = useState<Team | null>(null);

  // Player quick-edit modal state
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [playerDisplayName, setPlayerDisplayName] = useState<string>('');
  const [playerDisplayPosition, setPlayerDisplayPosition] = useState<PlayerPosition>('Forward');
  const [isSavingPlayerEdit, setIsSavingPlayerEdit] = useState<boolean>(false);

  // Add Player to Lineup modal state (for Admins)
  const [isAddPlayerModalOpen, setIsAddPlayerModalOpen] = useState<boolean>(false);
  const [addPlayerTargetType, setAddPlayerTargetType] = useState<'starting' | 'bench'>('starting');
  const [addPlayerSearchQuery, setAddPlayerSearchQuery] = useState<string>('');
  const [addPlayerPositionFilter, setAddPlayerPositionFilter] = useState<'all' | PlayerPosition>('all');

  // Projector / Theater Mode state
  const [isProjectorMode, setIsProjectorMode] = useState<boolean>(false);
  const posterRef = useRef<HTMLDivElement>(null);

  // Real-time Lineup Subscription
  useEffect(() => {
    if (!activeTeam) return;
    const unsubscribe = listenToTeamLineup(activeTeam.id, remoteLineup => {
      setLineup(remoteLineup);
    });
    return () => unsubscribe();
  }, [activeTeam?.id]);

  // Squad Players for this team (actual players sold or assigned to this team in Firebase)
  const teamSoldPlayers = useMemo(() => {
    if (!activeTeam) return [];
    return players.filter(
      p => p.winningTeamId === activeTeam.id || p.winningTeamName === activeTeam.name
    );
  }, [players, activeTeam]);

  // Combined Active Lineup Object (falling back to auto-generated lineup if not set in Firebase)
  const currentLineup: TeamLineup = useMemo(() => {
    if (lineup) return lineup;
    if (activeTeam) return buildDefaultLineup(activeTeam, teamSoldPlayers);
    return {
      teamId: '',
      formation: '4-3-3',
      startingPlayerIds: [],
      benchPlayerIds: [],
      updatedAt: '',
      updatedBy: '',
    };
  }, [lineup, activeTeam, teamSoldPlayers]);

  // Enter edit mode
  const handleStartEdit = () => {
    if (!isAdmin) return;
    setEditedLineup(JSON.parse(JSON.stringify(currentLineup)));
    setIsEditMode(true);
    setFeedbackMessage(null);
  };

  // Cancel edit mode
  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditedLineup(null);
    setFeedbackMessage(null);
  };

  // Save edit mode changes
  const handleSaveLineup = async () => {
    if (!editedLineup || !activeTeam) return;
    setIsSaving(true);
    setFeedbackMessage(null);

    const res = await saveTeamLineup(editedLineup, currentUser?.email || 'admin');
    setIsSaving(false);

    if (res.success) {
      setFeedbackMessage({
        type: 'success',
        text: language === 'bn' ? 'স্কোয়াড ও লাইনআপ সফলভাবে সংরক্ষিত হয়েছে!' : 'Squad lineup saved successfully!',
      });
      setIsEditMode(false);
      setEditedLineup(null);
      setTimeout(() => setFeedbackMessage(null), 3500);
    } else {
      setFeedbackMessage({
        type: 'error',
        text: res.error || (language === 'bn' ? 'সংরক্ষণ ব্যর্থ হয়েছে' : 'Failed to save'),
      });
    }
  };

  // Determine working lineup (draft in edit mode, or live)
  const activeLineupConfig = isEditMode && editedLineup ? editedLineup : currentLineup;

  // Resolve player objects with custom overrides applied
  const resolvePlayer = (id: string): (Player & { isCaptain?: boolean; isViceCaptain?: boolean }) | null => {
    const raw = players.find(p => p.id === id);
    if (!raw) return null;

    const customName = activeLineupConfig.customNames?.[id] || raw.name;
    const customPhoto = activeLineupConfig.customPhotos?.[id] || raw.photoUrl;
    const customPos = activeLineupConfig.customPositions?.[id] || raw.position;

    return {
      ...raw,
      name: customName,
      photoUrl: customPhoto,
      position: customPos,
      isCaptain: activeLineupConfig.captainId === id,
      isViceCaptain: activeLineupConfig.viceCaptainId === id,
    };
  };

  // Starting XI Players
  const startingPlayers = useMemo(() => {
    const ids = activeLineupConfig.startingPlayerIds || [];
    return ids.map(id => resolvePlayer(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  }, [activeLineupConfig.startingPlayerIds, players, activeLineupConfig]);

  // Bench Players
  const benchPlayers = useMemo(() => {
    const ids = activeLineupConfig.benchPlayerIds || [];
    return ids.map(id => resolvePlayer(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  }, [activeLineupConfig.benchPlayerIds, players, activeLineupConfig]);

  // Track all player IDs already assigned to this team's lineup (starting or bench)
  const usedPlayerIds = useMemo(() => {
    return new Set([
      ...(activeLineupConfig.startingPlayerIds || []),
      ...(activeLineupConfig.benchPlayerIds || []),
    ]);
  }, [activeLineupConfig.startingPlayerIds, activeLineupConfig.benchPlayerIds]);

  // Any sold player not yet assigned to starting or bench
  const unassignedSoldPlayers = useMemo(() => {
    return teamSoldPlayers.filter(p => !usedPlayerIds.has(p.id));
  }, [teamSoldPlayers, usedPlayerIds]);

  // All tournament players available to be added to this team's lineup
  const availablePlayersToAdd = useMemo(() => {
    const pool = players.filter(p => !usedPlayerIds.has(p.id));
    return pool.filter(p => {
      if (addPlayerPositionFilter !== 'all' && p.position !== addPlayerPositionFilter) return false;
      if (addPlayerSearchQuery.trim()) {
        const q = addPlayerSearchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.banglaName && p.banglaName.toLowerCase().includes(q)) ||
          (p.formNumber && p.formNumber.includes(q)) ||
          String(p.formNumericValue || '').includes(q) ||
          (p.phone && p.phone.includes(q))
        );
      }
      return true;
    });
  }, [players, usedPlayerIds, addPlayerPositionFilter, addPlayerSearchQuery]);

  // Categorize Starting XI by formation rows (Forward / Striker, Midfielder, Defender, Goalkeeper)
  const { goalkeepers, defenders, midfielders, forwards } = useMemo(() => {
    const gk: (Player & { isCaptain?: boolean; isViceCaptain?: boolean })[] = [];
    const def: (Player & { isCaptain?: boolean; isViceCaptain?: boolean })[] = [];
    const mid: (Player & { isCaptain?: boolean; isViceCaptain?: boolean })[] = [];
    const fwd: (Player & { isCaptain?: boolean; isViceCaptain?: boolean })[] = [];

    startingPlayers.forEach(p => {
      if (p.position === 'Goalkeeper') gk.push(p);
      else if (p.position === 'Defender') def.push(p);
      else if (p.position === 'Midfielder') mid.push(p);
      else fwd.push(p);
    });

    return { goalkeepers: gk, defenders: def, midfielders: mid, forwards: fwd };
  }, [startingPlayers]);

  // Helper actions in edit mode
  const movePlayerToBench = (playerId: string) => {
    if (!editedLineup) return;
    const newStarting = editedLineup.startingPlayerIds.filter(id => id !== playerId);
    const newBench = [...new Set([...editedLineup.benchPlayerIds, playerId])];
    setEditedLineup({
      ...editedLineup,
      startingPlayerIds: newStarting,
      benchPlayerIds: newBench,
    });
  };

  const movePlayerToStarting = (playerId: string) => {
    if (!editedLineup) return;
    const newBench = editedLineup.benchPlayerIds.filter(id => id !== playerId);
    const newStarting = [...new Set([...editedLineup.startingPlayerIds, playerId])];
    setEditedLineup({
      ...editedLineup,
      startingPlayerIds: newStarting,
      benchPlayerIds: newBench,
    });
  };

  const removePlayerFromLineup = (playerId: string) => {
    if (!editedLineup) return;
    setEditedLineup({
      ...editedLineup,
      startingPlayerIds: editedLineup.startingPlayerIds.filter(id => id !== playerId),
      benchPlayerIds: editedLineup.benchPlayerIds.filter(id => id !== playerId),
      captainId: editedLineup.captainId === playerId ? null : editedLineup.captainId,
      viceCaptainId: editedLineup.viceCaptainId === playerId ? null : editedLineup.viceCaptainId,
    });
  };

  const toggleCaptain = (playerId: string) => {
    if (!editedLineup) return;
    setEditedLineup({
      ...editedLineup,
      captainId: editedLineup.captainId === playerId ? null : playerId,
      viceCaptainId: editedLineup.viceCaptainId === playerId ? null : editedLineup.viceCaptainId,
    });
  };

  const toggleViceCaptain = (playerId: string) => {
    if (!editedLineup) return;
    setEditedLineup({
      ...editedLineup,
      viceCaptainId: editedLineup.viceCaptainId === playerId ? null : playerId,
      captainId: editedLineup.captainId === playerId ? null : editedLineup.captainId,
    });
  };

  const changeFormation = (newFormation: string) => {
    if (!editedLineup) return;
    setEditedLineup({
      ...editedLineup,
      formation: newFormation,
    });
  };

  // Add a player from the tournament pool to this team's lineup
  const handleAddPlayer = (player: Player, target: 'starting' | 'bench') => {
    if (!editedLineup) return;
    if (usedPlayerIds.has(player.id)) return;

    if (target === 'starting') {
      setEditedLineup({
        ...editedLineup,
        startingPlayerIds: [...editedLineup.startingPlayerIds, player.id],
      });
    } else {
      setEditedLineup({
        ...editedLineup,
        benchPlayerIds: [...editedLineup.benchPlayerIds, player.id],
      });
    }

    setFeedbackMessage({
      type: 'success',
      text: language === 'bn' ? `"${player.name}" সফলভাবে যুক্ত হয়েছে!` : `"${player.name}" added to lineup!`,
    });
    setTimeout(() => setFeedbackMessage(null), 2500);
  };

  // Open Quick Edit Player modal
  const handleOpenPlayerEdit = (p: Player) => {
    if (!isAdmin) return;
    setEditingPlayer(p);
    setPlayerDisplayName(p.name);
    setPlayerDisplayPosition(p.position);
  };

  // Save Player quick edit
  const handleSavePlayerEdit = async () => {
    if (!editingPlayer) return;
    setIsSavingPlayerEdit(true);

    try {
      // 1. Update Firestore player document
      const playerRef = doc(db, 'players', editingPlayer.id);
      await updateDoc(playerRef, {
        name: playerDisplayName.trim() || editingPlayer.name,
        position: playerDisplayPosition,
        updatedAt: new Date().toISOString(),
      });

      // 2. If in edit mode, also update lineup custom overrides
      if (editedLineup) {
        setEditedLineup({
          ...editedLineup,
          customNames: {
            ...editedLineup.customNames,
            [editingPlayer.id]: playerDisplayName.trim(),
          },
          customPositions: {
            ...editedLineup.customPositions,
            [editingPlayer.id]: playerDisplayPosition,
          },
        });
      }

      setEditingPlayer(null);
    } catch (err) {
      console.error('Failed to update player info:', err);
      alert('খেলোয়াড়ের তথ্য আপডেট করতে ব্যর্থ হয়েছে');
    } finally {
      setIsSavingPlayerEdit(false);
    }
  };

  // Fullscreen Projector toggle
  const toggleFullscreen = () => {
    if (!posterRef.current) return;
    if (!document.fullscreenElement) {
      posterRef.current.requestFullscreen().catch(() => {});
      setIsProjectorMode(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsProjectorMode(false);
    }
  };

  // Calculate squad finances
  const totalPurseSpent = useMemo(() => {
    return teamSoldPlayers.reduce((sum, p) => sum + (p.finalPrice || p.basePrice || 0), 0);
  }, [teamSoldPlayers]);

  if (!activeTeam) {
    return (
      <div className="text-center py-20 text-slate-400">
        <Shield className="w-12 h-12 mx-auto text-slate-600 mb-3" />
        <p className="text-sm font-semibold">কোনো দল পাওয়া যায়নি।</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. TEAM SELECTOR CAROUSEL / CHIPS */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {language === 'bn' ? 'দল নির্বাচন করুন' : 'Select Team Lineup'}
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {language === 'bn' ? `মোট দল: ${teams.length}টি` : `Teams: ${teams.length}`}
          </span>
        </div>

        {/* Team Chips */}
        <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700">
          {teams.map(team => {
            const isSelected = team.id === activeTeam.id;
            const teamSquadMembers = players.filter(
              p => p.winningTeamId === team.id || p.winningTeamName === team.name
            );

            return (
              <button
                key={team.id}
                type="button"
                onClick={() => {
                  if (isEditMode) {
                    if (window.confirm(language === 'bn' ? 'অসংরক্ষিত পরিবর্তনগুলো বাতিল হবে। অন্য দলে যেতে চান?' : 'Discard unsaved changes?')) {
                      setIsEditMode(false);
                      setEditedLineup(null);
                      setSelectedTeamId(team.id);
                    }
                  } else {
                    setSelectedTeamId(team.id);
                  }
                }}
                className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-left shrink-0 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-cyan-950/80 to-slate-900 border-cyan-400 text-white shadow-lg shadow-cyan-950/50 scale-[1.02]'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white overflow-hidden shadow-xs shrink-0"
                  style={{ backgroundColor: team.color || '#06b6d4' }}
                >
                  {team.logoUrl ? (
                    <img src={team.logoUrl} alt={team.name} className="w-full h-full object-cover" />
                  ) : (
                    team.name.charAt(0)
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold truncate max-w-[140px] text-white">
                    {team.banglaName || team.name}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
                    <span className="text-emerald-400 font-semibold">{teamSquadMembers.length} জন</span>
                    <span>•</span>
                    <span>{formatBDT(team.remainingBudget)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* FEEDBACK ALERT */}
      {feedbackMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 border shadow-lg animate-in fade-in ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
              : 'bg-rose-950/80 border-rose-500/50 text-rose-300'
          }`}
        >
          {feedbackMessage.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* 2. POSTER CONTAINER (Real Sociedad Reference Style) */}
      <div
        ref={posterRef}
        className={`relative rounded-3xl overflow-hidden border-2 shadow-2xl transition-all duration-300 ${
          isProjectorMode ? 'bg-[#020611] p-6' : 'bg-gradient-to-b from-[#030919] via-[#040f29] to-[#020713] p-4 sm:p-7'
        }`}
        style={{
          borderColor: activeTeam.color ? `${activeTeam.color}60` : 'rgba(6, 182, 212, 0.4)',
        }}
      >
        {/* REAL SOCIEDAD REFERENCE ATMOSPHERE: DIAGONAL STADIUM FLOODLIGHT BEAMS */}
        {/* Left Floodlight Mast & Conic Beam */}
        <div className="absolute -top-12 -left-12 w-80 h-96 pointer-events-none overflow-hidden opacity-35 z-0">
          <div className="w-96 h-96 bg-gradient-to-br from-cyan-300/40 via-sky-400/15 to-transparent blur-2xl transform -rotate-12" />
        </div>
        {/* Right Floodlight Mast & Conic Beam */}
        <div className="absolute -top-12 -right-12 w-80 h-96 pointer-events-none overflow-hidden opacity-35 z-0">
          <div
            className="w-96 h-96 blur-2xl transform rotate-12"
            style={{
              background: `radial-gradient(circle at top right, ${activeTeam.color || '#06b6d4'}50, transparent 70%)`,
            }}
          />
        </div>
        {/* Bottom Ambient Turf Glow */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-80 bg-emerald-950/20 blur-3xl pointer-events-none z-0" />

        {/* POSTER HEADER: League Crest, Team Identity & Action Controls */}
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 pb-6 border-b border-slate-800/80">
          {/* Team Brand & Crest */}
          <div className="flex items-center gap-4">
            {/* Big Team Crest */}
            <div
              onClick={() => {
                if (isAdmin) setLogoModalTeam(activeTeam);
              }}
              className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-white font-extrabold text-2xl shadow-[0_0_25px_rgba(0,0,0,0.6)] overflow-hidden border-2 relative group/logo ${
                isAdmin ? 'cursor-pointer hover:border-emerald-400 hover:scale-105 transition-all' : ''
              }`}
              style={{
                backgroundColor: activeTeam.color || '#06b6d4',
                borderColor: activeTeam.color || '#06b6d4',
              }}
              title={isAdmin ? (language === 'bn' ? 'লোগো পরিবর্তন করতে ক্লিক করুন' : 'Click to change logo') : activeTeam.name}
            >
              {activeTeam.logoUrl ? (
                <img
                  src={activeTeam.logoUrl}
                  alt={activeTeam.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                activeTeam.name.charAt(0)
              )}
              {isAdmin && (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/logo:opacity-100 flex items-center justify-center transition-opacity">
                  <Camera className="w-5 h-5 text-emerald-300" />
                </div>
              )}
            </div>

            {/* Titles */}
            <div>
              <div className="flex items-center gap-2 text-[10px] sm:text-xs font-mono font-bold uppercase tracking-widest text-cyan-400">
                <span>{currentSeason?.name || 'TEESTA PREMIER LEAGUE SEASON 2'}</span>
                <span>•</span>
                <span className="text-amber-400 font-sans">{language === 'bn' ? 'অফিশিয়াল স্কোয়াড পোস্টার' : 'OFFICIAL SQUAD'}</span>
              </div>
              <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight uppercase mt-0.5">
                {activeTeam.banglaName || activeTeam.name}
              </h1>
              <div className="flex items-center gap-2 flex-wrap mt-1 text-xs text-slate-300">
                <span className="font-mono text-slate-400">{activeTeam.name}</span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400">
                  {language === 'bn' ? 'ম্যানেজার / স্বত্বাধিকারী:' : 'Manager:'}{' '}
                  <strong className="text-white font-medium">{activeTeam.ownerName || 'ম্যানেজার'}</strong>
                </span>
                <span className="text-slate-600">•</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] font-bold">
                  {teamSoldPlayers.length} {language === 'bn' ? 'জন সদস্য' : 'Members'}
                </span>
              </div>
            </div>
          </div>

          {/* Controls: Formation, Projector & Admin Edit */}
          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end">
            {/* Formation Selector / Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-700 text-xs font-mono">
              <Shirt className="w-4 h-4 text-cyan-400" />
              <span className="text-slate-400">{language === 'bn' ? 'ফর্মেশন:' : 'Formation:'}</span>
              {isEditMode ? (
                <select
                  value={activeLineupConfig.formation}
                  onChange={e => changeFormation(e.target.value)}
                  className="bg-slate-900 border border-cyan-500/50 rounded-lg px-2 py-1 text-white font-bold cursor-pointer focus:outline-none"
                >
                  <option value="4-3-3">৪-৩-৩ (4-3-3)</option>
                  <option value="4-4-2">৪-৪-২ (4-4-2)</option>
                  <option value="3-4-3">৩-৪-৩ (3-4-3)</option>
                  <option value="3-5-2">৩-৫-২ (3-5-2)</option>
                  <option value="4-2-3-1">৪-২-৩-১ (4-2-3-1)</option>
                  <option value="5-3-2">৫-৩-২ (5-3-2)</option>
                </select>
              ) : (
                <strong className="text-white font-bold">
                  {activeLineupConfig.formation}
                </strong>
              )}
            </div>

            {/* Add Player to Lineup (Admin Only) */}
            {isAdmin && isEditMode && (
              <button
                type="button"
                onClick={() => setIsAddPlayerModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600/30 hover:bg-cyan-600 text-cyan-300 hover:text-white text-xs font-bold border border-cyan-500/40 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? '+ খেলোয়াড় যুক্ত করুন' : '+ Add Player'}</span>
              </button>
            )}

            {/* Fullscreen Stadium Projector Button */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2.5 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={language === 'bn' ? 'স্টেডিয়াম প্রজেক্টর ভিউ' : 'Stadium Projector View'}
            >
              {isProjectorMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Admin Edit Controls (Only for Authorized Admin) */}
            {isAdmin && (
              <>
                {isEditMode ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleCancelEdit}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {language === 'bn' ? 'বাতিল' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleSaveLineup}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold shadow-lg shadow-emerald-950 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSaving ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>{language === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...'}</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>{language === 'bn' ? 'সংরক্ষণ করুন' : 'Save Lineup'}</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-slate-950 text-xs font-black shadow-lg shadow-amber-950 transition-all cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'লাইনআপ সম্পাদনা' : 'Edit Lineup'}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* 3. FOOTBALL PITCH FORMATION CANVAS (Real Sociedad Stadium Style) */}
        <div className="relative z-10 mt-6 rounded-2xl bg-gradient-to-b from-[#061833]/90 via-[#082046]/85 to-[#031024]/90 border border-cyan-500/30 p-4 sm:p-8 backdrop-blur-sm shadow-inner overflow-hidden">
          {/* Football Field Turf Graphic Markings & Lawn Stripes */}
          <div className="absolute inset-0 pointer-events-none opacity-20">
            {/* Lawn mowing alternate vertical/horizontal turf bands */}
            <div className="absolute inset-0 flex flex-col justify-between">
              <div className="h-1/5 bg-cyan-400/5" />
              <div className="h-1/5 bg-transparent" />
              <div className="h-1/5 bg-cyan-400/5" />
              <div className="h-1/5 bg-transparent" />
              <div className="h-1/5 bg-cyan-400/5" />
            </div>
            {/* Center Circle & Spot */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border-2 border-cyan-400" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-cyan-400" />
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-cyan-400" />
            {/* Penalty Boxes & Arcs */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-28 border-b-2 border-x-2 border-cyan-400 rounded-b-xl" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-80 h-28 border-t-2 border-x-2 border-cyan-400 rounded-t-xl" />
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 w-32 h-16 border-t-2 border-cyan-400 rounded-t-full" />
          </div>

          {/* SQUAD PITCH ROWS (Top: Strikers -> Midfielders -> Defenders -> Bottom: Goalkeeper) */}
          <div className="relative z-10 space-y-6 sm:space-y-8 min-h-[460px] flex flex-col justify-between">
            {/* ROW 1: FORWARDS / STRIKERS */}
            <div>
              <div className="flex items-center justify-center gap-2 mb-2.5 text-center">
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-rose-400 bg-rose-950/70 border border-rose-500/40 px-3 py-0.5 rounded-full shadow-md">
                  {language === 'bn' ? 'আক্রমণভাগ • স্ট্রাইকার (STRIKERS)' : 'FORWARDS / STRIKERS'}
                </span>
              </div>
              <div className="flex items-center justify-center gap-3 sm:gap-6 flex-wrap">
                {forwards.length > 0 ? (
                  forwards.map(player => (
                    <PlayerPosterCard
                      key={player.id}
                      player={player}
                      isEditMode={isEditMode}
                      language={language}
                      onMoveToBench={() => movePlayerToBench(player.id)}
                      onToggleCaptain={() => toggleCaptain(player.id)}
                      onToggleViceCaptain={() => toggleViceCaptain(player.id)}
                      onEdit={() => handleOpenPlayerEdit(player)}
                      onRemove={() => removePlayerFromLineup(player.id)}
                    />
                  ))
                ) : (
                  <div className="text-[11px] text-slate-500 italic py-2">
                    {language === 'bn' ? 'কোনো স্ট্রাইকার নেই' : 'No forwards in lineup'}
                  </div>
                )}
              </div>
            </div>

            {/* ROW 2: MIDFIELDERS */}
            <div>
              <div className="flex items-center justify-center gap-2 mb-2.5 text-center">
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-emerald-400 bg-emerald-950/70 border border-emerald-500/40 px-3 py-0.5 rounded-full shadow-md">
                  {language === 'bn' ? 'মধ্যমাঠ • মিডফিল্ডার (MIDFIELDERS)' : 'MIDFIELDERS'}
                </span>
              </div>
              <div className="flex items-center justify-center gap-3 sm:gap-6 flex-wrap">
                {midfielders.length > 0 ? (
                  midfielders.map(player => (
                    <PlayerPosterCard
                      key={player.id}
                      player={player}
                      isEditMode={isEditMode}
                      language={language}
                      onMoveToBench={() => movePlayerToBench(player.id)}
                      onToggleCaptain={() => toggleCaptain(player.id)}
                      onToggleViceCaptain={() => toggleViceCaptain(player.id)}
                      onEdit={() => handleOpenPlayerEdit(player)}
                      onRemove={() => removePlayerFromLineup(player.id)}
                    />
                  ))
                ) : (
                  <div className="text-[11px] text-slate-500 italic py-2">
                    {language === 'bn' ? 'কোনো মিডফিল্ডার নেই' : 'No midfielders in lineup'}
                  </div>
                )}
              </div>
            </div>

            {/* ROW 3: DEFENDERS */}
            <div>
              <div className="flex items-center justify-center gap-2 mb-2.5 text-center">
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-cyan-400 bg-cyan-950/70 border border-cyan-500/40 px-3 py-0.5 rounded-full shadow-md">
                  {language === 'bn' ? 'রক্ষণভাগ • ডিফেন্ডার (DEFENDERS)' : 'DEFENDERS'}
                </span>
              </div>
              <div className="flex items-center justify-center gap-3 sm:gap-6 flex-wrap">
                {defenders.length > 0 ? (
                  defenders.map(player => (
                    <PlayerPosterCard
                      key={player.id}
                      player={player}
                      isEditMode={isEditMode}
                      language={language}
                      onMoveToBench={() => movePlayerToBench(player.id)}
                      onToggleCaptain={() => toggleCaptain(player.id)}
                      onToggleViceCaptain={() => toggleViceCaptain(player.id)}
                      onEdit={() => handleOpenPlayerEdit(player)}
                      onRemove={() => removePlayerFromLineup(player.id)}
                    />
                  ))
                ) : (
                  <div className="text-[11px] text-slate-500 italic py-2">
                    {language === 'bn' ? 'কোনো ডিফেন্ডার নেই' : 'No defenders in lineup'}
                  </div>
                )}
              </div>
            </div>

            {/* ROW 4: GOALKEEPER */}
            <div>
              <div className="flex items-center justify-center gap-2 mb-2.5 text-center">
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-amber-400 bg-amber-950/70 border border-amber-500/40 px-3 py-0.5 rounded-full shadow-md">
                  {language === 'bn' ? 'গোলকিপার (GOALKEEPER)' : 'GOALKEEPER'}
                </span>
              </div>
              <div className="flex items-center justify-center gap-3 sm:gap-6 flex-wrap">
                {goalkeepers.length > 0 ? (
                  goalkeepers.map(player => (
                    <PlayerPosterCard
                      key={player.id}
                      player={player}
                      isEditMode={isEditMode}
                      language={language}
                      onMoveToBench={() => movePlayerToBench(player.id)}
                      onToggleCaptain={() => toggleCaptain(player.id)}
                      onToggleViceCaptain={() => toggleViceCaptain(player.id)}
                      onEdit={() => handleOpenPlayerEdit(player)}
                      onRemove={() => removePlayerFromLineup(player.id)}
                    />
                  ))
                ) : (
                  <div className="text-[11px] text-slate-500 italic py-2">
                    {language === 'bn' ? 'কোনো গোলকিপার নেই' : 'No goalkeeper in lineup'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 4. BENCH / SUBSTITUTES SECTION (বেঞ্চ ও অতিরিক্ত খেলোয়াড়) */}
        <div className="relative z-10 mt-6 pt-5 border-t border-slate-800">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider">
                {language === 'bn' ? 'অতিরিক্ত খেলোয়াড় / বেঞ্চ (Substitutes & Reserves)' : 'Substitutes & Reserves'}
              </h4>
              <span className="px-2 py-0.2 rounded-full bg-slate-800 text-slate-400 font-mono text-[10px]">
                {benchPlayers.length}
              </span>
            </div>
            {isEditMode && unassignedSoldPlayers.length > 0 && (
              <span className="text-[11px] text-amber-400 font-medium">
                {language === 'bn' ? `আরও ${unassignedSoldPlayers.length} জন খেলোয়াড় যুক্ত করা যাবে` : `${unassignedSoldPlayers.length} unassigned squad members`}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
            {benchPlayers.map(player => (
              <div
                key={player.id}
                className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-2.5 flex flex-col items-center text-center group/bench relative hover:border-slate-700 transition-all"
              >
                <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0 mb-1.5 shadow-sm">
                  {player.photoUrl ? (
                    <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-6 h-6 text-slate-600" />
                  )}
                </div>
                <div className="w-full truncate text-[11px] font-bold text-white">
                  {player.name}
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">
                  {getPositionLabel(player.position, language === 'bn')}
                </div>
                {(player.formNumber || player.formNumericValue) && (
                  <span className="text-[8px] font-mono text-amber-400 mt-0.5">
                    {player.formNumber || `ফরম নং:- ${toBengaliDigits(player.formNumericValue!)}`}
                  </span>
                )}

                {/* Edit Mode Quick Actions for Bench */}
                {isEditMode && (
                  <div className="flex items-center gap-1 mt-1.5 pt-1 border-t border-slate-800 w-full justify-center">
                    <button
                      type="button"
                      onClick={() => movePlayerToStarting(player.id)}
                      className="p-1 rounded bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white transition-colors cursor-pointer"
                      title={language === 'bn' ? 'মূল একাদশে তুলুন' : 'Promote to Starting XI'}
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenPlayerEdit(player)}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                      title={language === 'bn' ? 'সম্পাদনা' : 'Edit'}
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removePlayerFromLineup(player.id)}
                      className="p-1 rounded bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white transition-colors cursor-pointer"
                      title={language === 'bn' ? 'লাইনআপ থেকে বাদ দিন' : 'Remove from Lineup'}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* In Edit Mode: Show quick button to add unassigned squad players */}
            {isEditMode && unassignedSoldPlayers.length > 0 && (
              <div className="col-span-full pt-3">
                <div className="text-xs font-bold text-slate-300 mb-2">
                  {language === 'bn' ? 'উপলব্ধ স্কোয়াড খেলোয়াড় (দলে বিক্রি হয়েছে কিন্তু লাইনআপে নেই):' : 'Available Squad Members:'}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {unassignedSoldPlayers.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => movePlayerToStarting(p.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-emerald-500 text-slate-300 hover:text-white text-xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3 text-emerald-400" />
                      <span>{p.name}</span>
                      <span className="text-[10px] text-slate-500">({p.position})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 5. POSTER FOOTER: Team Stats & Branding */}
        <div className="relative z-10 mt-6 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              {language === 'bn' ? 'মোট খেলোয়াড় খরচ:' : 'Total Purse Invested:'}{' '}
              <strong className="text-emerald-400 font-mono">{formatBDT(totalPurseSpent)}</strong>
            </span>
            <span>•</span>
            <span>
              {language === 'bn' ? 'অবশিষ্ট বাজেট:' : 'Remaining Budget:'}{' '}
              <strong className="text-white font-mono">{formatBDT(activeTeam.remainingBudget)}</strong>
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            {language === 'bn'
              ? 'টিস্তা প্রিমিয়ার লীগ সিজন ২ • অফিসিয়াল টিম স্কোরবোর্ড ও লাইনআপ'
              : 'TEESTA PREMIER LEAGUE SEASON 2 • OFFICIAL SQUAD POSTER'}
          </div>
        </div>
      </div>

      {/* 6. ADMIN MODAL: Edit Player Display Information & Photo */}
      {editingPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-400" />
                <span>{language === 'bn' ? 'খেলোয়াড়ের তথ্য ও ছবি সম্পাদনা' : 'Edit Player Details & Photo'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingPlayer(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Photo Uploader with storage integration */}
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">
                  {language === 'bn' ? 'খেলোয়াড়ের ছবি আপলোড / পরিবর্তন' : 'Upload / Replace Player Photo'}
                </label>
                <PlayerPhotoUploader
                  currentPhotoUrl={editingPlayer.photoUrl}
                  onPhotoChanged={url => {
                    setEditingPlayer({ ...editingPlayer, photoUrl: url });
                    if (editedLineup) {
                      setEditedLineup({
                        ...editedLineup,
                        customPhotos: {
                          ...editedLineup.customPhotos,
                          [editingPlayer.id]: url,
                        },
                      });
                    }
                  }}
                  onSavedToFirestore={url => {
                    setEditingPlayer(prev => (prev ? { ...prev, photoUrl: url } : null));
                  }}
                  playerId={editingPlayer.id}
                  seasonId={editingPlayer.seasonId || currentSeason?.id || 'season-2-2026'}
                  language={language}
                  isAdmin={isAdmin}
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">
                  {language === 'bn' ? 'পোস্টারে প্রদর্শিত নাম' : 'Displayed Name'}
                </label>
                <input
                  type="text"
                  value={playerDisplayName}
                  onChange={e => setPlayerDisplayName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">
                  {language === 'bn' ? 'পজিশন' : 'Position'}
                </label>
                <select
                  value={playerDisplayPosition}
                  onChange={e => setPlayerDisplayPosition(e.target.value as PlayerPosition)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white cursor-pointer"
                >
                  <option value="Forward">{language === 'bn' ? 'স্ট্রাইকার (Forward)' : 'Forward'}</option>
                  <option value="Midfielder">{language === 'bn' ? 'মিডফিল্ডার (Midfielder)' : 'Midfielder'}</option>
                  <option value="Defender">{language === 'bn' ? 'ডিফেন্ডার (Defender)' : 'Defender'}</option>
                  <option value="Goalkeeper">{language === 'bn' ? 'গোলকিপার (Goalkeeper)' : 'Goalkeeper'}</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingPlayer(null)}
                className="px-3.5 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                {language === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={isSavingPlayerEdit}
                onClick={handleSavePlayerEdit}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {isSavingPlayerEdit ? (language === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...') : (language === 'bn' ? 'সংরক্ষণ করুন' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. ADMIN MODAL: Add Player from Tournament Pool to Lineup */}
      {isAddPlayerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">
                  {language === 'bn' ? 'দলীয় লাইনআপে খেলোয়াড় সংযুক্ত করুন' : 'Add Player to Squad Lineup'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddPlayerModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Destination Toggle */}
            <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setAddPlayerTargetType('starting')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  addPlayerTargetType === 'starting'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {language === 'bn' ? 'মূল একাদশ (Starting XI)' : 'Starting XI'}
              </button>
              <button
                type="button"
                onClick={() => setAddPlayerTargetType('bench')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  addPlayerTargetType === 'bench'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {language === 'bn' ? 'বেঞ্চ / অতিরিক্ত (Bench)' : 'Bench'}
              </button>
            </div>

            {/* Search and Filters */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={language === 'bn' ? 'নাম বা ফরম নম্বর দিয়ে খুঁজুন...' : 'Search by name or form number...'}
                  value={addPlayerSearchQuery}
                  onChange={e => setAddPlayerSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <select
                value={addPlayerPositionFilter}
                onChange={e => setAddPlayerPositionFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="all">{language === 'bn' ? 'সকল পজিশন' : 'All Positions'}</option>
                <option value="Forward">{language === 'bn' ? 'ফরওয়ার্ড' : 'Forward'}</option>
                <option value="Midfielder">{language === 'bn' ? 'মিডফিল্ডার' : 'Midfielder'}</option>
                <option value="Defender">{language === 'bn' ? 'ডিফেন্ডার' : 'Defender'}</option>
                <option value="Goalkeeper">{language === 'bn' ? 'গোলকিপার' : 'Goalkeeper'}</option>
              </select>
            </div>

            {/* Player List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[200px] max-h-[360px] scrollbar-thin scrollbar-thumb-slate-700">
              {availablePlayersToAdd.length > 0 ? (
                availablePlayersToAdd.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                        {p.photoUrl ? (
                          <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-5 h-5 text-slate-600" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>{p.name}</span>
                          {(p.formNumber || p.formNumericValue) && (
                            <span className="text-[10px] font-mono text-amber-400">
                              [{p.formNumber || `নং ${p.formNumericValue}`}]
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span className={`px-1.5 py-0.2 rounded-sm border ${getPositionBadgeColor(p.position)}`}>
                            {getPositionLabel(p.position, language === 'bn')}
                          </span>
                          <span>• ক্যাটাগরি {p.category || 'A'}</span>
                          {p.winningTeamName && <span>• দল: {p.winningTeamName}</span>}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddPlayer(p, addPlayerTargetType)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{language === 'bn' ? 'যুক্ত করুন' : 'Add'}</span>
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-slate-500 text-xs">
                  {language === 'bn' ? 'কোনো খেলোয়াড় পাওয়া যায়নি' : 'No available players found'}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsAddPlayerModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
              >
                {language === 'bn' ? 'বন্ধ করুন' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. TEAM LOGO MODAL */}
      <TeamLogoModal
        team={logoModalTeam}
        isOpen={Boolean(logoModalTeam)}
        onClose={() => setLogoModalTeam(null)}
        currentSeasonId={currentSeason?.id || 'season-2-2026'}
        onLogoUpdated={(teamId, newLogoUrl) => {
          if (activeTeam && activeTeam.id === teamId) {
            activeTeam.logoUrl = newLogoUrl;
          }
        }}
      />
    </div>
  );
};

/**
 * INDIVIDUAL PLAYER POSTER CARD (Real Sociedad Reference Style)
 * Clean vertical card with player portrait, form number, position badge, and player name beneath photo!
 */
interface PlayerPosterCardProps {
  player: Player & { isCaptain?: boolean; isViceCaptain?: boolean };
  isEditMode: boolean;
  language: 'bn' | 'en';
  onMoveToBench: () => void;
  onToggleCaptain: () => void;
  onToggleViceCaptain: () => void;
  onEdit: () => void;
  onRemove: () => void;
}

const PlayerPosterCard: React.FC<PlayerPosterCardProps> = ({
  player,
  isEditMode,
  language,
  onMoveToBench,
  onToggleCaptain,
  onToggleViceCaptain,
  onEdit,
  onRemove,
}) => {
  // Position badge accent color
  const posBorderColor =
    player.position === 'Goalkeeper'
      ? 'border-amber-400'
      : player.position === 'Defender'
      ? 'border-cyan-400'
      : player.position === 'Midfielder'
      ? 'border-emerald-400'
      : 'border-rose-400';

  const posBgGlow =
    player.position === 'Goalkeeper'
      ? 'shadow-[0_0_15px_rgba(251,191,36,0.25)]'
      : player.position === 'Defender'
      ? 'shadow-[0_0_15px_rgba(6,182,212,0.25)]'
      : player.position === 'Midfielder'
      ? 'shadow-[0_0_15px_rgba(16,185,129,0.25)]'
      : 'shadow-[0_0_15px_rgba(244,63,94,0.25)]';

  return (
    <div className="flex flex-col items-center group/card transition-transform duration-200 hover:-translate-y-1">
      {/* CARD CONTAINER */}
      <div
        className={`w-28 sm:w-36 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border-2 ${posBorderColor} ${posBgGlow} overflow-hidden shadow-2xl relative flex flex-col items-center`}
      >
        {/* Form Number Badge (Top-Left) */}
        {(player.formNumber || player.formNumericValue) && (
          <div className="absolute top-1.5 left-1.5 z-20 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-xs border border-amber-500/40 text-[9px] font-mono text-amber-300 font-bold">
            {player.formNumber || `ফরম নং:- ${toBengaliDigits(player.formNumericValue!)}`}
          </div>
        )}

        {/* Captain / Vice Captain Badge (Top-Right) */}
        {player.isCaptain && (
          <div className="absolute top-1.5 right-1.5 z-20 px-1.5 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-black shadow-md flex items-center gap-0.5">
            <Crown className="w-2.5 h-2.5 fill-current" />
            <span>C</span>
          </div>
        )}
        {player.isViceCaptain && (
          <div className="absolute top-1.5 right-1.5 z-20 px-1.5 py-0.5 rounded-md bg-slate-300 text-slate-950 text-[10px] font-black shadow-md">
            VC
          </div>
        )}

        {/* Player Portrait (Full frame with fallback placeholder) */}
        <div className="w-full h-32 sm:h-40 bg-gradient-to-b from-slate-800 to-slate-950 relative overflow-hidden flex items-center justify-center">
          {player.photoUrl ? (
            <img
              src={player.photoUrl}
              alt={player.name}
              onError={e => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
              className="w-full h-full object-cover object-top filter brightness-[1.02]"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 bg-slate-900/80">
              <User className="w-12 h-12 text-slate-600 mb-1" />
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                {player.position}
              </span>
            </div>
          )}

          {/* Bottom subtle shadow vignette */}
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent pointer-events-none" />
        </div>

        {/* PLAYER NAME BENEATH PHOTO (Real Sociedad Reference Feature) */}
        <div className="w-full bg-slate-950 px-2 py-2 text-center border-t border-slate-800 flex flex-col items-center justify-center min-h-[52px]">
          <h4
            className="text-[11px] sm:text-xs font-black text-white uppercase tracking-tight truncate w-full"
            title={player.name}
          >
            {player.name}
          </h4>
          {player.banglaName && player.banglaName !== player.name && (
            <div className="text-[9px] text-slate-400 truncate w-full font-sans">
              {player.banglaName}
            </div>
          )}
          <div className="flex items-center justify-center gap-1 mt-1">
            <span
              className={`text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded-full border ${getPositionBadgeColor(
                player.position
              )}`}
            >
              {getPositionLabel(player.position, language === 'bn')}
            </span>
            {player.finalPrice ? (
              <span className="text-[8px] font-mono text-emerald-400 font-bold">
                {formatBDT(player.finalPrice)}
              </span>
            ) : null}
          </div>
        </div>

        {/* EDIT MODE CONTROLS OVERLAY */}
        {isEditMode && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs z-30 p-2 flex flex-col items-center justify-center gap-1.5 animate-in fade-in">
            <span className="text-[10px] font-bold text-white truncate max-w-[100px]">
              {player.name}
            </span>
            <div className="grid grid-cols-2 gap-1 w-full mt-1">
              <button
                type="button"
                onClick={onMoveToBench}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[9px] flex items-center justify-center gap-0.5 cursor-pointer"
                title={language === 'bn' ? 'বেঞ্চে পাঠান' : 'Move to Bench'}
              >
                <ArrowDown className="w-2.5 h-2.5 text-cyan-400" />
                <span>বেঞ্চ</span>
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[9px] flex items-center justify-center gap-0.5 cursor-pointer"
                title={language === 'bn' ? 'তথ্য ও ছবি' : 'Edit Info'}
              >
                <Edit3 className="w-2.5 h-2.5 text-amber-400" />
                <span>তথ্য</span>
              </button>
              <button
                type="button"
                onClick={onToggleCaptain}
                className={`p-1 rounded text-[9px] font-bold flex items-center justify-center gap-0.5 cursor-pointer ${
                  player.isCaptain ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title={language === 'bn' ? 'অধিনায়ক নির্ধারণ' : 'Set as Captain'}
              >
                <Crown className="w-2.5 h-2.5" />
                <span>(C)</span>
              </button>
              <button
                type="button"
                onClick={onToggleViceCaptain}
                className={`p-1 rounded text-[9px] font-bold flex items-center justify-center gap-0.5 cursor-pointer ${
                  player.isViceCaptain ? 'bg-slate-300 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title={language === 'bn' ? 'সহ-অধিনায়ক নির্ধারণ' : 'Set as Vice-Captain'}
              >
                <span>(VC)</span>
              </button>
            </div>
            <button
              type="button"
              onClick={onRemove}
              className="w-full mt-1 py-1 rounded bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white text-[9px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <Trash2 className="w-2.5 h-2.5" />
              <span>{language === 'bn' ? 'বাদ দিন' : 'Remove'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
