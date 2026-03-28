import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ThumbsUp, ThumbsDown, ArrowUpRight, Layers, Plus, HelpCircle,
  X, Upload, History, ChevronLeft, ChevronRight, Calendar,
  Trash2
} from 'lucide-react';
import { cn } from '../lib/cn';
import type { Vibe, Comment } from '../lib/types';
import type { User } from '@supabase/supabase-js';

interface DetailModalProps {
  selectedId: string | null;
  displayVibe: Vibe | null;
  isTodayProjectModal: boolean;
  historyOffset: number;
  setHistoryOffset: (offset: number) => void;
  handleCloseModal: () => void;
  getProjectByDateOffset: (offset: number) => Vibe | null;

  // Voting
  user: User | null;
  isAdmin: boolean;
  userVotes: Record<string, 'up' | 'down'>;
  isVoting: string | null;
  handleLike: (id: string) => void;
  handleDislike: (id: string) => void;

  // Comments
  comments: Comment[];
  newComment: string;
  setNewComment: (val: string) => void;
  isSubmittingComment: boolean;
  handleAddComment: (e: React.FormEvent) => void;
  handleLogin: () => void;

  // Delete & Edit
  isDeletingVibe: string | null;
  handleDeleteVibe: (vibeId: string, imageUrl: string, ownerId: string) => void;
  onEditVibe: (vibe: Vibe) => void;
}

