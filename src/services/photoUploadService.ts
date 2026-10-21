/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  UploadTask,
} from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { storage, db, getStorageConfigInfo } from '../firebase/config';

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  fileInfo?: {
    name: string;
    sizeKb: number;
    type: string;
  };
}

export interface CompressedImageResult {
  dataUrl: string;
  blob: Blob;
  originalSizeKb: number;
  compressedSizeKb: number;
  width: number;
  height: number;
}

export type StorageErrorType =
  | 'VALIDATION_ERROR'
  | 'BUCKET_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'COMPRESSION_FAILED'
  | 'UNKNOWN_ERROR';

export interface UploadPhotoResult {
  success: boolean;
  url: string;
  storageType: 'firebase_storage' | 'direct_optimized';
  message: string;
  errorType?: StorageErrorType;
  errorDetail?: string;
  compressedDataUrl?: string;
  compressedSizeKb?: number;
  setupGuideUrl?: string;
}

// 5MB maximum upload limit
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

/**
 * Validates player photo file type and size.
 * Supports JPG, JPEG, PNG, WEBP from Android camera or gallery.
 */
export function validateImageFile(file: File, language: 'bn' | 'en' = 'bn'): ImageValidationResult {
  if (!file) {
    return {
      valid: false,
      error: language === 'bn' ? 'কোনো ফাইল নির্বাচন করা হয়নি।' : 'No file selected.',
    };
  }

  // Type check: check MIME type and filename extension
  const fileType = file.type ? file.type.toLowerCase() : '';
  const fileName = file.name ? file.name.toLowerCase() : '';
  const isTypeAllowed =
    ALLOWED_IMAGE_TYPES.includes(fileType) ||
    Boolean(fileName.match(/\.(jpe?g|png|webp)$/i));

  if (!isTypeAllowed) {
    return {
      valid: false,
      error:
        language === 'bn'
          ? 'শুধুমাত্র JPG, JPEG, PNG অথবা WEBP ফরম্যাটের ছবি আপলোড করা যাবে।'
          : 'Only JPG, JPEG, PNG, or WEBP image formats are supported.',
    };
  }

  // Size check (max 5MB)
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error:
        language === 'bn'
          ? `ফাইলের আকার (${sizeMb} MB) অতিরিক্ত বড়। সর্বোচ্চ ৫ MB আকারের ছবি দিন।`
          : `File size (${sizeMb} MB) is too large. Maximum size allowed is 5 MB.`,
    };
  }

  return {
    valid: true,
    fileInfo: {
      name: file.name,
      sizeKb: Math.round(file.size / 1024),
      type: fileType || 'image/jpeg',
    },
  };
}

/**
 * Compresses an image client-side using HTML5 Canvas.
 * Uses URL.createObjectURL instead of loading massive base64 strings into memory,
 * preventing mobile Android browser memory spikes and tab crashes.
 * Includes a 6-second timeout so it never hangs indefinitely.
 */
export function compressImageClientSide(
  file: File,
  maxDimension = 800,
  quality = 0.82
): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    let hasFinished = false;
    let objectUrl: string | null = null;

    // Timeout guard: 6 seconds max
    const timer = setTimeout(() => {
      if (!hasFinished) {
        hasFinished = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(new Error('Image processing timed out on your device.'));
      }
    }, 6000);

    try {
      objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onerror = () => {
        if (hasFinished) return;
        hasFinished = true;
        clearTimeout(timer);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(new Error('Browser could not decode this image format.'));
      };

      img.onload = () => {
        if (hasFinished) return;
        clearTimeout(timer);

        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          if (!width || !height) {
            hasFinished = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            reject(new Error('Invalid image dimensions.'));
            return;
          }

          // Maintain aspect ratio while bounding within maxDimension
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            hasFinished = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            reject(new Error('Canvas 2D context not available.'));
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Get optimized base64 Data URL
          const dataUrl = canvas.toDataURL('image/jpeg', quality);

          // Convert to Blob for Firebase Storage upload
          canvas.toBlob(
            blob => {
              hasFinished = true;
              if (objectUrl) URL.revokeObjectURL(objectUrl);

              if (!blob) {
                reject(new Error('Canvas toBlob conversion failed.'));
                return;
              }

              resolve({
                dataUrl,
                blob,
                originalSizeKb: Math.round(file.size / 1024),
                compressedSizeKb: Math.round(blob.size / 1024),
                width,
                height,
              });
            },
            'image/jpeg',
            quality
          );
        } catch (drawErr) {
          hasFinished = true;
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          reject(drawErr);
        }
      };

      img.src = objectUrl;
    } catch (err) {
      if (!hasFinished) {
        hasFinished = true;
        clearTimeout(timer);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    }
  });
}

