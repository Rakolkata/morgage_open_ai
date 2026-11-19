
import axios from "axios";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 600000,
  withCredentials: true,
  headers: {
    Accept: "application/json",
  },
});

export default api;
