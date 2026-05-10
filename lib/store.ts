import { create } from "zustand";
import { UserProfile } from "./types";

interface AppState {
  token: string | null;
  isConnected: boolean;
  userProfile: UserProfile | null;
  sessionExpiry: string | null;

  setToken: (token: string) => void;
  setProfile: (profile: UserProfile) => void;
  clearSession: () => void;
  hydrateFromStorage: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  token: null,
  isConnected: false,
  userProfile: null,
  sessionExpiry: null,

  setToken: (token: string) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("enc_token", token);
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(6, 0, 0, 0);
    set({
      token,
      isConnected: true,
      sessionExpiry: "6:00 AM tomorrow",
    });
  },

  setProfile: (profile: UserProfile) => {
    set({ userProfile: profile });
  },

  clearSession: () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("enc_token");
    }
    set({
      token: null,
      isConnected: false,
      userProfile: null,
      sessionExpiry: null,
    });
  },

  hydrateFromStorage: () => {
    if (typeof window !== "undefined") {
      const token = sessionStorage.getItem("enc_token");
      if (token) {
        set({
          token,
          isConnected: true,
          sessionExpiry: "6:00 AM tomorrow",
        });
      }
    }
  },
}));
