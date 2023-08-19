import fetch from 'node-fetch';
import { config } from '../../index.ts';

export const getRandomImage = async () => {
  const endpointNumber = Math.floor(
    Math.random() * config.URL_ENDPOINTS.length
  );
  const response = await fetch(config.URL_ENDPOINTS[endpointNumber]);

  const body = await response.json();

  return body?.url;
};
