import React, { useState } from 'react';
import {
  User,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Gavel,
  Shield,
  MapPin,
  Calendar,
  Phone,
  Tag,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertTriangle,
  Camera,
  Settings,
} from 'lucide-react';
import { Player, PlayerPosition, ApprovalStatus, AuctionStatus, Season } from '../types';
import {
  formatBDT,
  getPositionBadgeColor,
  getPositionLabel,
  getAuctionStatusInfo,
  getApprovalStatusInfo,
} from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, deleteDoc, collection, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { PlayerPhotoUploader } from './PlayerPhotoUploader';
import { loadPlayerToAuction } from '../services/auctionService';
import { EditableText } from './common/EditableText';
import { updatePlayerField } from '../services/editService';
import { RegistrationSettingsModal } from './RegistrationSettingsModal';

interface PlayerManagementProps {
  players: Player[];
  onOpenRegisterModal: () => void;
  onSelectForAuction: (player: Player) => void;
  currentSeason?: Season;
}

export const PlayerManagement: React.FC<PlayerManagementProps> = ({
  players,
  onOpenRegisterModal,
  onSelectForAuction,
  currentSeason,
}) => {
  const { isAdmin, language, currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'sold' | 'unsold'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPosition, setSelectedPosition] = useState<string>('all');
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [isRegSettingsOpen, setIsRegSettingsOpen] = useState(false);

  // Filter players
  const filteredPlayers = players.filter(player => {
    // Status tab filter
    if (activeTab === 'pending' && player.approvalStatus !== 'pending') return false;
    if (activeTab === 'approved' && player.approvalStatus !== 'approved') return false;
    if (activeTab === 'sold' && player.auctionStatus !== 'sold') return false;
    if (activeTab === 'unsold' && player.auctionStatus !== 'unsold') return false;

    // Position filter
    if (selectedPosition !== 'all' && player.position !== selectedPosition) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = player.name.toLowerCase().includes(q);
      const matchBangla = player.banglaName?.toLowerCase().includes(q);
      const matchArea = player.area?.toLowerCase().includes(q);
      const matchPhone = player.phone?.includes(q);
      if (!matchName && !matchBangla && !matchArea && !matchPhone) return false;
    }

    return true;
  });

  // Admin Approve / Reject actions
  const handleApprovalChange = async (playerId: string, status: ApprovalStatus) => {
    if (!currentUser) {
      alert(
        language === 'bn'
          ? 'অনুমোদন পরিচালনা করতে প্রথমে আপনার Google অ্যাডমিন অ্যাকাউন্ট (arifhossainbd087@gmail.com) দিয়ে লগইন করুন।'
          : 'Please sign in with your admin account to manage approvals.'
      );
      return;
    }
    try {
      await updateDoc(doc(db, 'players', playerId), {
        approvalStatus: status,
        updatedAt: new Date().toISOString(),
      });
      // Audit log
      const auditRef = doc(collection(db, 'auditLogs'));
      await setDoc(auditRef, {
        action: status === 'approved' ? 'PLAYER_APPROVED' : 'PLAYER_REJECTED',
        actorEmail: currentUser.email || 'admin',
        actorRole: 'admin',
        details: `খেলোয়াড় আইডি ${playerId} এর আবেদন ${status === 'approved' ? 'অনুমোদিত' : 'বাতিল'} করা হয়েছে।`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error changing approval:', err);
      alert('অনুমোদন পরিবর্তন করতে সমস্যা হয়েছে');
    }
  };

  // Admin Delete Player
  const handleDeletePlayer = async (playerId: string, name: string) => {
    if (!currentUser) {
      alert(language === 'bn' ? 'অনুগ্রহ করে অ্যাডমিন হিসেবে লগইন করুন।' : 'Please sign in as admin.');
      return;
    }
    if (!window.confirm(`${name} কে সম্পূর্ণ মুছে ফেলতে চান?`)) return;
    try {
      await deleteDoc(doc(db, 'players', playerId));
    } catch (err) {
      console.error('Error deleting player:', err);
    }
  };

  // Admin Edit Base Price Save
  const handleSaveEdit = async () => {
    if (!editingPlayer) return;
    try {
      await updateDoc(doc(db, 'players', editingPlayer.id), {
        name: editingPlayer.name,
        basePrice: editingPlayer.basePrice,
        position: editingPlayer.position,
        age: editingPlayer.age,
        area: editingPlayer.area,
        photoUrl: editingPlayer.photoUrl || '',
        updatedAt: new Date().toISOString(),
      });
      setEditingPlayer(null);
    } catch (err) {
      console.error('Error updating player:', err);
      alert('হালনাগাদ করতে ব্যর্থ হয়েছে');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <User className="w-6 h-6 text-emerald-400" />
            <span>{language === 'bn' ? 'খেলোয়াড় ড্রাফট ও নিলাম পুল' : 'Player Registry & Draft Pool'}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
            <span>
              {language === 'bn'
                ? `মোট নিবন্ধিত: ${players.length} জন খেলোয়াড়`
                : `Total Registered: ${players.length} players`}
            </span>
            {currentSeason && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-semibold">
                {currentSeason.name}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {isAdmin && (
            <button
              onClick={() => setIsRegSettingsOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition-all cursor-pointer"
              title={language === 'bn' ? 'ফরম নম্বর সেটিংস কনফিগার করুন' : 'Configure Form Number Settings'}
            >
              <Settings className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">{language === 'bn' ? 'ফরম সেটিংস' : 'Form Settings'}</span>
            </button>
          )}

          <button
            onClick={onOpenRegisterModal}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-950 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'bn' ? 'নতুন খেলোয়াড় নিবন্ধন' : 'Register Player'}</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl space-y-4">
        {/* Status Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          {[
            { id: 'all', label: language === 'bn' ? 'সকল খেলোয়াড়' : 'All', count: players.length },
            {
              id: 'pending',
              label: language === 'bn' ? 'অনুমোদনের অপেক্ষায়' : 'Pending',
              count: players.filter(p => p.approvalStatus === 'pending').length,
              color: 'text-amber-400',
            },
            {
              id: 'approved',
              label: language === 'bn' ? 'অনুমোদিত পুল' : 'Approved',
              count: players.filter(p => p.approvalStatus === 'approved').length,
              color: 'text-emerald-400',
            },
            {
              id: 'sold',
              label: language === 'bn' ? 'বিক্রিত (SOLD)' : 'Sold',
              count: players.filter(p => p.auctionStatus === 'sold').length,
              color: 'text-green-400',
            },
            {
              id: 'unsold',
              label: language === 'bn' ? 'অবিক্রিত (UNSOLD)' : 'Unsold',
              count: players.filter(p => p.auctionStatus === 'unsold').length,
              color: 'text-rose-400',
            },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-900 text-[10px] font-mono">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Position Select */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                language === 'bn'
                  ? 'খেলোয়াড়ের নাম, ফোন নম্বর বা এলাকা দিয়ে খুঁজুন...'
                  : 'Search by player name, phone or area...'
              }
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedPosition}
              onChange={e => setSelectedPosition(e.target.value)}
              className="bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer w-full sm:w-auto"
            >
              <option value="all">{language === 'bn' ? 'সকল পজিশন' : 'All Positions'}</option>
              <option value="Forward">{language === 'bn' ? 'ফরোয়ার্ড (Forward)' : 'Forward'}</option>
              <option value="Midfielder">{language === 'bn' ? 'মিডফিল্ডার (Midfielder)' : 'Midfielder'}</option>
              <option value="Defender">{language === 'bn' ? 'ডিফেন্ডার (Defender)' : 'Defender'}</option>
              <option value="Goalkeeper">{language === 'bn' ? 'গোলকিপার (Goalkeeper)' : 'Goalkeeper'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Players Cards Grid */}
      {filteredPlayers.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 space-y-2">
          <User className="w-12 h-12 mx-auto text-slate-600" />
          <p className="text-sm font-medium text-slate-400">
            {language === 'bn' ? 'কোনো খেলোয়াড় পাওয়া যায়নি' : 'No players found'}
          </p>
          <p className="text-xs text-slate-500">
            {language === 'bn'
              ? 'অনুগ্রহ করে ফিল্টার পরিবর্তন করুন অথবা নতুন খেলোয়াড় নিবন্ধন করুন।'
              : 'Try adjusting filters or register a new player.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlayers.map(player => {
            const auctionInfo = getAuctionStatusInfo(player.auctionStatus);
            const approvalInfo = getApprovalStatusInfo(player.approvalStatus);

            return (
              <div
                key={player.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between hover:border-slate-700 transition-all space-y-3"
              >
                <div>
                  {/* Card Header: Position & Status */}
                  <div className="flex items-center justify-between gap-2">
                    <EditableText
                      value={player.position}
                      type="select"
                      options={[
                        { value: 'Forward', label: 'ফরোয়ার্ড (Forward)' },
                        { value: 'Midfielder', label: 'মিডফিল্ডার (Midfielder)' },
                        { value: 'Defender', label: 'ডিফেন্ডার (Defender)' },
                        { value: 'Goalkeeper', label: 'গোলরক্ষক (Goalkeeper)' },
                      ]}
                      onSave={async (val) => {
                        await updatePlayerField(player.id, 'position', val, currentUser?.email || 'admin');
                      }}
                      label={language === 'bn' ? 'খেলোয়াড়ের পজিশন' : 'Player Position'}
                    >
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-md font-semibold border ${getPositionBadgeColor(
                          player.position
                        )}`}
                      >
                        {getPositionLabel(player.position, language === 'bn')}
                      </span>
                    </EditableText>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {player.formNumber && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono font-medium">
                          {player.formNumber}
                        </span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${auctionInfo.color}`}>
                        {auctionInfo.label}
                      </span>
                      {player.approvalStatus !== 'approved' && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full border ${approvalInfo.color}`}
                        >
                          {approvalInfo.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Player Identity */}
                  <div className="flex items-center gap-3 mt-3">
                    <div
                      onClick={() => {
                        if (isAdmin) setEditingPlayer(player);
                      }}
                      className={`w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 overflow-hidden relative group/avatar ${
                        isAdmin ? 'cursor-pointer hover:border-emerald-500/80 transition-colors' : ''
                      }`}
                      title={
                        isAdmin
                          ? language === 'bn'
                            ? 'ছবি পরিবর্তন বা সম্পাদনা করতে ক্লিক করুন'
                            : 'Click to edit or upload photo'
                          : undefined
                      }
                    >
                      <User className="w-6 h-6 text-slate-500 absolute" />
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

                      {isAdmin && (
                        <>
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity text-emerald-400 z-20">
                            <Camera className="w-4 h-4" />
                          </div>
                          <div
                            className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-slate-900 border border-slate-700 text-emerald-400 z-20 shadow"
                            title={language === 'bn' ? 'ছবি পরিবর্তন / সম্পাদনা' : 'Edit Photo'}
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="truncate flex-1">
                      <EditableText
                        value={player.name}
                        onSave={async (val) => {
                          await updatePlayerField(player.id, 'name', val, currentUser?.email || 'admin');
                        }}
                        label={language === 'bn' ? 'খেলোয়াড়ের নাম' : 'Player Name'}
                      >
                        <h4 className="text-sm font-bold text-white truncate">{player.name}</h4>
                      </EditableText>

                      <EditableText
                        value={player.banglaName || ''}
                        required={false}
                        onSave={async (val) => {
                          await updatePlayerField(player.id, 'banglaName', val, currentUser?.email || 'admin');
                        }}
                        label={language === 'bn' ? 'বাংলা নাম' : 'Bangla Name'}
                        placeholder={language === 'bn' ? 'বাংলা নাম লিখুন' : 'Enter Bangla name'}
                      >
                        <p className="text-xs text-slate-400 truncate">
                          {player.banglaName || (language === 'bn' ? 'বাংলা নাম নেই' : 'No Bangla Name')}
                        </p>
                      </EditableText>
                    </div>
                  </div>

                  {/* Meta Stats */}
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800 text-[11px]">
                    <div className="text-slate-400 flex items-center gap-1">
                      <span>{language === 'bn' ? 'বয়স:' : 'Age:'}</span>
                      <EditableText
                        value={player.age}
                        type="number"
                        min={12}
                        max={55}
                        onSave={async (val) => {
                          await updatePlayerField(player.id, 'age', val, currentUser?.email || 'admin');
                        }}
                        label={language === 'bn' ? 'খেলোয়াড়ের বয়স' : 'Player Age'}
                      >
                        <strong className="text-slate-200">{player.age}</strong>
                      </EditableText>
                    </div>

                    <div className="text-slate-400 truncate flex items-center gap-1">
                      <span>{language === 'bn' ? 'এলাকা:' : 'Area:'}</span>
                      <EditableText
                        value={player.area || ''}
                        onSave={async (val) => {
                          await updatePlayerField(player.id, 'area', val, currentUser?.email || 'admin');
                        }}
                        label={language === 'bn' ? 'এলাকা / ঠিকানা' : 'Area / Location'}
                      >
                        <strong className="text-slate-200 truncate">{player.area || 'N/A'}</strong>
                      </EditableText>
                    </div>

                    <div className="col-span-2 text-slate-400 truncate flex items-center gap-1">
                      <span>{language === 'bn' ? 'অভিজ্ঞতা:' : 'Club:'}</span>
                      <EditableText
                        value={player.prevClub || ''}
                        required={false}
                        onSave={async (val) => {
                          await updatePlayerField(player.id, 'prevClub', val, currentUser?.email || 'admin');
                        }}
                        label={language === 'bn' ? 'পূর্ববর্তী ক্লাব / অভিজ্ঞতা' : 'Club / Experience'}
                      >
                        <strong className="text-slate-300">{player.prevClub || 'N/A'}</strong>
                      </EditableText>
                    </div>

                    <div className="col-span-2 text-slate-400 truncate flex items-center gap-1">
                      <span>{language === 'bn' ? 'মোবাইল:' : 'Phone:'}</span>
                      <EditableText
                        value={player.phone || ''}
                        required={false}
                        onSave={async (val) => {
                          await updatePlayerField(player.id, 'phone', val, currentUser?.email || 'admin');
                        }}
                        label={language === 'bn' ? 'খেলোয়াড়ের মোবাইল নম্বর' : 'Player Phone'}
                        placeholder="017XXXXXXXX"
                      >
                        <strong className="text-slate-300 font-mono">{player.phone || 'N/A'}</strong>
                      </EditableText>
                    </div>
                  </div>

                  {/* Pricing / Sold Outcomes */}
                  <div className="mt-3 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400">
                        {language === 'bn' ? 'ভিত্তিমূল্য' : 'Base Price'}
                      </div>
                      <EditableText
                        value={player.basePrice}
                        type="number"
                        min={500}
                        onSave={async (val) => {
                          await updatePlayerField(player.id, 'basePrice', val, currentUser?.email || 'admin');
                        }}
                        label={language === 'bn' ? 'ভিত্তিমূল্য (Base Price)' : 'Base Price'}
                        pencilClassName="text-emerald-400 hover:text-emerald-300"
                      >
                        <div className="text-sm font-bold text-emerald-400 font-mono">
                          {formatBDT(player.basePrice)}
                        </div>
                      </EditableText>
                    </div>

                    {player.auctionStatus === 'sold' && (
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400">
                          {language === 'bn' ? 'বিক্রিত মূল্য' : 'Sold For'}
                        </div>
                        <div className="text-sm font-bold text-amber-300 font-mono">
                          {formatBDT(player.finalPrice || 0)}
                        </div>
                        <div className="text-[10px] text-emerald-400 truncate max-w-[120px]">
                          {player.winningTeamName}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Admin Actions Bar */}
                {isAdmin && (
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-1 flex-wrap">
                    {/* Direct to Live Auction */}
                    {player.approvalStatus === 'approved' && player.auctionStatus !== 'sold' && (
                      <button
                        onClick={() => onSelectForAuction(player)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 text-xs font-semibold border border-emerald-500/40 transition-colors cursor-pointer"
                        title="লাইভ নিলামে লোড করুন"
                      >
                        <Gavel className="w-3.5 h-3.5" />
                        <span>{language === 'bn' ? 'নিলামে তুলুন' : 'Auction Now'}</span>
                      </button>
                    )}

                    {/* Approve / Reject buttons */}
                    {player.approvalStatus === 'pending' && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleApprovalChange(player.id, 'approved')}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>{language === 'bn' ? 'অনুমোদন' : 'Approve'}</span>
                        </button>
                        <button
                          onClick={() => handleApprovalChange(player.id, 'rejected')}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>{language === 'bn' ? 'বাতিল' : 'Reject'}</span>
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-1 ml-auto">
                      <button
                        onClick={() => setEditingPlayer(player)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                        title="সম্পাদনা"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeletePlayer(player.id, player.name)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="মুছুন"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Player Modal */}
      {editingPlayer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-emerald-400" />
              <span>{language === 'bn' ? 'খেলোয়াড়ের তথ্য সম্পাদনা' : 'Edit Player Info'}</span>
            </h3>

            <div className="space-y-3 text-xs max-h-[72vh] overflow-y-auto pr-1">
              {/* Photo Uploader */}
              <PlayerPhotoUploader
                currentPhotoUrl={editingPlayer.photoUrl}
                onPhotoChanged={url => setEditingPlayer({ ...editingPlayer, photoUrl: url })}
                onSavedToFirestore={url => setEditingPlayer(prev => prev ? { ...prev, photoUrl: url } : null)}
                playerId={editingPlayer.id}
                seasonId={editingPlayer.seasonId || currentSeason?.id || 'season-2-2026'}
                language={language}
                isAdmin={isAdmin}
              />

              <div>
                <label className="text-slate-400 block mb-1">
                  {language === 'bn' ? 'খেলোয়াড়ের নাম' : 'Player Name'}
                </label>
                <input
                  type="text"
                  value={editingPlayer.name}
                  onChange={e => setEditingPlayer({ ...editingPlayer, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">
                    {language === 'bn' ? 'ভিত্তিমূল্য (৳)' : 'Base Price (BDT)'}
                  </label>
                  <input
                    type="number"
                    value={editingPlayer.basePrice}
                    onChange={e =>
                      setEditingPlayer({
                        ...editingPlayer,
                        basePrice: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">
                    {language === 'bn' ? 'বয়স' : 'Age'}
                  </label>
                  <input
                    type="number"
                    value={editingPlayer.age}
                    onChange={e =>
                      setEditingPlayer({
                        ...editingPlayer,
                        age: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  {language === 'bn' ? 'পজিশন' : 'Position'}
                </label>
                <select
                  value={editingPlayer.position}
                  onChange={e =>
                    setEditingPlayer({ ...editingPlayer, position: e.target.value as PlayerPosition })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white cursor-pointer"
                >
                  <option value="Forward">ফরোয়ার্ড (Forward)</option>
                  <option value="Midfielder">মিডফিল্ডার (Midfielder)</option>
                  <option value="Defender">ডিফেন্ডার (Defender)</option>
                  <option value="Goalkeeper">গোলকিপার (Goalkeeper)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  {language === 'bn' ? 'এলাকা / জেলা' : 'Area'}
                </label>
                <input
                  type="text"
                  value={editingPlayer.area}
                  onChange={e => setEditingPlayer({ ...editingPlayer, area: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setEditingPlayer(null)}
                className="px-3.5 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                {language === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
              >
                {language === 'bn' ? 'সংরক্ষণ করুন' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Registration Settings Modal */}
      {isAdmin && (
        <RegistrationSettingsModal
          isOpen={isRegSettingsOpen}
          onClose={() => setIsRegSettingsOpen(false)}
          language={language}
          currentUserEmail={currentUser?.email || 'admin'}
        />
      )}
    </div>
  );
};
