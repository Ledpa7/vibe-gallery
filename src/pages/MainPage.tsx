import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Plus, HelpCircle, LogOut, Loader2
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { type User } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { toast, Toaster } from 'react-hot-toast';

import { cn } from '../lib/cn';
import type { Vibe, Comment } from '../lib/types';
import { getCache, isCacheFresh, setVibeCache, setTopVibeCache, setTotalCountCache } from '../lib/cache';
import VibeCard from '../components/VibeCard';
import DetailModal from '../components/DetailModal';
import UploadModal from '../components/UploadModal';
import Avatar from '../components/Avatar';

// Storage Settings: Support multiple buckets for 50MB-per-bucket free tier bypass
const BUCKET_CANDIDATES = ['vibe-images', 'vibe-images2'];

// ═══════════════════════════════════════════════════
// 🔥 OPTIMIZATION: Static objects declared OUTSIDE component
//    to prevent re-creation on every render cycle
// ═══════════════════════════════════════════════════
const TOAST_OPTIONS = {
  duration: 3500,
  style: {
    background: '#1a1a2e',
    color: '#e0e0e0',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '600' as const,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(139,92,246,0.15)',
    backdropFilter: 'blur(12px)',
  },
  success: {
    iconTheme: { primary: '#8b5cf6', secondary: '#fff' },
  },
  error: {
    iconTheme: { primary: '#ef4444', secondary: '#fff' },
  },
};

const GRID_VARIANTS = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const CARD_VARIANTS = {
  hidden: { opacity: 0, scale: 0.8 },
  show: { opacity: 1, scale: 1 }
};

const PAGE_SIZE = 17;

