export interface ChatMessage {
  id?: number;
  // backend returns 'user' | 'bot'
  role: 'user' | 'bot'; 
  // backend returns 'content'
  content: string; 
  created_at?: string;
}

export interface ChatResponse {
  session_id: string;
  reply: string;
  history: ChatMessage[];
}