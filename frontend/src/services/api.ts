import axios from "axios";

const api = axios.create({
  baseURL: "",
  timeout: 600000,
  withCredentials: true,
  headers: {
    Accept: "application/json",
  },
});

export default api;