export default function MainPage() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});
  
  // Security State
  const lastCommentTimeRef = useRef<number>(0);
  
  // Real DB State
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [dailyTopVibes, setDailyTopVibes] = useState<Vibe[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTodayProjectModal, setIsTodayProjectModal] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [isVoting, setIsVoting] = useState<string | null>(null);
  const [isDeletingVibe, setIsDeletingVibe] = useState<string | null>(null);
  const [editVibeId, setEditVibeId] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  
  // Pagination State
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  // ═══════════════════════════════════════════════════
  // 🔥 OPTIMIZATION: All handlers wrapped in useCallback
  //    to ensure stable references for React.memo children
  // ═══════════════════════════════════════════════════

  const handleCardClick = useCallback((id: string, isToday: boolean = false) => {
    setIsTodayProjectModal(isToday);
    setSelectedId(id);
    if (isToday) setHistoryOffset(0);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedId(null);
  }, []);

  const getProjectByDateOffset = useCallback((offset: number): Vibe | null => {
    for (let currentOffset = offset; currentOffset < offset + 30; currentOffset++) {
      const target = new Date();
      target.setDate(target.getDate() - currentOffset);
      const targetStr = target.toISOString().split('T')[0];

      const match = dailyTopVibes.find(v => {
        if (!v.vibe_date) return false;
        const dbDate = v.vibe_date.includes('T') ? v.vibe_date.split('T')[0] : v.vibe_date;
        return dbDate === targetStr;
      });

      if (match) return match;

      if (currentOffset === 0 && vibes.length > 0) {
        const todayVibes = vibes.filter(v => {
          const vDate = new Date(v.created_at).toISOString().split('T')[0];
          return vDate === targetStr;
        });
        if (todayVibes.length > 0) {
          return [...todayVibes].sort((a, b) => (b.likes || 0) - (a.likes || 0))[0];
        }
      }
    }
    return null;
  }, [dailyTopVibes, vibes]);

  const displayVibe = useMemo(() => 
    selectedId === 'today-project' 
      ? getProjectByDateOffset(historyOffset) 
      : vibes.find(v => v.id === selectedId),
    [selectedId, historyOffset, vibes, getProjectByDateOffset]
  ) as Vibe | null;

  const todayVibe = useMemo(() => getProjectByDateOffset(0), [getProjectByDateOffset]);

  // ═══════════════════════════════════════════════════
  // Data Fetching (useCallback for stable reference)
  // ═══════════════════════════════════════════════════

  const fetchVibes = useCallback(async (currentPage = 0, isInitial = true) => {
    if (isInitial) setIsLoading(true);
    else setIsFetchingMore(true);
    
    const start = currentPage * PAGE_SIZE;
    const end = start + PAGE_SIZE - 1;
    const today = new Date();
    const seed = today.getFullYear() * 1000000 + (today.getMonth() + 1) * 10000 + today.getDate() * 100 + today.getHours();

    try {
      if (isInitial) {
        const [topVibesResult, totalCountResult, vibesResult] = await Promise.all([
          supabase.from('daily_top_vibes').select('id, title, summary, description, image, tech, link, likes, vibe_date').order('vibe_date', { ascending: false }),
          supabase.from('vibes').select('id', { count: 'exact', head: true }),
          supabase.rpc('get_shuffled_vibes', { seed_val: seed }).select('id, title, summary, description, image, tech, link, likes, created_at, user_id').range(start, end)
        ]);
          
        if (topVibesResult.data) {
          const data = topVibesResult.data as Vibe[];
          setDailyTopVibes(data);
          setTopVibeCache(data);
        }
        if (totalCountResult.count !== null) {
          setTotalCount(totalCountResult.count);
          setTotalCountCache(totalCountResult.count);
        }
        
        const vibesData = vibesResult.data as Vibe[] | null;
        if (vibesData) {
          setVibes(vibesData);
          setPage(0);
          setHasMore(vibesData.length === PAGE_SIZE);
          setVibeCache(vibesData);
        }
      } else {
        const { data: vibesData } = (await supabase
          .rpc('get_shuffled_vibes', { seed_val: seed })
          .select('id, title, summary, description, image, tech, link, likes, created_at, user_id')
          .range(start, end)) as { data: Vibe[] | null };
        
        if (vibesData && Array.isArray(vibesData)) {
          setVibes(prev => [...prev, ...vibesData]);
          setHasMore(vibesData.length === PAGE_SIZE);
          setPage(currentPage);
        }
      }
    } catch (error) {
      console.error("Vibe sync failed:", error);
    } finally {
      if (isInitial) setIsLoading(false);
      else setIsFetchingMore(false);
    }
  }, []);

  const fetchComments = useCallback(async (vibeId: string) => {
    if (!vibeId || vibeId === 'today-project' || vibeId === 'placeholder') return;
    
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('vibe_id', vibeId)
      .order('created_at', { ascending: true });
    
    if (data) setComments(data);
  }, []);

  // ═══════════════════════════════════════════════════
  // Initialization Effect
  // ═══════════════════════════════════════════════════

  useEffect(() => {
    if (isCacheFresh()) {
        const cache = getCache();
        setVibes(cache.vibes!);
        setDailyTopVibes(cache.topVibes || []);
        setTotalCount(cache.totalCount || 0);
        setIsLoading(false);
    } else {
        fetchVibes(); 
    }

    const refreshUserData = async (userId: string) => {
      try {
        const [adminResult, votesResult] = await Promise.all([
          supabase.from('profiles').select('role').eq('id', userId).single(),
          supabase.from('vibe_votes').select('vibe_id, vote_type').eq('user_id', userId)
        ]);

        setIsAdmin(adminResult.data?.role === 'admin');
        
        if (votesResult.data) {
          const votesMap = votesResult.data.reduce((acc, curr) => {
            acc[curr.vibe_id] = curr.vote_type;
            return acc;
          }, {} as Record<string, 'up' | 'down'>);
          setUserVotes(votesMap);
        }
      } catch (err) {
        console.warn("Profile fetch skipped for session initialization");
        setIsAdmin(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      if (currentUser) {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          refreshUserData(currentUser.id);
        }
        if (window.location.pathname === '/' || window.location.pathname === '') {
           navigate('/main', { replace: true });
        }
      } else {
        setIsAdmin(false);
        setUserVotes({});
        if (window.location.pathname === '/' || window.location.pathname === '') {
          navigate('/main', { replace: true });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchVibes, navigate]);

  // [Scroll Lock] Prevent background scroll when any modal is open
  useEffect(() => {
    if (selectedId || showUploadModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedId, showUploadModal]);

  // Fetch comments when modal opens with a valid vibe
  useEffect(() => {
    if (selectedId && displayVibe && displayVibe.id !== 'placeholder') {
      fetchComments(displayVibe.id);
    } else {
      setComments([]);
    }
  }, [selectedId, displayVibe?.id, fetchComments]);

  // ═══════════════════════════════════════════════════
  // 🔥 OPTIMIZATION: All action handlers are useCallback
  // ═══════════════════════════════════════════════════

  const handleAddComment = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim() || !displayVibe || displayVibe.id === 'placeholder') return;

    const now = Date.now();
    if (now - lastCommentTimeRef.current < 10000 && !isAdmin) {
      toast.error('Please wait 10 seconds before sending another feedback to prevent spam.');
      return;
    }
    lastCommentTimeRef.current = now;

    setIsSubmittingComment(true);
    const { error } = await supabase
      .from('comments')
      .insert([
        { 
          vibe_id: displayVibe.id, 
          user_id: user.id, 
          user_email: user.email ?? 'Anonymous', 
          content: newComment.trim() 
        }
      ]);

    if (!error) {
      const trimmedComment = newComment.trim();
      setNewComment("");
      const newCommentObj: Comment = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        vibe_id: displayVibe.id,
        user_id: user.id,
        user_email: user.email ?? 'Anonymous',
        content: trimmedComment
      };
      setComments(prev => [...prev, newCommentObj]);
    }
    setIsSubmittingComment(false);
  }, [user, newComment, displayVibe, isAdmin]);

  const updateLocalVibeCounts = useCallback((id: string, update: { likes?: number, dislikes?: number }) => {
    const mapVibe = (v: Vibe) => {
      if (v.id !== id) return v;
      return {
        ...v,
        likes: Math.max(0, Number(v.likes || 0) + (update.likes || 0)),
        dislikes: Math.max(0, Number(v.dislikes || 0) + (update.dislikes || 0))
      };
    };
    setVibes(prev => prev.map(mapVibe));
    setDailyTopVibes(prev => prev.map(mapVibe));
  }, []);

  const handleVote = useCallback(async (id: string, type: 'up' | 'down') => {
    if (!user || isVoting) {
      if (!user) handleLogin();
      return;
    }

    const originalVoteType = userVotes[id];
    setIsVoting(id);

    try {
      if (originalVoteType) {
        if (originalVoteType === type) {
          setUserVotes(prev => { const n = { ...prev }; delete n[id]; return n; });
          updateLocalVibeCounts(id, type === 'up' ? { likes: -1 } : { dislikes: -1 });
          await supabase.from('vibe_votes').delete().eq('vibe_id', id).eq('user_id', user.id);
        } else {
          setUserVotes(prev => ({ ...prev, [id]: type }));
          updateLocalVibeCounts(id, type === 'up' ? { likes: 1, dislikes: -1 } : { likes: -1, dislikes: 1 });
          await supabase.from('vibe_votes').update({ vote_type: type }).eq('vibe_id', id).eq('user_id', user.id);
        }
      } else {
        setUserVotes(prev => ({ ...prev, [id]: type }));
        updateLocalVibeCounts(id, type === 'up' ? { likes: 1 } : { dislikes: 1 });
        await supabase.from('vibe_votes').upsert({ vibe_id: id, user_id: user.id, vote_type: type }, { onConflict: 'vibe_id,user_id' });
      }
    } catch (e: any) {
      toast.error('Sync failed: ' + e.message);
      // Rollback: re-fetch from DB
      const { data } = await supabase.from('vibe_votes').select('vibe_id, vote_type').eq('user_id', user.id);
      if (data) {
        const votesMap = data.reduce((acc, curr) => {
          acc[curr.vibe_id] = curr.vote_type;
          return acc;
        }, {} as Record<string, 'up' | 'down'>);
        setUserVotes(votesMap);
      }
      fetchVibes(0, true);
    } finally {
      setIsVoting(null);
    }
  }, [user, isVoting, userVotes, updateLocalVibeCounts, fetchVibes]);

  const handleLike = useCallback((id: string) => handleVote(id, 'up'), [handleVote]);
  const handleDislike = useCallback((id: string) => handleVote(id, 'down'), [handleVote]);

  const handleLogin = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
  }, []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const handleOpenMyProject = useCallback(() => {
    if (!user) return;
    const myProject = vibes.find(v => v.user_id === user.id);
    if (myProject) {
      setIsTodayProjectModal(false);
      setSelectedId(myProject.id);
    } else {
      toast('You haven\'t uploaded a project yet.', { icon: '📦' });
    }
  }, [user, vibes]);

  const handleUploadAttempt = useCallback(async () => {
    if (!user) {
      handleLogin();
      return;
    }
    
    if (isAdmin) {
      setShowUploadModal(true);
      return;
    }

    const hasUploaded = vibes.some(v => v.user_id === user.id);
    if (hasUploaded) {
      toast.error('You have already uploaded a project! (Limit: 1 Vibe per account)');
      return;
    }

    const hasVoted = Object.keys(userVotes).length > 0;
    const { count: commentCount } = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const hasEvaluation = hasVoted || (commentCount !== null && commentCount > 0);

    if (!hasEvaluation) {
      toast.error('You must evaluate other projects (applaud, dislike, or leave feedback) before uploading your own Vibe!');
      return;
    }
    
    setShowUploadModal(true);
  }, [user, isAdmin, vibes, userVotes, handleLogin]);

  const closeUploadModal = useCallback(() => {
    setShowUploadModal(false);
    setEditVibeId(null);
  }, []);

  const handleDeleteVibe = useCallback(async (vibeId: string, imageUrl: string, ownerId: string) => {
    const isOwner = user && ownerId === user.id;
    if (!isAdmin && !isOwner) {
      toast.error("Access Denied: You don't have permission to delete this project.");
      return;
    }
    
    if (!window.confirm("Are you sure you want to delete this Vibe?\n\nThis will permanently remove the record and its image.")) return;

    setIsDeletingVibe(vibeId);
    try {
      let filePath = '';
      let targetBucket = BUCKET_CANDIDATES[0];

      try {
        const publicUrlIdentifier = '/storage/v1/object/public/';
        if (imageUrl.includes(publicUrlIdentifier)) {
            const pathParts = imageUrl.split(publicUrlIdentifier)[1].split('/');
            targetBucket = pathParts[0];
            filePath = pathParts.slice(1).join('/');
        }
      } catch(e) {
          console.error("URL parsing fail:", e);
      }

      const { error: dbError } = await supabase
        .from('vibes')
        .delete()
        .eq('id', vibeId);

      if (dbError) {
        throw new Error(`Database error: ${dbError.message} (${dbError.code})`);
      }

      if (filePath) {
        const { error: storageError } = await supabase.storage.from(targetBucket).remove([filePath]);
        if (storageError) console.error(`Storage cleanup failed in [${targetBucket}]`, storageError);
      }

      setSelectedId(null);
      setIsTodayProjectModal(false);
      setHistoryOffset(0);
      
      await fetchVibes(0, true);
      toast.success('Project successfully removed from gallery.');
    } catch (error: any) {
      console.error("Delete sequence failed:", error);
      toast.error(error.message || "An unexpected error occurred during deletion.");
    } finally {
      setIsDeletingVibe(null);
    }
  }, [user, isAdmin, fetchVibes]);

  const handleEditVibe = useCallback((vibe: Vibe) => {
    const vibeData = { ...vibe };
    setEditVibeId(vibeData.id);
    setSelectedId(null);
    setTimeout(() => {
      setShowUploadModal(true);
      setTimeout(() => {
        const form = document.querySelector('form') as HTMLFormElement;
        if (form) {
          const titleInput = form.querySelector('[name=title]') as HTMLInputElement;
          const summaryInput = form.querySelector('[name=summary]') as HTMLInputElement;
          const linkInput = form.querySelector('[name=link]') as HTMLInputElement;
          const techInput = form.querySelector('[name=tech]') as HTMLInputElement;
          if (titleInput) titleInput.value = vibeData.title || '';
          if (summaryInput) summaryInput.value = vibeData.summary || '';
          if (linkInput) linkInput.value = vibeData.link || '';
          if (techInput) techInput.value = vibeData.tech?.join(', ') || '';
        }
      }, 150);
    }, 250);
  }, []);

  // 🔥 OPTIMIZATION: Stable callback for onPublishSuccess to avoid UploadModal re-render
  const handlePublishSuccess = useCallback(() => fetchVibes(0, true), [fetchVibes]);

  // 🔥 OPTIMIZATION: Stable callback for loadMore to avoid button re-render
  const handleLoadMore = useCallback(() => fetchVibes(page + 1, false), [fetchVibes, page]);

  return (
    <div className="min-h-screen p-8 lg:p-16">
      <Toaster position="bottom-right" toastOptions={TOAST_OPTIONS} />
      <div className="bg-mesh" />
      
      {/* Navigation */}
      <nav className="flex justify-between items-center mb-16 px-1 lg:px-0">
        {/* Logo Section */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-[32px] h-[44px] shrink-0 border-[4px] border-vibe-accent flex items-end justify-center pb-1.5 bg-transparent">
            <span className="text-white font-black text-xl leading-none">V</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tighter hidden sm:block">
            VIBE <span className="text-vibe-accent">GALLERY</span>
          </h1>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          {user ? (
            <div className="flex items-center gap-3 px-3 py-2 sm:px-6 sm:py-3 bg-white/5 border border-white/10 rounded-full backdrop-blur-md">
              <div className="hidden sm:block text-right">
                <p className="text-[10px] font-black italic text-vibe-accent uppercase tracking-[0.2em] leading-tight">Vibe Coder</p>
                <div className="flex flex-col">
                  {user.user_metadata.full_name && (
                    <p className="text-xs font-bold text-gray-300 leading-tight">{user.user_metadata.full_name}</p>
                  )}
                </div>
              </div>
              <Avatar 
                src={user.user_metadata.avatar_url} 
                seed={user.email || user.id}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-vibe-accent/30 shadow-[0_0_15px_rgba(139,92,246,0.3)] object-cover cursor-pointer hover:scale-110 active:scale-95 transition-all" 
                onClick={handleOpenMyProject}
                title="My Project"
              />
              <button onClick={handleLogout} className="p-2 sm:p-2 text-gray-500 hover:text-white transition-colors" title="Logout"><LogOut size={18} className="sm:w-3.5 sm:h-3.5" /></button>
            </div>

          ) : (
            <button onClick={handleLogin} className="flex items-center gap-3 px-6 py-3 sm:px-8 sm:py-4 bg-black border border-white/10 text-white rounded-full font-bold uppercase tracking-[0.2em] text-[11px] sm:text-xs shadow-2xl hover:bg-white/5 hover:border-vibe-accent/50 transition-all active:scale-95 group">
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4 sm:w-5 sm:h-5 bg-white rounded-full p-0.5" alt="G" />
              <span className="hidden sm:inline">LOGIN</span>
              <span className="sm:hidden text-[9px]">LOGIN</span>
            </button>
          )}
        </div>
      </nav>

      {/* Hero Header & Project of the Day */}
      <div className="flex flex-col lg:flex-row justify-between items-start gap-12 mb-20 relative">
        <header className="max-w-3xl">
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
              "text-5xl lg:text-7xl font-bold mb-6",
              "bg-gradient-to-r from-white via-white to-gray-500 bg-clip-text text-transparent",
              "cursor-default drop-shadow-2xl"
            )}
          >
            Vibe Gallery for <br />
            <span className="text-vibe-accent drop-shadow-[0_0_20px_rgba(139,92,246,0.3)]">Vibe Coders</span>
          </motion.h1>
          <div className="flex flex-col gap-6 mt-6">
            <p className="text-lg text-gray-400">
               This is a space to showcase projects created with Vibe Coding. 
               Introduce your projects and receive anonymous feedback.
            </p>
            <ol className="list-decimal list-inside text-[15px] text-vibe-accent font-medium space-y-2 pl-2 marker:text-vibe-accent marker:font-black">
               <li>You must evaluate other people's projects to upload a project (Vibe).</li>
               <li>Only one project (Vibe) can be uploaded per account.</li>
               <li>The location of posted projects (Vibe) changes every hour.</li>
            </ol>
          </div>
        </header>

        {/* Today's Project (Framed Spotlight) */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.05 }}
          onClick={() => handleCardClick('today-project', true)}
          className="lg:w-[340px] w-full cursor-pointer relative group"
        >
          <div className="featured-border-glow" />
          <div className="glass-card relative group transition-all duration-500 hover:border-vibe-accent/30 overflow-hidden h-full">
            <div className="absolute top-4 left-4 z-20 text-vibe-accent text-[9px] font-bold uppercase tracking-[0.3em] bg-black/40 backdrop-blur-md px-2 py-1 rounded ring-1 ring-vibe-accent/30">
              Today's Vibe
            </div>
            <div className="rotating-glow-bg opacity-20" />
            <div className="relative z-10 overflow-hidden aspect-square flex items-center justify-center bg-vibe-bg border border-white/5 shadow-2xl">
               {todayVibe && todayVibe.id !== 'placeholder' ? (
                 <>
                   <img 
                     src={todayVibe.image} 
                     className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-60 group-hover:opacity-80" 
                     alt="Top Vibe"
                   />
                   <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-6">
                      <div className="text-vibe-accent text-[10px] font-black uppercase tracking-[0.4em] mb-2 opacity-80">Spotlight of the Day</div>
                      <div className="text-white font-black text-2xl mb-1 leading-tight">{todayVibe.title}</div>
                   </div>
                 </>
               ) : (
                 <>
                   <HelpCircle className="w-24 h-24 text-white/5 group-hover:text-vibe-accent/20 transition-colors" />
                   <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                   <div className="absolute bottom-6 left-6 right-6">
                      <div className="text-vibe-accent text-[10px] font-bold uppercase tracking-[0.3em] mb-1">Top Rated</div>
                      <div className="text-white font-bold text-2xl mb-1">Today's Vibe</div>
                      <div className="text-gray-400 text-sm leading-tight">The vibe that received the most likes during the day is displayed.</div>
                   </div>
                 </>
               )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Gallery Grid Section Header */}
      {!isLoading && (
        <div className="mb-6 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-vibe-accent animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">
              Total Vibes ({totalCount})
            </span>
          </div>
        </div>
      )}

      {/* Gallery Grid */}
      <motion.div 
        variants={GRID_VARIANTS}
        initial="hidden"
        animate="show"
        className={cn(
          "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4",
          "w-full"
        )}
      >
        {isLoading ? (
          <div className="col-span-full py-40 flex flex-col items-center justify-center gap-8">
             <div className="relative">
                <div className="w-16 h-16 border-2 border-vibe-accent/20 rounded-full" />
                <div className="absolute inset-0 border-t-2 border-vibe-accent rounded-full animate-spin shadow-[0_0_15px_rgba(139,92,246,0.5)]" />
                <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse shadow-[0_0_10px_white]" />
                </div>
             </div>
             <div className="flex flex-col items-center gap-2">
                <p className="text-vibe-accent font-black tracking-[0.5em] uppercase text-[10px] animate-pulse">Syncing Vibes</p>
                <div className="w-32 h-0.5 bg-white/5 rounded-full overflow-hidden">
                   <motion.div 
                     initial={{ x: '-100%' }}
                     animate={{ x: '100%' }}
                     transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                     className="w-full h-full bg-vibe-accent shadow-[0_0_10px_rgba(139,92,246,1)]"
                   />
                </div>
             </div>
          </div>
        ) : (
          <>
            <motion.div 
              variants={CARD_VARIANTS}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleUploadAttempt}
              className="glass-card flex flex-col items-center justify-center p-6 border-dashed border-2 border-white/10 hover:border-vibe-accent/50 group cursor-pointer aspect-square bg-vibe-accent/5"
            >
              <div className="w-12 h-12 rounded-full bg-vibe-accent/10 flex items-center justify-center mb-4 group-hover:bg-vibe-accent group-hover:text-white transition-all duration-300">
                <Plus size={24} />
              </div>
              <span className="text-sm font-medium text-gray-400 group-hover:text-white uppercase tracking-widest font-bold text-[10px]">Upload Vibe</span>
            </motion.div>

            {vibes.map(vibe => (
              <VibeCard 
                key={vibe.id} 
                vibe={vibe} 
                onClick={() => handleCardClick(vibe.id, false)}
              />
            ))}
            {!isLoading && vibes.length === 0 && (
              <div className="col-span-full py-20 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                 <HelpCircle className="text-gray-700 mb-4" size={48} />
                 <p className="text-gray-500 font-medium italic">No vibes have been optimized yet. Be the first to exhibit.</p>
              </div>
            )}
          </>
        )}
      </motion.div>

      {hasMore && !isLoading && (
        <div className="flex justify-center mt-12 mb-8">
          <button
            onClick={handleLoadMore}
            disabled={isFetchingMore}
            className="flex items-center gap-2 px-8 py-3 rounded-full border border-vibe-accent/30 text-vibe-accent font-bold uppercase tracking-widest text-xs hover:bg-vibe-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(139,92,246,0.1)]"
          >
            {isFetchingMore ? (
              <><Loader2 className="animate-spin" size={16} /> Loading Cosmos...</>
            ) : (
              'Load More Vibes'
            )}
          </button>
        </div>
      )}

      {/* Detail Modal */}
      <DetailModal
        selectedId={selectedId}
        displayVibe={displayVibe}
        isTodayProjectModal={isTodayProjectModal}
        historyOffset={historyOffset}
        setHistoryOffset={setHistoryOffset}
        handleCloseModal={handleCloseModal}
        getProjectByDateOffset={getProjectByDateOffset}
        user={user}
        isAdmin={isAdmin}
        userVotes={userVotes}
        isVoting={isVoting}
        handleLike={handleLike}
        handleDislike={handleDislike}
        comments={comments}
        newComment={newComment}
        setNewComment={setNewComment}
        isSubmittingComment={isSubmittingComment}
        handleAddComment={handleAddComment}
        handleLogin={handleLogin}
        isDeletingVibe={isDeletingVibe}
        handleDeleteVibe={handleDeleteVibe}
        onEditVibe={handleEditVibe}
      />

      {/* Upload Modal */}
      <UploadModal
        show={showUploadModal}
        onClose={closeUploadModal}
        user={user}
        isAdmin={isAdmin}
        editVibeId={editVibeId}
        handleLogin={handleLogin}
        onPublishSuccess={handlePublishSuccess}
      />

      {/* Footer */}
      <footer className="mt-24 pt-12 border-t border-white/5 text-gray-600 text-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex flex-col gap-1">
          <p>© 2026 Vibe Gallery. Registered Developer: ledpa7</p>
          {user && (
            <div className="flex items-center gap-2 text-vibe-accent text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-vibe-accent animate-pulse" />
              Logged in: {user.email} (Vibe Coder)
              <button onClick={handleLogout} className="underline text-gray-500 hover:text-white ml-2">Logout</button>
            </div>
          )}
        </div>
        <div className="flex gap-6">
          <button 
            onClick={() => {
              navigate('/privacy');
              window.scrollTo(0, 0);
            }} 
            className="hover:text-vibe-accent transition-colors"
          >
            Privacy Policy
          </button>

          <a href="mailto:led@kakao.com" className="hover:text-vibe-accent transition-colors">Contact</a>
        </div>
      </footer>
    </div>
  );
}
