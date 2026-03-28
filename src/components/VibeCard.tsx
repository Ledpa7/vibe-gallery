import { memo } from 'react';
import { motion } from 'framer-motion';
import type { Vibe } from '../lib/types';

const VibeCard = memo(({ vibe, onClick }: { 
  vibe: Vibe, 
  onClick: () => void
}) => {
  return (
    <motion.div 
      layoutId={vibe.id}
      variants={{
        hidden: { opacity: 0, scale: 0.8 },
        show: { opacity: 1, scale: 1 }
      }}
      onClick={onClick}
      className="glass-card group relative cursor-pointer aspect-square overflow-hidden"
    >
      {/* Likes Count (Top Right) */}
      <div className="absolute top-4 right-4 z-20 text-[11px] font-black text-vibe-cyan bg-black/40 backdrop-blur-md px-2 py-1 rounded border border-vibe-cyan/20 ring-1 ring-vibe-cyan/10 shadow-lg">
         {vibe.likes}
      </div>

      {/* Vibe Image */}
      <img src={vibe.image} alt={vibe.title} loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-all duration-700 group-hover:scale-110" />
      
      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center items-center p-6 text-center backdrop-blur-xl">
        <p className="text-sm text-gray-300 mb-6 leading-relaxed line-clamp-3 font-medium">{vibe.summary}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {vibe.tech?.map(t => (
            <span key={t} className="px-3 py-1.5 bg-vibe-accent/10 border border-vibe-accent/20 rounded-md text-[10px] font-black uppercase tracking-widest text-vibe-accent">
              {t}
            </span>
          ))}
        </div>
      </div>
      
      {/* Bottom Title (Static) */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <h3 className="text-lg font-bold tracking-tight text-white line-clamp-1">{vibe.title}</h3>
      </div>
    </motion.div>
  );
});

export default VibeCard;
