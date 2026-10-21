/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Trash2,
  RefreshCw,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldAlert,
  Info,
  ChevronDown,
  ChevronUp,
  Save,
} from 'lucide-react';
import {
  validateImageFile,
  uploadPlayerPhoto,
  deletePlayerPhoto,
  savePlayerPhotoToFirestore,
  StorageErrorType,
} from '../services/photoUploadService';
import { getStorageConfigInfo } from '../firebase/config';

interface PlayerPhotoUploaderProps {
  currentPhotoUrl?: string;
  onPhotoChanged: (url: string) => void;
  playerId?: string;
  seasonId?: string;
  language?: 'bn' | 'en';
  disabled?: boolean;
  isAdmin?: boolean;
  allowPublicUpload?: boolean;
  onSavedToFirestore?: (url: string) => void;
}

export const PlayerPhotoUploader: React.FC<PlayerPhotoUploaderProps> = ({
  currentPhotoUrl,
  onPhotoChanged,
  playerId = 'new',
  seasonId = 'season-2-2026',
  language = 'bn',
  disabled = false,
  isAdmin = true,
  allowPublicUpload = false,
  onSavedToFirestore,
}) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const activeObjectUrlRef = useRef<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string>(currentPhotoUrl || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<StorageErrorType | null>(null);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);
  const [showStorageGuide, setShowStorageGuide] = useState(false);
  const [pendingDirectPhoto, setPendingDirectPhoto] = useState<string | null>(null);
  const [isSavingDirect, setIsSavingDirect] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);

  const storageInfo = getStorageConfigInfo();

  // Cleanup object URL on component unmount
  useEffect(() => {
    return () => {
      if (activeObjectUrlRef.current) {
        try {
          URL.revokeObjectURL(activeObjectUrlRef.current);
        } catch (_) {}
      }
    };
  }, []);

  // Keep preview in sync if prop changes externally
  useEffect(() => {
    if (currentPhotoUrl !== undefined) {
      setPreviewUrl(currentPhotoUrl || '');
      setImageLoadError(false);
    }
  }, [currentPhotoUrl]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset notifications
    setErrorMessage(null);
    setErrorType(null);
    setSuccessStatus(null);
    setPendingDirectPhoto(null);
    setImageLoadError(false);

    // 0. Verify authorization (allow if admin or registration applicant)
    const canUpload = isAdmin || allowPublicUpload || playerId === 'draft';
    if (!canUpload) {
      setErrorMessage(
        language === 'bn'
          ? 'শুধুমাত্র অনুমোদিত অ্যাডমিন ছবি আপলোড বা পরিবর্তন করতে পারেন।'
          : 'Only authorized administrators can upload or change player photos.'
      );
      e.target.value = '';
      return;
    }

    // 1. Client-side file validation
    const validation = validateImageFile(file, language);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Invalid file');
      setErrorType('VALIDATION_ERROR');
      e.target.value = '';
      return;
    }

    // 2. Immediate local preview using Object URL for instant feedback on Android Chrome
    if (activeObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(activeObjectUrlRef.current);
      } catch (_) {}
      activeObjectUrlRef.current = null;
    }

    try {
      const localPreviewObjUrl = URL.createObjectURL(file);
      activeObjectUrlRef.current = localPreviewObjUrl;
      setPreviewUrl(localPreviewObjUrl);
    } catch (_) {}

    setIsProcessing(true);
    setUploadProgress(10);

    try {
      // 3. Perform upload with real progress and strict timeout protection
      const uploadResult = await uploadPlayerPhoto(file, playerId, seasonId, language, {
        onProgress: percent => setUploadProgress(percent),
        timeoutMs: 8000,
      });

      if (uploadResult.success) {
        // Uploaded to Firebase Cloud Storage!
        setPreviewUrl(uploadResult.url);
        onPhotoChanged(uploadResult.url);
        setPendingDirectPhoto(null);

        // If editing an existing player, save directly to Firestore
        if (playerId && playerId !== 'new' && playerId !== 'draft') {
          try {
            await savePlayerPhotoToFirestore(playerId, uploadResult.url);
            onSavedToFirestore?.(uploadResult.url);
          } catch (dbErr) {
            console.warn('Could not auto-save to player document:', dbErr);
          }
        }

        setSuccessStatus(uploadResult.message);
        setTimeout(() => setSuccessStatus(null), 4000);
      } else {
        // Handle failure
        setErrorType(uploadResult.errorType || 'UNKNOWN_ERROR');
        setErrorMessage(uploadResult.message);

        // If bucket is not provisioned or timeout occurred, offer direct saving option
        if (uploadResult.compressedDataUrl) {
          setPendingDirectPhoto(uploadResult.compressedDataUrl);
          setPreviewUrl(uploadResult.compressedDataUrl);
        }
      }
    } catch (err: any) {
      console.error('Unexpected photo upload error:', err);
      setErrorMessage(
        language === 'bn'
          ? 'ছবি আপলোড করতে অপ্রত্যাশিত সমস্যা হয়েছে। পুনরায় চেষ্টা করুন।'
          : 'Unexpected upload error. Please try again.'
      );
    } finally {
      // Guarantees spinner always stops on success OR failure!
      setIsProcessing(false);
      setUploadProgress(0);
      e.target.value = '';
    }
  };

  // Direct Save fallback when Firebase Storage is not yet enabled
  const handleSaveDirectToDatabase = async () => {
    if (!pendingDirectPhoto) return;
    setIsSavingDirect(true);
    setErrorMessage(null);

    try {
      onPhotoChanged(pendingDirectPhoto);
      setPreviewUrl(pendingDirectPhoto);

      if (playerId && playerId !== 'new' && playerId !== 'draft') {
        await savePlayerPhotoToFirestore(playerId, pendingDirectPhoto);
        onSavedToFirestore?.(pendingDirectPhoto);
      }

      setPendingDirectPhoto(null);
      setSuccessStatus(
        language === 'bn'
          ? 'ছবি সফলভাবে খেলোয়াড়ের প্রোফাইলে সংরক্ষণ করা হয়েছে।'
          : 'Photo successfully saved to player record.'
      );
      setTimeout(() => setSuccessStatus(null), 4000);
    } catch (err: any) {
      console.error('Direct save error:', err);
      setErrorMessage(
        language === 'bn'
          ? 'ডাটাবেজে সংরক্ষণ করতে সমস্যা হয়েছে।'
          : 'Failed to save photo to database.'
      );
    } finally {
      setIsSavingDirect(false);
    }
  };

  // Remove photo handler
  const handleRemovePhoto = async () => {
    const canUpload = isAdmin || allowPublicUpload || playerId === 'draft';
    if (disabled || isProcessing || !canUpload) return;
    if (!previewUrl) return;

    const confirmMsg =
      language === 'bn'
        ? 'আপনি কি নিশ্চিত যে এই খেলোয়াড়ের ছবি মুছে ফেলতে চান?'
        : 'Are you sure you want to remove this player photo?';
    if (!window.confirm(confirmMsg)) return;

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      await deletePlayerPhoto(previewUrl);
      setPreviewUrl('');
      setPendingDirectPhoto(null);
      setImageLoadError(false);
      onPhotoChanged('');

      if (playerId && playerId !== 'new' && playerId !== 'draft') {
        await savePlayerPhotoToFirestore(playerId, '');
        onSavedToFirestore?.('');
      }

      setSuccessStatus(
        language === 'bn' ? 'ছবি সফলভাবে মুছে ফেলা হয়েছে।' : 'Photo removed successfully.'
      );
      setTimeout(() => setSuccessStatus(null), 3000);
    } catch (err: any) {
      console.error('Error removing photo:', err);
      setErrorMessage(
        language === 'bn' ? 'ছবি মুছতে ব্যর্থ হয়েছে।' : 'Failed to delete photo.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-3 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
          <Camera className="w-4 h-4 text-emerald-400" />
          <span>
            {language === 'bn' ? 'খেলোয়াড়ের ছবি (Player Photo)' : 'Player Photo'}
          </span>
          {isAdmin ? (
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-mono">
              Admin
            </span>
          ) : (
            <span className="text-[10px] bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded border border-rose-500/20 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" />
              Admin Only
            </span>
          )}
        </label>

        <button
          type="button"
          onClick={() => setShowStorageGuide(!showStorageGuide)}
          className="text-[11px] text-slate-400 hover:text-emerald-400 flex items-center gap-1 transition-colors cursor-pointer"
        >
          <Info className="w-3.5 h-3.5 text-sky-400" />
          <span>{language === 'bn' ? 'ক্লাউড স্টোরেজ সেটআপ' : 'Storage Setup'}</span>
          {showStorageGuide ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* Manual Setup & Storage Details Guide */}
      {showStorageGuide && (
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700 text-[11px] text-slate-300 space-y-2.5 animate-in fade-in">
          <div className="font-semibold text-white flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <UploadCloud className="w-4 h-4 text-emerald-400" />
              {language === 'bn'
                ? 'Firebase Cloud Storage সেটআপ নির্দেশিকা'
                : 'Firebase Cloud Storage Setup Guide'}
            </span>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
              Spark Plan (Free 5GB)
            </span>
          </div>

          <p className="text-slate-400 leading-relaxed">
            {language === 'bn'
              ? 'Firebase Storage এ ছবি আপলোড করতে প্রজেক্টে একবারের জন্য Cloud Storage ফিচার সক্রিয় থাকতে হয়। Firebase এর ফ্রি স্পার্ক প্ল্যানে কোনো কার্ড ছাড়াই বিনামূল্যে ৫ GB স্টোরেজ পাওয়া যায়।'
              : 'To store player photos in Firebase Storage, Cloud Storage must be enabled once in your Firebase Console. The free Spark plan includes 5 GB of free storage without requiring a credit card.'}
          </p>

          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5 text-[10px]">
            <div className="font-semibold text-slate-300">
              {language === 'bn' ? 'সহজ ৩টি ধাপ:' : '3 Simple Setup Steps:'}
            </div>
            <ol className="list-decimal list-inside space-y-1 text-slate-400">
              <li>
                {language === 'bn'
                  ? 'Firebase কনসোলে যান এবং Build > Storage এ ক্লিক করুন।'
                  : 'Open Firebase Console and click Build > Storage.'}
              </li>
              <li>
                {language === 'bn'
                  ? 'Get Started বাটনে ক্লিক করে পছন্দমতো লোকেশন নির্বাচন করে সম্পন্ন করুন।'
                  : 'Click Get Started, select your preferred location, and finish.'}
              </li>
              <li>
                {language === 'bn'
                  ? 'Storage Rules ট্যাবে storage.rules রুলস সেট করুন।'
                  : 'Paste the provided storage.rules in the Storage Rules tab.'}
              </li>
            </ol>
          </div>

          <div className="flex items-center justify-between pt-1 text-[11px]">
            <a
              href={storageInfo.consoleStorageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 underline font-semibold"
            >
              <span>{language === 'bn' ? 'Firebase Console Storage খুলুন' : 'Open Firebase Console Storage'}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <span className="text-slate-500 font-mono text-[10px]">
              Bucket: {storageInfo.configuredBucket}
            </span>
          </div>
        </div>
      )}

      {/* Main Preview and Action Controls */}
      <div className="flex flex-col sm:flex-row items-center gap-3.5">
        {/* Photo Box Preview */}
        <div className="relative group shrink-0">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-slate-900 border-2 border-dashed border-slate-700 overflow-hidden flex items-center justify-center shadow-lg relative">
            {previewUrl && !imageLoadError ? (
              <img
                src={previewUrl}
                alt="Player Preview"
                onLoad={() => setImageLoadError(false)}
                onError={() => setImageLoadError(true)}
                className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-500 p-2 text-center">
                <ImageIcon className="w-8 h-8 text-slate-600 mb-1" />
                <span className="text-[10px] text-slate-400">
                  {imageLoadError
                    ? language === 'bn'
                      ? 'ছবি লোড হয়নি'
                      : 'Load failed'
                    : language === 'bn'
                    ? 'ছবি নেই'
                    : 'No photo'}
                </span>
              </div>
            )}

            {/* Loading Spinner with Progress Percentage */}
            {isProcessing && (
              <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center text-white p-1 text-center">
                <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin mb-1" />
                <span className="text-[11px] font-bold text-emerald-300">
                  {uploadProgress > 0 ? `${uploadProgress}%` : ''}
                </span>
                <span className="text-[9px] text-slate-300 leading-tight">
                  {language === 'bn' ? 'প্রসেসিং হচ্ছে...' : 'Processing...'}
                </span>
              </div>
            )}
          </div>

          {/* Remove Photo Button */}
          {previewUrl && !disabled && isAdmin && !isProcessing && (
            <button
              type="button"
              onClick={handleRemovePhoto}
              title={language === 'bn' ? 'ছবি মুছে ফেলুন' : 'Remove photo'}
              className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-md transition-transform hover:scale-110 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Upload Buttons for Android Camera and Gallery */}
        <div className="flex-1 space-y-2 w-full">
          <div className="grid grid-cols-2 gap-2">
            {/* Native Android Camera Button */}
            <button
              type="button"
              disabled={disabled || isProcessing || !isAdmin}
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold shadow-xs hover:border-emerald-500/50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Camera className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{language === 'bn' ? 'ক্যামেরা' : 'Camera'}</span>
            </button>

            {/* Android Phone Gallery / File Picker */}
            <button
              type="button"
              disabled={disabled || isProcessing || !isAdmin}
              onClick={() => galleryInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold shadow-xs hover:border-emerald-500/50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ImageIcon className="w-4 h-4 text-sky-400 shrink-0" />
              <span>{language === 'bn' ? 'গ্যালারি' : 'Gallery'}</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-400 leading-tight">
            {language === 'bn'
              ? 'অ্যান্ড্রয়েড ফোন থেকে সরাসরি ক্যামেরা দিয়ে ছবি তুলুন অথবা গ্যালারি থেকে JPG, PNG, WEBP ছবি দিন (সর্বোচ্চ ৫ MB)।'
              : 'Take a photo using your Android camera or pick from phone gallery (JPG, PNG, WEBP, max 5 MB).'}
          </p>

          {/* Hidden inputs tailored for Android Chrome */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/jpg,.jpg,.jpeg,.png,.webp"
            capture="environment"
            className="hidden"
            onChange={handleFileSelected}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/jpg,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={handleFileSelected}
          />
        </div>
      </div>

      {/* Success Notification */}
      {successStatus && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{successStatus}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div className="space-y-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs animate-in fade-in">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold block">{errorMessage}</span>
              {errorType === 'BUCKET_NOT_FOUND' && (
                <div className="text-[11px] text-slate-300 pt-1">
                  <span>Firebase কনসোলে </span>
                  <a
                    href={storageInfo.consoleStorageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 underline font-semibold inline-flex items-center gap-0.5"
                  >
                    Storage ট্যাবে যান <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  <span> এবং &quot;Get Started&quot; এ ক্লিক করে বাকেট চালু করুন।</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Direct Save Fallback Action when Storage is unprovisioned */}
      {pendingDirectPhoto && (
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-2 animate-in fade-in">
          <div className="space-y-0.5">
            <span className="font-bold text-white block">
              {language === 'bn' ? 'ছবিটি কি সরাসরি সংরক্ষণ করতে চান?' : 'Save photo directly to profile?'}
            </span>
            <span className="text-[11px] text-amber-300/90 block">
              {language === 'bn'
                ? 'ক্লাউড স্টোরেজ সেটআপ ছাড়াই ছবিটি ডেটাবেজে সংরক্ষিত হবে।'
                : 'Save optimized photo directly in the database without cloud storage setup.'}
            </span>
          </div>
          <button
            type="button"
            disabled={isSavingDirect}
            onClick={handleSaveDirectToDatabase}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shrink-0 flex items-center gap-1 shadow-sm cursor-pointer disabled:opacity-50"
          >
            {isSavingDirect ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{language === 'bn' ? 'সেভ করুন' : 'Save Now'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