/**
 * Checks whether the Firebase Storage bucket is actually provisioned in the project.
 * Returns true if bucket exists or returns 401/403/200; returns false if returns 404 (unprovisioned).
 */
export async function checkStorageBucketReachable(bucketName?: string): Promise<{
  enabled: boolean;
  statusText: string;
}> {
  const config = getStorageConfigInfo();
  const bucket = bucketName || config.configuredBucket;
  if (!bucket) {
    return { enabled: false, statusText: 'Bucket not configured in firebase-applet-config.json' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 404) {
      return {
        enabled: false,
        statusText: `Bucket ${bucket} has not been created in Firebase Console yet (HTTP 404).`,
      };
    }
    return { enabled: true, statusText: 'Bucket reachable.' };
  } catch (err: any) {
    return { enabled: false, statusText: err.message || 'Network error reaching bucket' };
  }
}

/**
 * Uploads a player photo.
 * 1. Validates file type and size.
 * 2. Compresses the photo client-side.
 * 3. Uses an UploadTask with real progress reporting and timeout protection.
 * 4. Never hangs indefinitely; catches all storage errors and surfaces visible error messages.
 */
export async function uploadPlayerPhoto(
  file: File,
  playerId: string,
  seasonId: string = 'season-2-2026',
  language: 'bn' | 'en' = 'bn',
  options?: {
    onProgress?: (progressPercent: number) => void;
    timeoutMs?: number;
  }
): Promise<UploadPhotoResult> {
  const config = getStorageConfigInfo();

  // 1. Validate
  const validation = validateImageFile(file, language);
  if (!validation.valid) {
    return {
      success: false,
      url: '',
      storageType: 'direct_optimized',
      errorType: 'VALIDATION_ERROR',
      message: validation.error || 'Invalid file',
    };
  }

  // 2. Compress on device
  let compressed: CompressedImageResult;
  try {
    compressed = await compressImageClientSide(file, 800, 0.82);
    options?.onProgress?.(25);
  } catch (compErr: any) {
    console.error('Client compression error:', compErr);
    return {
      success: false,
      url: '',
      storageType: 'direct_optimized',
      errorType: 'COMPRESSION_FAILED',
      message:
        language === 'bn'
          ? 'ছবি প্রসেস করতে সমস্যা হয়েছে। অনুগ্রহ করে অন্য ছবি নির্বাচন করুন।'
          : 'Failed to process image. Please try another image.',
      errorDetail: compErr?.message,
    };
  }

  // 3. Check if Firebase Storage is initialized
  if (!storage || !config.isConfigured) {
    return {
      success: false,
      url: '',
      storageType: 'direct_optimized',
      errorType: 'BUCKET_NOT_FOUND',
      compressedDataUrl: compressed.dataUrl,
      compressedSizeKb: compressed.compressedSizeKb,
      message:
        language === 'bn'
          ? 'Firebase Storage কনফিগার করা হয়নি। নিচে সরাসরি ডাটাবেজে সংরক্ষণ করার বিকল্প রয়েছে।'
          : 'Firebase Storage is not configured. You can save directly to the database below.',
      setupGuideUrl: config.consoleStorageUrl,
    };
  }

  // 4. Attempt upload via UploadTask with timeout protection
  const cleanPlayerId = playerId ? playerId.replace(/[^a-zA-Z0-9_-]/g, '') : `new_${Date.now()}`;
  const cleanSeasonId = seasonId ? seasonId.replace(/[^a-zA-Z0-9_-]/g, '') : 'season-2';
  const filename = `player_${cleanPlayerId}_${Date.now()}.jpg`;
  const storagePath = `players/${cleanSeasonId}/${filename}`;
  const storageRef = ref(storage, storagePath);

  const metadata = {
    contentType: 'image/jpeg',
    customMetadata: {
      playerId: cleanPlayerId,
      seasonId: cleanSeasonId,
      uploadedAt: new Date().toISOString(),
    },
  };

  return new Promise<UploadPhotoResult>(resolve => {
    let taskCompleted = false;
    let uploadTask: UploadTask;

    // Timeout: 8 seconds max to prevent endless spinner on mobile
    const timeoutMs = options?.timeoutMs || 8000;
    const timeoutTimer = setTimeout(() => {
      if (!taskCompleted) {
        taskCompleted = true;
        try {
          uploadTask?.cancel();
        } catch (_) {}

        resolve({
          success: false,
          url: '',
          storageType: 'direct_optimized',
          errorType: 'TIMEOUT',
          compressedDataUrl: compressed.dataUrl,
          compressedSizeKb: compressed.compressedSizeKb,
          message:
            language === 'bn'
              ? 'ক্লাউড স্টোরেজে আপলোড করার সময়সীমা অতিক্রান্ত হয়েছে (টাইমআউট)। Firebase Console এ Storage বাকেট সক্রিয় করা আছে কিনা যাচাই করুন।'
              : 'Upload request timed out. Please verify that the Firebase Storage bucket is enabled in the Firebase Console.',
          setupGuideUrl: config.consoleStorageUrl,
        });
      }
    }, timeoutMs);

    try {
      uploadTask = uploadBytesResumable(storageRef, compressed.blob, metadata);

      uploadTask.on(
        'state_changed',
        snapshot => {
          if (taskCompleted) return;
          if (snapshot.totalBytes > 0) {
            const percent = Math.round(
              25 + (snapshot.bytesTransferred / snapshot.totalBytes) * 70
            );
            options?.onProgress?.(percent);
          }
        },
        storageError => {
          if (taskCompleted) return;
          taskCompleted = true;
          clearTimeout(timeoutTimer);

          const errorCode = storageError?.code || '';
          console.warn('Firebase Storage upload error:', errorCode, storageError);

          let errorType: StorageErrorType = 'UNKNOWN_ERROR';
          let message = '';

          if (
            errorCode === 'storage/bucket-not-found' ||
            errorCode === 'storage/project-not-found' ||
            storageError.message?.includes('404')
          ) {
            errorType = 'BUCKET_NOT_FOUND';
            message =
              language === 'bn'
                ? `Firebase Cloud Storage বাকেট (${config.configuredBucket}) এখনও সক্রিয় করা হয়নি। অনুগ্রহ করে Firebase কনসোল থেকে Storage চালু করুন।`
                : `Firebase Cloud Storage bucket (${config.configuredBucket}) is not enabled yet in your Firebase console. Please visit the Firebase Console to activate it.`;
          } else if (
            errorCode === 'storage/unauthorized' ||
            errorCode === 'permission-denied'
          ) {
            errorType = 'PERMISSION_DENIED';
            message =
              language === 'bn'
                ? 'Firebase Storage এর নিরাপত্তা পারমিশন ত্রুটি। শুধুমাত্র অনুমোদিত অ্যাডমিন ছবি আপলোড করতে পারবেন।'
                : 'Firebase Storage permission denied. Uploads are restricted to authorized administrators.';
          } else if (
            errorCode === 'storage/retry-limit-exceeded' ||
            errorCode === 'storage/network-request-failed'
          ) {
            errorType = 'NETWORK_ERROR';
            message =
              language === 'bn'
                ? 'ইন্টারনেট সংযোগ বিচ্ছিন্ন বা ধীরগতির কারণে আপলোড ব্যর্থ হয়েছে।'
                : 'Network connection failed while uploading to Firebase Storage.';
          } else if (errorCode === 'storage/canceled') {
            errorType = 'TIMEOUT';
            message =
              language === 'bn'
                ? 'আপলোড বাতিল হয়েছে।'
                : 'Upload was canceled.';
          } else {
            errorType = 'UNKNOWN_ERROR';
            message =
              language === 'bn'
                ? `Firebase Storage ত্রুটি (${errorCode || 'Unknown'})`
                : `Firebase Storage error (${errorCode || 'Unknown'})`;
          }

          resolve({
            success: false,
            url: '',
            storageType: 'direct_optimized',
            errorType,
            errorDetail: storageError.message,
            compressedDataUrl: compressed.dataUrl,
            compressedSizeKb: compressed.compressedSizeKb,
            message,
            setupGuideUrl: config.consoleStorageUrl,
          });
        },
        async () => {
          if (taskCompleted) return;
          taskCompleted = true;
          clearTimeout(timeoutTimer);
          options?.onProgress?.(100);

          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({
              success: true,
              url: downloadUrl,
              storageType: 'firebase_storage',
              compressedSizeKb: compressed.compressedSizeKb,
              message:
                language === 'bn'
                  ? `Firebase ক্লাউড স্টোরেজে সফলভাবে আপলোড হয়েছে (${compressed.compressedSizeKb} KB)`
                  : `Uploaded successfully to Firebase Cloud Storage (${compressed.compressedSizeKb} KB)`,
            });
          } catch (urlErr: any) {
            resolve({
              success: false,
              url: '',
              storageType: 'direct_optimized',
              errorType: 'UNKNOWN_ERROR',
              errorDetail: urlErr?.message,
              compressedDataUrl: compressed.dataUrl,
              compressedSizeKb: compressed.compressedSizeKb,
              message:
                language === 'bn'
                  ? 'ডাউনলোড লিঙ্ক সংগ্রহ করতে ব্যর্থ হয়েছে।'
                  : 'Failed to retrieve image download URL from storage.',
            });
          }
        }
      );
    } catch (startErr: any) {
      if (!taskCompleted) {
        taskCompleted = true;
        clearTimeout(timeoutTimer);
        resolve({
          success: false,
          url: '',
          storageType: 'direct_optimized',
          errorType: 'UNKNOWN_ERROR',
          errorDetail: startErr?.message,
          compressedDataUrl: compressed.dataUrl,
          compressedSizeKb: compressed.compressedSizeKb,
          message: startErr?.message || 'Failed to initiate storage upload task.',
        });
      }
    }
  });
}

/**
 * Saves or updates a player's photoUrl directly in Firestore.
 */
export async function savePlayerPhotoToFirestore(
  playerId: string,
  photoUrl: string
): Promise<void> {
  if (!playerId || playerId === 'new' || playerId === 'draft') return;
  const playerRef = doc(db, 'players', playerId);
  await updateDoc(playerRef, {
    photoUrl,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Removes photo from Firebase Storage if it's a storage URL.
 */
export async function deletePlayerPhoto(photoUrl?: string | null): Promise<boolean> {
  if (!photoUrl) return true;
  if (!storage || !photoUrl.includes('firebasestorage.googleapis.com')) {
    return true;
  }
  try {
    const storageRef = ref(storage, photoUrl);
    await deleteObject(storageRef);
    return true;
  } catch (err) {
    console.warn('Could not delete file from Firebase Storage:', err);
    return true;
  }
}
