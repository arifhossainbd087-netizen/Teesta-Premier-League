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
  X,
  Save,
} from 'lucide-react';
import { Player, PlayerPosition, PlayerCategory, ApprovalStatus, AuctionStatus, Season } from '../types';
import {
  formatBDT,
  getPositionBadgeColor,
  getPositionLabel,
  getAuctionStatusInfo,
  getApprovalStatusInfo,
} from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, updateDoc, deleteDoc, collection, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { PlayerPhotoUploader } from './PlayerPhotoUploader';
import { loadPlayerToAuction, safeDeletePlayer } from '../services/auctionService';
import { EditableText } from './common/EditableText';
import { updatePlayerField } from '../services/editService';
import { RegistrationSettingsModal } from './RegistrationSettingsModal';
import {
  updatePlayerFormNumber,
  parseNumericFormValue,
  toBengaliDigits,
} from '../services/registrationService';

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
  const { isAdmin, isSuperAdmin, language, currentUser } = useAuth();
  const isSuperAdminEmail =
    isSuperAdmin || (currentUser?.email || '').trim().toLowerCase() === 'arifhossainbd087@gmail.com';

  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'sold' | 'unsold'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPosition, setSelectedPosition] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'formAsc' | 'formDesc' | 'createdDesc' | 'nameAsc'>('formAsc');
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [isRegSettingsOpen, setIsRegSettingsOpen] = useState(false);

  // Dedicated Form Number Editing Modal state (Super Admin only: arifhossainbd087@gmail.com)
  const [formNumberEditPlayer, setFormNumberEditPlayer] = useState<Player | null>(null);
  const [newFormNumberInput, setNewFormNumberInput] = useState<string>('');
  const [isSavingFormNumber, setIsSavingFormNumber] = useState<boolean>(false);
  const [formNumberError, setFormNumberError] = useState<string | null>(null);
  const [formNumberSuccess, setFormNumberSuccess] = useState<string | null>(null);

  // Dedicated Category and Base Price Editing Modal state
  const [categoryPricePlayer, setCategoryPricePlayer] = useState<Player | null>(null);
  const [editCategory, setEditCategory] = useState<PlayerCategory>('A');
  const [editBasePrice, setEditBasePrice] = useState<string>('0');
  const [isSavingCategoryPrice, setIsSavingCategoryPrice] = useState<boolean>(false);
  const [categoryPriceError, setCategoryPriceError] = useState<string | null>(null);
  const [categoryPriceSuccess, setCategoryPriceSuccess] = useState<string | null>(null);

  // Dedicated Player Deletion Confirmation Modal state
  const [playerToDelete, setPlayerToDelete] = useState<Player | null>(null);
  const [isDeletingPlayer, setIsDeletingPlayer] = useState<boolean>(false);
  const [deleteFeedback, setDeleteFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleOpenCategoryPriceModal = (player: Player) => {
    if (!isAdmin) return;
    setCategoryPricePlayer(player);
    setEditCategory((player.category || 'A') as PlayerCategory);
    setEditBasePrice(
      player.basePrice !== undefined && player.basePrice !== null ? String(player.basePrice) : '0'
    );
    setCategoryPriceError(null);
    setCategoryPriceSuccess(null);
  };

  const handleSaveCategoryAndBasePrice = async () => {
    if (!categoryPricePlayer) return;
    setCategoryPriceError(null);
    setCategoryPriceSuccess(null);

    const trimmed = editBasePrice.trim();
    if (trimmed === '') {
      setCategoryPriceError(
        language === 'bn' ? 'অনুগ্রহ করে একটি ভিত্তিমূল্য লিখুন।' : 'Please enter a base price.'
      );
      return;
    }

    const parsedPrice = parseInt(trimmed, 10);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setCategoryPriceError(
        language === 'bn'
          ? 'ভিত্তিমূল্য ০ বা তার বেশি যেকোনো পূর্ণসংখ্যা হতে হবে।'
          : 'Base price must be a non-negative whole number (0 or higher).'
      );
      return;
    }

    setIsSavingCategoryPrice(true);
    try {
      const playerDocRef = doc(db, 'players', categoryPricePlayer.id);
      await updateDoc(playerDocRef, {
        category: editCategory,
        basePrice: parsedPrice,
        updatedAt: new Date().toISOString(),
      });

      // Synchronize live auction board if this player is currently loaded on the active board
      try {
        const auctionSnap = await getDoc(doc(db, 'auction', 'current'));
        if (auctionSnap.exists()) {
          const aData = auctionSnap.data();
          if (aData.currentPlayerId === categoryPricePlayer.id) {
            const auctionUpdates: any = {
              currentPlayerCategory: editCategory,
              currentBasePrice: parsedPrice,
              updatedAt: new Date().toISOString(),
            };
            if (!aData.highestBidderTeamId || aData.currentBid <= aData.currentBasePrice) {
              auctionUpdates.currentBid = parsedPrice;
            }
            await updateDoc(doc(db, 'auction', 'current'), auctionUpdates);
          }
        }
      } catch (auctionSyncErr) {
        console.warn('Sync to live auction board notice:', auctionSyncErr);
      }

      // Record audit log
      try {
        const auditRef = doc(collection(db, 'auditLogs'));
        await setDoc(auditRef, {
          action: 'CATEGORY_BASEPRICE_UPDATED',
          actorEmail: currentUser?.email || 'admin',
          actorRole: 'admin',
          details: `${categoryPricePlayer.name} এর ক্যাটেগরি "${editCategory}" ও ভিত্তিমূল্য ৳${parsedPrice.toLocaleString()} নির্ধারণ করা হয়েছে।`,
          timestamp: new Date().toISOString(),
        });
      } catch {}

      setCategoryPriceSuccess(
        language === 'bn'
          ? 'ক্যাটেগরি ও ভিত্তিমূল্য সফলভাবে সংরক্ষিত হয়েছে।'
          : 'Category and base price saved successfully.'
      );

      setTimeout(() => {
        setCategoryPricePlayer(null);
        setCategoryPriceSuccess(null);
      }, 900);
    } catch (err: any) {
      console.error('Failed to update category and base price:', err);
      setCategoryPriceError(
        err?.message ||
          (language === 'bn' ? 'সংরক্ষণ করতে ব্যর্থ হয়েছে।' : 'Failed to save changes.')
      );
    } finally {
      setIsSavingCategoryPrice(false);
    }
  };

  const handleOpenFormNumberModal = (player: Player) => {
    if (!isSuperAdminEmail) return;
    setFormNumberEditPlayer(player);
    const currentVal =
      typeof player.formNumericValue === 'number' && !isNaN(player.formNumericValue)
        ? player.formNumericValue
        : parseNumericFormValue(player.formNumber);
    setNewFormNumberInput(currentVal > 0 ? String(currentVal) : '');
    setFormNumberError(null);
    setFormNumberSuccess(null);
  };

  const handleSaveFormNumber = async () => {
    if (!formNumberEditPlayer) return;
    const num = parseInt(newFormNumberInput.trim(), 10);
    if (isNaN(num) || num < 1) {
      setFormNumberError(
        language === 'bn'
          ? 'ফরম নম্বর অবশ্যই ১ বা তার বেশি ধনাত্মক পূর্ণসংখ্যা হতে হবে।'
          : 'Form number must be an integer >= 1.'
      );
      return;
    }

    setIsSavingFormNumber(true);
    setFormNumberError(null);
    setFormNumberSuccess(null);

    try {
      const adminEmail = currentUser?.email || 'arifhossainbd087@gmail.com';
      const seasonId = formNumberEditPlayer.seasonId || currentSeason?.id || 'season-2-2026';
      const result = await updatePlayerFormNumber(
        formNumberEditPlayer.id,
        num,
        seasonId,
        adminEmail
      );

      if (!result.success) {
        setFormNumberError(result.error || 'ফরম নম্বর আপডেট করতে ব্যর্থ হয়েছে।');
        setIsSavingFormNumber(false);
        return;
      }

      setFormNumberSuccess(
        language === 'bn'
          ? `খেলোয়াড় "${formNumberEditPlayer.name}" এর ফরম নম্বর সফলভাবে পরিবর্তন হয়েছে!`
          : `Form number for "${formNumberEditPlayer.name}" updated successfully!`
      );

      // Keep success message visible briefly before closing
      setTimeout(() => {
        setFormNumberEditPlayer(null);
        setIsSavingFormNumber(false);
        setFormNumberSuccess(null);
      }, 1100);
    } catch (err: any) {
      setFormNumberError(err?.message || 'ফরম নম্বর সংরক্ষণে ত্রুটি ঘটেছে');
      setIsSavingFormNumber(false);
    }
  };

  // Filter players
  const filteredPlayers = players.filter(player => {
    // Status tab filter
    if (activeTab === 'pending' && player.approvalStatus !== 'pending') return false;
    if (activeTab === 'approved' && player.approvalStatus !== 'approved') return false;
    if (activeTab === 'sold' && player.auctionStatus !== 'sold') return false;
    if (activeTab === 'unsold' && player.auctionStatus !== 'unsold') return false;

    // Position filter (support safe legacy mapping)
    if (selectedPosition !== 'all') {
      const pos = player.position;
      if (selectedPosition === 'Forward') {
        if (pos !== 'Forward' && String(pos).toLowerCase() !== 'forward') return false;
      } else if (pos !== selectedPosition) {
        return false;
      }
    }

    // Category filter
    if (selectedCategory !== 'all') {
      const cat = player.category || 'A';
      if (cat !== selectedCategory) return false;
    }

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

  // Sort players (defaults to Form Number 1, 2, 3...)
  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    const numA =
      typeof a.formNumericValue === 'number' && a.formNumericValue > 0
        ? a.formNumericValue
        : parseNumericFormValue(a.formNumber);
    const numB =
      typeof b.formNumericValue === 'number' && b.formNumericValue > 0
        ? b.formNumericValue
        : parseNumericFormValue(b.formNumber);

    if (sortBy === 'formAsc') {
      if (numA > 0 && numB > 0) return numA - numB;
      if (numA > 0) return -1;
      if (numB > 0) return 1;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    }
    if (sortBy === 'formDesc') {
      if (numA > 0 && numB > 0) return numB - numA;
      if (numA > 0) return -1;
      if (numB > 0) return 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    }
    if (sortBy === 'createdDesc') {
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    }
    if (sortBy === 'nameAsc') {
      return (a.name || '').localeCompare(b.name || '');
    }
    return 0;
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

  // Admin Delete Player - opens Bengali confirmation dialog
  const handleInitiateDeletePlayer = (player: Player) => {
    if (!isAdmin || !currentUser) {
      setDeleteFeedback({
        type: 'error',
        message:
          language === 'bn'
            ? 'শুধুমাত্র অনুমোদিত অ্যাডমিন (arifhossainbd087@gmail.com) খেলোয়াড় মুছতে পারবেন।'
            : 'Only authorized administrator (arifhossainbd087@gmail.com) can delete players.',
      });
      return;
    }
    setDeleteFeedback(null);
    setPlayerToDelete(player);
  };

  // Safe Execute Player Deletion
  const handleConfirmDeletePlayer = async () => {
    if (!playerToDelete) return;
    if (!isAdmin || !currentUser) {
      setDeleteFeedback({
        type: 'error',
        message:
          language === 'bn'
            ? 'শুধুমাত্র অনুমোদিত অ্যাডমিন (arifhossainbd087@gmail.com) খেলোয়াড় মুছতে পারবেন।'
            : 'Only authorized administrator can delete players.',
      });
      return;
    }

    setIsDeletingPlayer(true);
    setDeleteFeedback(null);

    try {
      const res = await safeDeletePlayer(
        playerToDelete.id,
        playerToDelete.name,
        currentUser.email || 'admin',
        currentSeason?.id || 'season-2-2026'
      );

      if (res.success) {
        setDeleteFeedback({
          type: 'success',
          message:
            res.message ||
            (language === 'bn'
              ? `খেলোয়াড় "${playerToDelete.name}" সফলভাবে মুছে ফেলা হয়েছে।`
              : `Player "${playerToDelete.name}" was successfully deleted.`),
        });
        setTimeout(() => {
          setPlayerToDelete(null);
          setIsDeletingPlayer(false);
          setTimeout(() => setDeleteFeedback(null), 4000);
        }, 700);
      } else {
        setDeleteFeedback({
          type: 'error',
          message:
            res.message ||
            (language === 'bn'
              ? 'খেলোয়াড় মুছে ফেলতে ব্যর্থ হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।'
              : 'Failed to delete player. Please try again.'),
        });
        setIsDeletingPlayer(false);
      }
    } catch (err: any) {
      console.error('Error deleting player:', err);
      setDeleteFeedback({
        type: 'error',
        message:
          err?.message ||
          (language === 'bn'
            ? 'সার্ভার বা ডেটাবেস ত্রুটির কারণে খেলোয়াড় মুছে ফেলা যায়নি।'
            : 'Failed to delete player due to a database or permission error.'),
      });
      setIsDeletingPlayer(false);
    }
  };

  // Admin Edit Base Price & Category Save
  const handleSaveEdit = async () => {
    if (!editingPlayer) return;
    try {
      const parsedBasePrice =
        typeof editingPlayer.basePrice === 'string'
          ? ((editingPlayer.basePrice as string).trim() === '' ? 0 : Math.max(0, parseInt(editingPlayer.basePrice, 10) || 0))
          : Math.max(0, Number(editingPlayer.basePrice) || 0);

      const targetCategory = (editingPlayer.category || 'A') as PlayerCategory;

      // If Super Admin modified the form number in this modal, update it with duplicate validation
      if (
        isSuperAdminEmail &&
        typeof editingPlayer.formNumericValue === 'number' &&
        editingPlayer.formNumericValue > 0
      ) {
        const origPlayer = players.find(p => p.id === editingPlayer.id);
        const origVal =
          typeof origPlayer?.formNumericValue === 'number'
            ? origPlayer.formNumericValue
            : parseNumericFormValue(origPlayer?.formNumber);
        if (editingPlayer.formNumericValue !== origVal) {
          const formResult = await updatePlayerFormNumber(
            editingPlayer.id,
            editingPlayer.formNumericValue,
            editingPlayer.seasonId || currentSeason?.id || 'season-2-2026',
            currentUser?.email || 'arifhossainbd087@gmail.com'
          );
          if (!formResult.success) {
            alert(formResult.error || 'ফরম নম্বর আপডেট করতে ব্যর্থ হয়েছে');
            return;
          }
        }
      }

      await updateDoc(doc(db, 'players', editingPlayer.id), {
        name: editingPlayer.name,
        banglaName: editingPlayer.banglaName || editingPlayer.name,
        basePrice: parsedBasePrice,
        position: editingPlayer.position,
        category: targetCategory,
        age: editingPlayer.age,
        area: editingPlayer.area,
        photoUrl: editingPlayer.photoUrl || '',
        updatedAt: new Date().toISOString(),
      });

      // Update auction board immediately if this player is currently loaded on the live auction board
      try {
        const auctionSnap = await getDoc(doc(db, 'auction', 'current'));
        if (auctionSnap.exists()) {
          const aData = auctionSnap.data();
          if (aData.currentPlayerId === editingPlayer.id) {
            const auctionUpdates: any = {
              currentPlayerName: editingPlayer.name,
              currentPlayerPosition: editingPlayer.position,
              currentPlayerCategory: targetCategory,
              currentPlayerAge: editingPlayer.age,
              currentPlayerArea: editingPlayer.area,
              currentBasePrice: parsedBasePrice,
              updatedAt: new Date().toISOString(),
            };
            // If no bid has been placed yet, also update currentBid to the new base price
            if (!aData.highestBidderTeamId || aData.currentBid <= aData.currentBasePrice) {
              auctionUpdates.currentBid = parsedBasePrice;
            }
            await updateDoc(doc(db, 'auction', 'current'), auctionUpdates);
          }
        }
      } catch (auctionErr) {
        console.warn('Could not update live auction board with player edits:', auctionErr);
      }

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
          {isSuperAdminEmail && (
            <button
              onClick={() => setIsRegSettingsOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition-all cursor-pointer"
              title={language === 'bn' ? 'ফরম নম্বর সেটিংস কনফিগার করুন (সুপার অ্যাডমিন)' : 'Configure Form Number Settings (Super Admin)'}
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

      {/* Toast Feedback for Player Deletion */}
      {deleteFeedback && !playerToDelete && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between border shadow-lg animate-in fade-in ${
            deleteFeedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {deleteFeedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{deleteFeedback.message}</span>
          </div>
          <button
            onClick={() => setDeleteFeedback(null)}
            className="p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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

          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedPosition}
              onChange={e => setSelectedPosition(e.target.value)}
              className="bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer flex-1 sm:flex-none"
            >
              <option value="all">{language === 'bn' ? 'সকল পজিশন' : 'All Positions'}</option>
              <option value="Forward">{language === 'bn' ? 'স্ট্রাইকার (Striker)' : 'Striker'}</option>
              <option value="Midfielder">{language === 'bn' ? 'মিডফিল্ডার (Midfielder)' : 'Midfielder'}</option>
              <option value="Defender">{language === 'bn' ? 'ডিফেন্ডার (Defender)' : 'Defender'}</option>
              <option value="Goalkeeper">{language === 'bn' ? 'গোলকিপার (Goalkeeper)' : 'Goalkeeper'}</option>
            </select>

            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="bg-slate-950 border border-red-500/40 rounded-xl px-3 py-2 text-xs text-red-300 focus:outline-none focus:border-red-500 cursor-pointer flex-1 sm:flex-none font-semibold"
            >
              <option value="all">{language === 'bn' ? 'সকল ক্যাটেগরি' : 'All Categories'}</option>
              <option value="A">ক্যাটেগরি A (৳৪,০০০)</option>
              <option value="B">ক্যাটেগরি B (৳৩,০০০)</option>
              <option value="C">ক্যাটেগরি C (৳২,০০০)</option>
              <option value="D">ক্যাটেগরি D (৳১,৫০০)</option>
            </select>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-slate-950 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-amber-300 focus:outline-none focus:border-amber-500 cursor-pointer flex-1 sm:flex-none font-semibold"
              title={language === 'bn' ? 'খেলোয়াড় তালিকা সাজান' : 'Sort Players'}
            >
              <option value="formAsc">{language === 'bn' ? 'ফরম নম্বর (১, ২, ৩...)' : 'Form No. (1, 2, 3...)'}</option>
              <option value="formDesc">{language === 'bn' ? 'ফরম নম্বর (বড় থেকে ছোট)' : 'Form No. (High to Low)'}</option>
              <option value="createdDesc">{language === 'bn' ? 'নতুন নিবন্ধন প্রথমে' : 'Newest Registration First'}</option>
              <option value="nameAsc">{language === 'bn' ? 'নাম অনুযায়ী (A-Z)' : 'Name (A-Z)'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Players Cards Grid */}
      {sortedPlayers.length === 0 ? (
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
          {sortedPlayers.map(player => {
            const auctionInfo = getAuctionStatusInfo(player.auctionStatus);
            const approvalInfo = getApprovalStatusInfo(player.approvalStatus);

            return (
              <div
                key={player.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between hover:border-slate-700 transition-all space-y-3"
              >
                <div>
                  {/* Card Header: Position, Red-Bordered Category, & Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <EditableText
                        value={player.position}
                        type="select"
                        options={[
                          { value: 'Forward', label: 'স্ট্রাইকার (Striker)' },
                          { value: 'Midfielder', label: 'মিডফিল্ডার (Midfielder)' },
                          { value: 'Defender', label: 'ডিফেন্ডার (Defender)' },
                          { value: 'Goalkeeper', label: 'গোলকিপার (Goalkeeper)' },
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

                      {/* Prominent Red-Bordered Category Badge (red dage category) */}
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenCategoryPriceModal(player)}
                          disabled={!isAdmin}
                          className={`text-[11px] px-2.5 py-0.5 rounded-md font-bold bg-red-950/80 text-red-300 border-2 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.35)] tracking-wide transition-all ${
                            isAdmin ? 'cursor-pointer hover:border-red-400 hover:bg-red-900/90 active:scale-95' : ''
                          }`}
                          title={isAdmin ? (language === 'bn' ? 'ক্যাটেগরি ও ভিত্তিমূল্য সম্পাদনা করতে ক্লিক করুন' : 'Click to edit category and base price') : undefined}
                        >
                          {player.category ? `ক্যাটেগরি ${player.category}` : 'ক্যাটেগরি A'}
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleOpenCategoryPriceModal(player)}
                            className="p-1 rounded-md text-red-400 hover:text-white hover:bg-red-500/20 transition-colors cursor-pointer"
                            title={language === 'bn' ? 'ক্যাটেগরি ও ভিত্তিমূল্য সম্পাদনা' : 'Edit Category & Base Price'}
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {(player.formNumber || isSuperAdminEmail) && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono font-medium flex items-center gap-1">
                          <span>
                            {player.formNumber ||
                              (player.formNumericValue
                                ? `ফরম নং:- ${toBengaliDigits(player.formNumericValue)}`
                                : language === 'bn'
                                ? 'ফরম নম্বর দিন'
                                : 'No Form No.')}
                          </span>
                          {isSuperAdminEmail && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                handleOpenFormNumberModal(player);
                              }}
                              title={
                                language === 'bn'
                                  ? 'ফরম নম্বর পরিবর্তন করুন (সুপার অ্যাডমিন)'
                                  : 'Edit Form Number (Super Admin)'
                              }
                              className="text-amber-400 hover:text-amber-100 hover:bg-amber-500/30 rounded p-0.5 transition-colors cursor-pointer ml-0.5"
                            >
                              <Edit2 className="w-2.5 h-2.5" />
                            </button>
                          )}
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
                        min={0}
                        onSave={async (val) => {
                          await updatePlayerField(player.id, 'basePrice', Number(val), currentUser?.email || 'admin');
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
                        onClick={() => handleOpenCategoryPriceModal(player)}
                        className="p-1.5 rounded-lg text-emerald-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                        title={language === 'bn' ? 'ক্যাটেগরি ও ভিত্তিমূল্য সম্পাদনা' : 'Edit Category & Base Price'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleInitiateDeletePlayer(player)}
                        disabled={isDeletingPlayer}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40"
                        title={language === 'bn' ? 'খেলোয়াড় মুছুন' : 'Delete Player'}
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

              {/* Form Number (Super Admin editable / Others read-only) */}
              {isSuperAdminEmail ? (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-amber-300 font-semibold flex items-center gap-1.5 text-xs">
                      <Edit2 className="w-3 h-3 text-amber-400" />
                      <span>{language === 'bn' ? 'ফরম নম্বর (সুপার অ্যাডমিন)' : 'Form Number (Super Admin)'}</span>
                    </label>
                    <span className="text-[10px] text-amber-400 font-mono">
                      {editingPlayer.formNumber || 'ফরম নং নেই'}
                    </span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={
                      typeof editingPlayer.formNumericValue === 'number' && !isNaN(editingPlayer.formNumericValue)
                        ? editingPlayer.formNumericValue
                        : parseNumericFormValue(editingPlayer.formNumber) || ''
                    }
                    onChange={e => {
                      const val = parseInt(e.target.value, 10);
                      setEditingPlayer({
                        ...editingPlayer,
                        formNumericValue: isNaN(val) ? ('' as any) : val,
                      });
                    }}
                    placeholder="যেমন: ৪, ১২, ৪১"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono text-xs"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {language === 'bn'
                      ? 'সুপার অ্যাডমিন হিসেবে যেকোনো মুক্ত নম্বর নির্ধারণ করতে পারেন। ডুপ্লিকেট নম্বর স্বয়ংক্রিয়ভাবে প্রত্যাখ্যাত হবে।'
                      : 'As Super Admin you can set any unused form number. Duplicates are rejected.'}
                  </p>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400 text-xs">
                    {language === 'bn' ? 'অফিসিয়াল ফরম নম্বর:' : 'Official Form Number:'}
                  </span>
                  <span className="text-amber-400 font-mono font-bold text-xs">
                    {editingPlayer.formNumber || (editingPlayer.formNumericValue ? `ফরম নং:- ${toBengaliDigits(editingPlayer.formNumericValue)}` : 'N/A')}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">
                    {language === 'bn' ? 'ভিত্তিমূল্য (৳)' : 'Base Price (BDT)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editingPlayer.basePrice !== undefined && editingPlayer.basePrice !== null ? editingPlayer.basePrice : ''}
                    onChange={e => {
                      const val = e.target.value;
                      setEditingPlayer({
                        ...editingPlayer,
                        basePrice: val === '' ? ('' as any) : Math.max(0, parseInt(val, 10) || 0),
                      });
                    }}
                    placeholder="০"
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <option value="Forward">{language === 'bn' ? 'স্ট্রাইকার (Striker)' : 'Striker'}</option>
                    <option value="Midfielder">{language === 'bn' ? 'মিডফিল্ডার (Midfielder)' : 'Midfielder'}</option>
                    <option value="Defender">{language === 'bn' ? 'ডিফেন্ডার (Defender)' : 'Defender'}</option>
                    <option value="Goalkeeper">{language === 'bn' ? 'গোলকিপার (Goalkeeper)' : 'Goalkeeper'}</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">
                    {language === 'bn' ? 'ক্যাটেগরি' : 'Category'}
                  </label>
                  <select
                    value={editingPlayer.category || 'A'}
                    onChange={e => {
                      const newCat = e.target.value as PlayerCategory;
                      // Category and base price are independent - do not force a fixed base price
                      setEditingPlayer({
                        ...editingPlayer,
                        category: newCat,
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-bold cursor-pointer"
                  >
                    <option value="A">ক্যাটেগরি A</option>
                    <option value="B">ক্যাটেগরি B</option>
                    <option value="C">ক্যাটেগরি C</option>
                    <option value="D">ক্যাটেগরি D</option>
                  </select>
                </div>
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

      {/* Admin Category and Base Price Editing Modal */}
      {categoryPricePlayer && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
          onClick={() => {
            if (!isSavingCategoryPrice) {
              setCategoryPricePlayer(null);
              setCategoryPriceError(null);
              setCategoryPriceSuccess(null);
            }
          }}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-slate-100"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {language === 'bn' ? 'প্লেয়ার ক্যাটেগরি ও ভিত্তিমূল্য' : 'Player Category & Base Price'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {categoryPricePlayer.name} {categoryPricePlayer.formNumber ? `(${categoryPricePlayer.formNumber})` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isSavingCategoryPrice) {
                    setCategoryPricePlayer(null);
                    setCategoryPriceError(null);
                    setCategoryPriceSuccess(null);
                  }
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error and Success Notices */}
            {categoryPriceError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{categoryPriceError}</span>
              </div>
            )}
            {categoryPriceSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 font-medium">
                <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{categoryPriceSuccess}</span>
              </div>
            )}

            {/* Inputs Form */}
            <div className="space-y-4 pt-1">
              {/* Category Dropdown */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  {language === 'bn' ? 'প্লেয়ার ক্যাটেগরি' : 'Player Category'}
                </label>
                <select
                  value={editCategory}
                  onChange={e => setEditCategory(e.target.value as PlayerCategory)}
                  disabled={isSavingCategoryPrice}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-red-500 focus:ring-1 focus:ring-red-500 rounded-xl p-2.5 text-sm font-bold text-white cursor-pointer transition-all"
                >
                  <option value="A">ক্যাটেগরি A</option>
                  <option value="B">ক্যাটেগরি B</option>
                  <option value="C">ক্যাটেগরি C</option>
                  <option value="D">ক্যাটেগরি D</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {language === 'bn'
                    ? 'ক্যাটেগরি নির্বাচন ভিত্তিমূল্য পরিবর্তন করবে না। ভিত্তিমূল্য নিচে স্বাধীনভাবে নির্ধারণ করুন।'
                    : 'Selecting a category does not overwrite the manually entered base price.'}
                </p>
              </div>

              {/* Base Price Input */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center justify-between">
                  <span>{language === 'bn' ? 'ভিত্তিমূল্য (Base Price)' : 'Base Price (BDT)'}</span>
                  <span className="text-[11px] text-emerald-400 font-mono">
                    {formatBDT(parseInt(editBasePrice, 10) || 0)}
                  </span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                    ৳
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={editBasePrice}
                    onChange={e => setEditBasePrice(e.target.value)}
                    disabled={isSavingCategoryPrice}
                    placeholder="০"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl pl-8 pr-3 py-2.5 text-sm font-mono text-white placeholder-slate-600 transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {language === 'bn'
                    ? '০ বা তার বেশি যেকোনো পূর্ণসংখ্যা লিখুন (যেমন: ০, ২০০, ১৮০, ১৫০০)। কোনো ন্যূনতম বাধ্যবাধকতা নেই।'
                    : 'Any non-negative integer starting from 0 is permitted (e.g. 0, 200, 180, 1500). No minimum value restriction.'}
                </p>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  const p = categoryPricePlayer;
                  setCategoryPricePlayer(null);
                  setEditingPlayer(p);
                }}
                className="text-[11px] text-slate-400 hover:text-emerald-400 underline cursor-pointer"
              >
                {language === 'bn' ? 'সকল তথ্য সম্পাদনা' : 'Edit All Details'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCategoryPricePlayer(null);
                    setCategoryPriceError(null);
                    setCategoryPriceSuccess(null);
                  }}
                  disabled={isSavingCategoryPrice}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveCategoryAndBasePrice}
                  disabled={isSavingCategoryPrice}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-950 cursor-pointer transition-all"
                >
                  {isSavingCategoryPrice ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{language === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...'}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{language === 'bn' ? 'সংরক্ষণ করুন' : 'Save Changes'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Registration Settings Modal (Super Admin: arifhossainbd087@gmail.com) */}
      {isSuperAdminEmail && (
        <RegistrationSettingsModal
          isOpen={isRegSettingsOpen}
          onClose={() => setIsRegSettingsOpen(false)}
          language={language}
          currentUserEmail={currentUser?.email || ''}
          currentSeasonId={currentSeason?.id || 'season-2-2026'}
        />
      )}

      {/* Admin Delete Player Confirmation Modal */}
      {playerToDelete && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
          onClick={() => {
            if (!isDeletingPlayer) {
              setPlayerToDelete(null);
              setDeleteFeedback(null);
            }
          }}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-slate-100"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-white">
                {language === 'bn' ? 'খেলোয়াড় মুছে ফেলার নিশ্চিতকরণ' : 'Confirm Player Deletion'}
              </h3>
              <p className="text-xs text-slate-400">
                {language === 'bn'
                  ? 'আপনি কি নিশ্চিত যে এই খেলোয়াড়ের সমস্ত তথ্য স্থায়ীভাবে মুছে ফেলতে চান?'
                  : 'Are you sure you want to permanently delete this player record?'}
              </p>
            </div>

            {/* Player Details Summary Card */}
            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden shrink-0 flex items-center justify-center">
                {playerToDelete.photoUrl ? (
                  <img src={playerToDelete.photoUrl} alt={playerToDelete.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-6 h-6 text-slate-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-white text-sm truncate">{playerToDelete.name}</div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                  <span>{playerToDelete.formNumber || `ফরম নং ${playerToDelete.formNumericValue || 1}`}</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-semibold">{getPositionLabel(playerToDelete.position, language === 'bn')}</span>
                  <span>•</span>
                  <span className="text-amber-400 font-bold">ক্যাটেগরি {playerToDelete.category || 'A'}</span>
                  <span>•</span>
                  <span className="font-mono text-emerald-400">{formatBDT(playerToDelete.basePrice || 0)}</span>
                </div>
                {playerToDelete.auctionStatus === 'sold' && playerToDelete.winningTeamName && (
                  <div className="text-[11px] text-amber-300 font-medium mt-1">
                    ⚠️ বিক্রিত খেলোয়াড়: {playerToDelete.winningTeamName} (৳{playerToDelete.finalPrice?.toLocaleString()})
                  </div>
                )}
              </div>
            </div>

            {/* Safety Notice */}
            <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-3 text-[11px] text-rose-200 leading-relaxed space-y-1">
              <p className="font-semibold text-rose-300">
                {language === 'bn' ? 'নিরাপত্তা ও ডেটাবেস নিয়মাবলী:' : 'Safety & Database Notice:'}
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-[10px] text-slate-300">
                {playerToDelete.auctionStatus === 'sold' ? (
                  <li>এই খেলোয়াড় বিক্রিত হওয়ায় ক্রেতা দলের খরচকৃত বাজেট স্বয়ংক্রিয়ভাবে ফেরত দেওয়া হবে।</li>
                ) : (
                  <li>এই খেলোয়াড়ের রেজিস্ট্রেশন রেকর্ড ডেটাবেস থেকে নিরাপদভাবে মুছে ফেলা হবে।</li>
                )}
                <li>বরাদ্দকৃত ফরম নম্বর অক্ষত থাকবে এবং অন্য কাউকে পুনরাবৃত্তি করা হবে না।</li>
                <li>লাইভ নিলাম বোর্ডে সক্রিয় থাকা অবস্থায় খেলোয়াড়কে মোছা যাবে না।</li>
              </ul>
            </div>

            {/* Error Feedback if any */}
            {deleteFeedback && deleteFeedback.type === 'error' && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{deleteFeedback.message}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingPlayer}
                onClick={() => {
                  setPlayerToDelete(null);
                  setDeleteFeedback(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
              >
                {language === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={isDeletingPlayer}
                onClick={handleConfirmDeletePlayer}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow-lg shadow-rose-950 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeletingPlayer ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{language === 'bn' ? 'মুছে ফেলা হচ্ছে...' : 'Deleting...'}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'হ্যাঁ, মুছুন' : 'Yes, Delete'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Form Number Edit Modal (Super Admin: arifhossainbd087@gmail.com) */}
      {formNumberEditPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {language === 'bn' ? 'খেলোয়াড়ের ফরম নম্বর পরিবর্তন' : 'Edit Player Form Number'}
                  </h3>
                  <p className="text-[11px] text-amber-300/80">
                    {language === 'bn' ? 'সুপার অ্যাডমিন নিয়ন্ত্রণ (arifhossainbd087@gmail.com)' : 'Super Admin Control'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isSavingFormNumber) {
                    setFormNumberEditPlayer(null);
                    setFormNumberError(null);
                    setFormNumberSuccess(null);
                  }
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {/* Player Identity summary */}
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                  {formNumberEditPlayer.photoUrl ? (
                    <img
                      src={formNumberEditPlayer.photoUrl}
                      alt={formNumberEditPlayer.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-5 h-5 text-slate-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-white truncate">{formNumberEditPlayer.name}</h4>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                    <span>{formNumberEditPlayer.position}</span>
                    <span>•</span>
                    <span className="text-amber-400 font-mono">
                      {language === 'bn' ? 'বর্তমান ফরম: ' : 'Current Form: '}
                      {formNumberEditPlayer.formNumber || formNumberEditPlayer.formNumericValue || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Form Number Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {language === 'bn' ? 'নতুন ফরম নম্বর (ধনাত্মক পূর্ণসংখ্যা)' : 'New Form Number (Positive Integer)'}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={newFormNumberInput}
                    onChange={e => {
                      setNewFormNumberInput(e.target.value);
                      setFormNumberError(null);
                    }}
                    placeholder="যেমন: 4, 12, 25, 41"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 pointer-events-none">
                    {newFormNumberInput && !isNaN(parseInt(newFormNumberInput, 10)) && (
                      <span className="text-amber-400 font-medium">
                        {toBengaliDigits(parseInt(newFormNumberInput, 10))}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  {language === 'bn'
                    ? 'যেকোনো মুক্ত ফরম নম্বর নির্ধারণ করতে পারেন (যেমন ৮ থেকে ৪, অথবা ২৫ থেকে ১২)। যদি নম্বরটি ইতোমধ্যে অন্য কোনো খেলোয়াড়ের জন্য বরাদ্দ থাকে, তবে সিস্টেম আপনাকে সতর্ক করবে।'
                    : 'Assign any unused form number. Duplicate numbers will be rejected.'}
                </p>
              </div>

              {/* Feedback Alerts */}
              {formNumberError && (
                <div className="p-3 bg-red-950/50 border border-red-500/50 rounded-xl flex items-start gap-2 text-xs text-red-200">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{formNumberError}</span>
                </div>
              )}

              {formNumberSuccess && (
                <div className="p-3 bg-emerald-950/50 border border-emerald-500/50 rounded-xl flex items-center gap-2 text-xs text-emerald-200">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{formNumberSuccess}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setFormNumberEditPlayer(null);
                  setFormNumberError(null);
                  setFormNumberSuccess(null);
                }}
                disabled={isSavingFormNumber}
                className="px-3.5 py-2 rounded-xl border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                {language === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSaveFormNumber}
                disabled={isSavingFormNumber}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSavingFormNumber ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                    <span>{language === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...'}</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'ফরম নম্বর সংরক্ষণ' : 'Save Form Number'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
