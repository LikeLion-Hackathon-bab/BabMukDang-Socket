export interface ChatMessage {
  messageId: string;
  roomId: string;
  user: Participant;
  text?: string;
  createdAt: string;
}

interface Participant {
  userId: string;
  username?: string;
}
