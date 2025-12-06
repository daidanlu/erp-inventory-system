import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';

// 1. axios 
const service: AxiosInstance = axios.create({
  baseURL: 'http://127.0.0.1:8000/api/',
  timeout: 5000,
  headers: { 'Content-Type': 'application/json' }
});

// Request Interceptor
service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: any) => {
    return Promise.reject(error);
  }
);

// Response Interceptor
service.interceptors.response.use(
  (response: AxiosResponse) => {
   
    return response;
  },
  (error: any) => {
   
    if (error.response && error.response.status === 401) {
      console.error('未授权，请重新登录');
    
    }
    return Promise.reject(error);
  }
);

export default service;