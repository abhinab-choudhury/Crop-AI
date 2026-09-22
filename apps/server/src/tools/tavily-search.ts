import env from './../utils/env.js';
import { TAVILY_API } from '../utils/axios.js';

export default async function tavilySearch({ query }: { query: string }) {
  console.log('Tavily Search');

  try {
    const response = await TAVILY_API.post(
      '/search',
      {
        api_key: env.TAVILY_API_KEY,
        query,
        search_depth: 'advanced',
      },
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const data = response.data;
    console.log('Data =', data);

    return {
      query: data.query,
      results: data.results
        ?.slice(0, 3)
        ?.map((r: { url: string; title: string; content: string; score: number }) => ({
          url: r.url,
          title: r.title,
          content: r.content,
          score: r.score,
        })),
      response_time: data.response_time,
      request_id: data.request_id,
    };
  } catch (err: unknown) {
    const error = err as { response?: { data?: { detail?: string } }; message?: string };
    console.error('Tavily Error:', error.response?.data || error.message);

    throw new Error(`Tavily request failed: ${error.response?.data?.detail || error.message}`);
  }
}
