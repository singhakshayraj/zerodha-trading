import { create } from "zustand";

interface UserProfile {
  name: string;
  email: string;
  broker: string;
  user_id?: string;
}

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
      localStorage.setItem("enc_token", token);
      sessionStorage.setItem("enc_token", token);
    }
    set({ token, isConnected: true, sessionExpiry: "6:00 AM tomorrow" });
  },

  setProfile: (profile: UserProfile) => {
    set({ userProfile: profile });
  },

  clearSession: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("enc_token");
      sessionStorage.removeItem("enc_token");
    }
    set({ token: null, isConnected: false, userProfile: null, sessionExpiry: null });
  },

  hydrateFromStorage: () => {
    if (typeof window !== "undefined") {
      const token =
        localStorage.getItem("enc_token") || sessionStorage.getItem("enc_token");
      if (token) {
        set({ token, isConnected: true, sessionExpiry: "6:00 AM tomorrow" });
      }
    }
  },
}));
