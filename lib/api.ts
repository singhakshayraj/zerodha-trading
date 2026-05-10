import axios from "axios";
import { useAppStore } from "./store";

const api = axios.create({
  baseURL: "/api",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = useAppStore.getState().token;
  if (token) {
    if (config.method === "get") {
      config.params = { ...config.params, token };
    } else {
      config.data = { ...config.data, token };
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      useAppStore.getState().clearSession();
      if (typeof window !== "undefined") {
        window.location.href = "/connect";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
