import React, { useState } from 'react';
import { X, LogIn, Mail, Lock, Shield, Sparkles } from 'lucide-react';
import { useAuth, BOOTSTRAP_ADMIN_EMAIL } from '../context/AuthContext';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'bn' | 'en';
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, language }) => {
  const { loginWithGoogle, loginWithEmail, registerWithEmail } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleAuth = async () => {
    setIsLoading(true);
    setAuthError(null);
    try {
      await loginWithGoogle();
      onClose();
    } catch (err: unknown) {
      setAuthError(
        err instanceof Error ? err.message : 'গুগল লগইন সম্পন্ন করতে সমস্যা হয়েছে'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setIsLoading(true);
    setAuthError(null);
    try {
      if (mode === 'login') {
        await loginWithEmail(email.trim(), password);
      } else {
        await registerWithEmail(email.trim(), password);
      }
      onClose();
    } catch (err: unknown) {
      setAuthError(
        err instanceof Error ? err.message : 'লগইন ব্যর্থ হয়েছে। পাসওয়ার্ড বা ইমেইল সঠিক নয়।'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <LogIn className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-white">
              {mode === 'login'
                ? language === 'bn'
                  ? 'নিরাপদ অ্যাকাউন্ট লগইন'
                  : 'Account Login'
                : language === 'bn'
                ? 'নতুন অ্যাকাউন্ট নিবন্ধন'
                : 'Create Account'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {authError && (
          <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs">
            {authError}
          </div>
        )}

        {/* Google One-Click Sign In */}
        <button
          onClick={handleGoogleAuth}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>
            {language === 'bn' ? 'Google দিয়ে সাইন ইন করুন' : 'Sign in with Google'}
          </span>
        </button>

        <div className="flex items-center gap-2 my-2">
          <div className="flex-1 h-px bg-slate-800"></div>
          <span className="text-[10px] text-slate-500 uppercase font-mono">
            {language === 'bn' ? 'অথবা ইমেইল দিয়ে' : 'or with email'}
          </span>
          <div className="flex-1 h-px bg-slate-800"></div>
        </div>

        {/* Email Password Form */}
        <form onSubmit={handleEmailAuth} className="space-y-3 text-xs">
          <div>
            <label className="text-slate-300 font-medium block mb-1">
              {language === 'bn' ? 'ইমেইল অ্যাড্রেস' : 'Email Address'}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-300 font-medium block mb-1">
              {language === 'bn' ? 'পাসওয়ার্ড' : 'Password'}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-950 transition-all cursor-pointer disabled:opacity-50"
          >
            {isLoading
              ? language === 'bn'
                ? 'অপেক্ষা করুন...'
                : 'Please wait...'
              : mode === 'login'
              ? language === 'bn'
                ? 'লগইন করুন'
                : 'Login'
              : language === 'bn'
              ? 'নিবন্ধন করুন'
              : 'Register'}
          </button>
        </form>

        <div className="pt-2 text-center text-xs text-slate-400">
          {mode === 'login' ? (
            <button
              onClick={() => setMode('register')}
              className="text-emerald-400 hover:underline cursor-pointer"
            >
              {language === 'bn' ? 'অ্যাকাউন্ট নেই? নতুন অ্যাকাউন্ট খুলুন' : "Don't have an account? Sign up"}
            </button>
          ) : (
            <button
              onClick={() => setMode('login')}
              className="text-emerald-400 hover:underline cursor-pointer"
            >
              {language === 'bn' ? 'আগে থেকেই অ্যাকাউন্ট আছে? লগইন করুন' : 'Already have an account? Login'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
