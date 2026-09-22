import type { Tool } from 'ollama';
import cropDiseasePrediction from '../tools/crop-disease-prediction.js';
import cropPrediction from '../tools/crop-prediction.js';
import getCropRotation from '../tools/get-crop-rotation.js';
import tavilySearch from '../tools/tavily-search.js';
import weatherLookup from '../tools/weather-lookup.js';

export const tools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'weatherLookup',
      description: 'Get current weather',
      parameters: {
        type: 'object',
        required: ['city'],
        properties: {
          city: { type: 'string' },
          country: { type: 'string' },
        },
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'tavilySearch',
      description: 'Deep research AI query',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
          depth: { type: 'string' },
        },
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'cropDiseasePrediction',
      description: 'Detect crop disease from image',
      parameters: {
        type: 'object',
        required: ['file_url'],
        properties: {
          file_url: { type: 'string' },
        },
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'getCropRotation',
      description: '12-month crop rotation plan',
      parameters: {
        type: 'object',
        required: ['state', 'city'],
        properties: {
          state: { type: 'string' },
          city: { type: 'string' },
          language: { type: 'string' },
          N: { type: 'number' },
          P: { type: 'number' },
          K: { type: 'number' },
          pH: { type: 'number' },
        },
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'cropPrediction',
      description: 'Predict best crop based on soil and rainfall',
      parameters: {
        type: 'object',
        required: ['nitrogen', 'phosphorus', 'potassium', 'ph', 'rainfall', 'lat', 'lon'],
        properties: {
          nitrogen: { type: 'number' },
          phosphorus: { type: 'number' },
          potassium: { type: 'number' },
          ph: { type: 'number' },
          rainfall: { type: 'number' },
          lat: { type: 'number' },
          lon: { type: 'number' },
        },
      },
    },
  },
];

type ToolFn = (args: any) => Promise<unknown>;

export const toolFunctions: Record<string, ToolFn> = {
  weatherLookup: weatherLookup as ToolFn,
  tavilySearch: tavilySearch as ToolFn,
  cropDiseasePrediction: cropDiseasePrediction as ToolFn,
  getCropRotation: getCropRotation as ToolFn,
  cropPrediction: cropPrediction as ToolFn,
};
