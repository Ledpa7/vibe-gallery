import { motion } from 'framer-motion';
import { ChevronLeft, ShieldCheck, Layers, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white p-8 lg:p-16 flex flex-col items-center">
      <div className="bg-mesh" />
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl w-full"
      >
        <button 
          onClick={() => navigate('/main')}
          className="flex items-center gap-2 text-vibe-accent font-bold uppercase tracking-widest text-xs mb-12 hover:translate-x-[-4px] transition-transform"
        >
          <ChevronLeft size={16} /> Back to Gallery
        </button>

        <h1 className="text-5xl font-black mb-12 tracking-tighter">PRIVACY <span className="text-vibe-accent">POLICY</span></h1>
        
        <div className="space-y-12 text-gray-400 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-white mb-4 uppercase tracking-widest flex items-center gap-3">
              <ShieldCheck className="text-vibe-accent" size={20} /> 1. Data Collection
            </h2>
            <p>To provide a secure environment, we collect minimal data through Google OAuth (email and profile name).</p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white mb-4 uppercase tracking-widest flex items-center gap-3">
              <Layers className="text-vibe-accent" size={20} /> 2. Content Ownership
            </h2>
            <p>Every "Vibe" you upload remains your property. You grant the community permission to view and vote.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white mb-4 uppercase tracking-widest flex items-center gap-3">
              <Plus className="text-vibe-accent" size={20} /> 3. Processing
            </h2>
            <p>Data is used for verifying entries, displaying work, and calculating spotlight rankings.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white mb-4 uppercase tracking-widest flex items-center gap-3">
              <Trash2 className="text-vibe-accent" size={20} /> 4. Deletion
            </h2>
            <p>You have the right to remove your contributions. Each "Vibe" includes a "Delete Exhibit" option for owners.</p>
          </section>
          <section className="pt-12 border-t border-white/5">
            <p className="text-xs italic">
              Last updated: March 2026. Reach out to <a href="mailto:led@kakao.com" className="text-vibe-accent underline">led@kakao.com</a>.
            </p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
