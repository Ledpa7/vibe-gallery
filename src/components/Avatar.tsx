import React from 'react';

interface AvatarProps {
  src?: string | null;
  seed: string; // user id or email
  className?: string;
  onClick?: () => void;
  title?: string;
}

export default function Avatar({ src, seed, className, onClick, title }: AvatarProps) {
  const fallbackUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
  
  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    // Prevent infinite loop if fallback also fails
    if (e.currentTarget.src !== fallbackUrl) {
      e.currentTarget.src = fallbackUrl;
    }
  };

  return (
    <img
      src={src || fallbackUrl}
      onError={handleError}
      className={className}
      onClick={onClick}
      title={title}
      alt="Avatar"
    />
  );
}
