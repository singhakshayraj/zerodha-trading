// MOCK-only axios instance. Mirrors lib/api.ts (same token injection) but:
//   - baseURL is /mock/api, so every call hits the staging-backed mock routes
//   - it deliberately OMITS the 401/403 → /connect redirect interceptor, so the
//     mock dashboard works without a Kite login and never bounces to /connect.
import axios from "axios";
import { useAppStore } from "@/lib/store";

const mockApi = axios.create({
  baseURL: "/mock/api",
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

mockApi.interceptors.request.use((config) => {
  const token =
    useAppStore.getState().token ||
    (typeof window !== "undefined" ? localStorage.getItem("enc_token") : null);
  if (token) {
    config.headers["x-enc-token"] = token;
  }
  return config;
});

export default mockApi;
