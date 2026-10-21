import React, { useState } from 'react';
import { History, Shield, Search, Filter, Clock, User, CheckCircle, Tag } from 'lucide-react';
import { AuditLog } from '../types';
import { useAuth } from '../context/AuthContext';

interface AuditLogViewerProps {
  logs: AuditLog[];
}

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ logs }) => {
  const { language } = useAuth();
  const [filterAction, setFilterAction] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = logs.filter(log => {
    if (filterAction !== 'all' && !log.action.includes(filterAction)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDetails = log.details.toLowerCase().includes(q);
      const matchActor = log.actorEmail?.toLowerCase().includes(q);
      if (!matchDetails && !matchActor) return false;
    }
    return true;
  });

  const getActionBadgeColor = (action: string) => {
    if (action.includes('SOLD')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (action.includes('UNSOLD')) return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    if (action.includes('BID')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (action.includes('APPROVED')) return 'bg-teal-500/20 text-teal-400 border-teal-500/30';
    if (action.includes('PAYMENT')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    return 'bg-slate-700 text-slate-300 border-slate-600';
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <History className="w-6 h-6 text-emerald-400" />
            <span>{language === 'bn' ? 'অডিট লগ ও স্বচ্ছতা রেকর্ড' : 'Audit Logs & Transparency Record'}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {language === 'bn'
              ? 'নিলামের প্রতিটি ডাক, বিক্রয় সিদ্ধান্ত, রেজিস্ট্রেশন অনুমোদন এবং আর্থিক পরিবর্তনের অপরিবর্তনীয় রেকর্ড'
              : 'Tamper-evident system activity log recording all bids, sold hammer events, and approvals'}
          </p>
        </div>

        <div className="text-xs font-mono bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-slate-400">
          {language === 'bn' ? 'মোট রেকর্ড:' : 'Total Events:'} <strong className="text-emerald-400">{logs.length}</strong>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {[
            { id: 'all', label: language === 'bn' ? 'সকল' : 'All' },
            { id: 'BID', label: language === 'bn' ? 'ডাক (Bids)' : 'Bids' },
            { id: 'SOLD', label: language === 'bn' ? 'বিক্রিত (Sold)' : 'Sold Events' },
            { id: 'UNSOLD', label: language === 'bn' ? 'অবিক্রিত' : 'Unsold' },
            { id: 'APPROVED', label: language === 'bn' ? 'অনুমোদন' : 'Approvals' },
            { id: 'PAYMENT', label: language === 'bn' ? 'পেমেন্ট' : 'Payments' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterAction(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterAction === tab.id
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={
              language === 'bn' ? 'লগ অনুসন্ধান করুন...' : 'Search audit events...'
            }
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Timeline View */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-5">
        <div className="space-y-3">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-xs italic">
              {language === 'bn' ? 'কোনো অডিট লগ রেকর্ড পাওয়া যায়নি।' : 'No audit log records found.'}
            </div>
          ) : (
            filteredLogs.map(log => (
              <div
                key={log.id}
                className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs hover:border-slate-700 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold border ${getActionBadgeColor(
                        log.action
                      )}`}
                    >
                      {log.action}
                    </span>
                    <span className="text-slate-400 text-[11px] flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-500" />
                      {log.actorEmail || 'System'}
                    </span>
                  </div>
                  <p className="text-slate-200 font-medium text-xs sm:text-sm">{log.details}</p>
                </div>

                <div className="text-slate-500 text-[11px] font-mono shrink-0 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-600" />
                  <span>
                    {new Date(log.timestamp).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
