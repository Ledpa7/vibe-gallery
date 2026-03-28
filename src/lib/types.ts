// Vibe Interface (Database Schema)
export interface Vibe {
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

export interface Comment {
  id: string;
  created_at: string;
  vibe_id: string;
  user_id: string;
  user_email: string;
  content: string;
}
