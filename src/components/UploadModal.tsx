import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Upload, ShieldCheck,
  Image as ImageIcon, Loader2, Check
} from 'lucide-react';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import imageCompression from 'browser-image-compression';
import { toast } from 'react-hot-toast';

import { supabase } from '../lib/supabase';
import { cn } from '../lib/cn';
import { generateCroppedBlob, createProportionalPaddedCanvas } from '../lib/imageUtils';
import type { User } from '@supabase/supabase-js';

// Storage Settings: Support multiple buckets for 50MB-per-bucket free tier bypass
const BUCKET_CANDIDATES = ['vibe-images', 'vibe-images2'];

interface UploadModalProps {
  show: boolean;
  onClose: () => void;
  user: User | null;
  isAdmin: boolean;
  editVibeId: string | null;
  handleLogin: () => void;
  onPublishSuccess: () => void;
}

export default function UploadModal({
  show,
  onClose,
  user,
  isAdmin,
  editVibeId,
  handleLogin,
  onPublishSuccess,
}: UploadModalProps) {
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

  const closeAndReset = () => {
    setImageFile(null);
    setImagePreview(null);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setCropPreview(null);
    setFinalCroppedBlob(null);
    setIsProcessingImage(false);
    onClose();
  };

  const handlePublishVibe = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Must capture FormData before any 'await' calls! 
    const formData = new FormData(e.currentTarget);

    // 1. Get fresh user session to avoid stale IDs which trigger RLS failures
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      toast.error("Please login again!");
      return;
    }
    // For new uploads, image is required. For edits, it's optional.
    if (!editVibeId && !imageFile) {
      toast.error("Please select a vibe screenshot!");
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
      let finalPublicUrl = '';
      let usedBucket = '';
      let filePath = '';

      // Only process image if user selected a new one
      if (imageFile) {
        // 2. Use the already confirmed blob or generate one now
        let finalBlob = finalCroppedBlob;
        if (!finalBlob) {
          if (!imgRef.current || !completedCrop) {
            toast.error("Please frame your shot correctly!");
            setIsUploading(false);
            return;
          }
          finalBlob = await generateCroppedBlob(imgRef.current, completedCrop || crop!);
        }
        const finalFile = new File([finalBlob], 'vibe.webp', { type: 'image/webp' });

        // 3. Final Compression (Extreme Efficiency at 480px)
        const options = { maxSizeMB: 0.03, maxWidthOrHeight: 480, useWebWorker: true };
        const microFile = await imageCompression(finalFile, options);

        // 4. Try upload with Multi-Bucket Failover
        const fileName = `${Date.now()}.webp`;
        filePath = `${currentUser.id}/${fileName}`;
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
                break;
            } else {
                console.warn(`Bucket [${bucketName}] failed:`, uploadError.message);
            }
        }

        if (!uploadSuccess) throw new Error("All storage buckets are full. Please contact the administrator.");
      }

      const techArray = techInput ? techInput.split(',').map(t => t.trim()).filter(Boolean) : ['N/A'];

      if (editVibeId) {
        // === UPDATE MODE ===
        const updateData: Record<string, any> = {
          title, summary, link, tech: techArray,
          updated_at: new Date().toISOString()
        };
        if (finalPublicUrl) updateData.image = finalPublicUrl;

        // Security: non-admin can only edit their own
        let updateQuery = supabase
          .from('vibes')
          .update(updateData)
          .eq('id', editVibeId);
        
        if (!isAdmin) {
          updateQuery = updateQuery.eq('user_id', currentUser.id);
        }

        const { error: dbError } = await updateQuery;
        if (dbError) throw dbError;
        closeAndReset();
        onPublishSuccess();
        toast.success('Your Vibe has been updated! ✨');
      } else {
        // === INSERT MODE ===
        const { error: dbError } = await supabase
          .from('vibes')
          .insert({ 
            title, summary,
            image: finalPublicUrl,
            link,
            tech: techArray,
            user_id: currentUser.id,
            user_email: currentUser.email ?? 'Anonymous', 
            likes: 0,
            dislikes: 0
          });

        if (dbError) {
          if (usedBucket && filePath) await supabase.storage.from(usedBucket).remove([filePath]);
          throw dbError;
        }
        closeAndReset();
        onPublishSuccess();
        toast.success('Your Vibe has been framed and uploaded! 🚀');
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to publish vibe.");
      console.error("Publish error:", error);
    } finally {
      setIsUploading(false);
    }
  };

  // Allow parent to pre-fill the form for editing
  // This is called externally via a ref or via the parent's effect using a timeout
  // We expose no ref here; the parent handles pre-filling via DOM queries after mount

  return (
    <AnimatePresence>
      {show && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl"
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
                 {editVibeId ? 'Update Your Vibe' : 'Exhibit Your Work'}
              </h2>
              <button 
                onClick={closeAndReset}
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
                      <span className="font-black tracking-[0.2em] text-sm group-hover:text-vibe-accent transition-colors text-white">LOGIN</span>
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
                             const blob = await generateCroppedBlob(imgRef.current, completedCrop);
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
                          {editVibeId ? 'SAVING CHANGES...' : 'OPTIMIZING & PUBLISHING...'}
                        </>
                      ) : editVibeId ? 'SAVE CHANGES' : 'PUBLISH TO GALLERY'}
                   </button>
                   <p className="text-[11px] text-gray-600 text-center mt-6 uppercase tracking-wider font-medium opacity-60">Ready for the community vibe check?</p>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
