import axios from "axios";
import { useAppStore } from "./store";

const api = axios.create({
  baseURL: "/api",
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token =
    useAppStore.getState().token ||
    (typeof window !== "undefined" ? localStorage.getItem("enc_token") : null);
  if (token) {
    config.headers["x-enc-token"] = token;
  }
  return config;
});

// ⚠️ This interceptor CLEARS THE SESSION and hard-redirects on 401/403.
// That is right for a user action, and a landmine for anything passive: a
// component that polls in the background will log the user out on a single 401,
// and if it is mounted globally it will do so on /connect, producing an
// infinite reload that makes pasting a token impossible (happened 2026-08-23
// via TokenAlert). Background/advisory callers must use a plain fetch, not this
// client.
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      useAppStore.getState().clearSession();
      if (typeof window !== "undefined") window.location.href = "/connect";
    }
    return Promise.reject(error);
  }
);

export default api;
