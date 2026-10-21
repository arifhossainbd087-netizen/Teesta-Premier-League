import React, { useState } from 'react';
import { X, Gavel, User, Search, Play, Clock, TrendingUp } from 'lucide-react';
import { Player } from '../types';
import { formatBDT, getPositionBadgeColor, getPositionLabel } from '../utils/formatters';
import { loadPlayerToAuction } from '../services/auctionService';
import { useAuth } from '../context/AuthContext';

interface PlayerSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  players: Player[];
  language: 'bn' | 'en';
}

export const PlayerSelectModal: React.FC<PlayerSelectModalProps> = ({
  isOpen,
  onClose,
  players,
  language,
}) => {
  const { currentUser } = useAuth();

  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [basePrice, setBasePrice] = useState<number>(2500);
  const [timerSeconds, setTimerSeconds] = useState<number>(20);
  const [minIncrement, setMinIncrement] = useState<number>(1000);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  // Available players for auction: approved, and not sold
  const eligiblePlayers = players.filter(
    p => p.approvalStatus === 'approved' && p.auctionStatus !== 'sold'
  );

  const filtered = eligiblePlayers.filter(p => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.banglaName?.toLowerCase().includes(q) ||
        p.area.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handlePlayerChoose = (player: Player) => {
    setSelectedPlayer(player);
    setBasePrice(player.basePrice || 2500);
  };

  const handleStartAuction = async () => {
    if (!selectedPlayer) return;
    if (!currentUser) {
      alert(
        language === 'bn'
          ? 'নিলাম শুরু করতে প্রথমে উপরে "লগইন" থেকে Google অ্যাকাউন্ট (arifhossainbd087@gmail.com) দিয়ে সাইন ইন করুন।'
          : 'Please sign in with your Google admin account to start an auction.'
      );
      return;
    }
    setIsLoading(true);
    try {
      await loadPlayerToAuction(
        {
          ...selectedPlayer,
          basePrice,
        },
        timerSeconds,
        minIncrement,
        currentUser?.email || 'admin'
      );
      setIsLoading(false);
      onClose();
    } catch (err) {
      console.error('Error starting auction:', err);
      setIsLoading(false);
      alert('নিলাম শুরু করতে সমস্যা হয়েছে');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Gavel className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {language === 'bn' ? 'নিলামের জন্য খেলোয়াড় নির্বাচন' : 'Select Player for Live Auction'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {language === 'bn'
                  ? 'অনুমোদিত ড্রাফট পুল থেকে খেলোয়াড় নির্বাচন করে লাইভ স্টেজে তুলুন'
                  : 'Load player onto active auction block'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: 2 Columns */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1 overflow-hidden">
          {/* Player List on Left (7 cols) */}
          <div className="md:col-span-7 flex flex-col space-y-2 overflow-hidden">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={language === 'bn' ? 'নাম বা এলাকা...' : 'Search player...'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-72">
              {filtered.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500 italic">
                  {language === 'bn'
                    ? 'কোনো অনুমোদিত খেলোয়াড় পাওয়া যায়নি।'
                    : 'No eligible players found.'}
                </div>
              ) : (
                filtered.map(p => (
                  <div
                    key={p.id}
                    onClick={() => handlePlayerChoose(p)}
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                      selectedPlayer?.id === p.id
                        ? 'bg-purple-950/50 border-purple-500/50 text-white shadow-sm'
                        : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/50 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0 relative">
                        <User className="w-4 h-4 text-slate-500 absolute" />
                        {p.photoUrl && (
                          <img
                            src={p.photoUrl}
                            alt={p.name}
                            onError={e => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                            className="w-full h-full object-cover relative z-10"
                          />
                        )}
                      </div>
                      <div>
                        <div className="font-bold flex items-center gap-1.5">
                          <span>{p.name}</span>
                          {p.auctionStatus === 'unsold' && (
                            <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1 py-0.2 rounded">
                              R2
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`px-1.5 py-0.2 rounded border ${getPositionBadgeColor(
                              p.position
                            )}`}
                          >
                            {getPositionLabel(p.position, language === 'bn')}
                          </span>
                          <span>•</span>
                          <span>{p.area}</span>
                        </div>
                      </div>
                    </div>

                    <div className="font-mono font-bold text-xs text-emerald-400">
                      {formatBDT(p.basePrice)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Auction Parameters Configuration on Right (5 cols) */}
          <div className="md:col-span-5 bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3 flex flex-col justify-between text-xs">
            {selectedPlayer ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 pb-2.5 border-b border-slate-800">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0 relative">
                    <User className="w-6 h-6 text-slate-500 absolute" />
                    {selectedPlayer.photoUrl && (
                      <img
                        src={selectedPlayer.photoUrl}
                        alt={selectedPlayer.name}
                        onError={e => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                        className="w-full h-full object-cover relative z-10"
                      />
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">{selectedPlayer.name}</div>
                    <div className="text-[11px] text-emerald-400 font-medium">
                      {getPositionLabel(selectedPlayer.position, language === 'bn')}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">
                    {language === 'bn' ? 'ভিত্তিমূল্য (Base Price ৳)' : 'Base Price (BDT)'}
                  </label>
                  <input
                    type="number"
                    step={500}
                    value={basePrice}
                    onChange={e => setBasePrice(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">
                    {language === 'bn' ? 'টাইমার (সেকেন্ড)' : 'Countdown (Seconds)'}
                  </label>
                  <select
                    value={timerSeconds}
                    onChange={e => setTimerSeconds(parseInt(e.target.value, 10) || 20)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white cursor-pointer"
                  >
                    <option value={15}>১৫ সেকেন্ড (Fast)</option>
                    <option value={20}>২০ সেকেন্ড (Standard)</option>
                    <option value={30}>৩০ সেকেন্ড (Extended)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">
                    {language === 'bn' ? 'ন্যূনতম ডাক বৃদ্ধি' : 'Min Increment'}
                  </label>
                  <select
                    value={minIncrement}
                    onChange={e => setMinIncrement(parseInt(e.target.value, 10) || 1000)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white cursor-pointer"
                  >
                    <option value={500}>+৳ ৫০০</option>
                    <option value={1000}>+৳ ১,০০০</option>
                    <option value={2000}>+৳ ২,০০০</option>
                    <option value={5000}>+৳ ৫,০০০</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-500 italic">
                {language === 'bn'
                  ? 'বাম পাশ থেকে খেলোয়াড় নির্বাচন করুন'
                  : 'Select a player from the left'}
              </div>
            )}

            <button
              onClick={handleStartAuction}
              disabled={!selectedPlayer || isLoading}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-xs shadow-md shadow-purple-950 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>
                {isLoading
                  ? language === 'bn'
                    ? 'শুরু হচ্ছে...'
                    : 'Loading...'
                  : language === 'bn'
                  ? 'নিলাম শুরু করুন (Start Auction)'
                  : 'Start Auction'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
