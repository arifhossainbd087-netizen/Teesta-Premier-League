import React, { useState, useRef } from 'react';
import { X, Upload, Image as ImageIcon, CheckCircle, AlertTriangle, RefreshCw, Link as LinkIcon, Camera } from 'lucide-react';
import { Team } from '../types';
import { uploadTeamLogo, saveTeamLogoToFirestore } from '../services/photoUploadService';
import { doc, collection, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';

interface TeamLogoModalProps {
  team: Team | null;
  isOpen: boolean;
  onClose: () => void;
  currentSeasonId?: string;
  onLogoUpdated?: (teamId: string, newLogoUrl: string) => void;
}

export const TeamLogoModal: React.FC<TeamLogoModalProps> = ({
  team,
  isOpen,
  onClose,
  currentSeasonId = 'season-2-2026',
  onLogoUpdated,
}) => {
  const { language, currentUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [urlInput, setUrlInput] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [fallbackDataUrl, setFallbackDataUrl] = useState<string | null>(null);

  // Sync state when team changes or modal opens
  React.useEffect(() => {
    if (team) {
      setPreviewUrl(team.logoUrl || '');
      setUrlInput(team.logoUrl || '');
      setSelectedFile(null);
      setErrorMessage(null);
      setSuccessMessage(null);
      setFallbackDataUrl(null);
      setUploadProgress(0);
    }
  }, [team, isOpen]);

  if (!isOpen || !team) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setFallbackDataUrl(null);
    setSelectedFile(file);

    // Create client-side preview immediately
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
  };

  const handleUploadAndSave = async () => {
    if (!selectedFile && !fallbackDataUrl) {
      setErrorMessage(language === 'bn' ? 'অনুগ্রহ করে প্রথমে একটি ছবি নির্বাচন করুন।' : 'Please select an image file first.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (selectedFile) {
        const result = await uploadTeamLogo(
          selectedFile,
          team.id,
          currentSeasonId,
          language as 'bn' | 'en',
          {
            onProgress: (p) => setUploadProgress(p),
          }
        );

        if (result.success && result.url) {
          await saveTeamLogoToFirestore(team.id, result.url);

          // Audit log
          const auditRef = doc(collection(db, 'auditLogs'));
          await setDoc(auditRef, {
            action: 'TEAM_LOGO_UPDATED',
            actorEmail: currentUser?.email || 'admin',
            actorRole: 'admin',
            details: `${team.name} দলের নতুন লোগো ক্লাউড স্টোরেজে আপলোড ও সংরক্ষণ করা হয়েছে`,
            timestamp: new Date().toISOString(),
          });

          setSuccessMessage(language === 'bn' ? 'লোগো সফলভাবে সংরক্ষণ করা হয়েছে!' : 'Logo saved successfully!');
          onLogoUpdated?.(team.id, result.url);
          setTimeout(() => {
            onClose();
          }, 900);
          return;
        }

        // If storage failed but compressed data URL is available
        if (result.compressedDataUrl) {
          setFallbackDataUrl(result.compressedDataUrl);
          setErrorMessage(result.message || (language === 'bn' ? 'ক্লাউড স্টোরেজ সংযোগ ব্যর্থ হয়েছে। আপনি সরাসরি ডাটাবেজে সংরক্ষণ করতে পারেন।' : 'Storage failed. You can save directly to database.'));
          setIsUploading(false);
          return;
        }

        setErrorMessage(result.message || (language === 'bn' ? 'লোগো আপলোড ব্যর্থ হয়েছে।' : 'Logo upload failed.'));
      }
    } catch (err: any) {
      console.error('Error uploading team logo:', err);
      setErrorMessage(err?.message || (language === 'bn' ? 'লোগো আপলোডে অপ্রত্যাশিত ত্রুটি ঘটেছে।' : 'Unexpected error during logo upload.'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveDirectDataUrl = async () => {
    if (!fallbackDataUrl) return;
    setIsUploading(true);
    setErrorMessage(null);
    try {
      await saveTeamLogoToFirestore(team.id, fallbackDataUrl);

      // Audit log
      const auditRef = doc(collection(db, 'auditLogs'));
      await setDoc(auditRef, {
        action: 'TEAM_LOGO_UPDATED',
        actorEmail: currentUser?.email || 'admin',
        actorRole: 'admin',
        details: `${team.name} দলের অপ্টিমাইজড লোগো ডাটাবেজে সরাসরি সংরক্ষণ করা হয়েছে`,
        timestamp: new Date().toISOString(),
      });

      setSuccessMessage(language === 'bn' ? 'লোগো সরাসরি ডাটাবেজে সফলভাবে সংরক্ষিত হয়েছে!' : 'Logo saved directly to database!');
      onLogoUpdated?.(team.id, fallbackDataUrl);
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      console.error('Error saving direct logo:', err);
      setErrorMessage(language === 'bn' ? 'ডাটাবেজে সংরক্ষণ ব্যর্থ হয়েছে।' : 'Failed to save to database.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveUrl = async () => {
    const clean = urlInput.trim();
    if (!clean) {
      setErrorMessage(language === 'bn' ? 'অনুগ্রহ করে সঠিক ইমেজ URL লিখুন।' : 'Please enter a valid image URL.');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    try {
      await saveTeamLogoToFirestore(team.id, clean);

      // Audit log
      const auditRef = doc(collection(db, 'auditLogs'));
      await setDoc(auditRef, {
        action: 'TEAM_LOGO_UPDATED',
        actorEmail: currentUser?.email || 'admin',
        actorRole: 'admin',
        details: `${team.name} দলের নতুন লোগো URL আপডেট করা হয়েছে: ${clean}`,
        timestamp: new Date().toISOString(),
      });

      setSuccessMessage(language === 'bn' ? 'লোগো লিঙ্ক সফলভাবে সংরক্ষণ করা হয়েছে!' : 'Logo URL saved successfully!');
      onLogoUpdated?.(team.id, clean);
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      console.error('Error saving logo URL:', err);
      setErrorMessage(language === 'bn' ? 'লিঙ্ক সংরক্ষণ ব্যর্থ হয়েছে।' : 'Failed to save URL.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md shrink-0 overflow-hidden"
              style={{ backgroundColor: team.color || '#10b981' }}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={team.name}
                  className="w-full h-full object-cover"
                  onError={() => setPreviewUrl('')}
                />
              ) : (
                team.name.charAt(0)
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-emerald-400" />
                <span>{language === 'bn' ? 'দলের লোগো আপলোড ও পরিবর্তন' : 'Team Logo Upload & Change'}</span>
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                {team.name} {team.banglaName ? `(${team.banglaName})` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 pt-2 gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-all ${
              activeTab === 'upload'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'ডিভাইস থেকে ফাইল আপলোড' : 'Device Upload'}</span>
          </button>
          <button
            onClick={() => setActiveTab('url')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-all ${
              activeTab === 'url'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'ইমেজ URL লিংক' : 'Web Image URL'}</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Messages */}
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <p>{errorMessage}</p>
                {fallbackDataUrl && (
                  <button
                    onClick={handleSaveDirectDataUrl}
                    disabled={isUploading}
                    className="mt-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all shadow-md flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'সরাসরি ডাটাবেজে সংরক্ষণ করুন (নিশ্চিত কাজ করবে)' : 'Save Directly to Database'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Logo Preview Box */}
          <div className="flex flex-col items-center justify-center p-4 bg-slate-950/80 border border-dashed border-slate-700/80 rounded-2xl">
            <div
              className="w-24 h-24 rounded-2xl flex items-center justify-center text-white font-bold text-3xl shadow-xl border-2 border-slate-700 overflow-hidden relative group"
              style={{ backgroundColor: team.color || '#10b981' }}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={team.name}
                  className="w-full h-full object-cover"
                  onError={() => setPreviewUrl('')}
                />
              ) : (
                team.name.charAt(0)
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-2 font-medium">
              {language === 'bn' ? 'বর্তমান প্রিভিউ (বর্গাকার লোগো সবচেয়ে ভালো দেখায়)' : 'Live Preview (Square logos look best)'}
            </p>
          </div>

          {activeTab === 'upload' ? (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 border border-slate-700 hover:border-emerald-500/60 bg-slate-800/60 hover:bg-slate-800 text-slate-200 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold transition-all cursor-pointer shadow-sm"
              >
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>
                  {selectedFile
                    ? `${selectedFile.name} (${Math.round(selectedFile.size / 1024)} KB)`
                    : (language === 'bn' ? 'গ্যালারি বা ফাইল থেকে লোগো নির্বাচন করুন' : 'Select Logo from Device')}
                </span>
              </button>

              <p className="text-[10px] text-slate-500 text-center">
                {language === 'bn'
                  ? 'সমর্থিত ফরম্যাট: PNG, JPG, WEBP (সর্বোচ্চ ৫ MB)। স্বয়ংক্রিয়ভাবে অপ্টিমাইজ করা হবে।'
                  : 'Supported formats: PNG, JPG, WEBP (Max 5 MB).'}
              </p>

              {isUploading && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>{language === 'bn' ? 'প্রসেসিং ও আপলোড হচ্ছে...' : 'Uploading...'}</span>
                    <span className="font-mono">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs text-slate-300 font-medium block">
                {language === 'bn' ? 'ইমেজ লিঙ্ক (URL):' : 'Image URL:'}
              </label>
              <input
                type="url"
                placeholder="https://example.com/logo.png"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  setPreviewUrl(e.target.value);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
              />
              <p className="text-[10px] text-slate-500">
                {language === 'bn'
                  ? 'যেকোনো পাবলিক ইমেজ URL বা হোস্টিং লিংক এখানে পেস্ট করুন।'
                  : 'Paste any public image link here.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-800 bg-slate-950/60">
          <button
            onClick={onClose}
            disabled={isUploading}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            {language === 'bn' ? 'বাতিল' : 'Cancel'}
          </button>

          {activeTab === 'upload' ? (
            <button
              onClick={handleUploadAndSave}
              disabled={isUploading || (!selectedFile && !fallbackDataUrl)}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 cursor-pointer"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{language === 'bn' ? 'আপলোড হচ্ছে...' : 'Uploading...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'লোগো সংরক্ষণ করুন' : 'Save Logo'}</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleSaveUrl}
              disabled={isUploading || !urlInput.trim()}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 cursor-pointer"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{language === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'লিঙ্ক সংরক্ষণ করুন' : 'Save URL'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
