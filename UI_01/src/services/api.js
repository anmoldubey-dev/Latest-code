import axios from 'axios';

// Backend Port 5000 par hai, aur routes /api se shuru ho rahe hain
const API_BASE_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api` 
  : 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// 1. Request Interceptor: Har request ke saath Token bhejna
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// 2. Response Interceptor: Data extraction aur Auth handling
api.interceptors.response.use(
  (response) => response.data, // Seedha data return karega
  (error) => {
    // Agar Token expire ho gaya ya invalid hai (401)
    if (error.response && error.response.status === 401) {
      sessionStorage.removeItem('token');
      // Uncomment niche wali line agar aap chahte ho ki automatic logout ho jaye
      // window.location.href = '/login'; 
    }
    return Promise.reject(error.response?.data || error.message);
  }
);

export default api;