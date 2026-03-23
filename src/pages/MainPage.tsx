import { useEffect, useState, useRef, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ThumbsUp, ThumbsDown, ArrowUpRight, Layers, Plus, HelpCircle, LogIn, 
  ShieldCheck, X, Upload, History, ChevronLeft, ChevronRight, Calendar, 
  Image as ImageIcon, Loader2, Trash2, Check, LogOut
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { type User } from '@supabase/supabase-js';
import { useNavigate, useLocation } from 'react-router-dom';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toast, Toaster } from 'react-hot-toast';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import imageCompression from 'browser-image-compression';



function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Storage Settings: Support multiple buckets for 50MB-per-bucket free tier bypass
const BUCKET_CANDIDATES = ['vibe-images', 'vibe-images2'];

// Vibe Interface (Database Schema)
interface Vibe {
  id: string;
  created_at: string;
  title: string;
  summary: string;
  description: string;
  image: string;
  link: string;
  tech: string[];
  likes: number;
  dislikes: number;
  user_id: string;
  user_email: string;
  comment_count?: number;
  total_engagement?: number;
  vibe_date?: string;
}

interface Comment {
  id: string;
  created_at: string;
  vibe_id: string;
  user_id: string;
  user_email: string;
  content: string;
}

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

export default function MainPage() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [totalCount, setTotalCount] = useState(0);
  
  // Pagination State
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const PAGE_SIZE = 17;

  // Image Upload State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [cropPreview, setCropPreview] = useState<string | null>(null);
  const [finalCroppedBlob, setFinalCroppedBlob] = useState<Blob | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // Helper to generate the final processed 480x480 WebP blob
  const generateCroppedBlob = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const activeCrop = completedCrop || crop;
      if (!imgRef.current || !activeCrop) return reject('No crop data');
      const img = imgRef.current;
      const canvas = document.createElement('canvas');
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;
      canvas.width = 480;
      canvas.height = 480;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, 480, 480);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        img,
        activeCrop.x * scaleX,
        activeCrop.y * scaleY,
        activeCrop.width * scaleX,
        activeCrop.height * scaleY,
        0, 0, 480, 480
      );
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject('Canvas failed');
      }, 'image/webp', 0.82); // Balanced WebP
    });
  };

  // Automatically adapts to any aspect ratio while injecting 1.6x perfectly uniform padding.
  // Guarantees small thumbnails forcibly trigger the 340px UI ceiling, while panoramic images maintain
  // maximum possible horizontal footprint without being forcefully squashed into square canvas blocks.
  const createProportionalPaddedCanvas = (src: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        
        // 1.6x size generates generous 30% symmetrical margins around the content bounds.
        let canvasW = w * 1.6;
        let canvasH = h * 1.6;

        // Automatically bypass tiny image float issues by enforcing a minimum native resolution 
        // that physically pushes against the CSS 'max-h' constraints to touch ceilings natively.
        if (Math.max(canvasW, canvasH) < 1000) {
            const scaleUp = 1000 / Math.max(canvasW, canvasH);
            canvasW *= scaleUp;
            canvasH *= scaleUp;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#0a0a0c'; 
        ctx.fillRect(0, 0, canvasW, canvasH);
        
        const drawScale = (canvasW / 1.6) / w;
        const drawW = w * drawScale;
        const drawH = h * drawScale;
        const x = (canvasW - drawW) / 2;
        const y = (canvasH - drawH) / 2;
        
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x, y, drawW, drawH);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.src = src;
    });
  };

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    const isPortrait = height > width;
    const initialCrop = centerCrop(
      makeAspectCrop(
        // Responsively attach to the smallest dimension to guarantee the 1:1 constraints safely fit
        { unit: '%', width: isPortrait ? 90 : undefined, height: isPortrait ? undefined : 90 }, 
        1, width, height
      ), width, height
    );
    setCrop(initialCrop);
  }

  const getProjectByDateOffset = useCallback((offset: number): Vibe | null => {
    const today = new Date();
    const targetDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    const targetDateString = `${year}-${month}-${day}`;

    // 1. Try to find the finalized winner from the pre-calculated view (Yesterday and before)
    const dailyWinner = dailyTopVibes.find(v => v.vibe_date === targetDateString);
    if (dailyWinner) return dailyWinner;

    // 2. If it's "Today" (offset 0) and no winner is finalized yet, 
    // find the current leader from the live vibes list in memory
    if (offset === 0 && vibes.length > 0) {
      const todayVibes = vibes.filter(v => {
        const vDate = new Date(v.created_at);
        // Compare dates in local time to match user expectation
        return vDate.getFullYear() === today.getFullYear() &&
               vDate.getMonth() === today.getMonth() &&
               vDate.getDate() === today.getDate();
      });

      if (todayVibes.length > 0) {
        // Return the one with the most engagement (likes)
        return [...todayVibes].sort((a, b) => (b.likes || 0) - (a.likes || 0))[0];
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

  const todayVibe = useMemo(() => getProjectByDateOffset(0), [getProjectByDateOffset, dailyTopVibes]);

  useEffect(() => {
    // 1. Initial Data Fetch (Only once on mount)
    fetchVibes(); 

    // 2. Optimized User Data Refresher
    const refreshUserData = async (userId: string) => {
      try {
        const [adminResult, votesResult] = await Promise.all([
          supabase.from('profiles').select('role').eq('id', userId).single(),
          supabase.from('vibe_votes').select('vibe_id, vote_type').eq('user_id', userId)
        ]);

        // Non-admins or new users won't have a profile record yet - this is fine
        setIsAdmin(adminResult.data?.role === 'admin');
        
        if (votesResult.data) {
          const votesMap = votesResult.data.reduce((acc, curr) => {
            acc[curr.vibe_id] = curr.vote_type;
            return acc;
          }, {} as Record<string, 'up' | 'down'>);
          setUserVotes(votesMap);
        }
      } catch (err) {
        console.error("Profile fetch skipped for new user");
        setIsAdmin(false);
      }
    };

    // 3. One-time Initial Session Check
    const checkInitialAuth = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        setUser(currentUser);
        refreshUserData(currentUser.id);
      }
    };
    checkInitialAuth();

    // 4. Stable Auth Change Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      
      // Update basic user state immediately for UI to reflect login (Important for new users!)
      setUser(currentUser);
      
      if (currentUser) {
        // Fetch detailed preferences/roles in background
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          refreshUserData(currentUser.id);
        }
        
        // Handle path consistency
        if (location.pathname === '/' || location.pathname === '') {
           navigate('/main', { replace: true });
        }
      } else {
        setIsAdmin(false);
        setUserVotes({});
        if (location.pathname === '/' || location.pathname === '') {
          navigate('/main', { replace: true });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []); // Remove location from dependency to prevent listener leaks




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

  const fetchVibes = async (currentPage = 0, isInitial = true) => {
    if (isInitial) setIsLoading(true);
    else setIsFetchingMore(true);
    
    // 1. Fetch static or one-time data on initial mount ONLY
    if (isInitial) {
      const [topVibesResult, totalCountResult] = await Promise.all([
        supabase.from('daily_top_vibes').select('*').order('vibe_date', { ascending: false }),
        supabase.from('vibes').select('id', { count: 'exact', head: true })
      ]);
        
      if (topVibesResult.data) setDailyTopVibes(topVibesResult.data);
      if (totalCountResult.count !== null) setTotalCount(totalCountResult.count);
    }

    // 2. Fetch general gallery vibes via Global RPC
    const start = currentPage * PAGE_SIZE;
    const end = start + PAGE_SIZE - 1;

    const today = new Date();
    // Seed changes every HOUR to shuffle globally across all pages
    const seed = today.getFullYear() * 1000000 + (today.getMonth() + 1) * 10000 + today.getDate() * 100 + today.getHours();

    const { data: vibesData } = await supabase
      .rpc('get_shuffled_vibes', { seed_val: seed })
      .range(start, end);
    
    if (vibesData) {
      if (isInitial) {
        setVibes(vibesData);
        setPage(0); // Explicitly reset page to 0 on initial/refresh
      } else {
        setVibes(prev => [...prev, ...vibesData]);
      }
      
      setHasMore(vibesData.length === PAGE_SIZE);
      if (!isInitial) setPage(currentPage);
    }
    
    if (isInitial) setIsLoading(false);
    else setIsFetchingMore(false);
  };

  const fetchComments = async (vibeId: string) => {
    // Prevent invalid UUID errors for placeholders or aliases
    if (!vibeId || vibeId === 'today-project' || vibeId === 'placeholder') return;
    
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('vibe_id', vibeId)
      .order('created_at', { ascending: true });
    
    if (data) setComments(data);
  };

  const fetchUserVotes = async (userId: string) => {
    // Replaced by refreshUserData batch call for efficiency
    const { data } = await supabase
      .from('vibe_votes')
      .select('vibe_id, vote_type')
      .eq('user_id', userId);
    
    if (data) {
      const votesMap = data.reduce((acc, curr) => {
        acc[curr.vibe_id] = curr.vote_type;
        return acc;
      }, {} as Record<string, 'up' | 'down'>);
      setUserVotes(votesMap);
    }
  };


  useEffect(() => {
    if (selectedId && displayVibe && displayVibe.id !== 'placeholder') {
      fetchComments(displayVibe.id);
    } else {
      setComments([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim() || !displayVibe || displayVibe.id === 'placeholder') return;

    // Security: Anti-Spam / Rate Limiting (10 seconds between comments)
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
      setNewComment("");
      // Optimistic local append instead of re-fetching
      const newCommentObj: Comment = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        vibe_id: displayVibe.id,
        user_id: user.id,
        user_email: user.email ?? 'Anonymous',
        content: newComment.trim()
      };
      setComments(prev => [...prev, newCommentObj]);
    }
    setIsSubmittingComment(false);
  };


  const handleVote = async (id: string, type: 'up' | 'down') => {
    if (!user || isVoting) {
      if (!user) handleLogin();
      return;
    }

    const originalVoteType = userVotes[id];
    setIsVoting(id);

    try {
      // 1. Optimistic Update UI Immediately
      if (originalVoteType) {
        if (originalVoteType === type) {
          // Cancel
          setUserVotes(prev => { const n = { ...prev }; delete n[id]; return n; });
          updateLocalVibeCounts(id, type === 'up' ? { likes: -1 } : { dislikes: -1 });
          await supabase.from('vibe_votes').delete().eq('vibe_id', id).eq('user_id', user.id);
        } else {
          // Swap
          setUserVotes(prev => ({ ...prev, [id]: type }));
          updateLocalVibeCounts(id, type === 'up' ? { likes: 1, dislikes: -1 } : { likes: -1, dislikes: 1 });
          await supabase.from('vibe_votes').update({ vote_type: type }).eq('vibe_id', id).eq('user_id', user.id);
        }
      } else {
        // New vote
        setUserVotes(prev => ({ ...prev, [id]: type }));
        updateLocalVibeCounts(id, type === 'up' ? { likes: 1 } : { dislikes: 1 });
        await supabase.from('vibe_votes').upsert({ vibe_id: id, user_id: user.id, vote_type: type }, { onConflict: 'vibe_id,user_id' });
      }
    } catch (e: any) {
      toast.error('Sync failed: ' + e.message);
      // Rollback on error
      fetchUserVotes(user.id);
      fetchVibes(0, true);
    } finally {
      setIsVoting(null);
    }
  };

  const updateLocalVibeCounts = (id: string, update: { likes?: number, dislikes?: number }) => {
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
  };

  const handleLike = (id: string) => handleVote(id, 'up');
  const handleDislike = (id: string) => handleVote(id, 'down');

  const handleOpenMyProject = () => {
    if (!user) return;
    const myProject = vibes.find(v => v.user_id === user.id);
    if (myProject) {
      setIsTodayProjectModal(false);
      setSelectedId(myProject.id);
    } else {
      toast('You haven\'t uploaded a project yet.', { icon: '📦' });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
  };

  const handleUploadAttempt = async () => {
    if (!user) {
      handleLogin();
      return;
    }
    
    // Admin bypass all restrictions
    if (isAdmin) {
      setShowUploadModal(true);
      return;
    }

    // 1. One project per account check (local state)
    const hasUploaded = vibes.some(v => v.user_id === user.id);
    if (hasUploaded) {
      toast.error('You have already uploaded a project! (Limit: 1 Vibe per account)');
      return;
    }

    // 2. Feedback/Evaluation check
    // A. Check local votes first (fastest)
    const hasVoted = Object.keys(userVotes).length > 0;
    
    // B. Check for comments in the database
    const { count: commentCount } = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const hasEvaluation = hasVoted || (commentCount !== null && commentCount > 0);

    if (!hasEvaluation) {
      toast.error('You must evaluate other projects (applaud, dislike, or leave feedback) before uploading your own Vibe!');
      return;
    }
    
    // Passed all checks
    setShowUploadModal(true);
  };


  const closeUploadModal = useCallback(() => {
    setShowUploadModal(false);
    setImageFile(null);
    setImagePreview(null);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setCropPreview(null);
    setFinalCroppedBlob(null);
    setIsProcessingImage(false);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    const options = {
      maxSizeMB: 2,
      maxWidthOrHeight: 1920,
      useWebWorker: true
    };

    try {
      const compressedFile = await imageCompression(file, options);
      setImageFile(compressedFile);
      const rawUrl = URL.createObjectURL(compressedFile);
      const paddedUrl = await createProportionalPaddedCanvas(rawUrl);
      URL.revokeObjectURL(rawUrl);
      setImagePreview(paddedUrl);
    } catch (error) {
      console.error('Compression error:', error);
      toast.error('Failed to process image. Please try a different file.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handlePublishVibe = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Must capture FormData before any 'await' calls! 
    const formData = new FormData(e.currentTarget);

    // 1. Get fresh user session to avoid stale IDs which trigger RLS failures
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser || !imageFile) {
      toast.error("Please login again or select a vibe screenshot!");
      return;
    }

    setIsUploading(true);
    const title = formData.get('title') as string;
    const summary = formData.get('summary') as string;
    let link = formData.get('link') as string;
    const techInput = formData.get('tech') as string;

    // Security: Deep check to prevent XSS (javascript: or data: URIs)
    if (link && !link.startsWith('http://') && !link.startsWith('https://')) {
      link = 'https://' + link;
    }
    try {
      const parsedUrl = new URL(link);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        toast.error("Security Alert: Vibe Link must be a valid HTTP/HTTPS URL.");
        setIsUploading(false);
        return;
      }
    } catch {
      toast.error("Vibe Link is not a valid URL format.");
      setIsUploading(false);
      return;
    }

    try {
      // 2. Use the already confirmed blob or generate one now
      let finalBlob = finalCroppedBlob;
      if (!finalBlob) {
        if (!imgRef.current || !completedCrop) {
          toast.error("Please frame your shot correctly!");
          return;
        }
        finalBlob = await generateCroppedBlob();
      }
      const finalFile = new File([finalBlob], 'vibe.webp', { type: 'image/webp' });

      // 3. Final Compression (Extreme Efficiency at 480px)
      const options = { maxSizeMB: 0.03, maxWidthOrHeight: 480, useWebWorker: true };
      const microFile = await imageCompression(finalFile, options);

      // 4. Try upload with Multi-Bucket Failover
      const fileName = `${Date.now()}.webp`;
      const filePath = `${currentUser.id}/${fileName}`;
      let finalPublicUrl = '';
      let usedBucket = '';
      let uploadSuccess = false;

      for (const bucketName of BUCKET_CANDIDATES) {
          const { error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(filePath, microFile);

          if (!uploadError) {
              const { data: { publicUrl } } = supabase.storage
                .from(bucketName)
                .getPublicUrl(filePath);
              finalPublicUrl = publicUrl;
              usedBucket = bucketName;
              uploadSuccess = true;
              break; // Success! Exit loop
          } else {
              console.warn(`Bucket [${bucketName}] failed:`, uploadError.message);
              // If it's not a quota/network error, we might still fail, but we'll try the next bucket as a fallback
          }
      }

      if (!uploadSuccess) throw new Error("All storage buckets are full. Please contact the administrator.");

      // 5. Insert Vibe Record with the successful publicUrl
      const { error: dbError } = await supabase
        .from('vibes')
        .insert({ 
          title: title,
          summary: summary,
          image: finalPublicUrl,
          link: link,
          tech: techInput ? techInput.split(',').map(t => t.trim()).filter(Boolean) : ['N/A'],
          user_id: currentUser.id,
          user_email: currentUser.email ?? 'Anonymous', 
          likes: 0,
          dislikes: 0
        });

      if (dbError) {
        // Cleanup orphaned image from the specific bucket used
        await supabase.storage.from(usedBucket).remove([filePath]);
        throw dbError;
      }

      // Reset all states via shared function
      closeUploadModal();
      
      fetchVibes();
      toast.success('Your Vibe has been framed and uploaded! 🚀');
    } catch (error: any) {
      toast.error(error.message || "Failed to publish vibe.");
      console.error("Publish error:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteVibe = async (vibeId: string, imageUrl: string, ownerId: string) => {
    // 1. Permission Check
    const isOwner = user && ownerId === user.id;
    if (!isAdmin && !isOwner) {
      toast.error("Access Denied: You don't have permission to delete this project.");
      return;
    }
    
    if (!window.confirm("Are you sure you want to delete this Vibe?\n\nThis will permanently remove the record and its image.")) return;

    setIsDeletingVibe(vibeId);
    try {
      // 2. Intelligent Bucket and Path Detection from URL
      let filePath = '';
      let targetBucket = BUCKET_CANDIDATES[0]; // Fallback to primary

      try {
        // Standard Supabase URL Format: .../storage/v1/object/public/BUCKET_NAME/USER_ID/FILE_NAME
        const publicUrlIdentifier = '/storage/v1/object/public/';
        if (imageUrl.includes(publicUrlIdentifier)) {
            const pathParts = imageUrl.split(publicUrlIdentifier)[1].split('/');
            targetBucket = pathParts[0]; // Extracted bucket name (vibe-images, vibe-images2 etc)
            filePath = pathParts.slice(1).join('/'); // Extracted user_id/file.webp
        }
      } catch(e) {
          console.error("URL parsing fail:", e);
      }

      // 3. Delete from DB (FK dependencies must be handled by CASCADE in PG)
      const { error: dbError } = await supabase
        .from('vibes')
        .delete()
        .eq('id', vibeId);

      if (dbError) {
        throw new Error(`Database error: ${dbError.message} (${dbError.code})`);
      }

      // 4. Cleanup image file from the correctly identified bucket
      if (filePath) {
        const { error: storageError } = await supabase.storage.from(targetBucket).remove([filePath]);
        if (storageError) console.error(`Storage cleanup failed in [${targetBucket}]`, storageError);
      }

      // 5. Success: Clean up UI state
      setSelectedId(null);
      setIsTodayProjectModal(false);
      setHistoryOffset(0);
      
      // Refresh the entire list (Page 0, Initial=true)
      await fetchVibes(0, true);
      toast.success('Project successfully removed from gallery.');
    } catch (error: any) {
      console.error("Delete sequence failed:", error);
      toast.error(error.message || "An unexpected error occurred during deletion.");
    } finally {
      setIsDeletingVibe(null);
    }
  };


  return (
    <div className="min-h-screen p-8 lg:p-16">
      <Toaster 
        position="bottom-right"
        toastOptions={{
          duration: 3500,
          style: {
            background: '#1a1a2e',
            color: '#e0e0e0',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: '600',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(139,92,246,0.15)',
            backdropFilter: 'blur(12px)',
          },
          success: {
            iconTheme: { primary: '#8b5cf6', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#fff' },
          },
        }}
      />
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
                  <p className="text-[9px] font-medium text-gray-500 leading-tight">{user.email}</p>
                </div>
              </div>
              <img 
                src={user.user_metadata.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} 
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-vibe-accent/30 shadow-[0_0_15px_rgba(139,92,246,0.3)] object-cover cursor-pointer hover:scale-110 active:scale-95 transition-all" 
                onClick={handleOpenMyProject}
                title="My Project"
                alt="P" 
              />
              <button onClick={handleLogout} className="p-2 sm:p-2 text-gray-500 hover:text-white transition-colors" title="Logout"><LogOut size={18} className="sm:w-3.5 sm:h-3.5" /></button>
            </div>

          ) : (
            <button onClick={handleLogin} className="flex items-center gap-2 px-6 py-3 sm:px-8 sm:py-4 bg-black border border-white/10 text-white rounded-full font-bold uppercase tracking-[0.2em] text-[11px] sm:text-xs shadow-2xl hover:bg-white/5 hover:border-vibe-accent/50 transition-all active:scale-95 group">
              <LogIn size={18} className="group-hover:text-vibe-accent transition-colors" /> <span className="hidden sm:inline">LOGIN</span>
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
            whileHover={{ scale: 1.02 }}
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
          onClick={() => {
            setHistoryOffset(0);
            setIsTodayProjectModal(true);
            setSelectedId('today-project'); 
          }}
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
                                            {todayVibe.user_email && (
                        <p className="text-gray-400 text-xs font-medium tracking-tight">By {todayVibe.user_email}</p>
                      )}
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
        variants={{
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: {
              staggerChildren: 0.05
            }
          }
        }}
        initial="hidden"
        animate="show"
        className={cn(
          "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4",
          "w-full"
        )}
      >
        {/* Upload Card */}
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
              variants={{
                hidden: { opacity: 0, scale: 0.8 },
                show: { opacity: 1, scale: 1 }
              }}
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
                onClick={() => {
                  setIsTodayProjectModal(false);
                  setSelectedId(vibe.id);
                }} 
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
            onClick={() => fetchVibes(page + 1, false)}
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
      <AnimatePresence>
        {selectedId && (isTodayProjectModal || displayVibe) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl"
            onClick={() => setSelectedId(null)}
          >
            <div className="flex items-center justify-center gap-8 w-full" onClick={e => e.stopPropagation()}>
              {/* Yesterday Ghost Preview */}
              {isTodayProjectModal && getProjectByDateOffset(historyOffset + 1) && (
                <motion.div 
                  initial={{ opacity: 0, x: 50, scale: 0.8 }}
                  animate={{ opacity: 1, x: 0, scale: 0.9 }}
                  className="hidden xl:flex glass-card w-48 h-[60vh] shrink-0 overflow-hidden relative cursor-pointer group/ghost border-vibe-accent/20"
                  onClick={() => setHistoryOffset(prev => prev + 1)}
                >
                  <img src={getProjectByDateOffset(historyOffset + 1)!.image} className="absolute inset-0 w-full h-full object-cover blur-md opacity-20 group-hover/ghost:opacity-40 transition-opacity" />
                  <div className="absolute inset-0 bg-gradient-to-l from-[#0f0f11] via-transparent to-transparent z-10" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                    <div className="p-6 rounded-full bg-vibe-accent/10 border border-vibe-accent/30 shadow-[0_0_30px_rgba(139,92,246,0.3)] group-hover/ghost:bg-vibe-accent/20 group-hover/ghost:scale-110 transition-all duration-300">
                      <ChevronLeft size={56} className="text-vibe-accent drop-shadow-[0_0_15px_rgba(139,92,246,1)]" />
                    </div>
                    <p className="text-[12px] uppercase tracking-[0.3em] font-black text-vibe-accent mt-6 drop-shadow-sm">Yesterday's Vibe</p>
                  </div>
                </motion.div>
              )}

              <motion.div 
                layoutId={selectedId!}
                className="glass-card max-w-4xl w-full max-h-[90vh] overflow-y-auto bg-[#0f0f11] pointer-events-auto relative shadow-[0_0_100px_rgba(0,0,0,0.8)] outline outline-1 outline-white/5"
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
                    onClick={() => setSelectedId(null)}
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
                          {(displayVibe.user_id === user?.id || isAdmin) && (
                            <button 
                              disabled={isDeletingVibe === displayVibe.id}
                              onClick={() => handleDeleteVibe(displayVibe.id, displayVibe.image, displayVibe.user_id)}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-400 rounded-md border border-red-500/20 transition-all font-bold uppercase tracking-widest text-[10px] disabled:opacity-50",
                                isDeletingVibe === displayVibe.id && "animate-pulse"
                              )}
                            >
                              <Trash2 size={12} /> 
                              {isDeletingVibe === displayVibe.id ? 'Deleting...' : (isAdmin && displayVibe.user_id !== user?.id ? 'Admin Delete' : 'Delete')}
                            </button>
                          )}
                            {isTodayProjectModal && (
                              <div className="flex items-center gap-2 text-vibe-accent bg-vibe-accent/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-vibe-accent/20">
                                <Calendar size={12} />
                                {new Date(new Date().setDate(new Date().getDate() - historyOffset)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                          className="vibe-button w-full justify-center py-4 text-center ring-1 ring-vibe-accent bg-vibe-accent/5 hover:bg-vibe-accent/10"
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
                              className="w-full bg-white/5 border border-white/10 rounded-xl p-6 outline-none focus:border-vibe-accent transition-all min-h-[120px] resize-none text-white text-sm"
                            />
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
                               className="px-8 py-3 bg-black border border-white/10 text-white rounded-full font-bold uppercase tracking-[0.2em] text-xs hover:border-vibe-accent/50 transition-all shadow-xl"
                             >
                               LOGIN WITH GOOGLE
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
              {isTodayProjectModal && historyOffset > 0 && getProjectByDateOffset(historyOffset - 1) && (
                <motion.div 
                  initial={{ opacity: 0, x: -50, scale: 0.8 }}
                  animate={{ opacity: 1, x: 0, scale: 0.9 }}
                  className="hidden xl:flex glass-card w-48 h-[60vh] shrink-0 overflow-hidden relative cursor-pointer group/ghost border-vibe-accent/20"
                  onClick={() => setHistoryOffset(prev => prev - 1)}
                >
                  <img src={getProjectByDateOffset(historyOffset - 1)!.image} className="absolute inset-0 w-full h-full object-cover blur-md opacity-20 group-hover/ghost:opacity-40 transition-opacity" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#0f0f11] via-transparent to-transparent z-10" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                    <div className="p-6 rounded-full bg-vibe-accent/10 border border-vibe-accent/30 shadow-[0_0_30px_rgba(139,92,246,0.3)] group-hover/ghost:bg-vibe-accent/20 transition-all duration-300">
                      <ChevronRight size={56} className="text-vibe-accent drop-shadow-[0_0_20px_rgba(139,92,246,1)] group-hover/ghost:scale-125 transition-transform" />
                    </div>
                    <p className="text-[12px] uppercase tracking-[0.3em] font-black text-vibe-accent mt-6 drop-shadow-sm">Tomorrow</p>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Modal Overlay */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl"
            onClick={closeUploadModal}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass-card max-w-3xl w-full max-h-[90vh] overflow-y-auto p-8 lg:p-12 border-vibe-accent/30 bg-[#0a0a0b]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold flex items-center gap-2 tracking-tight uppercase">
                   <Upload className="text-vibe-accent" size={24} />
                   Exhibit Your Work
                </h2>
                <button 
                  onClick={closeUploadModal}
                  className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {!user ? (
                <div className="text-center py-8">
                   <div className="w-20 h-20 mx-auto rounded-full bg-vibe-accent/10 flex items-center justify-center mb-6 ring-1 ring-vibe-accent/30 shadow-[0_0_40px_rgba(139,92,246,0.2)]">
                      <ShieldCheck size={40} className="text-vibe-accent" />
                   </div>
                   <h3 className="text-xl font-bold mb-3 uppercase tracking-widest text-white">Vibe Check Required</h3>
                   <p className="text-gray-400 text-sm mb-10 leading-relaxed max-w-[280px] mx-auto">To preserve the gallery's premium standards, we only accept submissions from verified Vibe Coders.</p>
                   <button 
                     onClick={handleLogin}
                     className="w-full justify-center py-6 bg-black border border-white/10 hover:border-vibe-accent/50 text-white rounded-2xl transition-all duration-500 shadow-2xl group flex flex-col gap-1 items-center"
                   >
                     <div className="flex items-center gap-3">
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5 bg-white rounded-full p-0.5" alt="G" />
                        <span className="font-black tracking-[0.2em] text-sm group-hover:text-vibe-accent transition-colors text-white">LOGIN WITH GOOGLE</span>
                     </div>
                     <span className="text-[9px] text-gray-500 uppercase tracking-widest">Connect to Vibe Gallery Network</span>
                   </button>
                </div>
              ) : (
                <form onSubmit={handlePublishVibe} className="flex flex-col gap-6">
                  {/* Image Crop Section - aligned with form fields */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-vibe-accent mb-3">Vibe Screenshot</label>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept="image/*" 
                      className="hidden" 
                    />
                    
                    {/* FIXED FRAME - Explicitly 340px height per user request */}
                    <div className="relative w-full h-[340px] bg-[#0a0a0c] rounded-lg border border-white/10 overflow-hidden flex items-center justify-center p-6">
                      {isProcessingImage ? (
                        /* Processing State */
                        <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                          <Loader2 size={32} className="animate-spin text-vibe-accent" />
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[11px] font-black uppercase tracking-[0.3em] text-vibe-accent animate-pulse">Processing Image</span>
                            <span className="text-[9px] text-gray-600 uppercase tracking-widest">Compressing & optimizing...</span>
                          </div>
                        </div>
                      ) : imagePreview ? (
                        cropPreview ? (
                          /* State 3: Confirmed - show cropped result inside fixed frame */
                          <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                            <div className="w-[180px] aspect-square rounded-lg overflow-hidden border-2 border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
                              <img src={cropPreview} className="w-full h-full object-cover" alt="Cropped preview" />
                            </div>
                            <div className="flex items-center gap-2 text-emerald-400">
                              <Check size={14} />
                              <span className="text-[10px] font-bold uppercase tracking-widest">Framing Confirmed</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setCropPreview(null)}
                              className="text-[9px] uppercase tracking-widest font-bold text-gray-500 hover:text-white transition-colors"
                            >
                              Re-edit Crop
                            </button>
                          </div>
                        ) : (
                          /* State 2: Crop tool inside fixed frame */
                          <ReactCrop
                            crop={crop}
                            onChange={(c) => setCrop(c)}
                            onComplete={(c) => setCompletedCrop(c)}
                            aspect={1}
                            className="inline-block"
                          >
                            <img 
                              ref={imgRef}
                              src={imagePreview} 
                              onLoad={onImageLoad}
                              className="block max-w-full w-auto h-auto object-contain pointer-events-none" 
                              style={{ maxHeight: '292px' }}
                              alt="Crop Me" 
                            />
                          </ReactCrop>
                        )
                      ) : (
                        /* State 1: Empty - file select prompt inside fixed frame */
                        <div 
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-white/[0.03] transition-colors group"
                        >
                          <div className="flex flex-col items-center gap-3 text-gray-500 group-hover:text-vibe-accent transition-colors">
                            <ImageIcon size={32} />
                            <div className="flex flex-col items-center">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Select Screenshot</span>
                              <span className="text-[9px] text-gray-600 mt-1 uppercase tracking-tighter">480px Efficiency WebP</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Action row - only visible when image is loaded and not yet confirmed */}
                    {imagePreview && !cropPreview && (
                      <div className="flex justify-between items-center mt-3">
                         <button 
                           type="button"
                           onClick={() => fileInputRef.current?.click()}
                           className="text-[9px] uppercase tracking-widest font-bold text-gray-500 hover:text-white transition-colors"
                         >
                           Change Image
                         </button>
                         <button 
                           type="button"
                            onClick={async () => {
                             if (!imgRef.current || !completedCrop) {
                               toast.error('Please adjust the crop handles');
                               return;
                             }
                             try {
                               const blob = await generateCroppedBlob();
                               setFinalCroppedBlob(blob);
                               setCropPreview(URL.createObjectURL(blob));
                               toast.success('Framing Confirmed!');
                             } catch (err) {
                               console.error(err);
                               toast.error('Error occurred during framing.');
                             }
                           }}
                           className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 px-6 py-2.5 rounded-full transition-all text-white shadow-lg shadow-emerald-900/30"
                         >
                           <Check size={14} />
                           Confirm Framing
                         </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-vibe-accent mb-2">Vibe Title</label>
                      <input name="title" required type="text" maxLength={50} className="w-full bg-white/5 border border-white/10 rounded-lg p-4 outline-none focus:border-vibe-accent focus:bg-vibe-accent/5 transition-all text-white" placeholder="What is it called? (Max 50)" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-vibe-accent mb-2">The Mood (Brief description)</label>
                      <input name="summary" required type="text" maxLength={200} className="w-full bg-white/5 border border-white/10 rounded-lg p-4 outline-none focus:border-vibe-accent focus:bg-vibe-accent/5 transition-all text-white" placeholder="A one-line vibe description (Max 200)" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-vibe-accent mb-2">URL (Required)</label>
                      <input name="link" required type="url" className="w-full bg-white/5 border border-white/10 rounded-lg p-4 outline-none focus:border-vibe-accent focus:bg-vibe-accent/5 transition-all text-white" placeholder="https://your-work.com" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-vibe-accent mb-2">VibeCoding Tool</label>
                      <input name="tech" required type="text" maxLength={100} className="w-full bg-white/5 border border-white/10 rounded-lg p-4 outline-none focus:border-vibe-accent focus:bg-vibe-accent/5 transition-all text-white" placeholder="ClaudeCode, Cursor..." />
                    </div>
                  </div>
                  <div className="pt-6">
                     <button 
                        type="submit" 
                        disabled={isUploading}
                        className="vibe-button w-full justify-center py-5 bg-vibe-accent text-white font-bold tracking-[0.2em] shadow-[0_0_30px_rgba(139,92,246,0.4)] hover:scale-[1.02] transition-transform disabled:opacity-50"
                     >
                        {isUploading ? (
                          <>
                            <Loader2 className="animate-spin" size={20} />
                            OPTIMIZING & PUBLISHING...
                          </>
                        ) : 'PUBLISH TO GALLERY'}
                     </button>
                     <p className="text-[11px] text-gray-600 text-center mt-6 uppercase tracking-wider font-medium opacity-60">Ready for the community vibe check?</p>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
