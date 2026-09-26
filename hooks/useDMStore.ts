import { create } from "zustand";

interface DMStore {
  /** The conversation id currently open on /messages, or null when the user has none selected or
   * has left the page entirely. Set by MessagesClient, read by GlobalDMListener so it knows which
   * conversation MessagesClient's own subscription is already playing sounds for — see
   * GlobalDMListener's own doc comment. */
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
}

export const useDMStore = create<DMStore>((set) => ({
  activeConversationId: null,
  setActiveConversationId: (id) => set({ activeConversationId: id }),
}));
