import { create } from "zustand";

interface UserProfile {
  name: string;
  email: string;
  broker: string;
  user_id?: string;
}

export interface TradeLogEntry {
  id: string;
  time: string;
  symbol: string;
  action: "BUY" | "SELL";
  qty: number;
  price: number;
  value: number;
  pnl: number;
  reason: string;
  orderId?: string;
}

export interface BrainLogEntry {
  time: string;
  message: string;
  type: "info" | "signal" | "order" | "error" | "stop";
}

export interface TradingConfig {
  capital: number;
  maxProfitPct: number;
  maxLossPct: number;
  maxTrades: number;
  mode: "holdings" | "market";
  intervalMinutes: number;
}

export type SessionStatus = "idle" | "running" | "paused" | "stopped";

export interface PnlPoint {
  time: string;
  pnl: number;
}

interface TradingSession {
  status: SessionStatus;
  sessionPnl: number;
  // DEPRECATED: brain writes trades directly to DB. Use liveTradesCount
  // from /api/trades/live (trades.length) instead. Kept to avoid breaking
  // unrelated call sites that still reference it.
  tradesExecuted: number;
  startTime: Date | null;
  tradeLogs: TradeLogEntry[];
  brainLogs: BrainLogEntry[];
  pnlHistory: PnlPoint[];
  config: TradingConfig | null;
  dbSessionId: string | null;
}

interface AppState {
  // auth
  token: string | null;
  isConnected: boolean;
  userProfile: UserProfile | null;
  sessionExpiry: string | null;

  // brain
  brainStatus: "OFFLINE" | "ONLINE" | "RUNNING" | "ERROR";
  brainMessage: string;
  lastBrainPing: number | null;

  // trading session
  session: TradingSession;

  // auth actions
  setToken: (token: string) => void;
  setProfile: (profile: UserProfile) => void;
  clearSession: () => void;
  hydrateFromStorage: () => void;

  // brain actions
  setBrainStatus: (status: AppState["brainStatus"], message?: string) => void;

  // session actions
  startSession: (config: TradingConfig) => void;
  stopSession: (reason?: string) => void;
  setDbSessionId: (id: string) => void;
  addTradeLog: (entry: TradeLogEntry) => void;
  addBrainLog: (msg: string, type?: BrainLogEntry["type"]) => void;
  updateSessionPnl: (delta: number) => void;
  resetSession: () => void;
}

const defaultSession: TradingSession = {
  status: "idle",
  sessionPnl: 0,
  tradesExecuted: 0,
  startTime: null,
  tradeLogs: [],
  brainLogs: [],
  pnlHistory: [],
  config: null,
  dbSessionId: null,
};

export const useAppStore = create<AppState>((set, get) => ({
  token: null,
  isConnected: false,
  userProfile: null,
  sessionExpiry: null,
  brainStatus: "OFFLINE",
  brainMessage: "",
  lastBrainPing: null,
  session: defaultSession,

  setToken: (token) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("enc_token", token);
      sessionStorage.setItem("enc_token", token);
    }
    set({ token, isConnected: true, sessionExpiry: "6:00 AM tomorrow" });
  },

  setProfile: (profile) => set({ userProfile: profile }),

  clearSession: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("enc_token");
      sessionStorage.removeItem("enc_token");
    }
    set({ token: null, isConnected: false, userProfile: null, sessionExpiry: null, session: defaultSession });
  },

  hydrateFromStorage: () => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("enc_token") || sessionStorage.getItem("enc_token");
      if (token) set({ token, isConnected: true, sessionExpiry: "6:00 AM tomorrow" });
    }
  },

  startSession: (config) => {
    const now = new Date();
    set((s) => ({
      session: {
        ...s.session,
        status: "running",
        startTime: now,
        config,
        sessionPnl: 0,
        tradesExecuted: 0,
        tradeLogs: [],
        dbSessionId: null,
        brainLogs: [{ time: now.toLocaleTimeString(), message: `Session started. Capital: ₹${config.capital}, Max loss: ${config.maxLossPct}%, Target: ${config.maxProfitPct}%`, type: "info" }],
        pnlHistory: [{ time: now.toLocaleTimeString(), pnl: 0 }],
      },
    }));
  },

  setBrainStatus: (status, message = "") => {
    set({ brainStatus: status, brainMessage: message, lastBrainPing: Date.now() });
  },

  setDbSessionId: (id) => {
    set((s) => ({ session: { ...s.session, dbSessionId: id } }));
  },

  stopSession: (reason = "Manually stopped") => {
    const now = new Date().toLocaleTimeString();
    set((s) => ({
      session: {
        ...s.session,
        status: "stopped",
        brainLogs: [...s.session.brainLogs, { time: now, message: `[STOPPED] ${reason}`, type: "stop" }],
      },
    }));
  },

  addTradeLog: (entry) => {
    set((s) => {
      const logs = [entry, ...s.session.tradeLogs].slice(0, 200);
      return { session: { ...s.session, tradeLogs: logs, tradesExecuted: s.session.tradesExecuted + 1 } };
    });
  },

  addBrainLog: (msg, type = "info") => {
    const entry: BrainLogEntry = { time: new Date().toLocaleTimeString(), message: msg, type };
    set((s) => {
      const logs = [...s.session.brainLogs, entry].slice(-500);
      return { session: { ...s.session, brainLogs: logs } };
    });
  },

  updateSessionPnl: (delta) => {
    set((s) => {
      const pnl = s.session.sessionPnl + delta;
      const point: PnlPoint = { time: new Date().toLocaleTimeString(), pnl };
      const history = [...s.session.pnlHistory, point].slice(-100);
      return { session: { ...s.session, sessionPnl: pnl, pnlHistory: history } };
    });
    // check guardrails
    const { session } = get();
    const config = session.config;
    if (!config) return;
    const pnl = session.sessionPnl + delta;
    const maxLossAmt = (config.capital * config.maxLossPct) / 100;
    const maxProfitAmt = (config.capital * config.maxProfitPct) / 100;
    if (pnl <= -maxLossAmt) get().stopSession(`Max loss limit hit: ₹${Math.abs(pnl).toFixed(2)}`);
    if (pnl >= maxProfitAmt) get().stopSession(`Profit target reached: ₹${pnl.toFixed(2)}`);
  },

  resetSession: () => set({ session: defaultSession }),
}));
