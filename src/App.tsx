import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainPage from './pages/MainPage';
import CommunityPage from './pages/CommunityPage';
import PrivacyPage from './pages/PrivacyPage';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, X, Share, Compass } from 'lucide-react';

/**
 * 🚀 Reddit Browser Guard
 * Detects if the site is opened within the Reddit in-app browser
 * and guides the user to open it in a system browser (Chrome/Safari)
 */
function BrowserGuard() {
  const [isReddit, setIsReddit] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isRedditUA = ua.includes('reddit') || ua.includes('reddit-ios') || ua.includes('reddit-android');
    setIsReddit(isRedditUA);
  }, []);

  if (!isReddit || isDismissed) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-md"
      >
        <motion.div 
          initial={{ y: 100, scale: 0.95 }}
          animate={{ y: 0, scale: 1 }}
          className="w-full max-w-lg bg-[#0f0f12] border border-[#FF4500]/30 rounded-3xl overflow-hidden shadow-[0_30px_100px_rgba(0,0,0,0.8)]"
        >
          {/* Reddit Brand Header */}
          <div className="bg-[#FF4500] p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="bg-white p-1.5 rounded-full shadow-lg">
                  <ExternalLink size={18} className="text-[#FF4500]" />
               </div>
               <span className="text-white font-black uppercase tracking-[0.2em] text-[10px]">Recommendation</span>
            </div>
            <button 
              onClick={() => setIsDismissed(true)}
              className="p-1 hover:bg-white/10 rounded-full transition-colors text-white"
            >
               <X size={20} />
            </button>
          </div>

          <div className="p-8 pb-10">
            <h2 className="text-2xl font-black text-white mb-4 leading-tight">
              Open in <span className="text-[#FF4500]">System Browser</span>
            </h2>
            <p className="text-gray-400 text-[15px] leading-relaxed mb-8">
              Reddit's internal browser may restrict file uploads and login stability. 
              Switch to your native browser for the <span className="text-white font-bold italic">full Vibe experience.</span>
            </p>

            {/* Platform Guides */}
            <div className="space-y-4 mb-10">
               <div className="flex gap-4 items-start p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/[0.08] transition-all">
                  <div className="w-10 h-10 shrink-0 bg-[#FF4500]/10 flex items-center justify-center rounded-xl text-[#FF4500]">
                    <Share size={20} />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm mb-1">Apple iOS Users</p>
                    <p className="text-gray-500 text-xs">Tap the <span className="text-white font-medium">triple dots (...)</span> or <span className="text-white font-medium">Share</span>, then select <span className="text-vibe-accent">"Open in Safari"</span>.</p>
                  </div>
               </div>

               <div className="flex gap-4 items-start p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/[0.08] transition-all">
                  <div className="w-10 h-10 shrink-0 bg-[#FF4500]/10 flex items-center justify-center rounded-xl text-[#FF4500]">
                    <Compass size={20} />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm mb-1">Android & Others</p>
                    <p className="text-gray-500 text-xs text-xs">Select <span className="text-white font-medium">"Open in Browser"</span> or <span className="text-white font-medium">"Open in Chrome"</span> for optimal performance.</p>
                  </div>
               </div>
            </div>

            <button 
              onClick={() => setIsDismissed(true)}
              className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-[0.3em] text-[11px] rounded-2xl border border-white/10 transition-all hover:border-[#FF4500]/50"
            >
              Enter Gallery Anyway
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <Router>
      <BrowserGuard />
      <Routes>
        {/* Mount MainPage at root to avoid token loss during redirect */}
        <Route path="/" element={<MainPage />} />
        
        {/* Still keep /main route accessible as requested */}
        <Route path="/main" element={<MainPage />} />
        
        {/* Individual Privacy Policy Page */}
        <Route path="/privacy" element={<PrivacyPage />} />

        {/* 💬 Community Threads */}
        <Route path="/community" element={<CommunityPage />} />
        
        {/* 404 Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

    </Router>
  );
}
