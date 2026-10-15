import axios from "axios";
import { AUTH_EXPIRED_EVENT, clearAccessToken, getAccessToken } from "@/auth/token";

const baseURL =
  typeof import.meta.env.VITE_API_URL === "string" && import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL
    : "/api";

export const api = axios.create({
  baseURL,
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Only a request that carried a token means "session expired"; a 401 from a failed
    // login attempt (no token yet) must not look like an expiry.
    if (err?.response?.status === 401 && getAccessToken()) {
      clearAccessToken();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    throw err;
  }
);