export default function DetailModal({
  selectedId,
  displayVibe,
  isTodayProjectModal,
  historyOffset,
  setHistoryOffset,
  handleCloseModal,
  getProjectByDateOffset,
  user,
  isAdmin,
  userVotes,
  isVoting,
  handleLike,
  handleDislike,
  comments,
  newComment,
  setNewComment,
  isSubmittingComment,
  handleAddComment,
  handleLogin,
  isDeletingVibe,
  handleDeleteVibe,
  onEditVibe,
}: DetailModalProps) {
  if (!selectedId) return null;
  if (!isTodayProjectModal && !displayVibe) return null;

  return (
    <AnimatePresence>
      {selectedId && (isTodayProjectModal || displayVibe) && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl"
          onClick={handleCloseModal}
        >
          <div className="flex items-center justify-center gap-8 w-full">
            {/* Yesterday Ghost Preview */}
            {isTodayProjectModal && (() => {
              // Determine the next actually available historic project offset
              let nextOffset = historyOffset + 1;
              let foundNext = null;
              while (nextOffset < 30) {
                foundNext = getProjectByDateOffset(nextOffset);
                if (foundNext && foundNext.id !== displayVibe?.id) break;
                nextOffset++;
              }
              
              if (foundNext) {
                return (
                  <motion.div 
                    initial={{ opacity: 0, x: 50, scale: 0.8 }}
                    animate={{ opacity: 1, x: 0, scale: 0.9 }}
                    className="hidden xl:flex glass-card w-48 h-[60vh] shrink-0 overflow-hidden relative cursor-pointer group/ghost border-vibe-accent/20"
                    onClick={(e) => { e.stopPropagation(); setHistoryOffset(nextOffset); }}
                  >
                    <img src={foundNext.image} className="absolute inset-0 w-full h-full object-cover blur-md opacity-20 group-hover/ghost:opacity-40 transition-opacity" />
                    <div className="absolute inset-0 bg-gradient-to-l from-[#0f0f11] via-transparent to-transparent z-10" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                      <div className="p-6 rounded-full bg-vibe-accent/10 border border-vibe-accent/30 shadow-[0_0_30px_rgba(139,92,246,0.3)] group-hover/ghost:bg-vibe-accent/20 group-hover/ghost:scale-110 transition-all duration-300">
                        <ChevronLeft size={56} className="text-vibe-accent drop-shadow-[0_0_15px_rgba(139,92,246,1)]" />
                      </div>
                      <p className="text-[12px] uppercase tracking-[0.3em] font-black text-vibe-accent mt-6 drop-shadow-sm">Earlier Vibe</p>
                    </div>
                  </motion.div>
                );
              }
              return null;
            })()}

            <motion.div 
              layoutId={selectedId!}
              className="glass-card max-w-4xl w-full max-h-[90vh] overflow-y-auto bg-[#0f0f11] pointer-events-auto relative shadow-[0_0_100px_rgba(0,0,0,0.8)] outline outline-1 outline-white/5"
              onClick={e => e.stopPropagation()}
            >
              {/* Back to Today Button */}
              {isTodayProjectModal && historyOffset > 0 && (
                <button 
                  onClick={() => setHistoryOffset(0)}
                  className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white bg-vibe-accent px-6 py-3 rounded-full shadow-[0_0_30px_rgba(139,92,246,0.5)] border border-white/20 backdrop-blur-md hover:scale-105 transition-all"
                >
                  <History size={16} />
                  Back to Today
                </button>
              )}
              
              <div className="relative w-full h-[340px] overflow-hidden flex items-center justify-center">
                <AnimatePresence mode="wait">
                  {displayVibe ? (
                    <motion.div
                      key={`${displayVibe.id}-${historyOffset}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.5 }}
                      className="absolute inset-0 w-full h-full"
                    >
                       {/* Widescreen Header - Top/Bottom Fill with Side Blurs (The requested form) */}
                       <div className="relative z-10 w-full h-full flex items-center justify-center">
                          <img 
                              src={displayVibe.image} 
                              className="absolute inset-0 w-full h-full object-cover blur-xl opacity-80" 
                              alt="Blurred Background Frame" 
                          />
                          {/* Centered Square Subject - Touching Top and Bottom */}
                          <div className="relative z-20 h-full aspect-square">
                             <img 
                                 src={displayVibe.image} 
                                 className="w-full h-full object-contain shadow-2xl" 
                                 alt={displayVibe.title} 
                             />
                          </div>
                       </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="empty-vibe"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 flex flex-col items-center justify-center bg-vibe-bg p-8"
                    >
                      <HelpCircle size={80} className="text-white/5" />
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <button 
                  onClick={handleCloseModal}
                  className="absolute top-4 right-4 z-50 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white transition-colors backdrop-blur-md"
                >
                  <Plus size={24} className="rotate-45" />
                </button>
                
                <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f11] via-transparent to-transparent pointer-events-none" />
              </div>
              
              <div className="p-8 lg:p-12 relative">
                {displayVibe ? (
                  <div className="flex flex-col lg:flex-row justify-between items-start gap-8">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-6 flex-wrap">
                          <h2 className="text-4xl font-black tracking-tight">{displayVibe.title}</h2>
                        {user && (isAdmin || displayVibe.user_id === user.id) && (
                          <button 
                            disabled={isDeletingVibe === displayVibe.id}
                            onClick={() => handleDeleteVibe(displayVibe.id, displayVibe.image, displayVibe.user_id)}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-400 rounded-md border border-red-500/20 transition-all font-bold uppercase tracking-widest text-[10px] disabled:opacity-50",
                              isDeletingVibe === displayVibe.id && "animate-pulse"
                            )}
                          >
                            <Trash2 size={12} /> 
                            {isDeletingVibe === displayVibe.id ? 'Deleting...' : (isAdmin && displayVibe.user_id !== user.id ? 'Admin Delete' : 'Delete')}
                          </button>
                        )}
                        {user && (isAdmin || displayVibe.user_id === user.id) && (
                          <button
                            onClick={() => onEditVibe(displayVibe)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-vibe-accent/10 text-vibe-accent hover:bg-vibe-accent/20 rounded-md border border-vibe-accent/20 transition-all font-bold uppercase tracking-widest text-[10px]"
                          >
                            <Upload size={12} /> Edit
                          </button>
                        )}
                          {isTodayProjectModal && (
                            <div className="flex items-center gap-2 text-vibe-accent bg-vibe-accent/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-vibe-accent/20">
                              <Calendar size={12} />
                              {new Date(displayVibe.vibe_date || displayVibe.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                          )}
                      </div>
                      
                      <div className="mb-8">
                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-vibe-accent/60 mb-3">Brief Description</label>
                        <p className="text-gray-300 text-lg leading-relaxed">
                          {displayVibe.description || displayVibe.summary}
                        </p>
                      </div>
                      
                      <h3 className="text-sm font-semibold uppercase tracking-widest text-vibe-accent mb-4 flex items-center gap-2">
                          <Layers size={16} /> VibeCoding Tool
                      </h3>
                      <div className="flex flex-wrap gap-2 mb-8">
                        {displayVibe.tech.map(t => (
                          <span key={t} className="px-3 py-1 bg-white/5 border border-white/10 rounded-md text-sm">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div className="w-full lg:w-48">
                      <a 
                        href={displayVibe.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          console.log("[VibeGallery] MouseDown on Visit Project. Link:", displayVibe.link);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log("[VibeGallery] Click on Visit Project. Executing navigation...");
                        }}
                        style={{ 
                          position: 'relative', 
                          zIndex: 99999, 
                          display: 'flex',
                          pointerEvents: 'auto'
                        }}
                        className="vibe-button w-full justify-center py-4 text-center ring-1 ring-vibe-accent bg-vibe-accent/5 hover:bg-vibe-accent/10 transition-all cursor-pointer pointer-events-auto"
                      >
                        <span className="font-bold tracking-widest uppercase text-xs">Visit Project</span>
                        <ArrowUpRight size={18} />
                      </a>

                      
                      <div className="flex items-center gap-3 mt-6">
                        <button 
                          disabled={isVoting === displayVibe.id}
                          onClick={() => handleLike(displayVibe.id)}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-2 px-4 py-3 border rounded-full transition-all group/like disabled:opacity-50",
                            userVotes[displayVibe.id] === 'up'
                              ? "bg-vibe-cyan/20 border-vibe-cyan text-vibe-cyan shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                              : "bg-white/5 border-white/10 text-gray-500 hover:text-white"
                          )}
                        >
                          <ThumbsUp size={20} className={cn("transition-transform group-hover/like:scale-110", userVotes[displayVibe.id] === 'up' && "fill-vibe-cyan")} />
                          <span className={cn("text-sm font-bold", userVotes[displayVibe.id] === 'up' ? "text-vibe-cyan" : "text-gray-500")}>{displayVibe.likes}</span>
                        </button>
                        <button 
                          disabled={isVoting === displayVibe.id}
                          onClick={() => handleDislike(displayVibe.id)}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-2 px-4 py-3 border rounded-full transition-all group/dislike disabled:opacity-50",
                            userVotes[displayVibe.id] === 'down'
                              ? "bg-red-500/20 border-red-500 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                              : "bg-white/5 border-white/10 text-gray-500 hover:text-white"
                          )}
                        >
                          <ThumbsDown size={20} className={cn("transition-transform group-hover/dislike:scale-110", userVotes[displayVibe.id] === 'down' && "fill-red-500")} />
                          <span className={cn("text-sm font-bold", userVotes[displayVibe.id] === 'down' ? "text-red-500" : "text-gray-500")}>{displayVibe.dislikes}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-32 text-center">
                     <div className="flex items-center justify-center text-white/5">
                        <HelpCircle size={120} />
                     </div>
                     
                     {isTodayProjectModal && (
                        <div className="inline-flex items-center gap-2 mt-12 text-vibe-accent bg-vibe-accent/10 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border border-vibe-accent/20">
                          <Calendar size={12} />
                          {new Date(new Date().setDate(new Date().getDate() - historyOffset)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                  </div>
                )}

                {displayVibe && (
                  <div className="mt-16 pt-12 border-t border-white/5">
                    <h3 className="text-xl font-bold uppercase tracking-widest mb-8 flex items-center gap-3">
                      <HelpCircle size={20} className="text-vibe-accent" />
                      Community Feedback
                    </h3>

                    {/* Comment Form */}
                    {user ? (
                      <form onSubmit={handleAddComment} className="mb-12">
                        <div className="relative">
                          <textarea 
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            maxLength={300}
                            placeholder="Share your thoughts on this vibe... (Max 300)"
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-6 pb-16 outline-none focus:border-vibe-accent transition-all min-h-[140px] resize-none text-white text-sm"
                          />
                          <div className="absolute bottom-5 left-6 pointer-events-none">
                            <span className={cn(
                              "text-[11px] font-black tracking-widest uppercase transition-colors",
                              newComment.length >= 250 ? "text-red-400" : "text-gray-500"
                            )}>
                              {newComment.length} / 300
                            </span>
                          </div>
                          <button 
                            disabled={isSubmittingComment || !newComment.trim()}
                            className="absolute bottom-4 right-4 vibe-button py-2 px-4 text-xs bg-vibe-accent text-white disabled:opacity-50"
                          >
                              {isSubmittingComment ? 'Sending...' : 'Send Feedback'}
                          </button>
                        </div>
                      </form>
                    ) : (
                        <div className="bg-black/40 border border-white/5 rounded-2xl p-10 text-center mb-12 shadow-2xl">
                           <p className="text-gray-400 text-sm mb-6 font-medium italic">Join the vibration to leave your feedback.</p>
                         <button 
                           onClick={handleLogin} 
                           className="flex items-center gap-3 mx-auto px-8 py-3 bg-black border border-white/10 text-white rounded-full font-bold uppercase tracking-[0.2em] text-xs hover:border-vibe-accent/50 transition-all shadow-xl group"
                         >
                           <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5 bg-white rounded-full p-0.5" alt="G" />
                           LOGIN
                         </button>
                        </div>
                    )}

                    {/* Comments List */}
                    <div className="flex flex-col">
                      {comments.length > 0 ? comments.map(comment => (
                        <div key={comment.id} className="py-6 border-b border-white/5 last:border-b-0 transition-none pb-8">
                           <div className="flex justify-between items-center mb-2">
                              <span className="text-[10px] font-black text-vibe-accent uppercase tracking-widest opacity-60">Anonymous Vibe Coder</span>
                              <span className="text-[10px] text-gray-600 font-medium">{new Date(comment.created_at).toLocaleDateString()}</span>
                           </div>
                           <p className="text-gray-200 text-sm leading-relaxed max-w-2xl">{comment.content}</p>
                        </div>
                      )) : (
                        <div className="text-center py-20 bg-white/[0.02] rounded-2xl border border-dashed border-white/5">
                           <p className="text-gray-600 italic text-sm tracking-tight">
                              No feedback yet. Be the first to start the vibration.
                           </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Tomorrow Ghost Preview */}
            {isTodayProjectModal && historyOffset > 0 && (() => {
              let prevOffset = historyOffset - 1;
              let foundPrev = null;
              while (prevOffset >= 0) {
                foundPrev = getProjectByDateOffset(prevOffset);
                if (foundPrev && foundPrev.id !== displayVibe?.id) break;
                prevOffset--;
              }
              
              if (foundPrev) {
                return (
                  <motion.div 
                    initial={{ opacity: 0, x: -50, scale: 0.8 }}
                    animate={{ opacity: 1, x: 0, scale: 0.9 }}
                    className="hidden xl:flex glass-card w-48 h-[60vh] shrink-0 overflow-hidden relative cursor-pointer group/ghost border-vibe-accent/20"
                    onClick={(e) => { e.stopPropagation(); setHistoryOffset(prevOffset); }}
                  >
                    <img src={foundPrev.image} className="absolute inset-0 w-full h-full object-cover blur-md opacity-20 group-hover/ghost:opacity-40 transition-opacity" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0f0f11] via-transparent to-transparent z-10" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                      <div className="p-6 rounded-full bg-vibe-accent/10 border border-vibe-accent/30 shadow-[0_0_30px_rgba(139,92,246,0.3)] group-hover/ghost:bg-vibe-accent/20 transition-all duration-300">
                        <ChevronRight size={56} className="text-vibe-accent drop-shadow-[0_0_20px_rgba(139,92,246,1)] group-hover/ghost:scale-125 transition-transform" />
                      </div>
                      <p className="text-[12px] uppercase tracking-[0.3em] font-black text-vibe-accent mt-6 drop-shadow-sm">Later Vibe</p>
                    </div>
                  </motion.div>
                );
              }
              return null;
            })()}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
