import axios from 'axios';
import env from './env.js';

export const ML_SERVER_API = axios.create({
  baseURL: env.ML_SERVER,
});

export const WEATHER_API = axios.create({
  baseURL: 'https://api.weatherapi.com',
});

export const TAVILY_API = axios.create({
  baseURL: 'https://api.tavily.com',
});

export const GEOLOCATION_API = axios.create({
  baseURL: 'https://geocoding-api.open-meteo.com',
});

export const HISTORIAL_CLIMATE_DATA_API = axios.create({
  baseURL: 'https://archive-api.open-meteo.com',
});

export const ISRIC_ORG_API = axios.create({
  baseURL: 'https://rest.isric.org',
});
