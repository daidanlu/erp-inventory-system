export type ChatRole = "user" | "bot";
export type ChatMessage = {

  id?: number;
  session_id?: string;
  role: ChatRole;
  content: string;
  created_at?: string;
};

export type ChatResponse = {
  session_id: string;
  reply: string;
  history: ChatMessage[];
};
