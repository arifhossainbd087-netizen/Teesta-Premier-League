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
  RotateCcw,
  Camera,
  UserPlus,
  Search,
  AlertCircle,
} from 'lucide-react';
import { Team, Player, Season } from '../types';
import { formatBDT, getPositionBadgeColor, getPositionLabel } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { doc, setDoc, updateDoc, deleteDoc, collection } from 'firebase/firestore';
import { db } from '../firebase/config';
import { EditableText } from './common/EditableText';
import { updateTeamField } from '../services/editService';
import { manualAddPlayerToSquad, manualRemovePlayerFromSquad } from '../services/auctionService';
import { TeamLogoModal } from './TeamLogoModal';
import { TeamBudgetResetModal } from './TeamBudgetResetModal';

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
  const [budgetResetTeam, setBudgetResetTeam] = useState<Team | null>(null);
  const [logoEditTeam, setLogoEditTeam] = useState<Team | null>(null);

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
    if (!isAdmin) {
      alert(language === 'bn' ? 'শুধুমাত্র অনুমোদিত অ্যাডমিন নতুন দল তৈরি করতে পারবেন।' : 'Only authorized admin can create teams.');
      return;
    }

    const cleanEmail = userEmail.trim().toLowerCase();
    if (cleanEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        alert(language === 'bn' ? 'অনুগ্রহ করে সঠিক ইমেইল অ্যাড্রেস লিখুন।' : 'Please enter a valid email address.');
        return;
      }
      const duplicateTeam = teams.find(
        t => (t.loginEmail?.toLowerCase() === cleanEmail || t.userEmail?.toLowerCase() === cleanEmail)
      );
      if (duplicateTeam) {
        const confirmMsg = language === 'bn'
          ? `সতর্কতা: "${duplicateTeam.name}" দলের জন্য ইতোমধ্যে এই ইমেইল (${cleanEmail}) বরাদ্দ রয়েছে। আপনি কি নিশ্চিত যে এই দলেও একই ইমেইল বরাদ্দ করতে চান?`
          : `Warning: This email (${cleanEmail}) is already assigned to "${duplicateTeam.name}". Do you want to proceed?`;
        if (!window.confirm(confirmMsg)) {
          return;
        }
      }
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
        userEmail: cleanEmail,
        loginEmail: cleanEmail,
        createdAt: new Date().toISOString(),
      };

      await setDoc(teamRef, newTeam);

      // Audit Log
      const auditRef = doc(collection(db, 'auditLogs'));
      await setDoc(auditRef, {
        action: 'TEAM_CREATED',
        actorEmail: currentUser?.email || 'admin',
        actorRole: 'admin',
        details: `নতুন দল ${teamName} তৈরি করা হয়েছে (বাজেট: ৳${totalBudget.toLocaleString()}, ম্যানেজার ইমেইল: ${cleanEmail || 'বরাদ্দ নেই'})`,
        timestamp: new Date().toISOString(),
      });

      setShowAddTeamModal(false);
      setTeamName('');
      setOwnerName('');
      setTeamPhone('');
      setUserEmail('');
    } catch (err) {
      console.error('Error creating team:', err);
      alert(language === 'bn' ? 'দল তৈরি করতে ব্যর্থ হয়েছে' : 'Failed to create team');
    }
  };

  const handleUpdateTeam = async () => {
    if (!editingTeam) return;
    if (!isAdmin) {
      alert(language === 'bn' ? 'শুধুমাত্র অনুমোদিত অ্যাডমিন দলের তথ্য পরিবর্তন করতে পারবেন।' : 'Only authorized admin can edit teams.');
      return;
    }

    const cleanEmail = (editingTeam.userEmail || editingTeam.loginEmail || '').trim().toLowerCase();
    if (cleanEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        alert(language === 'bn' ? 'অনুগ্রহ করে সঠিক ইমেইল অ্যাড্রেস লিখুন।' : 'Please enter a valid email address.');
        return;
      }
      const duplicateTeam = teams.find(
        t => t.id !== editingTeam.id && (t.loginEmail?.toLowerCase() === cleanEmail || t.userEmail?.toLowerCase() === cleanEmail)
      );
      if (duplicateTeam) {
        const confirmMsg = language === 'bn'
          ? `সতর্কতা: "${duplicateTeam.name}" দলের জন্য ইতোমধ্যে এই ইমেইল (${cleanEmail}) বরাদ্দ রয়েছে। আপনি কি নিশ্চিত যে এই দলেও একই ইমেইল বরাদ্দ করতে চান?`
          : `Warning: This email (${cleanEmail}) is already assigned to "${duplicateTeam.name}". Do you want to proceed?`;
        if (!window.confirm(confirmMsg)) {
          return;
        }
      }
    }

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
        userEmail: cleanEmail,
        loginEmail: cleanEmail,
        updatedAt: new Date().toISOString(),
      });

      // Audit Log
      const auditRef = doc(collection(db, 'auditLogs'));
      await setDoc(auditRef, {
        action: 'TEAM_UPDATED',
        actorEmail: currentUser?.email || 'admin',
        actorRole: 'admin',
        details: `দল [${editingTeam.name}] এর তথ্য হালনাগাদ (ম্যানেজার ইমেইল: ${cleanEmail || 'বরাদ্দ নেই'})`,
        timestamp: new Date().toISOString(),
      });

      setEditingTeam(null);
    } catch (err) {
      console.error('Error updating team:', err);
      alert(language === 'bn' ? 'দল সম্পাদনা করতে ব্যর্থ হয়েছে' : 'Failed to update team');
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
                      onClick={() => {
                        if (isAdmin) setLogoEditTeam(team);
                      }}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg text-white shadow-md relative group/logo shrink-0 overflow-hidden ${
                        isAdmin ? 'cursor-pointer ring-1 ring-slate-700 hover:ring-emerald-500' : ''
                      }`}
                      style={{ backgroundColor: team.color || '#10b981' }}
                      title={isAdmin ? (language === 'bn' ? 'লোগো পরিবর্তন করতে ক্লিক করুন' : 'Click to change logo') : team.name}
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
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/logo:opacity-100 flex items-center justify-center transition-opacity">
                          <Camera className="w-4 h-4 text-emerald-300" />
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
                        onClick={() => setLogoEditTeam(team)}
                        className="p-1.5 rounded-lg text-emerald-400 hover:text-white hover:bg-emerald-950/60 border border-emerald-500/20 transition-colors cursor-pointer"
                        title={language === 'bn' ? 'দলের লোগো আপলোড ও পরিবর্তন' : 'Upload Team Logo'}
                      >
                        <Camera className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setBudgetResetTeam(team)}
                        className="p-1.5 rounded-lg text-amber-400 hover:text-white hover:bg-amber-950/60 border border-amber-500/20 transition-colors cursor-pointer"
                        title={language === 'bn' ? 'বাজেট রিসেট ও সংশোধন' : 'Reset / Adjust Budget'}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingTeam(team)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                        title={language === 'bn' ? 'সম্পূর্ণ ফর্ম সম্পাদনা' : 'Full Team Edit Form'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTeam(team.id, team.name)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="মুছুন"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Assigned Login Email or Unassigned Warning Badge */}
                {team.loginEmail || team.userEmail ? (
                  <div className="mt-2 text-[10px] text-slate-400 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800/80 truncate flex items-center justify-between">
                    <span className="truncate pr-1">
                      <span className="text-emerald-400 font-semibold mr-1">📧 {language === 'bn' ? 'লগইন:' : 'Login:'}</span>
                      <strong className="text-slate-300 font-mono">{team.loginEmail || team.userEmail}</strong>
                    </span>
                    {isAdmin && (
                      <EditableText
                        value={team.loginEmail || team.userEmail}
                        onSave={async (val) => {
                          const cleanVal = String(val || '').trim().toLowerCase();
                          if (cleanVal) {
                            const duplicateTeam = teams.find(
                              t => t.id !== team.id && (t.loginEmail?.toLowerCase() === cleanVal || t.userEmail?.toLowerCase() === cleanVal)
                            );
                            if (duplicateTeam) {
                              const confirmMsg = language === 'bn'
                                ? `সতর্কতা: "${duplicateTeam.name}" দলের জন্য ইতোমধ্যে এই ইমেইল (${cleanVal}) বরাদ্দ রয়েছে। আপনি কি নিশ্চিত যে এই দলেও একই ইমেইল বরাদ্দ করতে চান?`
                                : `Warning: This email (${cleanVal}) is already assigned to "${duplicateTeam.name}". Do you want to proceed?`;
                              if (!window.confirm(confirmMsg)) {
                                return;
                              }
                            }
                          }
                          await updateTeamField(team.id, 'userEmail', cleanVal, team, currentUser?.email || 'admin');
                        }}
                        label={language === 'bn' ? 'দলের লগইন ইমেইল (Gmail)' : 'Team Login Email (Gmail)'}
                        pencilClassName="text-slate-500 hover:text-sky-400"
                      />
                    )}
                  </div>
                ) : (
                  <div className="mt-2 text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-300 px-2.5 py-1.5 rounded-md flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1 truncate pr-1">
                      <span>⚠️</span>
                      <span className="truncate">{language === 'bn' ? 'কোনো ম্যানেজার ইমেইল বরাদ্দ নেই (ডাক প্রদান নিষ্ক্রিয়)' : 'No manager email assigned (Bidding disabled)'}</span>
                    </span>
                    {isAdmin && (
                      <button
                        onClick={() => setEditingTeam(team)}
                        className="text-amber-400 hover:text-amber-200 underline text-[10px] font-bold shrink-0 cursor-pointer"
                        title={language === 'bn' ? 'ম্যানেজার জিমেইল বরাদ্দ করুন' : 'Assign Manager Gmail'}
                      >
                        {language === 'bn' ? 'বরাদ্দ করুন' : 'Assign'}
                      </button>
                    )}
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

                {/* Admin Budget Reset & Test Deduction Correction Button */}
                {isAdmin && (
                  <div className="pt-2.5">
                    <button
                      onClick={() => setBudgetResetTeam(team)}
                      className="w-full py-1.5 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer group"
                      title={language === 'bn' ? 'দলের বাজেট রিসেট অথবা টেস্ট কর্তন সংশোধন করুন' : 'Reset budget or correct test deductions'}
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400 group-hover:-rotate-45 transition-transform" />
                      <span>{language === 'bn' ? 'বাজেট রিসেট ও টেস্ট কর্তন সংশোধন' : 'Reset / Adjust Budget'}</span>
                    </button>
                  </div>
                )}
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
                  {language === 'bn' ? 'দলের লগইন ইমেইল (ম্যানেজারের Gmail)' : 'Assigned Team Login Email (Manager Gmail)'}
                </label>
                <input
                  type="email"
                  placeholder="manager@gmail.com"
                  value={userEmail}
                  onChange={e => setUserEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {language === 'bn'
                    ? 'ম্যানেজার এই জিমেইল দিয়ে লগইন করলে শুধুমাত্র এই দলের হয়ে লাইভ নিলামে ডাক দিতে পারবেন।'
                    : 'Manager logging in with this Gmail will be strictly bound to bid for this team only.'}
                </p>
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
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400">{language === 'bn' ? 'দলের অফিসিয়াল লোগো' : 'Official Team Logo'}</label>
                  <button
                    type="button"
                    onClick={() => setLogoEditTeam(editingTeam)}
                    className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold text-[11px] cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'ফাইল / গ্যালারি থেকে আপলোড' : 'Upload File / Photo'}</span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden border border-slate-700 shadow-sm"
                    style={{ backgroundColor: editingTeam.color || '#10b981' }}
                  >
                    {editingTeam.logoUrl ? (
                      <img src={editingTeam.logoUrl} alt={editingTeam.name} className="w-full h-full object-cover" />
                    ) : (
                      editingTeam.name.charAt(0)
                    )}
                  </div>
                  <input
                    type="url"
                    placeholder="https://.../logo.png"
                    value={editingTeam.logoUrl || ''}
                    onChange={e => setEditingTeam({ ...editingTeam, logoUrl: e.target.value })}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-xs"
                  />
                </div>
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
                  {language === 'bn' ? 'দলের লগইন ইমেইল (ম্যানেজারের Gmail)' : 'Assigned Team Login Email (Manager Gmail)'}
                </label>
                <input
                  type="email"
                  placeholder="manager@gmail.com"
                  value={editingTeam.loginEmail || editingTeam.userEmail || ''}
                  onChange={e => setEditingTeam({ ...editingTeam, userEmail: e.target.value, loginEmail: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {language === 'bn'
                    ? 'দলের অনুমোদিত Gmail ঠিকানা। ম্যানেজার এই জিমেইল দিয়ে লগইন করলে শুধুমাত্র এই দলের হয়ে ডাক দিতে পারবেন।'
                    : 'Authorized manager Gmail. Only this email account can submit live bids for this team.'}
                </p>
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

      {/* Team Official Logo Modal */}
      <TeamLogoModal
        team={logoEditTeam}
        isOpen={Boolean(logoEditTeam)}
        onClose={() => setLogoEditTeam(null)}
        currentSeasonId={currentSeasonId}
        onLogoUpdated={(teamId, newLogoUrl) => {
          if (editingTeam && editingTeam.id === teamId) {
            setEditingTeam({ ...editingTeam, logoUrl: newLogoUrl });
          }
        }}
      />

      {/* Team Budget Reset & Manual Correction Modal */}
      <TeamBudgetResetModal
        team={budgetResetTeam}
        isOpen={Boolean(budgetResetTeam)}
        onClose={() => setBudgetResetTeam(null)}
      />
    </div>
  );
};
