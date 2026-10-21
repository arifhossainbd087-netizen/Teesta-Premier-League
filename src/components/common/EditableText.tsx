/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Edit2, Check, X, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export interface EditableTextOption {
  value: string;
  label: string;
}

export interface EditableTextProps {
  value: string | number | undefined | null;
  onSave: (newValue: string | number) => Promise<void> | void;
  label?: string;
  type?: 'text' | 'textarea' | 'number' | 'select';
  options?: EditableTextOption[];
  validate?: (val: string | number) => string | null;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string; // Text styling
  containerClassName?: string;
  pencilClassName?: string;
  renderValue?: (val: any) => React.ReactNode;
  children?: React.ReactNode;
  disabled?: boolean;
  inline?: boolean;
  prefix?: string;
  suffix?: string;
}

export const EditableText: React.FC<EditableTextProps> = ({
  value,
  onSave,
  label = 'তথ্য সম্পাদনা (Edit Field)',
  type = 'text',
  options = [],
  validate,
  required = true,
  min,
  max,
  step,
  placeholder,
  className = '',
  containerClassName = '',
  pencilClassName = '',
  renderValue,
  children,
  disabled = false,
  inline = true,
  prefix = '',
  suffix = '',
}) => {
  const { isAdmin, language } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [currentDraft, setCurrentDraft] = useState<string>(value !== undefined && value !== null ? String(value) : '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  // Sync draft when value prop changes externally
  useEffect(() => {
    if (!isEditing) {
      setCurrentDraft(value !== undefined && value !== null ? String(value) : '');
    }
  }, [value, isEditing]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  // If not admin or disabled, render plain value without edit button
  if (!isAdmin || disabled) {
    if (children) return <>{children}</>;
    return (
      <span className={className}>
        {renderValue ? renderValue(value) : (value !== undefined && value !== null ? `${prefix}${value}${suffix}` : '')}
      </span>
    );
  }

  const handleOpenEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setCurrentDraft(value !== undefined && value !== null ? String(value) : '');
    setErrorMessage(null);
    setIsEditing(true);
  };

  const handleClose = () => {
    if (isSaving) return;
    setIsEditing(false);
    setErrorMessage(null);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setErrorMessage(null);

    // 1. Validation
    let finalVal: string | number = currentDraft;
    if (type === 'number') {
      const num = Number(currentDraft);
      if (isNaN(num)) {
        setErrorMessage(language === 'bn' ? 'সঠিক সংখ্যা প্রদান করুন।' : 'Please enter a valid number.');
        return;
      }
      if (min !== undefined && num < min) {
        setErrorMessage(
          language === 'bn'
            ? `সংখ্যাটি কমপক্ষে ${min} হতে হবে।`
            : `Value must be at least ${min}.`
        );
        return;
      }
      if (max !== undefined && num > max) {
        setErrorMessage(
          language === 'bn'
            ? `সংখ্যাটি সর্বোচ্চ ${max} হতে পারে।`
            : `Value must not exceed ${max}.`
        );
        return;
      }
      finalVal = num;
    } else {
      finalVal = currentDraft.trim();
      if (required && !finalVal) {
        setErrorMessage(
          language === 'bn' ? 'এই ফিল্ডটি খালি রাখা যাবে না।' : 'This field cannot be empty.'
        );
        return;
      }
    }

    if (validate) {
      const customErr = validate(finalVal);
      if (customErr) {
        setErrorMessage(customErr);
        return;
      }
    }

    // 2. Perform Save
    setIsSaving(true);
    try {
      await onSave(finalVal);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 2000);
      setIsEditing(false);
    } catch (err: any) {
      console.error('Error saving field:', err);
      setErrorMessage(
        err?.message ||
          (language === 'bn'
            ? 'সংরক্ষণ করতে ব্যর্থ হয়েছে। পুনরায় চেষ্টা করুন।'
            : 'Failed to save changes. Please try again.')
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault();
      handleSave();
    }
  };

  const displayNode = children ? (
    children
  ) : renderValue ? (
    renderValue(value)
  ) : (
    <span className={className}>
      {value !== undefined && value !== null ? `${prefix}${value}${suffix}` : ''}
    </span>
  );

  return (
    <>
      <span
        className={`group/edit inline-flex items-center gap-1.5 align-middle ${containerClassName}`}
      >
        {displayNode}

        {/* Small Pencil Button for Admin */}
        <button
          type="button"
          onClick={handleOpenEdit}
          title={language === 'bn' ? `${label} পরিবর্তন করুন` : `Edit ${label}`}
          aria-label={label}
          className={`shrink-0 inline-flex items-center justify-center p-1 rounded-md text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 active:scale-95 transition-all cursor-pointer border border-transparent hover:border-emerald-500/30 ${pencilClassName}`}
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>

        {/* Quick temporary saved indicator */}
        {showSuccessToast && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/20 animate-in fade-in">
            <Check className="w-3 h-3" />
          </span>
        )}
      </span>

      {/* Focused Editor Modal/Dialog for Desktop & Android Mobile */}
      {isEditing && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
          onClick={handleClose}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-slate-100"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Edit2 className="w-3.5 h-3.5" />
                </div>
                <h4 className="text-sm font-bold text-white leading-tight">{label}</h4>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="leading-tight">{errorMessage}</span>
              </div>
            )}

            {/* Input Form Control */}
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                {type === 'textarea' ? (
                  <textarea
                    ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                    rows={4}
                    value={currentDraft}
                    onChange={e => setCurrentDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-hidden focus:border-emerald-500 transition-colors placeholder:text-slate-600 resize-y"
                  />
                ) : type === 'select' ? (
                  <select
                    ref={inputRef as React.RefObject<HTMLSelectElement>}
                    value={currentDraft}
                    onChange={e => setCurrentDraft(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-hidden focus:border-emerald-500 transition-colors"
                  >
                    {options.map(opt => (
                      <option key={opt.value} value={opt.value} className="bg-slate-900 text-white">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type={type === 'number' ? 'number' : 'text'}
                    value={currentDraft}
                    min={min}
                    max={max}
                    step={step}
                    onChange={e => setCurrentDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-hidden focus:border-emerald-500 transition-colors placeholder:text-slate-600 font-sans"
                  />
                )}
              </div>

              {/* Action Buttons: Cancel & Save */}
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSaving}
                  className="px-3.5 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-950 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{language === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...'}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{language === 'bn' ? 'সংরক্ষণ করুন' : 'Save'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
