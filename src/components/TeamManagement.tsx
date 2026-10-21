import React, { useState } from 'react';
import {
  Shield,
  Plus,
  Users,
  Wallet,
  Phone,
  UserCheck,
  Edit2,
  Trash2,
  CheckCircle,
  ExternalLink,
  X,
  Award,
  User,
} from 'lucide-react';
import { Team, Player, Season } from '../types';
import { formatBDT, getPositionBadgeColor, getPositionLabel } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { doc, setDoc, updateDoc, deleteDoc, collection } from 'firebase/firestore';
import { db } from '../firebase/config';
import { EditableText } from './common/EditableText';
import { updateTeamField } from '../services/editService';

interface TeamManagementProps {
  teams: Team[];
  players: Player[];
  currentSeasonId?: string;
  currentSeason?: Season;
}

export const TeamManagement: React.FC<TeamManagementProps> = ({
  teams,
  players,
  currentSeasonId = 'season-2-2026',
  currentSeason,
}) => {
  const { isAdmin, language, currentUser } = useAuth();

  const [selectedTeamRoster, setSelectedTeamRoster] = useState<Team | null>(null);
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  // New Team Form state
  const [teamName, setTeamName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [teamPhone, setTeamPhone] = useState('');
  const [totalBudget, setTotalBudget] = useState(currentSeason?.defaultBudget || 100000);
  const [maxSquad, setMaxSquad] = useState(currentSeason?.maxSquadSize || 15);
  const [teamColor, setTeamColor] = useState('#10b981');
  const [userEmail, setUserEmail] = useState('');

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    if (!currentUser) {
      alert(
        language === 'bn'
          ? 'নতুন দল তৈরি করতে প্রথমে আপনার Google অ্যাডমিন অ্যাকাউন্ট (arifhossainbd087@gmail.com) দিয়ে লগইন করুন।'
          : 'Please sign in with your admin account to create teams.'
      );
      return;
    }

    try {
      const teamRef = doc(collection(db, 'teams'));
      const newTeam: Team = {
        id: teamRef.id,
        seasonId: currentSeasonId,
        name: teamName,
        ownerName: ownerName || 'ম্যানেজার',
        phone: teamPhone || '',
        totalBudget: Number(totalBudget),
        spentBudget: 0,
        remainingBudget: Number(totalBudget),
        squadCount: 0,
        maxSquad: Number(maxSquad),
        color: teamColor,
        userEmail: userEmail.trim().toLowerCase(),
        createdAt: new Date().toISOString(),
      };

      await setDoc(teamRef, newTeam);

      // Audit Log
      const auditRef = doc(collection(db, 'auditLogs'));
      await setDoc(auditRef, {
        action: 'TEAM_CREATED',
        actorEmail: currentUser?.email || 'admin',
        actorRole: 'admin',
        details: `নতুন দল ${teamName} তৈরি করা হয়েছে (বাজেট: ৳${totalBudget.toLocaleString()})`,
        timestamp: new Date().toISOString(),
      });

      setShowAddTeamModal(false);
      setTeamName('');
      setOwnerName('');
      setTeamPhone('');
      setUserEmail('');
    } catch (err) {
      console.error('Error creating team:', err);
      alert('দল তৈরি করতে ব্যর্থ হয়েছে');
    }
  };

  const handleUpdateTeam = async () => {
    if (!editingTeam) return;
    try {
      await updateDoc(doc(db, 'teams', editingTeam.id), {
        name: editingTeam.name,
        banglaName: editingTeam.banglaName || '',
        logoUrl: editingTeam.logoUrl || '',
        ownerName: editingTeam.ownerName,
        phone: editingTeam.phone || '',
        totalBudget: Number(editingTeam.totalBudget),
        remainingBudget: Number(editingTeam.totalBudget) - (editingTeam.spentBudget || 0),
        maxSquad: Number(editingTeam.maxSquad),
        color: editingTeam.color,
        userEmail: editingTeam.userEmail?.toLowerCase() || '',
        updatedAt: new Date().toISOString(),
      });
      setEditingTeam(null);
    } catch (err) {
      console.error('Error updating team:', err);
    }
  };

  const handleDeleteTeam = async (teamId: string, name: string) => {
    if (!window.confirm(`${name} দলটিকে মুছে ফেলতে চান?`)) return;
    try {
      await deleteDoc(doc(db, 'teams', teamId));
    } catch (err) {
      console.error('Error deleting team:', err);
    }
  };

  // Find players in selected team roster
  const squadPlayers = selectedTeamRoster
    ? players.filter(p => p.winningTeamId === selectedTeamRoster.id || p.winningTeamName === selectedTeamRoster.name)
    : [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald-400" />
            <span>{language === 'bn' ? 'দল ও বাজেট ব্যবস্থাপনা' : 'Teams & Purse Management'}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {language === 'bn'
              ? `অংশগ্রহণকারী দল: ${teams.length}টি | প্রতিটি দলের বাজেট ও স্কোয়াড মনিটরিং`
              : `Participating Teams: ${teams.length} | Monitor purse, squad limits & acquisitions`}
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowAddTeamModal(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-950 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'bn' ? 'নতুন দল যোগ করুন' : 'Add New Team'}</span>
          </button>
        )}
      </div>

      {/* Teams Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {teams.map(team => {
          const spentPercent = Math.min(
            100,
            Math.round(((team.spentBudget || 0) / (team.totalBudget || 100000)) * 100)
          );
          const teamRoster = players.filter(
            p => p.winningTeamId === team.id || p.winningTeamName === team.name
          );

          return (
            <div
              key={team.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between"
            >
              <div>
                {/* Team Brand Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg text-white shadow-md relative group/logo shrink-0 overflow-hidden"
                      style={{ backgroundColor: team.color || '#10b981' }}
                    >
                      {team.logoUrl ? (
                        <img
                          src={team.logoUrl}
                          alt={team.name}
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        team.name.charAt(0)
                      )}
                      {isAdmin && (
                        <div
                          className="absolute -bottom-1 -right-1 z-20"
                          title={language === 'bn' ? 'লোগো URL সম্পাদনা' : 'Edit Logo URL'}
                        >
                          <EditableText
                            value={team.logoUrl || ''}
                            required={false}
                            onSave={async (val) => {
                              await updateTeamField(team.id, 'logoUrl', val, team, currentUser?.email || 'admin');
                            }}
                            label={language === 'bn' ? 'দলের লোগো URL' : 'Team Logo URL'}
                            placeholder="https://.../logo.png"
                            pencilClassName="p-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:text-emerald-400"
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <EditableText
                        value={team.name}
                        onSave={async (val) => {
                          await updateTeamField(team.id, 'name', val, team, currentUser?.email || 'admin');
                        }}
                        label={language === 'bn' ? 'দলের নাম (English/বাংলা)' : 'Team Name'}
                      >
                        <h3 className="text-base font-bold text-white leading-snug">{team.name}</h3>
                      </EditableText>

                      {/* Bangla Name editable */}
                      <EditableText
                        value={team.banglaName || ''}
                        required={false}
                        onSave={async (val) => {
                          await updateTeamField(team.id, 'banglaName', val, team, currentUser?.email || 'admin');
                        }}
                        label={language === 'bn' ? 'দলের বাংলা নাম' : 'Bangla Team Name'}
                        placeholder={language === 'bn' ? 'বাংলায় দলের নাম লিখুন' : 'Enter Bangla team name'}
                        pencilClassName="text-slate-400 hover:text-emerald-400"
                      >
                        <span className="text-xs text-emerald-400/90 font-medium block">
                          {team.banglaName || (language === 'bn' ? '+ বাংলা নাম যোগ করুন' : '+ Add Bangla Name')}
                        </span>
                      </EditableText>

                      <div className="text-xs text-slate-400 flex items-center flex-wrap gap-1 mt-0.5">
                        <EditableText
                          value={team.ownerName}
                          onSave={async (val) => {
                            await updateTeamField(team.id, 'ownerName', val, team, currentUser?.email || 'admin');
                          }}
                          label={language === 'bn' ? 'ম্যানেজার / মালিকের নাম' : 'Manager / Owner Name'}
                        >
                          <span>{team.ownerName}</span>
                        </EditableText>

                        <span className="text-slate-600">•</span>
                        <EditableText
                          value={team.phone || ''}
                          required={false}
                          onSave={async (val) => {
                            await updateTeamField(team.id, 'phone', val, team, currentUser?.email || 'admin');
                          }}
                          label={language === 'bn' ? 'যোগাযোগ নম্বর' : 'Phone Number'}
                          placeholder="01712-XXXXXX"
                        >
                          <span>{team.phone || (language === 'bn' ? 'নম্বর নেই' : 'No Phone')}</span>
                        </EditableText>
                      </div>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingTeam(team)}
                        className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                        title={language === 'bn' ? 'সম্পূর্ণ ফর্ম সম্পাদনা' : 'Full Team Edit Form'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTeam(team.id, team.name)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="মুছুন"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Assigned Login Email */}
                {team.userEmail && (
                  <div className="mt-2 text-[10px] text-slate-400 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800/80 truncate flex items-center justify-between">
                    <span>
                      {language === 'bn' ? 'লগইন:' : 'Login:'} <strong className="text-slate-300">{team.userEmail}</strong>
                    </span>
                    <EditableText
                      value={team.userEmail}
                      onSave={async (val) => {
                        await updateTeamField(team.id, 'userEmail', val, team, currentUser?.email || 'admin');
                      }}
                      label={language === 'bn' ? 'দলের লগইন ইমেইল' : 'Team Login Email'}
                      pencilClassName="text-slate-500 hover:text-sky-400"
                    />
                  </div>
                )}

                {/* Purse Cards */}
                <div className="grid grid-cols-2 gap-2.5 mt-4">
                  <div className="bg-slate-950/80 border border-slate-800/90 p-3 rounded-xl">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                      {language === 'bn' ? 'অবশিষ্ট বাজেট' : 'Remaining Purse'}
                    </div>
                    <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                      {formatBDT(team.remainingBudget)}
                    </div>
                  </div>

                  <div className="bg-slate-950/80 border border-slate-800/90 p-3 rounded-xl">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                      {language === 'bn' ? 'ব্যয় হয়েছে' : 'Spent Amount'}
                    </div>
                    <div className="text-base font-bold text-slate-300 font-mono mt-0.5">
                      {formatBDT(team.spentBudget || 0)}
                    </div>
                  </div>
                </div>

                {/* Budget Utilization Bar */}
                <div className="space-y-1.5 mt-4">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      {language === 'bn' ? 'বাজেট ব্যবহার' : 'Budget Used'}: {spentPercent}%
                    </span>
                    <div className="flex items-center gap-1">
                      <span>{language === 'bn' ? 'মোট:' : 'Total:'}</span>
                      <EditableText
                        value={team.totalBudget}
                        type="number"
                        min={1000}
                        onSave={async (val) => {
                          await updateTeamField(team.id, 'totalBudget', val, team, currentUser?.email || 'admin');
                        }}
                        label={language === 'bn' ? 'দলের মোট বাজেট' : 'Total Budget'}
                        pencilClassName="text-emerald-400 hover:text-emerald-300"
                      >
                        <span className="font-mono font-bold text-slate-200">
                          {formatBDT(team.totalBudget)}
                        </span>
                      </EditableText>
                    </div>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${spentPercent}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Card Footer: Squad Status & View Roster Modal Trigger */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span className="flex items-center gap-1">
                    <span>{language === 'bn' ? 'স্কোয়াড:' : 'Squad:'}</span>
                    <strong className="text-white font-mono">{teamRoster.length} /</strong>
                    <EditableText
                      value={team.maxSquad || 15}
                      type="number"
                      min={5}
                      max={30}
                      onSave={async (val) => {
                        await updateTeamField(team.id, 'maxSquad', val, team, currentUser?.email || 'admin');
                      }}
                      label={language === 'bn' ? 'সর্বোচ্চ স্কোয়াড সংখ্যা' : 'Max Squad Limit'}
                      pencilClassName="text-slate-400 hover:text-emerald-400"
                    >
                      <strong className="text-white font-mono">{team.maxSquad || 15}</strong>
                    </EditableText>
                  </span>
                </div>

                <button
                  onClick={() => setSelectedTeamRoster(team)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-emerald-400 font-semibold border border-slate-700 transition-colors cursor-pointer"
                >
                  <span>{language === 'bn' ? 'স্কোয়াড দেখুন' : 'View Roster'}</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Team Roster Modal */}
      {selectedTeamRoster && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-md"
                  style={{ backgroundColor: selectedTeamRoster.color || '#10b981' }}
                >
                  {selectedTeamRoster.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedTeamRoster.name}</h3>
                  <p className="text-xs text-slate-400">
                    {language === 'bn' ? 'নিলামে ক্রয়কৃত খেলোয়াড় তালিকা' : 'Acquired Players Roster'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTeamRoster(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Stats Pill */}
            <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-center text-xs">
              <div>
                <span className="text-slate-400 block">{language === 'bn' ? 'মোট খেলোয়াড়' : 'Total Players'}</span>
                <span className="text-base font-bold text-white">{squadPlayers.length}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{language === 'bn' ? 'মোট খরচ' : 'Total Spent'}</span>
                <span className="text-base font-bold text-amber-400 font-mono">
                  {formatBDT(selectedTeamRoster.spentBudget || 0)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">{language === 'bn' ? 'অবশিষ্ট বাজেট' : 'Purse Left'}</span>
                <span className="text-base font-bold text-emerald-400 font-mono">
                  {formatBDT(selectedTeamRoster.remainingBudget)}
                </span>
              </div>
            </div>

            {/* Squad List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {squadPlayers.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">
                  {language === 'bn'
                    ? 'এই দল এখনো কোনো খেলোয়াড় ক্রয় করেনি।'
                    : 'This team has not acquired any players yet.'}
                </div>
              ) : (
                squadPlayers.map((player, idx) => (
                  <div
                    key={player.id}
                    className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center font-mono text-[11px] text-slate-400 shrink-0">
                        {idx + 1}
                      </span>
                      <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0 relative">
                        <User className="w-4 h-4 text-slate-500 absolute" />
                        {player.photoUrl && (
                          <img
                            src={player.photoUrl}
                            alt={player.name}
                            onError={e => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                            className="w-full h-full object-cover relative z-10"
                          />
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-slate-200">{player.name}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <span
                            className={`px-1.5 py-0.2 rounded border ${getPositionBadgeColor(
                              player.position
                            )}`}
                          >
                            {getPositionLabel(player.position, language === 'bn')}
                          </span>
                          <span>•</span>
                          <span>{player.area || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] text-slate-400">
                        {language === 'bn' ? 'নিলাম মূল্য' : 'Sold Price'}
                      </div>
                      <div className="font-mono font-bold text-sm text-amber-300">
                        {formatBDT(player.finalPrice || player.basePrice)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-800 text-right">
              <button
                onClick={() => setSelectedTeamRoster(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
              >
                {language === 'bn' ? 'বন্ধ করুন' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Team Modal */}
      {showAddTeamModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <form
            onSubmit={handleCreateTeam}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              <span>{language === 'bn' ? 'নতুন টুর্নামেন্ট দল তৈরি' : 'Create Tournament Team'}</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">
                  {language === 'bn' ? 'দলের নাম (বাংলা / ইংরেজি)' : 'Team Name'} *
                </label>
                <input
                  type="text"
                  required
                  placeholder="যেমন: তিস্তা থান্ডারস"
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">
                    {language === 'bn' ? 'মালিক / ম্যানেজার' : 'Owner / Manager'}
                  </label>
                  <input
                    type="text"
                    placeholder="ম্যানেজারের নাম"
                    value={ownerName}
                    onChange={e => setOwnerName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">
                    {language === 'bn' ? 'ফোন নম্বর' : 'Phone'}
                  </label>
                  <input
                    type="text"
                    placeholder="017XXXXXXXX"
                    value={teamPhone}
                    onChange={e => setTeamPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">
                    {language === 'bn' ? 'প্রারম্ভিক বাজেট (৳)' : 'Purse Budget (BDT)'}
                  </label>
                  <input
                    type="number"
                    value={totalBudget}
                    onChange={e => setTotalBudget(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">
                    {language === 'bn' ? 'সর্বোচ্চ স্কোয়াড' : 'Max Squad Limit'}
                  </label>
                  <input
                    type="number"
                    value={maxSquad}
                    onChange={e => setMaxSquad(parseInt(e.target.value, 10) || 15)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  {language === 'bn' ? 'দলের থিম কালার' : 'Team Theme Color'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={teamColor}
                    onChange={e => setTeamColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border border-slate-700 bg-transparent"
                  />
                  <span className="text-slate-300 font-mono text-xs">{teamColor}</span>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  {language === 'bn' ? 'দলের লগইন ইমেইল (ঐচ্ছিক)' : 'Assigned Team Login Email (Optional)'}
                </label>
                <input
                  type="email"
                  placeholder="team1@teestaleague.com"
                  value={userEmail}
                  onChange={e => setUserEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddTeamModal(false)}
                className="px-3.5 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                {language === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
              >
                {language === 'bn' ? 'দল যুক্ত করুন' : 'Create Team'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Team Modal */}
      {editingTeam && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-emerald-400" />
              <span>{language === 'bn' ? 'দলের তথ্য ও বাজেট সম্পাদনা' : 'Edit Team & Budget'}</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">{language === 'bn' ? 'দলের নাম (ইংরেজি)' : 'Team Name (English)'}</label>
                <input
                  type="text"
                  value={editingTeam.name}
                  onChange={e => setEditingTeam({ ...editingTeam, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">{language === 'bn' ? 'দলের বাংলা নাম' : 'Bangla Team Name'}</label>
                <input
                  type="text"
                  placeholder="যেমন: তিস্তা ওয়ারিয়র্স"
                  value={editingTeam.banglaName || ''}
                  onChange={e => setEditingTeam({ ...editingTeam, banglaName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">{language === 'bn' ? 'লোগো URL' : 'Logo URL'}</label>
                <input
                  type="url"
                  placeholder="https://.../logo.png"
                  value={editingTeam.logoUrl || ''}
                  onChange={e => setEditingTeam({ ...editingTeam, logoUrl: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">
                    {language === 'bn' ? 'মোট বাজেট (৳)' : 'Total Budget'}
                  </label>
                  <input
                    type="number"
                    value={editingTeam.totalBudget}
                    onChange={e =>
                      setEditingTeam({
                        ...editingTeam,
                        totalBudget: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">
                    {language === 'bn' ? 'সর্বোচ্চ স্কোয়াড' : 'Max Squad'}
                  </label>
                  <input
                    type="number"
                    value={editingTeam.maxSquad}
                    onChange={e =>
                      setEditingTeam({
                        ...editingTeam,
                        maxSquad: parseInt(e.target.value, 10) || 15,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">{language === 'bn' ? 'ম্যানেজার' : 'Owner Name'}</label>
                <input
                  type="text"
                  value={editingTeam.ownerName}
                  onChange={e => setEditingTeam({ ...editingTeam, ownerName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  {language === 'bn' ? 'লগইন ইমেইল' : 'Assigned Email'}
                </label>
                <input
                  type="email"
                  value={editingTeam.userEmail || ''}
                  onChange={e => setEditingTeam({ ...editingTeam, userEmail: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setEditingTeam(null)}
                className="px-3.5 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                {language === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                onClick={handleUpdateTeam}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
              >
                {language === 'bn' ? 'সংরক্ষণ করুন' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
