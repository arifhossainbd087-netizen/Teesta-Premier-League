/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Sliders,
  Image,
  Eye,
  Palette,
  DollarSign,
  Layers,
  RotateCcw,
  CheckCircle2,
  CloudUpload,
  Save,
  Monitor,
  Sparkles,
  Clock,
} from 'lucide-react';
import { AuctionDisplayConfig } from '../types';
import {
  DEFAULT_AUCTION_DISPLAY_CONFIG,
  saveAuctionDisplayConfig,
} from '../services/auctionDisplayService';
import { updateAuctionTimerDuration } from '../services/auctionService';
import { useAuth } from '../context/AuthContext';

interface AuctionDisplayCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AuctionDisplayConfig;
  onConfigChange: (newConfig: AuctionDisplayConfig) => void;
}

export const AuctionDisplayCustomizerModal: React.FC<AuctionDisplayCustomizerModalProps> = ({
  isOpen,
  onClose,
  config,
  onConfigChange,
}) => {
  const { currentUser, language } = useAuth();
  const [activeTab, setActiveTab] = useState<'photo' | 'fields' | 'theme' | 'bid' | 'sections'>('photo');
  const [tempConfig, setTempConfig] = useState<AuctionDisplayConfig>(config);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [customDurationVal, setCustomDurationVal] = useState<string>('');

  if (!isOpen) return null;

  const handleUpdate = (updater: (prev: AuctionDisplayConfig) => AuctionDisplayConfig) => {
    const updated = updater(tempConfig);
    setTempConfig(updated);
    onConfigChange(updated); // Immediate live preview!
  };

  const handlePublish = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const adminEmail = currentUser?.email || 'arifhossainbd087@gmail.com';
      const res = await saveAuctionDisplayConfig(tempConfig, adminEmail, true);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: language === 'bn' ? 'কনফিগারেশন ক্লাউডে স্থায়ীভাবে সফলভাবে প্রকাশিত হয়েছে!' : 'Display settings published to Cloud Firestore!',
        });
        setTimeout(() => setFeedback(null), 4000);
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Error publishing display settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const adminEmail = currentUser?.email || 'admin';
      const res = await saveAuctionDisplayConfig(tempConfig, adminEmail, false);
      setFeedback({
        type: 'success',
        message: language === 'bn' ? 'ড্রাফট হিসেবে লোকাল মেমরিতে সংরক্ষিত হয়েছে।' : 'Saved as local preview draft.',
      });
      setTimeout(() => setFeedback(null), 3500);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setTempConfig(DEFAULT_AUCTION_DISPLAY_CONFIG);
    onConfigChange(DEFAULT_AUCTION_DISPLAY_CONFIG);
    setFeedback({
      type: 'success',
      message: language === 'bn' ? 'ডিফল্ট সেটিংসে ফিরিয়ে নেওয়া হয়েছে।' : 'Restored default display settings.',
    });
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-amber-400 p-0.5 shadow-md flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Sliders className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>{language === 'bn' ? 'অকশন ডিসপ্লে কাস্টমাইজার' : 'Auction Display Customizer'}</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono uppercase">
                  {language === 'bn' ? 'লাইভ প্রিভিউ' : 'Live Preview'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {language === 'bn'
                  ? 'প্রজেক্টর, এলইডি স্ক্রিন ও বড় ডিসপ্লের জন্য লেআউট, ছবি, ফন্ট ও রং কাস্টমাইজ করুন'
                  : 'Customize layout, typography, colors, and visibility for stadium & projector screens'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`px-6 py-2.5 text-xs font-semibold flex items-center justify-between border-b ${
              feedback.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{feedback.message}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="hover:underline">
              {language === 'bn' ? 'ঠিক আছে' : 'OK'}
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/70 overflow-x-auto scrollbar-none px-4">
          {[
            { id: 'photo', label: language === 'bn' ? 'ফটো ও বিন্যাস' : 'Photo & Layout', icon: Image },
            { id: 'fields', label: language === 'bn' ? 'তথ্য প্রদর্শন' : 'Info Fields', icon: Eye },
            { id: 'theme', label: language === 'bn' ? 'থিম ও রং' : 'Theme & Colors', icon: Palette },
            { id: 'bid', label: language === 'bn' ? 'বিড ও টাইমার' : 'Bid & Timer', icon: DollarSign },
            { id: 'sections', label: language === 'bn' ? 'সেকশন দৃশ্যমানতা' : 'Sections', icon: Layers },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                  isActive
                    ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Contents Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: Photo & Layout */}
          {activeTab === 'photo' && (
            <div className="space-y-6">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
                  {language === 'bn' ? 'প্লেয়ার ফটোর অবস্থান (Photo Placement):' : 'Player Photo Placement:'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'left', label: language === 'bn' ? 'বামপাশে (Left - প্রমিনেন্ট রেফারেন্স স্টাইল)' : 'Left (Prominent - Reference Style)', desc: 'খেলোয়াড়ের পোর্ট্রেট বামে, ডানপাশে যাবতীয় তথ্য ও বিড' },
                    { id: 'center', label: language === 'bn' ? 'কেন্দ্রে (Center Stage)' : 'Center Stage', desc: 'প্লেয়ারের ছবি ও মূল তথ্য মধ্যবর্তী কলামে বিন্যাস' },
                    { id: 'split', label: language === 'bn' ? 'স্প্লিট প্যানেল (Split View)' : 'Split View', desc: '৫০-৫০ প্রস্থের ভারসাম্যপূর্ণ কলাম' },
                  ].map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleUpdate(c => ({ ...c, photoPlacement: item.id as any }))}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                        tempConfig.photoPlacement === item.id
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-lg'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-sm text-slate-100">{item.label}</div>
                      <div className="text-[11px] text-slate-400 mt-1">{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
                  {language === 'bn' ? 'ফটোর আকার ও উচ্চতা (Photo Size):' : 'Photo Size & Scale:'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { id: 'normal', label: language === 'bn' ? 'স্বাভাবিক (Normal)' : 'Normal', desc: '১৬০px স্কয়ার' },
                    { id: 'large', label: language === 'bn' ? 'বড় (Large)' : 'Large', desc: '২০০px পোর্ট্রেট' },
                    { id: 'xlarge', label: language === 'bn' ? 'এক্সট্রা লার্জ (XL)' : 'Extra Large', desc: '২৬০px স্টেডিয়াম' },
                    { id: 'full', label: language === 'bn' ? 'ফুল কার্ড (Full Height)' : 'Full Height', desc: 'সম্পূর্ণ কলামের উচ্চতা' },
                  ].map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleUpdate(c => ({ ...c, photoSize: item.id as any }))}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        tempConfig.photoSize === item.id
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-xs text-slate-100">{item.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tempConfig.photoBorderAccent}
                    onChange={e => handleUpdate(c => ({ ...c, photoBorderAccent: e.target.checked }))}
                    className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 focus:ring-offset-slate-900 bg-slate-950 border-slate-700"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">
                      {language === 'bn' ? 'ডাইনামিক টুর্নামেন্ট অ্যাকসেন্ট বর্ডার ও গ্লো' : 'Dynamic Accent Border Glow'}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {language === 'bn'
                        ? 'খেলোয়াড়ের ছবির চারপাশে টুর্নামেন্ট বা দলের থিম রঙের সুন্দর বর্ডার যোগ করে'
                        : 'Displays tournament or team color accent frame around photo'}
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: Display Fields */}
          {activeTab === 'fields' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                {language === 'bn'
                  ? 'প্লেয়ার ইনফরমেশন প্যানেলে কোন কোন ফিল্ড প্রদর্শিত হবে তা নির্বাচন করুন:'
                  : 'Select which player details appear in the live auction information panel:'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: 'formNumber', label: language === 'bn' ? 'ফরম নম্বর (যেমন: ফরম নং ১)' : 'Form Number (e.g. Form No. 1)' },
                  { key: 'playerId', label: language === 'bn' ? 'প্লেয়ার রেজিস্ট্রেশন আইডি (TPL-S2-xxx)' : 'Registration Player ID' },
                  { key: 'position', label: language === 'bn' ? 'খেলার পজিশন (Forward, Midfielder, etc.)' : 'Playing Position' },
                  { key: 'category', label: language === 'bn' ? 'প্লেয়ার ক্যাটাগরি (Category A / B / C)' : 'Player Category' },
                  { key: 'age', label: language === 'bn' ? 'বয়স (Age in Years)' : 'Age' },
                  { key: 'basePrice', label: language === 'bn' ? 'ভিত্তিমূল্য (Base Price)' : 'Base Price' },
                  { key: 'minIncrement', label: language === 'bn' ? 'ন্যূনতম বৃদ্ধি ধাপ (Min Increment Step)' : 'Min Increment' },
                  { key: 'area', label: language === 'bn' ? 'ইউনিয়ন / এলাকা (Area/Union)' : 'Union / Area' },
                  { key: 'prevClub', label: language === 'bn' ? 'বিগত ক্লাব বা দল (Previous Club)' : 'Previous Club' },
                ].map(field => {
                  const isChecked = tempConfig.visibleFields[field.key as keyof typeof tempConfig.visibleFields] ?? true;
                  return (
                    <label
                      key={field.key}
                      className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-950/40 border-slate-800 text-slate-500 hover:border-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e =>
                          handleUpdate(c => ({
                            ...c,
                            visibleFields: {
                              ...c.visibleFields,
                              [field.key]: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 bg-slate-950 border-slate-700"
                      />
                      <span className="text-xs font-semibold">{field.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Theme & Colors */}
          {activeTab === 'theme' && (
            <div className="space-y-6">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
                  {language === 'bn' ? 'স্টেডিয়াম ভিজ্যুয়াল ব্যাকগ্রাউন্ড থিম:' : 'Stadium Background Theme:'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      id: 'dark-stadium',
                      label: language === 'bn' ? 'ডার্ক স্টেডিয়াম (Dark Stadium Floodlight)' : 'Dark Stadium Floodlight',
                      desc: 'প্রিমিয়াম ফুটবল টুর্নামেন্ট গভীর স্লেট ও স্টেডিয়াম গ্রাস অ্যাস্পেক্ট',
                      badge: 'রেফারেন্স স্টাইল',
                    },
                    {
                      id: 'midnight-navy',
                      label: language === 'bn' ? 'মিডনাইট নেভি (Midnight Championship Navy)' : 'Midnight Championship Navy',
                      desc: 'উজ্জ্বল কনট্রাস্ট সমৃদ্ধ রাজকীয় নেভি ব্লু ও শ্যাম্পেন গোল্ড',
                    },
                    {
                      id: 'emerald-glow',
                      label: language === 'bn' ? 'তিস্তা এমারেল্ড সাইবার (Teesta Emerald Cyber)' : 'Teesta Emerald Cyber',
                      desc: 'তিস্তা নদীর সবুজ ও চ্যাম্পিয়নশিপ ফ্লুয়োরোসেন্ট গ্রিন গ্লো',
                    },
                    {
                      id: 'onyx-gold',
                      label: language === 'bn' ? 'অনিক্স গোল্ড ট্রফি (Onyx & Gold Trophy)' : 'Onyx & Gold Trophy',
                      desc: 'চ্যাম্পিয়নশিপ সোনালী হাইলাইট ও ডিপ অনিক্স মার্বেল',
                    },
                  ].map(theme => (
                    <button
                      key={theme.id}
                      onClick={() => handleUpdate(c => ({ ...c, themeMode: theme.id as any }))}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                        tempConfig.themeMode === theme.id
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-md ring-1 ring-emerald-500/50'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-100">{theme.label}</span>
                        {theme.badge && (
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">
                            {theme.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">{theme.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
                  {language === 'bn' ? 'অ্যাকসেন্ট হাইলাইট রঙ (Accent Color):' : 'Highlight Accent Color:'}
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                  {[
                    { id: 'emerald', label: 'Emerald', bg: 'bg-emerald-500' },
                    { id: 'amber', label: 'Gold Amber', bg: 'bg-amber-400' },
                    { id: 'cyan', label: 'Electric Cyan', bg: 'bg-cyan-400' },
                    { id: 'rose', label: 'Crimson Rose', bg: 'bg-rose-500' },
                    { id: 'purple', label: 'Royal Purple', bg: 'bg-purple-500' },
                    { id: 'blue', label: 'Sapphire Blue', bg: 'bg-blue-500' },
                  ].map(col => (
                    <button
                      key={col.id}
                      onClick={() => handleUpdate(c => ({ ...c, accentColor: col.id as any }))}
                      className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 cursor-pointer transition-all ${
                        tempConfig.accentColor === col.id
                          ? 'border-white bg-slate-800 scale-105 shadow-md'
                          : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full ${col.bg} shadow-inner`}></div>
                      <span className="text-[10px] font-bold text-slate-300">{col.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
                  {language === 'bn' ? 'ফন্ট স্কেল (Font Scale for Projectors):' : 'Font Scale for Distance Legibility:'}
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'standard', label: language === 'bn' ? 'স্বাভাবিক (Standard)' : 'Standard', desc: 'ল্যাপটপ / মনিটর' },
                    { id: 'large', label: language === 'bn' ? 'বড় (Large - Recommended)' : 'Large (Recommended)', desc: 'প্রজেক্টর ও টিভি স্ক্রিন' },
                    { id: 'extra-large', label: language === 'bn' ? 'বিশাল (Projector XL)' : 'Projector XL', desc: 'স্টেডিয়াম বড় এলইডি স্ক্রিন' },
                  ].map(scale => (
                    <button
                      key={scale.id}
                      onClick={() => handleUpdate(c => ({ ...c, fontScale: scale.id as any }))}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        tempConfig.fontScale === scale.id
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-xs text-slate-100">{scale.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{scale.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Bid & Timer */}
          {activeTab === 'bid' && (
            <div className="space-y-6">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
                  {language === 'bn' ? 'সর্বোচ্চ ডাকের টাইপোগ্রাফি আকার (Bid Amount Size):' : 'Highest Bid Typography Scale:'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { id: 'large', label: 'Large (4xl)', sample: '৳২৫,০০০' },
                    { id: 'huge', label: 'Huge (5xl)', sample: '৳২৫,০০০' },
                    { id: 'jumbo', label: 'Jumbo (6xl - Ref)', sample: '৳২৫,০০০' },
                    { id: 'monumental', label: 'Monumental (7xl)', sample: '৳২৫,০০০' },
                  ].map(b => (
                    <button
                      key={b.id}
                      onClick={() => handleUpdate(c => ({ ...c, bidTypographySize: b.id as any }))}
                      className={`p-3 rounded-xl border text-center cursor-pointer transition-all ${
                        tempConfig.bidTypographySize === b.id
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-md'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-200">{b.label}</div>
                      <div className="font-mono font-bold text-emerald-400 mt-1">{b.sample}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
                  {language === 'bn' ? 'কাউন্টডাউন টাইমার স্টাইল (Countdown Timer Style):' : 'Countdown Timer Style:'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'digital-clock', label: language === 'bn' ? 'ডিজিটাল ক্লক কার্ড' : 'Digital Clock Box', desc: 'বড় মোনোস্পেস সেকেন্ড কাউন্টার ও শেষ ডাক এলার্ট' },
                    { id: 'pulse-pill', label: language === 'bn' ? 'পালস পিল ব্যাজ' : 'Pulse Pill Badge', desc: 'কমপ্যাক্ট ব্লিংকিং ব্যাজ' },
                    { id: 'circular-badge', label: language === 'bn' ? 'সার্কুলার রিং' : 'Circular Ring', desc: 'বৃত্তাকার টাইমার প্রদর্শন' },
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleUpdate(c => ({ ...c, countdownStyle: t.id as any }))}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        tempConfig.countdownStyle === t.id
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-xs text-slate-100">{t.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
                  {language === 'bn' ? 'কাউন্টডাউন টাইমার সময়কাল (Countdown Duration):' : 'Countdown Duration Settings:'}
                </label>
                <div className="flex items-center flex-wrap gap-2">
                  {[5, 10, 15, 20, 30, 45, 60].map(sec => (
                    <button
                      key={sec}
                      type="button"
                      onClick={async () => {
                        const adminEmail = currentUser?.email || 'admin';
                        const res = await updateAuctionTimerDuration(sec, 'season-2-2026', adminEmail);
                        if (res.success) {
                          setFeedback({ type: 'success', message: res.message });
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 hover:border-emerald-500 text-xs font-mono font-bold text-slate-200 hover:text-emerald-300 transition-colors cursor-pointer"
                    >
                      {sec}s
                    </button>
                  ))}

                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={3}
                      max={300}
                      placeholder={language === 'bn' ? 'কাস্টম...' : 'Custom...'}
                      value={customDurationVal}
                      onChange={e => setCustomDurationVal(e.target.value)}
                      className="w-20 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      disabled={!customDurationVal}
                      onClick={async () => {
                        const val = parseInt(customDurationVal, 10);
                        if (!isNaN(val) && val >= 3 && val <= 300) {
                          const adminEmail = currentUser?.email || 'admin';
                          const res = await updateAuctionTimerDuration(val, 'season-2-2026', adminEmail);
                          if (res.success) {
                            setFeedback({ type: 'success', message: res.message });
                            setCustomDurationVal('');
                          }
                        }
                      }}
                      className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 text-xs font-bold transition-colors cursor-pointer disabled:opacity-40"
                    >
                      {language === 'bn' ? 'সেট' : 'Set'}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {language === 'bn'
                    ? 'কমিটি যেকোনো সময় টাইমারের সময়কাল পরিবর্তন করতে পারবে। প্রতিটি ডাকের পর এই সময় থেকে টাইমার পুনরায় শুরু হবে।'
                    : 'Duration applies to all bids. Timer restarts from this duration after every valid bid.'}
                </p>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
                  {language === 'bn' ? 'শীর্ষ দলের লোগো ও বাজেট ডিসপ্লে (Leading Team Crest):' : 'Leading Team Logo Placement:'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'prominent-badge', label: language === 'bn' ? 'প্রমিনেন্ট কার্ড (রেফারেন্স স্টাইল)' : 'Prominent Badge Card', desc: 'দলের লোগো, নাম ও অবশিষ্ট বাজেট স্পষ্ট কার্ডে' },
                    { id: 'beside-name', label: language === 'bn' ? 'কমপ্যাক্ট ইনলাইন' : 'Compact Inline', desc: 'বামের বড় ডাকের পাশে লোগো ও নাম' },
                    { id: 'corner-crest', label: language === 'bn' ? 'কর্নার শিল্ড' : 'Corner Crest', desc: 'উপরের ডান কোণায় দলের ব্যাজ' },
                  ].map(l => (
                    <button
                      key={l.id}
                      onClick={() => handleUpdate(c => ({ ...c, teamLogoPlacement: l.id as any }))}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        tempConfig.teamLogoPlacement === l.id
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-xs text-slate-100">{l.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{l.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Sections Visibility */}
          {activeTab === 'sections' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                {language === 'bn'
                  ? 'প্রজেক্টরে পরিচ্ছন্ন ভিউ রাখার জন্য অতিরিক্ত সাইডবার বা সেকশনগুলো চালু বা বন্ধ করতে পারেন:'
                  : 'Control the visibility of peripheral sections to keep the stage distraction-free on projector screens:'}
              </p>

              <div className="space-y-3">
                {[
                  { key: 'showBidsFeed', title: language === 'bn' ? 'লাইভ বিডিং হিস্টোরি ফিড' : 'Live Bidding Ticker Feed', desc: 'ডানপাশে বিগত সকল বিডের তালিকা ও টাইমস্ট্যাম্প' },
                  { key: 'showTeamsPurse', title: language === 'bn' ? 'দলের অবশিষ্ট বাজেট ও স্কোয়াড চার্ট' : 'Team Purses & Squad Slots', desc: 'সকল দলের বাজেট ও খেলোয়াড় সংখ্যার অগ্রগতি বার' },
                  { key: 'showQuickBidButtons', title: language === 'bn' ? 'দলের কুইক বিড বাটন (+৳২০০, +৳৫০০, +৳১০০০)' : 'Quick Bid Buttons (+৳200, +৳500, +৳1000)', desc: 'দলগুলোর জন্য এক ক্লিকে ডাক বাড়ানোর বাটন' },
                  { key: 'showRulesCard', title: language === 'bn' ? 'টুর্নামেন্ট নিয়মাবলী ও ঘোষণা কার্ড' : 'Tournament Rules & Announcement Card', desc: 'টুর্নামেন্টের অফিসিয়াল নীতি ও নিয়মের সংক্ষিপ্ত বক্স' },
                  { key: 'showProjectorWatermark', title: language === 'bn' ? 'টিস্তা প্রিমিয়ার লীগ ওয়াটারমার্ক' : 'TPL Season 2 Projector Crest', desc: 'স্টেজের ব্যাকগ্রাউন্ডে সূক্ষ্ম অফিশিয়াল ওয়াটারমার্ক ও গ্লো' },
                ].map(item => {
                  const val = tempConfig[item.key as keyof AuctionDisplayConfig] as boolean;
                  return (
                    <label
                      key={item.key}
                      className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${
                        val
                          ? 'bg-slate-950/80 border-emerald-500/40 text-slate-200'
                          : 'bg-slate-950/40 border-slate-800 text-slate-500'
                      }`}
                    >
                      <div className="pr-4">
                        <div className="font-bold text-xs text-slate-100">{item.title}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{item.desc}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={val}
                        onChange={e => handleUpdate(c => ({ ...c, [item.key]: e.target.checked }))}
                        className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 bg-slate-950 border-slate-700 shrink-0"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'ডিফল্টে ফিরুন' : 'Restore Defaults'}</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleSaveDraft}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
              title="লোকাল প্রিভিউ হিসেবে রাখুন"
            >
              <Save className="w-3.5 h-3.5 text-slate-400" />
              <span>{language === 'bn' ? 'ড্রাফট সেভ' : 'Save Draft'}</span>
            </button>

            <button
              onClick={handlePublish}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-extrabold shadow-lg shadow-emerald-950 transition-all cursor-pointer disabled:opacity-50"
            >
              <CloudUpload className="w-4 h-4" />
              <span>
                {isSaving
                  ? (language === 'bn' ? 'সংরক্ষিত হচ্ছে...' : 'Publishing...')
                  : (language === 'bn' ? 'ক্লাউডে প্রকাশ করুন (Publish)' : 'Publish to Firestore')}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
