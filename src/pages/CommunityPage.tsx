import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, ChevronUp, Clock, CalendarDays, Trophy, Flame,
  Hash, Send, ArrowLeft, MessageCircle, TrendingUp, Sparkles,
  LogOut, X, Bookmark, Loader2, Trash2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast, Toaster } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { type User } from '@supabase/supabase-js';
import { cn } from '../lib/cn';
import type { CommunityPost } from '../lib/types';

const CATEGORIES = [
  { id: 'all', label: 'All Threads', icon: MessageSquare, color: 'text-white' },
  { id: 'show-my-vibe', label: '#show-my-vibe', icon: Sparkles, color: 'text-purple-400', desc: 'Show off your vibe-coded project' },
  { id: 'feedback-wanted', label: '#feedback-wanted', icon: MessageCircle, color: 'text-cyan-400', desc: 'Request feedback from the community' },
  { id: 'tips-and-tricks', label: '#tips-and-tricks', icon: Flame, color: 'text-orange-400', desc: 'Share vibe coding tips' },
  { id: 'bug-or-feature', label: '#bug-or-feature', icon: Hash, color: 'text-rose-400', desc: 'Vibe Gallery site feedback' },
  { id: 'random', label: '#random', icon: MessageSquare, color: 'text-emerald-400', desc: 'Free talk zone' },
];

const TIME_FILTERS = [
  { id: 'recent', label: 'Recent', icon: Clock },
  { id: 'week', label: 'This Week', icon: CalendarDays },
  { id: 'month', label: 'This Month', icon: CalendarDays },
  { id: 'all-time', label: 'All Time', icon: Trophy },
];

const LIST_VARIANTS = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } }
};
const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] } }
};

