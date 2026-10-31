import React, { useState, useEffect, useMemo } from 'react';
import {
  Image as ImageIcon,
  Download,
  Share2,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  Search,
  Filter,
  Check,
  Copy,
  X,
  Sparkles,
  Trophy,
  Shield,
  Layers,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { AuctionPoster, Team, Season, Player } from '../types';
import {
  subscribeToPosters,
  downloadPosterImage,
  sharePoster,
  togglePosterVisibility,
  deletePoster,
  generateAndSavePoster,
} from '../services/posterService';
import { formatBDT } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';

interface PosterGalleryProps {
  currentSeason: Season;
  teams: Team[];
  players: Player[];
}

export const PosterGallery: React.FC<PosterGalleryProps> = ({
  currentSeason,
  teams,
  players,
}) => {
  const { language, isAdmin, currentUser } = useAuth();
  const [posters, setPosters] = useState<AuctionPoster[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'sold' | 'unsold'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewPoster, setPreviewPoster] = useState<AuctionPoster | null>(null);
  const [copiedPosterId, setCopiedPosterId] = useState<string | null>(null);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [posterToDelete, setPosterToDelete] = useState<AuctionPoster | null>(null);

  // Subscribe to posters for current season
  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToPosters(currentSeason.id, (loadedPosters) => {
      setPosters(loadedPosters);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentSeason.id]);

  // Flash status message helper
  const showMessage = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  };

  // Filter posters based on tab filter, search query, and visibility
  const filteredPosters = useMemo(() => {
    return posters.filter(poster => {
      // Visibility filter: Hide hidden posters from public non-admin viewers
      if (poster.hidden && !isAdmin) {
        return false;
      }

      // Status filter
      if (filter === 'sold' && poster.status !== 'sold') return false;
      if (filter === 'unsold' && poster.status !== 'unsold') return false;

      // Search filter (player name, form number, team name)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (poster.playerName || '').toLowerCase().includes(q);
        const matchesBangla = (poster.playerBanglaName || '').toLowerCase().includes(q);
        const matchesForm = (poster.playerFormNumber || '').toLowerCase().includes(q);
        const matchesTeam = (poster.winningTeamName || '').toLowerCase().includes(q);
        const matchesReg = (poster.playerRegistrationNumber || '').toLowerCase().includes(q);
        if (!matchesName && !matchesBangla && !matchesForm && !matchesTeam && !matchesReg) {
          return false;
        }
      }

      return true;
    });
  }, [posters, filter, searchQuery, isAdmin]);

  // Handle Download
  const handleDownload = async (poster: AuctionPoster) => {
    try {
      await downloadPosterImage(poster);
      showMessage('success', language === 'bn' ? 'পোস্টার ডাউনলোড শুরু হয়েছে!' : 'Poster download started!');
    } catch (err: any) {
      showMessage('error', language === 'bn' ? 'ডাউনলোড করতে ত্রুটি হয়েছে' : 'Download failed');
    }
  };

  // Handle Share / Copy
  const handleShare = async (poster: AuctionPoster) => {
    try {
      const res = await sharePoster(poster);
      if (res.method === 'clipboard') {
        setCopiedPosterId(poster.id);
        setTimeout(() => setCopiedPosterId(null), 3000);
        showMessage('success', language === 'bn' ? 'পোস্টারের বিবরণ ও লিংক ক্লিপবোর্ডে কপি হয়েছে!' : 'Caption and link copied to clipboard!');
      } else {
        showMessage('success', language === 'bn' ? 'শেয়ার ডায়ালগ খোলা হয়েছে' : 'Share dialog opened');
      }
    } catch {
      showMessage('error', language === 'bn' ? 'শেয়ার করতে ব্যর্থ হয়েছে' : 'Share failed');
    }
  };

  // Admin: Toggle visibility
  const handleToggleVisibility = async (poster: AuctionPoster) => {
    if (!isAdmin) return;
    setActionInProgressId(poster.id);
    const newHidden = !poster.hidden;
    const res = await togglePosterVisibility(poster.id, newHidden, currentUser?.email || 'admin');
    setActionInProgressId(null);
    if (res.success) {
      showMessage('success', res.message);
      setPosters(prev => prev.map(p => p.id === poster.id ? { ...p, hidden: newHidden } : p));
    } else {
      showMessage('error', res.message);
    }
  };

  // Admin: Regenerate poster with fresh info
  const handleRegenerate = async (poster: AuctionPoster) => {
    if (!isAdmin) return;
    setActionInProgressId(poster.id);

    // Find fresh player & team data if available
    const freshPlayer = players.find(p => p.id === poster.playerId);
    const freshTeam = teams.find(t => t.id === poster.winningTeamId);

    const res = await generateAndSavePoster({
      player: {
        id: poster.playerId,
        name: freshPlayer?.name || poster.playerName,
        banglaName: freshPlayer?.banglaName || poster.playerBanglaName,
        photoUrl: freshPlayer?.photoUrl || poster.playerPhoto,
        position: freshPlayer?.position || poster.playerPosition,
        category: freshPlayer?.category || poster.playerCategory,
        formNumber: freshPlayer?.formNumber || poster.playerFormNumber,
        registrationNumber: freshPlayer?.registrationNumber || poster.playerRegistrationNumber,
      },
      status: poster.status,
      finalPrice: poster.finalPrice,
      winningTeam: poster.winningTeamId ? {
        id: poster.winningTeamId,
        name: freshTeam?.name || poster.winningTeamName || '',
        logoUrl: freshTeam?.logoUrl || poster.winningTeamLogo || undefined,
      } : null,
      season: {
        id: currentSeason.id,
        name: currentSeason.name,
        code: currentSeason.code,
        year: currentSeason.year,
      },
      forceRegenerate: true,
    });

    setActionInProgressId(null);

    if (res.success && res.poster) {
      showMessage('success', language === 'bn' ? 'পোস্টার সফলভাবে পুনঃউৎপন্ন (Regenerated) হয়েছে!' : 'Poster successfully regenerated!');
      setPosters(prev => prev.map(p => p.id === poster.id ? (res.poster as AuctionPoster) : p));
      if (previewPoster?.id === poster.id) {
        setPreviewPoster(res.poster);
      }
    } else {
      showMessage('error', res.error || (language === 'bn' ? 'পুনঃউৎপাদনে ত্রুটি হয়েছে' : 'Regeneration failed'));
    }
  };

  // Admin: Confirm Delete
  const handleConfirmDelete = async () => {
    if (!posterToDelete || !isAdmin) return;
    const target = posterToDelete;
    setActionInProgressId(target.id);
    const res = await deletePoster(target, currentUser?.email || 'admin');
    setActionInProgressId(null);
    setPosterToDelete(null);

    if (res.success) {
      showMessage('success', res.message);
      setPosters(prev => prev.filter(p => p.id !== target.id));
      if (previewPoster?.id === target.id) {
        setPreviewPoster(null);
      }
    } else {
      showMessage('error', res.message);
    }
  };

  // Counts for tabs
  const soldCount = useMemo(() => posters.filter(p => p.status === 'sold' && (!p.hidden || isAdmin)).length, [posters, isAdmin]);
  const unsoldCount = useMemo(() => posters.filter(p => p.status === 'unsold' && (!p.hidden || isAdmin)).length, [posters, isAdmin]);
  const totalCount = useMemo(() => posters.filter(p => !p.hidden || isAdmin).length, [posters, isAdmin]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-emerald-950/60 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{currentSeason.name} • {language === 'bn' ? 'অফিসিয়াল আর্টওয়ার্ক' : 'Official Artwork'}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <ImageIcon className="w-7 h-7 text-amber-400" />
              <span>{language === 'bn' ? 'পোস্টার গ্যালারি' : 'Poster Gallery'}</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              {language === 'bn'
                ? 'লাইভ নিলামে বিক্রিত (SOLD) ও অবিক্রিত (UNSOLD) খেলোয়াড়দের অফিসিয়াল ডিজিটাল পোস্টার। সকল দর্শক হাই-রেজুলেশন পোস্টার দেখতে ও ডাউনলোড করতে পারবেন।'
                : 'Official digital posters for SOLD and UNSOLD players generated from live auction. High-resolution downloads available for all viewers.'}
            </p>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-3 bg-slate-950/60 border border-slate-800 rounded-2xl p-3 shrink-0 backdrop-blur-md">
            <div className="text-center px-2">
              <div className="text-xs text-slate-400 font-medium">{language === 'bn' ? 'মোট' : 'Total'}</div>
              <div className="text-lg font-black text-white font-mono">{totalCount}</div>
            </div>
            <div className="w-px h-8 bg-slate-800"></div>
            <div className="text-center px-2">
              <div className="text-xs text-emerald-400 font-medium">SOLD</div>
              <div className="text-lg font-black text-emerald-400 font-mono">{soldCount}</div>
            </div>
            <div className="w-px h-8 bg-slate-800"></div>
            <div className="text-center px-2">
              <div className="text-xs text-rose-400 font-medium">UNSOLD</div>
              <div className="text-lg font-black text-rose-400 font-mono">{unsoldCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Status Notification */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 shadow-lg transition-all animate-in slide-in-from-top-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/90 border border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/90 border border-rose-500/50 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Controls */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 sm:p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800/80 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filter === 'all'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'সব পোস্টার' : 'All Posters'}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
              {totalCount}
            </span>
          </button>

          <button
            onClick={() => setFilter('sold')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filter === 'sold'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-300" />
            <span>{language === 'bn' ? 'SOLD পোস্টার' : 'SOLD Posters'}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono text-emerald-300">
              {soldCount}
            </span>
          </button>

          <button
            onClick={() => setFilter('unsold')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filter === 'unsold'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-200" />
            <span>{language === 'bn' ? 'UNSOLD পোস্টার' : 'UNSOLD Posters'}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono text-rose-200">
              {unsoldCount}
            </span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              language === 'bn'
                ? 'খেলোয়াড়ের নাম, ফরম নং বা দল দিয়ে খুঁজুন...'
                : 'Search by player, form #, or team...'
            }
            className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-emerald-500 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Gallery Content State */}
      {loading ? (
        <div className="py-20 text-center space-y-4">
          <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-400">
            {language === 'bn' ? 'পোস্টার গ্যালারি লোড হচ্ছে...' : 'Loading poster gallery...'}
          </p>
        </div>
      ) : filteredPosters.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center space-y-4 max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
            <ImageIcon className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-white">
            {language === 'bn' ? 'কোনো পোস্টার পাওয়া যায়নি' : 'No posters found'}
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            {searchQuery
              ? (language === 'bn'
                  ? `"${searchQuery}" এর জন্য কোনো ফলাফল নেই। অন্য নাম বা ফিল্টার দিয়ে চেষ্টা করুন।`
                  : `No results matching "${searchQuery}". Try a different keyword.`)
              : (language === 'bn'
                  ? 'লাইভ নিলামে কোনো খেলোয়াড়ের শেষ ডাক নিশ্চিত হলে এখানে স্বয়ংক্রিয়ভাবে তার অফিসিয়াল পোস্টার যুক্ত হবে।'
                  : 'Official posters will automatically appear here once players are settled in the live auction.')}
          </p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              {language === 'bn' ? 'সার্চ ক্লিয়ার করুন' : 'Clear search'}
            </button>
          )}
        </div>
      ) : (
        /* Poster Grid (Responsive 1 col mobile, 2 col tablet, 3-4 col desktop) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredPosters.map(poster => {
            const isSold = poster.status === 'sold';
            const isBusy = actionInProgressId === poster.id;

            return (
              <div
                key={poster.id}
                className={`group bg-slate-900 border rounded-2xl overflow-hidden shadow-xl transition-all duration-300 hover:shadow-2xl hover:translate-y-[-2px] flex flex-col ${
                  poster.hidden
                    ? 'border-amber-500/40 opacity-70 bg-slate-900/50'
                    : isSold
                    ? 'border-emerald-500/30 hover:border-emerald-400/60'
                    : 'border-rose-500/30 hover:border-rose-400/60'
                }`}
              >
                {/* Poster Image Container */}
                <div
                  className="relative aspect-[4/5] bg-slate-950 overflow-hidden cursor-pointer group/img"
                  onClick={() => setPreviewPoster(poster)}
                >
                  <img
                    src={poster.posterUrl}
                    alt={poster.playerName}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-105"
                    loading="lazy"
                  />

                  {/* Gradient Overlay & Status Tag */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60"></div>

                  {/* Top Badge: SOLD / UNSOLD */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <span
                      className={`px-3 py-1 rounded-full text-[11px] font-black tracking-wider uppercase shadow-lg border backdrop-blur-md ${
                        isSold
                          ? 'bg-emerald-600/90 border-emerald-400 text-white'
                          : 'bg-rose-600/90 border-rose-400 text-white'
                      }`}
                    >
                      {isSold ? 'SOLD' : 'UNSOLD'}
                    </span>

                    {poster.hidden && (
                      <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-amber-500/90 border border-amber-300 text-slate-950 shadow">
                        {language === 'bn' ? 'লুকানো (Hidden)' : 'Hidden'}
                      </span>
                    )}
                  </div>

                  {/* Top Right: Form Number */}
                  {poster.playerFormNumber && (
                    <div className="absolute top-3 right-3 px-2 py-0.5 rounded-lg bg-black/75 border border-white/20 text-white font-mono text-[11px] font-bold shadow backdrop-blur-md">
                      {poster.playerFormNumber}
                    </div>
                  )}

                  {/* Hover Overlay with Preview Prompt */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                    <div className="px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-white/30 text-white text-xs font-bold flex items-center gap-2 shadow-2xl backdrop-blur-sm">
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{language === 'bn' ? 'বড় করে দেখুন' : 'Full Preview'}</span>
                    </div>
                  </div>

                  {/* Bottom Image Overlay Strip: Player Name and Price / Status */}
                  <div className="absolute bottom-2.5 left-3 right-3 pointer-events-none">
                    <div className="font-extrabold text-sm sm:text-base text-white truncate drop-shadow-md">
                      {poster.playerBanglaName || poster.playerName}
                    </div>
                    {poster.playerBanglaName && poster.playerName && (
                      <div className="text-[11px] text-slate-300 truncate font-medium drop-shadow">
                        {poster.playerName}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Info Details */}
                <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    {/* Position & Category */}
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold text-slate-300">
                        {poster.playerPosition || (language === 'bn' ? 'খেলোয়াড়' : 'Player')}
                      </span>
                      {poster.playerCategory && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
                          ক্যাটাগরি {poster.playerCategory}
                        </span>
                      )}
                    </div>

                    {/* Winning Team & Price for SOLD */}
                    {isSold ? (
                      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-400">{language === 'bn' ? 'বিজয়ী দল:' : 'Team:'}</span>
                          <span className="text-xs font-bold text-white truncate max-w-[140px]">
                            {poster.winningTeamName || '-'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-slate-800/60 pt-1">
                          <span className="text-[11px] text-emerald-400 font-semibold">{language === 'bn' ? 'মূল্য:' : 'Price:'}</span>
                          <span className="text-sm font-black text-amber-400 font-mono">
                            ৳{formatBDT(poster.finalPrice || 0)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-2.5 text-center">
                        <span className="text-xs font-bold text-rose-300">
                          {language === 'bn' ? 'পরবর্তী রাউন্ডে পুনর্বিবেচনা' : 'Available for re-auction'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Public Action Controls: Download, Preview, Share */}
                  <div className="space-y-2 pt-1 border-t border-slate-800">
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        onClick={() => setPreviewPoster(poster)}
                        className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        title={language === 'bn' ? 'প্রিভিউ' : 'Preview'}
                      >
                        <Eye className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-[11px]">{language === 'bn' ? 'প্রিভিউ' : 'View'}</span>
                      </button>

                      <button
                        onClick={() => handleDownload(poster)}
                        className="py-1.5 px-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        title={language === 'bn' ? 'ডাউনলোড' : 'Download'}
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span className="text-[11px]">{language === 'bn' ? 'ডাউনলোড' : 'Download'}</span>
                      </button>

                      <button
                        onClick={() => handleShare(poster)}
                        className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        title={language === 'bn' ? 'শেয়ার' : 'Share'}
                      >
                        {copiedPosterId === poster.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-[11px] text-emerald-300">{language === 'bn' ? 'কপি' : 'Copied'}</span>
                          </>
                        ) : (
                          <>
                            <Share2 className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-[11px]">{language === 'bn' ? 'শেয়ার' : 'Share'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Admin Specific Action Controls */}
                    {isAdmin && (
                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1 text-[11px]">
                        {/* Regenerate */}
                        <button
                          onClick={() => handleRegenerate(poster)}
                          disabled={isBusy}
                          className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                          title={language === 'bn' ? 'পোস্টার পুনঃউৎপাদন (Regenerate)' : 'Regenerate'}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin text-amber-400' : ''}`} />
                          <span className="hidden sm:inline">{language === 'bn' ? 'রিফ্রেশ' : 'Regen'}</span>
                        </button>

                        {/* Hide / Unhide Toggle */}
                        <button
                          onClick={() => handleToggleVisibility(poster)}
                          disabled={isBusy}
                          className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 ${
                            poster.hidden
                              ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                              : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
                          }`}
                          title={poster.hidden ? 'পাবলিক গ্যালারিতে দেখান' : 'পাবলিক গ্যালারি থেকে লুকান'}
                        >
                          {poster.hidden ? (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{language === 'bn' ? 'প্রকাশ' : 'Show'}</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{language === 'bn' ? 'লুকান' : 'Hide'}</span>
                            </>
                          )}
                        </button>

                        {/* Delete Entry */}
                        <button
                          onClick={() => setPosterToDelete(poster)}
                          disabled={isBusy}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                          title={language === 'bn' ? 'পোস্টার মুছুন' : 'Delete'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{language === 'bn' ? 'মুছুন' : 'Delete'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Size Preview Modal */}
      {previewPoster && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="relative max-w-2xl w-full bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase ${
                    previewPoster.status === 'sold'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-rose-600 text-white'
                  }`}
                >
                  {previewPoster.status.toUpperCase()}
                </span>
                <h3 className="font-bold text-white text-sm sm:text-base truncate max-w-xs">
                  {previewPoster.playerBanglaName || previewPoster.playerName}
                </h3>
              </div>
              <button
                onClick={() => setPreviewPoster(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: High Resolution Poster Image View */}
            <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center bg-slate-950">
              <img
                src={previewPoster.posterUrl}
                alt={previewPoster.playerName}
                className="max-h-[68vh] w-auto object-contain rounded-xl shadow-2xl border border-slate-800"
              />
            </div>

            {/* Modal Footer: Action Bar */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-400 truncate max-w-sm">
                {previewPoster.caption}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <button
                  onClick={() => handleShare(previewPoster)}
                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>{language === 'bn' ? 'শেয়ার / কপি' : 'Share / Copy'}</span>
                </button>

                <button
                  onClick={() => handleDownload(previewPoster)}
                  className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{language === 'bn' ? 'এইচডি ডাউনলোড' : 'HD Download'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Admin) */}
      {posterToDelete && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="text-base font-bold text-white">
                {language === 'bn' ? 'পোস্টার মুছে ফেলতে চান?' : 'Delete this poster?'}
              </h4>
              <p className="text-xs text-slate-400">
                {language === 'bn'
                  ? `খেলোয়াড় "${posterToDelete.playerName}" এর পোস্টারটি গ্যালারি থেকে স্থায়ীভাবে মুছে ফেলা হবে। খেলোয়াড়ের নিলাম ফলাফল অপরিবর্তিত থাকবে।`
                  : `This will permanently remove the poster for "${posterToDelete.playerName}". Auction results remain intact.`}
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setPosterToDelete(null)}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                {language === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-950 transition-colors cursor-pointer"
              >
                {language === 'bn' ? 'হ্যাঁ, মুছুন' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
