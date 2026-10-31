/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  UserPlus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Mail,
  Clock,
  User,
  Lock,
  RefreshCw,
  Sparkles,
  Info,
} from 'lucide-react';
import { useAuth, BOOTSTRAP_ADMIN_EMAIL } from '../context/AuthContext';
import { AdminRecord } from '../types';
import {
  subscribeToAuthorizedAdmins,
  addAuthorizedAdmin,
  removeAuthorizedAdmin,
  PRIMARY_ADMIN_EMAIL,
} from '../services/adminManagementService';

interface AdminManagementSectionProps {
  onClose?: () => void;
  isModal?: boolean;
}

export const AdminManagementSection: React.FC<AdminManagementSectionProps> = ({
  onClose,
  isModal = false,
}) => {
  const { currentUser, isPrimaryAdmin, isAdmin, language } = useAuth();

  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal confirmation states
  const [confirmAddOpen, setConfirmAddOpen] = useState(false);
  const [adminToRemove, setAdminToRemove] = useState<AdminRecord | null>(null);

  // Subscribe to real-time admins
  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToAuthorizedAdmins(
      list => {
        setAdmins(list);
        setLoading(false);
      },
      err => {
        console.warn('Admin subscription error:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const clearFeedbackAfterDelay = () => {
    setTimeout(() => {
      setFeedback(null);
    }, 6000);
  };

  const handleInitiateAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const emailTrimmed = newEmail.trim().toLowerCase();
    if (!emailTrimmed) {
      setFeedback({ type: 'error', message: 'অনুগ্রহ করে একটি জিমেইল ঠিকানা লিখুন।' });
      clearFeedbackAfterDelay();
      return;
    }

    if (!emailTrimmed.includes('@') || !emailTrimmed.includes('.')) {
      setFeedback({ type: 'error', message: 'সঠিক জিমেইল ঠিকানা লিখুন (যেমন: name@gmail.com)।' });
      clearFeedbackAfterDelay();
      return;
    }

    if (emailTrimmed === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
      setFeedback({ type: 'error', message: 'এই জিমেইলটি ইতিমধ্যে প্রধান অ্যাডমিন হিসেবে সংরক্ষিত।' });
      clearFeedbackAfterDelay();
      return;
    }

    const alreadyExists = admins.some(a => a.email.toLowerCase() === emailTrimmed);
    if (alreadyExists) {
      setFeedback({ type: 'error', message: 'এই জিমেইলটি ইতিমধ্যে তালিকায় সক্রিয় আছে।' });
      clearFeedbackAfterDelay();
      return;
    }

    setConfirmAddOpen(true);
  };

  const handleConfirmAdd = async () => {
    if (!isPrimaryAdmin) {
      setFeedback({
        type: 'error',
        message: 'শুধুমাত্র প্রধান অ্যাডমিন (arifhossainbd087@gmail.com) নতুন অ্যাডমিন যোগ করতে পারেন।',
      });
      setConfirmAddOpen(false);
      clearFeedbackAfterDelay();
      return;
    }

    setIsSubmitting(true);
    try {
      const actorEmail = currentUser?.email || PRIMARY_ADMIN_EMAIL;
      const res = await addAuthorizedAdmin(newEmail, actorEmail, newNotes);
      setFeedback({ type: 'success', message: res.message });
      setNewEmail('');
      setNewNotes('');
      setConfirmAddOpen(false);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'অ্যাডমিন যোগ করতে ব্যর্থ হয়েছে।' });
    } finally {
      setIsSubmitting(false);
      clearFeedbackAfterDelay();
    }
  };

  const handleConfirmRemove = async () => {
    if (!adminToRemove) return;

    if (!isPrimaryAdmin) {
      setFeedback({
        type: 'error',
        message: 'শুধুমাত্র প্রধান অ্যাডমিন অন্য অ্যাডমিনকে অপসারণ করতে পারেন।',
      });
      setAdminToRemove(null);
      clearFeedbackAfterDelay();
      return;
    }

    if (adminToRemove.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
      setFeedback({
        type: 'error',
        message: 'প্রধান অ্যাডমিনকে অপসারণ করা সম্পূর্ণ নিষিদ্ধ।',
      });
      setAdminToRemove(null);
      clearFeedbackAfterDelay();
      return;
    }

    setIsSubmitting(true);
    try {
      const actorEmail = currentUser?.email || PRIMARY_ADMIN_EMAIL;
      const res = await removeAuthorizedAdmin(adminToRemove.email, actorEmail);
      setFeedback({ type: 'success', message: res.message });
      setAdminToRemove(null);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'অ্যাডমিন অপসারণ করতে ব্যর্থ হয়েছে।' });
    } finally {
      setIsSubmitting(false);
      clearFeedbackAfterDelay();
    }
  };

  if (!isAdmin) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center max-w-lg mx-auto my-8 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">অনুমতি প্রয়োজন (Admin Only)</h3>
        <p className="text-sm text-slate-400 leading-relaxed">
          অ্যাডমিন ম্যানেজমেন্ট শুধুমাত্র অনুমোদিত অ্যাডমিনিস্ট্রেটরদের জন্য সংরক্ষিত। সাধারণ ব্যবহারকারী বা দর্শকদের এই পাতা দেখার অনুমতি নেই।
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${isModal ? '' : 'max-w-6xl mx-auto px-4 sm:px-6 py-6'}`}>
      {/* Top Banner: Status and Identity Badge */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800/90 to-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-lg ${
                isPrimaryAdmin
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-amber-950/40'
                  : 'bg-teal-500/15 border-teal-500/30 text-teal-400 shadow-teal-950/40'
              }`}
            >
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {language === 'bn' ? 'অ্যাডমিন ম্যানেজমেন্ট ও অ্যাক্সেস কন্ট্রোল' : 'Admin Authorization Management'}
                </h2>
                {isPrimaryAdmin ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    প্রধান অ্যাডমিন (Primary Admin)
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                    সহকারী অ্যাডমিন (Assistant Admin)
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                {isPrimaryAdmin
                  ? `আপনি স্থায়ী প্রধান অ্যাডমিন (${PRIMARY_ADMIN_EMAIL}) হিসেবে পূর্ণ ক্ষমতাপ্রাপ্ত। আপনি নতুন সহকারী অ্যাডমিন যোগ বা অপসারণ করতে পারেন।`
                  : `আপনি অনুমোদিত সহকারী অ্যাডমিন হিসেবে লগইন আছেন। নিরাপত্তার সুবিধার্থে শুধুমাত্র প্রধান অ্যাডমিন (${PRIMARY_ADMIN_EMAIL}) নতুন অ্যাডমিন যোগ বা অপসারণ করতে পারবেন।`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <span className="text-xs text-slate-400 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800">
              মোট অ্যাডমিন: <strong className="text-white font-mono">{admins.length}</strong> জন
            </span>
          </div>
        </div>
      </div>

      {/* Feedback Alert Toast */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-sm flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs opacity-75 hover:opacity-100 underline cursor-pointer"
          >
            বন্ধ করুন
          </button>
        </div>
      )}

      {/* Main Grid: Add Admin Form + Authorized Admins List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Add Admin Panel (Admin-Only) */}
        <div className="lg:col-span-5">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
                <UserPlus className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">নতুন সহকারী অ্যাডমিন যোগ</h3>
                <p className="text-[11px] text-slate-400">জিমেইল ঠিকানার মাধ্যমে অধিকার প্রদান</p>
              </div>
            </div>

            {isPrimaryAdmin ? (
              <form onSubmit={handleInitiateAdd} className="space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    জিমেইল ঠিকানা (Gmail Address) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input
                      type="email"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      placeholder="e.g. colleague@gmail.com"
                      required
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    সংশ্লিষ্ট ব্যক্তি এই জিমেইলে গুগল বা ইমেইল লগইন করলে সরাসরি অ্যাডমিন এক্সেস পাবেন।
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    নাম বা দায়িত্ব (ঐচ্ছিক বিবরণ)
                  </label>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    placeholder="যেমন: অকশনার / টেকনিক্যাল সাপোর্ট"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:border-purple-500 focus:outline-none transition-colors"
                  />
                </div>

                <div className="bg-purple-950/20 border border-purple-800/30 rounded-2xl p-3 text-[11px] text-purple-300 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-purple-400" />
                    সহকারী অ্যাডমিনের সুবিধাসমূহ:
                  </div>
                  <ul className="list-disc list-inside text-slate-400 space-y-0.5 text-[10px] pl-1">
                    <li>লাইভ নিলাম শুরু, বিরতি ও কাউন্টডাউন পরিচালনা</li>
                    <li>বেস প্রাইজ ও খেলোয়াড়ের বিবরণ সম্পাদনা</li>
                    <li>নতুন আবেদন যাচাই ও খেলোয়াড় অনুমোদন/বাতিল</li>
                    <li>দলের বাজেট সমন্বয় ও রিসেট</li>
                  </ul>
                  <p className="text-[10px] text-amber-300/90 pt-1 border-t border-purple-900/40">
                    * সহকারী অ্যাডমিন কখনোই অন্য অ্যাডমিন যোগ বা অপসারণ করতে পারবেন না।
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !newEmail.trim()}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold shadow-md shadow-purple-950/50 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>অ্যাডমিন হিসেবে অনুমতি দিন</span>
                </button>
              </form>
            ) : (
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-slate-300">
                  নিয়ন্ত্রণ শুধুমাত্র প্রধান অ্যাডমিনের জন্য
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  সহকারী অ্যাডমিন হিসেবে আপনি এই তালিকা দেখতে পারছেন, তবে নতুন অ্যাডমিন যোগ বা কাউকে অপসারণ করার অনুমতি শুধুমাত্র প্রধান অ্যাডমিন (<span className="text-amber-400">{PRIMARY_ADMIN_EMAIL}</span>) এর কাছে সংরক্ষিত।
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Authorized Admins List */}
        <div className="lg:col-span-7">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">অনুমোদিত অ্যাডমিনদের তালিকা</h3>
                  <p className="text-[11px] text-slate-400">সিস্টেম ব্যবহারের বৈধ অনুমতিপ্রাপ্ত হিসাবসমূহ</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                  {admins.length} ACTIVE
                </span>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                <span>অ্যাডমিন তালিকা লোড হচ্ছে...</span>
              </div>
            ) : admins.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs italic">
                কোনো অ্যাডমিন রেকর্ড পাওয়া যায়নি।
              </div>
            ) : (
              <div className="space-y-3">
                {admins.map(admin => {
                  const isPrimary = admin.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();

                  return (
                    <div
                      key={admin.id || admin.email}
                      className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isPrimary
                          ? 'bg-amber-950/20 border-amber-500/30'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                            isPrimary
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                              : 'bg-teal-500/15 border-teal-500/30 text-teal-400'
                          }`}
                        >
                          {isPrimary ? <Sparkles className="w-4 h-4" /> : <User className="w-4 h-4" />}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs sm:text-sm font-semibold text-white font-mono break-all">
                              {admin.email}
                            </span>
                            {isPrimary ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                প্রধান অ্যাডমিন
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                                সহকারী অ্যাডমিন
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 flex-wrap">
                            {admin.notes && (
                              <span className="text-slate-300 italic">
                                "{admin.notes}"
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-[10px] text-slate-500">
                              <Clock className="w-3 h-3" />
                              সংযোজন: {admin.addedAt ? new Date(admin.addedAt).toLocaleDateString('bn-BD') : 'মূল সিস্টেম'}
                            </span>
                            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                              সক্রিয় (Active)
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        {isPrimary ? (
                          <div className="flex items-center gap-1 text-[11px] text-amber-400/80 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                            <Lock className="w-3 h-3 text-amber-400" />
                            <span>স্থায়ী অ্যাডমিন</span>
                          </div>
                        ) : isPrimaryAdmin ? (
                          <button
                            onClick={() => setAdminToRemove(admin)}
                            disabled={isSubmitting}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:text-rose-200 text-xs font-semibold transition-colors cursor-pointer"
                            title="অনুমতি বাতিল করুন"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>অনুমতি বাতিল</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">
                            শুধুমাত্র প্রধান অ্যাডমিন
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal: Add Admin */}
      {confirmAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/30 text-purple-400 flex items-center justify-center mx-auto">
              <UserPlus className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-white">নতুন অ্যাডমিন নিশ্চিতকরণ</h3>
              <p className="text-xs text-slate-400">
                আপনি কি নিশ্চিত যে নিচের জিমেইলকে সহকারী অ্যাডমিন হিসেবে যুক্ত করতে চান?
              </p>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center font-mono text-sm text-purple-300 break-all">
              {newEmail}
            </div>

            <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3 text-[11px] text-amber-300 leading-relaxed">
              সতর্কবার্তা: অনুমোদিত ব্যক্তি নিলাম শুরু, বিরতি, প্লেয়ার অনুমোদন ও বাজেট পরিবর্তনের অধিকার পাবেন।
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmAddOpen(false)}
                disabled={isSubmitting}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={handleConfirmAdd}
                disabled={isSubmitting}
                className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white shadow-lg shadow-purple-950 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>যুক্ত হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>হ্যাঁ, অনুমতি দিন</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Remove Admin */}
      {adminToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-white">অ্যাডমিন অধিকার বাতিলের সতর্কতা</h3>
              <p className="text-xs text-slate-400">
                আপনি কি নিশ্চিত যে নিচের ব্যবহারকারীর অ্যাডমিন অনুমতি প্রত্যাহার করতে চান?
              </p>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center font-mono text-sm text-rose-300 break-all">
              {adminToRemove.email}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed text-center">
              অনুমতি বাতিল করার সাথে সাথে তিনি আর কোনো অ্যাডমিন প্যানেল এক্সেস করতে পারবেন না এবং সাধারণ দর্শকে পরিণত হবেন।
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAdminToRemove(null)}
                disabled={isSubmitting}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                ফিরে যান
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                disabled={isSubmitting}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow-lg shadow-rose-950 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>বাতিল হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>হ্যাঁ, অনুমতি প্রত্যাহার করুন</span>
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