const TOAST_OPTIONS = {
  duration: 3500,
  style: {
    background: '#1a1a2e', color: '#e0e0e0',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    borderRadius: '12px', fontSize: '13px', fontWeight: '600' as const,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
};

const VOTED_POSTS_KEY = 'vibe_gallery_voted_posts';
function getVotedPosts(): Set<string> {
  try {
    const raw = localStorage.getItem(VOTED_POSTS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}
function saveVotedPosts(set: Set<string>) {
  localStorage.setItem(VOTED_POSTS_KEY, JSON.stringify([...set]));
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getCategoryMeta(catId: string) {
  return CATEGORIES.find(c => c.id === catId) || CATEGORIES[0];
}

function getTimeFilterRange(filter: string): Date | null {
  const now = new Date();
  if (filter === 'week') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (filter === 'month') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return null;
}

export default function CommunityPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [timeFilter, setTimeFilter] = useState('recent');
  const [showCompose, setShowCompose] = useState(false);
  const [composeTitle, setComposeTitle] = useState('');
  const [composeContent, setComposeContent] = useState('');
  const [composeCategory, setComposeCategory] = useState('show-my-vibe');
  const [votedPosts, setVotedPosts] = useState<Set<string>>(getVotedPosts());
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const lastPostTimeRef = useRef<number>(0);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        const { data } = await supabase.from('profiles').select('role').eq('id', currentUser.id).single();
        setIsAdmin(data?.role === 'admin');
      } else {
        setIsAdmin(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchPosts = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('community_posts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPosts(data as CommunityPost[]);
    } catch (err) {
      console.error('Failed to fetch posts:', err);
      toast.error('Failed to load community posts.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const filteredPosts = useMemo(() => {
    let result = posts;
    if (selectedCategory !== 'all') result = result.filter(p => p.category === selectedCategory);
    const rangeDate = getTimeFilterRange(timeFilter);
    if (rangeDate) result = result.filter(p => new Date(p.created_at) >= rangeDate);
    if (timeFilter === 'all-time') result = [...result].sort((a, b) => b.upvotes - a.upvotes);
    return result;
  }, [posts, selectedCategory, timeFilter]);

  const trendingPosts = useMemo(() =>
    [...posts].sort((a, b) => b.upvotes - a.upvotes).slice(0, 3), [posts]);

  const handleUpvote = useCallback(async (postId: string) => {
    const alreadyVoted = votedPosts.has(postId);
    const delta = alreadyVoted ? -1 : 1;
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, upvotes: p.upvotes + delta } : p));
    const next = new Set(votedPosts);
    if (alreadyVoted) next.delete(postId); else next.add(postId);
    setVotedPosts(next);
    saveVotedPosts(next);
    const { error } = await supabase.rpc('increment_post_upvotes', { post_id: postId, delta_val: delta });
    if (error) {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, upvotes: p.upvotes - delta } : p));
      const rollback = new Set(votedPosts);
      setVotedPosts(rollback);
      saveVotedPosts(rollback);
      toast.error('Vote sync failed.');
    }
  }, [votedPosts]);

  const handleCompose = useCallback(async () => {
    if (!composeTitle.trim() || !composeContent.trim()) return;
    if (!user) { handleLogin(); return; }
    const now = Date.now();
    if (!isAdmin && now - lastPostTimeRef.current < 60000) {
      const remaining = Math.ceil((60000 - (now - lastPostTimeRef.current)) / 1000);
      toast.error(`Please wait ${remaining}s before posting again.`);
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('Session expired. Please login again.');
      const { data, error } = await supabase
        .from('community_posts')
        .insert({
          title: composeTitle.trim(),
          content: composeContent.trim(),
          category: composeCategory,
          user_id: currentUser.id,
          user_email: currentUser.email ?? 'Anonymous',
          upvotes: 0,
          comment_count: 0,
        })
        .select()
        .single();
      if (error) throw error;
      lastPostTimeRef.current = Date.now();
      setPosts(prev => [data as CommunityPost, ...prev]);
      setComposeTitle('');
      setComposeContent('');
      setShowCompose(false);
      toast.success('Thread published! 🚀');
    } catch (err: any) {
      toast.error(err.message || 'Failed to publish thread.');
    } finally {
      setIsSubmitting(false);
    }
  }, [composeTitle, composeContent, composeCategory, user, isAdmin]);

  const handleDelete = useCallback(async (postId: string, ownerId: string) => {
    if (!user) return;
    if (user.id !== ownerId && !isAdmin) { toast.error('Permission denied.'); return; }
    if (!window.confirm('Delete this thread permanently?')) return;
    setDeletingId(postId);
    const { error } = await supabase.from('community_posts').delete().eq('id', postId);
    if (error) toast.error('Failed to delete.');
    else { setPosts(prev => prev.filter(p => p.id !== postId)); toast.success('Thread deleted.'); }
    setDeletingId(null);
  }, [user, isAdmin]);

  const handleLogin = useCallback(async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/community' } });
  }, []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return (
    <div className="min-h-screen p-8 lg:p-16 relative">
      <Toaster position="bottom-right" toastOptions={TOAST_OPTIONS} />
      <div className="bg-mesh" />

      {/* NAV */}
      <nav className="flex justify-between items-center mb-16 px-1 lg:px-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-[32px] h-[44px] shrink-0 border-[4px] border-vibe-accent flex items-end justify-center pb-1.5 bg-transparent cursor-pointer" onClick={() => navigate('/main')}>
            <span className="text-white font-black text-xl leading-none">V</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tighter hidden sm:block cursor-pointer" onClick={() => navigate('/main')}>
            VIBE <span className="text-vibe-accent">GALLERY</span>
          </h1>
          <button className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest text-vibe-accent bg-vibe-accent/10 border border-vibe-accent/20 ml-2">
            <MessageSquare size={13} /><span className="hidden md:inline">Community</span>
          </button>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          {user ? (
            <div className="flex items-center gap-3 px-3 py-2 sm:px-6 sm:py-3 bg-white/5 border border-white/10 rounded-full backdrop-blur-md">
              <div className="hidden sm:block text-right">
                <p className="text-[10px] font-black italic text-vibe-accent uppercase tracking-[0.2em] leading-tight">Vibe Coder</p>
                {user.user_metadata.full_name && <p className="text-xs font-bold text-gray-300 leading-tight">{user.user_metadata.full_name}</p>}
              </div>
              <img src={user.user_metadata.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-vibe-accent/30 object-cover" alt="Avatar" />
              <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-white transition-colors" title="Logout"><LogOut size={18} /></button>
            </div>
          ) : (
            <button onClick={handleLogin} className="flex items-center gap-3 px-6 py-3 bg-black border border-white/10 text-white rounded-full font-bold uppercase tracking-[0.2em] text-[11px] hover:border-vibe-accent/50 transition-all active:scale-95">
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4 bg-white rounded-full p-0.5" alt="G" />
              LOGIN
            </button>
          )}
        </div>
      </nav>

      {/* MAIN */}
      <div className="flex gap-6">
        {/* LEFT SIDEBAR */}
        <aside className="hidden lg:block w-56 shrink-0 sticky top-24 self-start">
          <div className="glass-card p-5 hover:transform-none hover:shadow-none">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-4">Categories</h3>
            <div className="flex flex-col gap-1">
              {CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const isActive = selectedCategory === cat.id;
                return (
                  <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                    className={cn("flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all group",
                      isActive ? "bg-vibe-accent/15 text-white border border-vibe-accent/20" : "text-gray-400 hover:bg-white/5 hover:text-white border border-transparent"
                    )}>
                    <Icon size={15} className={cn("shrink-0", isActive ? cat.color : "text-gray-600 group-hover:text-gray-400")} />
                    <span className="font-semibold text-[13px] truncate">{cat.label}</span>
                    {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-vibe-accent" />}
                  </button>
                );
              })}
            </div>
          </div>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => navigate('/main')}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5 text-gray-500 hover:text-vibe-accent hover:border-vibe-accent/20 transition-all text-xs font-bold uppercase tracking-widest">
            <ArrowLeft size={14} /> Back to Gallery
          </motion.button>
        </aside>

        {/* CENTER */}
        <main className="flex-1 min-w-0">
          {/* Compose */}
          {!showCompose ? (
            <motion.button initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              onClick={() => { if (!user) { handleLogin(); return; } setShowCompose(true); }}
              className="w-full flex items-center gap-3 px-6 py-4 glass-card hover:transform-none hover:border-vibe-accent/30 cursor-text mb-6 group">
              <div className="w-8 h-8 rounded-full bg-vibe-accent/10 border border-vibe-accent/20 flex items-center justify-center shrink-0 group-hover:bg-vibe-accent/20 transition-colors">
                <MessageSquare size={15} className="text-vibe-accent" />
              </div>
              <span className="text-gray-500 text-sm font-medium">Start a thread...</span>
            </motion.button>
          ) : (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 mb-6 hover:transform-none hover:shadow-none">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-vibe-accent">New Thread</h3>
                <button onClick={() => setShowCompose(false)} className="p-1.5 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/5"><X size={18} /></button>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                  <button key={cat.id} onClick={() => setComposeCategory(cat.id)}
                    className={cn("px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest border transition-all",
                      composeCategory === cat.id ? "bg-vibe-accent/15 border-vibe-accent/30 text-vibe-accent" : "bg-white/5 border-white/10 text-gray-500 hover:text-white hover:border-white/20"
                    )}>{cat.label}</button>
                ))}
              </div>
              <input type="text" value={composeTitle} onChange={e => setComposeTitle(e.target.value)} placeholder="Thread title..." maxLength={120}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 mb-3 outline-none focus:border-vibe-accent transition-colors text-white text-sm placeholder:text-gray-600" />
              <textarea value={composeContent} onChange={e => setComposeContent(e.target.value)} placeholder="What's on your mind?" maxLength={1000} rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 mb-4 outline-none focus:border-vibe-accent transition-colors text-white text-sm placeholder:text-gray-600 resize-none" />
              <div className="flex items-center justify-between">
                <span className={cn("text-[11px] font-bold tracking-widest", composeContent.length >= 900 ? "text-red-400" : "text-gray-600")}>{composeContent.length} / 1000</span>
                <button onClick={handleCompose} disabled={!composeTitle.trim() || !composeContent.trim() || isSubmitting}
                  className="vibe-button py-2.5 px-6 text-xs bg-vibe-accent text-white disabled:opacity-40 disabled:cursor-not-allowed">
                  {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  <span className="font-bold uppercase tracking-widest">{isSubmitting ? 'Publishing...' : 'Publish'}</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* Time Filter */}
          <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
            {TIME_FILTERS.map(tf => {
              const Icon = tf.icon;
              const isActive = timeFilter === tf.id;
              return (
                <button key={tf.id} onClick={() => setTimeFilter(tf.id)}
                  className={cn("flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all whitespace-nowrap",
                    isActive ? "bg-vibe-accent/15 text-vibe-accent border border-vibe-accent/20" : "text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent")}>
                  <Icon size={13} /> {tf.label}
                </button>
              );
            })}
            <div className="lg:hidden ml-auto">
              <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-400 outline-none">
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* Thread List */}
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 border-2 border-vibe-accent/20 rounded-full" />
                <div className="absolute inset-0 border-t-2 border-vibe-accent rounded-full animate-spin" />
              </div>
              <p className="text-vibe-accent font-black tracking-[0.4em] uppercase text-[10px] animate-pulse">Loading Threads</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={`${selectedCategory}-${timeFilter}`} variants={LIST_VARIANTS} initial="hidden" animate="show" className="flex flex-col gap-3">
                {filteredPosts.length > 0 ? filteredPosts.map(post => {
                  const catMeta = getCategoryMeta(post.category);
                  const isVoted = votedPosts.has(post.id);
                  const canDelete = user?.id === post.user_id || isAdmin;
                  return (
                    <motion.div key={post.id} variants={ITEM_VARIANTS} className="glass-card hover:transform-none hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)] group">
                      <div className="flex gap-4 p-5">
                        <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                          <button onClick={() => handleUpvote(post.id)}
                            className={cn("p-1.5 rounded-lg transition-all border",
                              isVoted ? "bg-vibe-accent/20 border-vibe-accent/30 text-vibe-accent shadow-[0_0_12px_rgba(139,92,246,0.3)]" : "border-transparent text-gray-600 hover:text-vibe-accent hover:bg-vibe-accent/10")}>
                            <ChevronUp size={18} />
                          </button>
                          <span className={cn("text-xs font-black tabular-nums", isVoted ? "text-vibe-accent" : "text-gray-500")}>{post.upvotes}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${post.user_id}`} className="w-5 h-5 rounded-full border border-white/10" alt="" />
                            <span className="text-[11px] text-gray-500 font-medium truncate">{post.user_email.split('@')[0]}</span>
                            <span className="text-[10px] text-gray-700">·</span>
                            <span className="text-[11px] text-gray-600">{timeAgo(post.created_at)}</span>
                          </div>
                          <h3 className="text-[15px] font-bold text-white leading-snug mb-2 group-hover:text-vibe-accent transition-colors">{post.title}</h3>
                          <p className="text-sm text-gray-500 leading-relaxed line-clamp-2 mb-3">{post.content}</p>
                          <div className="flex items-center gap-3">
                            <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md bg-white/5 border border-white/5", catMeta.color)}>{catMeta.label}</span>
                            <div className="flex items-center gap-1.5 text-gray-600"><MessageCircle size={13} /><span className="text-[11px] font-bold">{post.comment_count}</span></div>
                          </div>
                        </div>
                        <div className="self-start flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canDelete && (
                            <button onClick={() => handleDelete(post.id, post.user_id)} disabled={deletingId === post.id} className="p-2 text-gray-700 hover:text-red-400 transition-colors">
                              {deletingId === post.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                            </button>
                          )}
                          <button className="p-2 text-gray-700 hover:text-vibe-accent transition-colors"><Bookmark size={16} /></button>
                        </div>
                      </div>
                    </motion.div>
                  );
                }) : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-2xl">
                    <MessageSquare size={48} className="text-gray-700 mb-4" />
                    <p className="text-gray-500 font-medium italic text-sm">No threads in this category yet.</p>
                    <button onClick={() => { if (!user) handleLogin(); else setShowCompose(true); }} className="mt-4 vibe-button text-xs py-2">
                      <Sparkles size={14} /> Start the first thread
                    </button>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </main>

        {/* RIGHT SIDEBAR */}
        <aside className="hidden xl:block w-64 shrink-0 sticky top-24 self-start space-y-4">
          <div className="glass-card p-5 hover:transform-none hover:shadow-none">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2"><Sparkles size={15} className="text-vibe-accent" /> Start a conversation</h3>
            <p className="text-[12px] text-gray-500 leading-relaxed mb-4">Pick a topic and share with the community.</p>
            <div className="flex flex-col gap-2">
              {CATEGORIES.filter(c => c.id !== 'all').slice(0, 3).map(cat => {
                const Icon = cat.icon;
                return (
                  <button key={cat.id} onClick={() => { setSelectedCategory(cat.id); if (user) setShowCompose(true); else handleLogin(); }}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left hover:bg-white/5 transition-all border border-transparent hover:border-white/5">
                    <div className={cn("p-1.5 rounded-md bg-white/5 border border-white/5", cat.color)}><Icon size={13} /></div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-gray-300">{cat.label}</p>
                      <p className="text-[10px] text-gray-600 truncate">{cat.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="glass-card p-5 hover:transform-none hover:shadow-none">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><TrendingUp size={15} className="text-vibe-cyan" /> Trending Threads</h3>
            <div className="flex flex-col gap-3">
              {trendingPosts.length > 0 ? trendingPosts.map((post, idx) => (
                <div key={post.id} className="flex items-start gap-2.5">
                  <span className={cn("text-[11px] font-black mt-0.5 shrink-0 w-5 text-center", idx === 0 ? "text-vibe-accent" : idx === 1 ? "text-vibe-cyan" : "text-gray-600")}>#{idx + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-gray-300 leading-snug line-clamp-2">{post.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-gray-600 flex items-center gap-1"><ChevronUp size={10} /> {post.upvotes}</span>
                      <span className="text-[10px] text-gray-600 flex items-center gap-1"><MessageCircle size={10} /> {post.comment_count}</span>
                    </div>
                  </div>
                </div>
              )) : <p className="text-[12px] text-gray-600 italic">No threads yet.</p>}
            </div>
          </div>

          <div className="glass-card p-5 hover:transform-none hover:shadow-none">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-3">Community Pulse</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 rounded-lg bg-white/[0.02] border border-white/5">
                <p className="text-lg font-black text-vibe-accent">{posts.length}</p>
                <p className="text-[9px] uppercase tracking-widest text-gray-600 font-bold">Threads</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-white/[0.02] border border-white/5">
                <p className="text-lg font-black text-vibe-cyan">{posts.reduce((acc, p) => acc + p.comment_count, 0)}</p>
                <p className="text-[9px] uppercase tracking-widest text-gray-600 font-bold">Replies</p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* FOOTER */}
      <footer className="mt-24 pt-12 border-t border-white/5 text-gray-600 text-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <p>© 2026 Vibe Gallery Community. Registered Developer: ledpa7</p>
        <div className="flex gap-6">
          <button onClick={() => navigate('/main')} className="hover:text-vibe-accent transition-colors">Gallery</button>
          <button onClick={() => { navigate('/privacy'); window.scrollTo(0, 0); }} className="hover:text-vibe-accent transition-colors">Privacy Policy</button>
          <a href="mailto:led@kakao.com" className="hover:text-vibe-accent transition-colors">Contact</a>
        </div>
      </footer>
    </div>
  );
}
