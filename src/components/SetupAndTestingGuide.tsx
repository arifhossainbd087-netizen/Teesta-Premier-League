import React, { useState } from 'react';
import {
  HelpCircle,
  CheckCircle,
  Copy,
  ExternalLink,
  Shield,
  Smartphone,
  Cloud,
  Terminal,
  Users,
  PlayCircle,
  Database,
  DollarSign,
  Sparkles,
} from 'lucide-react';
import { useAuth, BOOTSTRAP_ADMIN_EMAIL } from '../context/AuthContext';
import { seedInitialTplData } from '../services/auctionService';

interface SetupAndTestingGuideProps {
  onSeeded: () => void;
}

export const SetupAndTestingGuide: React.FC<SetupAndTestingGuideProps> = ({ onSeeded }) => {
  const { language, currentUser } = useAuth();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSeedClick = async () => {
    setIsSeeding(true);
    const success = await seedInitialTplData(currentUser?.email || BOOTSTRAP_ADMIN_EMAIL);
    setIsSeeding(false);
    if (success) {
      setSeedSuccess(true);
      onSeeded();
      setTimeout(() => setSeedSuccess(false), 4000);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 border border-emerald-500/40 p-6 rounded-2xl shadow-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                {language === 'bn'
                  ? 'তিস্তা প্রিমিয়ার লীগ (TPL S2) সেটআপ ও লাইভ টেস্ট গাইড'
                  : 'TPL S2 Setup, 2-Team Testing & Deployment Guide'}
              </h2>
            </div>
            <p className="text-xs text-slate-300">
              {language === 'bn'
                ? 'রিয়েল-টাইম ডাটাবেস প্রস্তুত। নিচের ৩টি ধাপ অনুসরণ করে এখনই ২টি দল নিয়ে লাইভ বিডিং টেস্ট করুন।'
                : 'Follow the 3 steps below to test live bidding with 2 teams and publish online at zero cost.'}
            </p>
          </div>

          {/* Seed Button */}
          <button
            onClick={handleSeedClick}
            disabled={isSeeding}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-950 transition-all cursor-pointer shrink-0 disabled:opacity-50"
          >
            <Database className="w-4 h-4" />
            <span>
              {isSeeding
                ? language === 'bn'
                  ? 'ডাটা লোড হচ্ছে...'
                  : 'Seeding...'
                : language === 'bn'
                ? '১-ক্লিকে ডেমো দল ও খেলোয়াড় লোড'
                : 'Seed Demo Teams & Players'}
            </span>
          </button>
        </div>

        {seedSuccess && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>
              {language === 'bn'
                ? '✓ ৪টি আঞ্চলিক দল ও ৮ জন বাস্তবধর্মী খেলোয়াড় সফলভাবে ডাটাবেসে যুক্ত হয়েছে!'
                : '✓ Demo teams and players successfully seeded to Firestore!'}
            </span>
          </div>
        )}
      </div>

      {/* Step 1: Admin Privileges */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm">
            ১
          </div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-400" />
            <span>{language === 'bn' ? 'অ্যাডমিন অধিকার ও অ্যাক্সেস' : 'Administrator Privileges'}</span>
          </h3>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          {language === 'bn'
            ? `আপনার জিমেইল অ্যাকাউন্ট (${BOOTSTRAP_ADMIN_EMAIL}) স্বয়ংক্রিয়ভাবে ক্লাউড সিকিউরিটি রুলস ও সিস্টেমে সুপার অ্যাডমিন হিসেবে কনফিগার করা হয়েছে। এছাড়াও যেকোনো সময় টেস্টিং করার জন্য হেডার এর 'রোল সিলেক্টর' থেকে সরাসরি অ্যাডমিন বা দল পরিবর্তন করতে পারবেন।`
            : `Your email (${BOOTSTRAP_ADMIN_EMAIL}) is securely bootstrapped as the system administrator in Firestore Security Rules and frontend auth. You can also use the Header Role Switcher to toggle seamlessly.`}
        </p>

        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400 flex items-center justify-between">
          <span>
            {language === 'bn' ? 'মাস্টার অ্যাডমিন ইমেইল:' : 'Master Admin Email:'}{' '}
            <strong className="text-purple-300 font-mono">{BOOTSTRAP_ADMIN_EMAIL}</strong>
          </span>
          <button
            onClick={() => copyToClipboard(BOOTSTRAP_ADMIN_EMAIL, 'admin-email')}
            className="text-xs text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copiedKey === 'admin-email' ? 'কপি হয়েছে' : 'কপি করুন'}</span>
          </button>
        </div>
      </div>

      {/* Step 2: Testing with Two Team Accounts */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
            ২
          </div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            <span>
              {language === 'bn'
                ? '২টি দল নিয়ে লাইভ বিডিং ও অকশন টেস্ট করার নিয়ম'
                : 'How to Test Live Bidding with Two Team Accounts'}
            </span>
          </h3>
        </div>

        <div className="space-y-3 text-xs text-slate-300">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/90 space-y-2">
            <strong className="text-emerald-400 block text-sm">
              {language === 'bn' ? 'পদ্ধতি ক: পাশাপাশি দুটি ব্রাউজার ট্যাব খুলুন (Two Windows Test)' : 'Method A: Side-by-Side Browser Tabs'}
            </strong>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
              <li>
                {language === 'bn'
                  ? 'বর্তমান উইন্ডোতে হেডার ড্রপডাউন থেকে রোল দিন: "তিস্তা থান্ডারস (Teesta Thunders)"'
                  : 'In this window, set role to "Teesta Thunders"'}
              </li>
              <li>
                {language === 'bn'
                  ? 'একটি ইনকগনিটো (Incognito) বা দ্বিতীয় উইন্ডো খুলে এই একই লিংকে যান এবং রোল নির্বাচন করুন: "রংপুর রাইডার্স এফসি (Rangpur Riders FC)"'
                  : 'Open an Incognito or 2nd window with the same app URL and switch role to "Rangpur Riders FC"'}
              </li>
              <li>
                {language === 'bn'
                  ? 'অ্যাডমিন মোডে গিয়ে "খেলোয়াড় তালিকা" থেকে রাকিবুল হাসান-এর "নিলামে তুলুন" বাটনে ক্লিক করুন।'
                  : 'As Admin, go to Players tab and click "Auction Now" on any approved player.'}
              </li>
              <li>
                {language === 'bn'
                  ? 'দল ১ থেকে "+৳১,০০০" বাটনে চাপ দিন। সাথে সাথে দল ২ এর স্ক্রিনে রিয়েল-টাইমে সর্বোচ্চ ডাক ও দল ১ এর নাম ভেসে উঠবে এবং টাইমার রিসেট হবে!'
                  : 'From Team 1, click "+৳1,000". Team 2 instantly sees the new bid & leader in real-time!'}
              </li>
              <li>
                {language === 'bn'
                  ? 'দল ২ থেকে "+৳২,০০০" ডাক দিন। রিয়েল-টাইম ফায়ারবেস ট্রানজেকশনের মাধ্যমে রেস কন্ডিশন ও বাজেট ওভাররান রোধ করা হয়।'
                  : 'Team 2 counter-bids. Atomic Firestore transactions prevent budget overdrafts.'}
              </li>
              <li>
                {language === 'bn'
                  ? 'টাইমার শেষ হলে অ্যাডমিন "বিক্রিত ঘোষণা (SOLD)" বাটনে ক্লিক করবেন — কনফেটি শো হবে এবং বিজয়ীর বাজেট থেকে টাকা স্বয়ংক্রিয়ভাবে কাটা যাবে!'
                  : 'Admin clicks SOLD: confetti triggers, player is assigned, and team purse is deducted.'}
              </li>
            </ol>
          </div>
        </div>
      </div>

      {/* Step 3: Multi-Season Management & Historical Archiving */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
            ৩
          </div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span>
              {language === 'bn'
                ? 'মাল্টি-সিজন পরিচালনা ও ঐতিহাসিক ডাটা সংরক্ষণ (Multi-Season Architecture)'
                : 'Multi-Season Management & Historical Data Archiving'}
            </span>
          </h3>
        </div>

        <div className="space-y-3 text-xs text-slate-300">
          <p className="leading-relaxed">
            {language === 'bn'
              ? 'টিপিএল প্ল্যাটফর্মটি স্থায়ীভাবে বহু-সিজন (Multi-Season) সমর্থন করে। সিজন ২ (২০২৬) শেষ হওয়ার পর অ্যাডমিন সিজন ৩ (২০২৭) বা ভবিষ্যতের যেকোনো সিজন তৈরি করতে পারেন।'
              : 'TPL permanently supports multi-season tournaments. When Season 2 concludes, you can create Season 3 or future seasons without losing any historical data.'}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
              <strong className="text-amber-300 block">
                {language === 'bn' ? '১. নতুন সিজন তৈরি ও সেটিংস' : '1. Create New Season'}
              </strong>
              <p className="text-[11px] text-slate-400">
                {language === 'bn'
                  ? 'হেডারের সিজন ড্রপডাউন থেকে "সিজন তৈরি ও কনফিগার" এ যান। নতুন সিজনের নাম, বছর, দল বাজেট (৳), প্লেয়ার ভিত্তিমূল্য ও নিলাম টাইমার নির্ধারণ করুন।'
                  : 'Click the season selector in Header -> "Manage / Create Seasons". Configure title, year, team budget, base price, and timer.'}
              </p>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
              <strong className="text-emerald-300 block">
                {language === 'bn' ? '২. দল টেমপ্লেট কপি (বাজেট রিসেট সহ)' : '2. Copy Team Templates'}
              </strong>
              <p className="text-[11px] text-slate-400">
                {language === 'bn'
                  ? 'পূর্ববর্তী সিজন থেকে দলগুলো কপি করার অপশন চেক করলে নতুন সিজনে শূন্য (০) খরচ ও নতুন বাজেট সহ দলগুলো যুক্ত হবে, পুরনো ডাক ও পেমেন্ট হিস্ট্রি সম্পূর্ণ অক্ষুণ্ণ রেখে।'
                  : 'Check the copy teams box to bring forward team names and colors with clean 0 spent budgets. Historical bids remain safely archived.'}
              </p>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
              <strong className="text-blue-300 block">
                {language === 'bn' ? '৩. সিজন সক্রিয়করণ (Single Active Live Auction)' : '3. Activate Live Season'}
              </strong>
              <p className="text-[11px] text-slate-400">
                {language === 'bn'
                  ? 'যেকোনো সময়ে শুধুমাত্র একটি সিজনেই লাইভ নিলাম সক্রিয় থাকতে পারবে। কোনো সিজন সক্রিয় করলে অন্যান্য সিজনের লাইভ অপশন স্বয়ংক্রিয়ভাবে স্থগিত হয়ে যায়।'
                  : 'Only one season can have an active live auction at any time, preventing unauthorized auction overlap.'}
              </p>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
              <strong className="text-rose-300 block">
                {language === 'bn' ? '৪. আর্কাইভ ও ঐতিহাসিক ফলাফল' : '4. Archive & Historical Records'}
              </strong>
              <p className="text-[11px] text-slate-400">
                {language === 'bn'
                  ? 'সমাপ্ত সিজন আর্কাইভ করা হলে সেটিতে নতুন কোনো ডাক দেওয়া যাবে না। পাবলিক ব্যবহারকারী ও অ্যাডমিন ড্রপডাউন থেকে যেকোনো সময়ে পুরনো সিজনের ফলাফল দেখতে পারবেন।'
                  : 'Archived seasons lock all bidding via Firestore Security Rules while remaining permanently browseable for historical records.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Step 4: Low Cost Hosting Deployment Guide */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm">
            ৪
          </div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Cloud className="w-5 h-5 text-blue-400" />
            <span>
              {language === 'bn'
                ? 'সর্বনিম্ন খরচে (০ টাকায়) ইন্টারনেটে প্রকাশ ও ডিপ্লয়মেন্ট'
                : 'Publishing Online at Lowest Cost (100% Free Tier)'}
            </span>
          </h3>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          {language === 'bn'
            ? 'Firebase এর ফ্রি "Spark Plan" দিয়ে কোনো খরচ ছাড়াই সম্পূর্ণ টুর্নামেন্টের লাইভ অকশন পরিচালনা করা সম্ভব। ফ্রি প্যাকেজে রয়েছে: ১০ জিবি স্টোরেজ, প্রতিদিন ৫০,০০০ রিড, ২০,০০০ রাইট এবং সম্পূর্ণ ফ্রি কাস্টম ডোমেইন ও SSL সার্টিফিকেট!'
            : 'Using the Firebase Spark (Free) plan, you can run the entire league auction at zero hosting cost. Includes free global CDN, 50k reads/day, and free custom domain SSL.'}
        </p>

        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
          <div className="text-slate-400 font-sans text-xs font-semibold mb-2">
            {language === 'bn' ? 'টার্মিনাল কমান্ডসমূহ:' : 'Deployment Commands:'}
          </div>
          <div className="flex items-center justify-between text-emerald-400 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
            <span>npm run build</span>
            <button
              onClick={() => copyToClipboard('npm run build', 'cmd1')}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center justify-between text-emerald-400 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
            <span>npx firebase-tools deploy --only hosting,firestore</span>
            <button
              onClick={() => copyToClipboard('npx firebase-tools deploy --only hosting,firestore', 'cmd2')}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Friendly / Projector View Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex items-center gap-2 text-amber-400">
          <Smartphone className="w-5 h-5" />
          <h4 className="text-sm font-bold text-white">
            {language === 'bn'
              ? 'মোবাইল ও স্টেডিয়াম প্রজেক্টর ভিউ'
              : 'Mobile & Stadium Projector Big Screen'}
          </h4>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          {language === 'bn'
            ? 'নিলাম হলে বড় প্রজেক্টরে লাইভ নিলাম স্ক্রিন (Live Auction Room) ফুলস্ক্রিন করে রাখবেন। সকল দর্শক ও টিম ম্যানেজাররা তাদের মোবাইল ফোন থেকেই লাইভ বিড দিতে এবং দেখতে পারবেন।'
            : 'In the auction auditorium, project the Live Auction Room on the big screen. All attendees and team owners can interactively view and bid directly from their mobile phones.'}
        </p>
      </div>
    </div>
  );
};
