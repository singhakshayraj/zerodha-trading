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
