import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Config {
  /** List of endpoints to get random images from */
  URL_ENDPOINTS: string[];

  /** Strings */
  messages: {
    /** Message sent when a duplicate link is detected */
    foundLinkSentBy: string;
    /** Message sent when a duplicate image is detected */
    foundImageSentBy: string;
    /** Suffix for minutes */
    minutesAgo: string;
    /** Response when directly mentioned */
    directReplyNoOp: string;
    /** Responses when directly mentioned */
    noReplying: string[];
    /** Response when sending a random image */
    sendingRandomImage: string;
    /** ID for command to reduce sensitivity */
    reduceSensitivityAction: string;
    /** Button text for reducing sensitivity */
    reduceSensitivityBtn: string;
    /** Message sent when sensitivity is reduced */
    reduceSensitivityMessage: string;
    /** Command to increase sensitivity */
    increaseSensitivityCommand: string;
    /** Message sent when sensitivity is increased */
    increaseSensitivityMessage: string;
    /** Command to set duplicate pixel threshold */
    setThresholdCommand: string;
    /** Command to set image resolution to scale to for duplicate detection */
    setResolutionCommand: string;
    /** Message sent when an invalid resolution is provided */
    invalidResolution: string;
    /** Message sent when a resolution is set */
    resolutionSetMessage: string;
    /** Message sent when a threshold is set */
    thresholdSetMessage: string;
    /** Message sent when an invalid threshold is provided */
    invalidThreshold: string;
    /** Prefix for outputting threshold */
    similarityThreshold: string;
    /** Prefix for outputting common pixels */
    similarPixels: string;
  };
}

function validateConfig(obj: unknown): obj is Config {
  if (typeof obj !== 'object' || obj === null) return false;

  const o = obj as Config;
  if (
    !Array.isArray(o.URL_ENDPOINTS) ||
    !o.URL_ENDPOINTS.every((v) => typeof v === 'string')
  ) {
    console.error('URL_ENDPOINTS is not an array of strings');
    return false;
  }
  if (
    !Array.isArray(o.messages.noReplying) ||
    !o.messages.noReplying.every((v) => typeof v === 'string')
  ) {
    console.error('URL_ENDPOINTS is not an array of strings');
    return false;
  }

  if (typeof o.messages !== 'object' || o.messages === null) {
    console.error('messages is not an object');
    return false;
  }

  if (!c('foundLinkSentBy')) return false;
  if (!c('foundImageSentBy')) return false;
  if (!c('minutesAgo')) return false;
  if (!c('directReplyNoOp')) return false;
  if (!c('sendingRandomImage')) return false;
  if (!c('reduceSensitivityAction')) return false;
  if (!c('reduceSensitivityBtn')) return false;
  if (!c('reduceSensitivityMessage')) return false;
  if (!c('increaseSensitivityCommand')) return false;
  if (!c('increaseSensitivityMessage')) return false;
  if (!c('setThresholdCommand')) return false;
  if (!c('setResolutionCommand')) return false;
  if (!c('invalidResolution')) return false;
  if (!c('resolutionSetMessage')) return false;
  if (!c('thresholdSetMessage')) return false;
  if (!c('invalidThreshold')) return false;
  if (!c('similarityThreshold')) return false;
  if (!c('similarPixels')) return false;

  return true;

  function c(id: keyof Config['messages']): boolean {
    if (typeof o.messages[id] !== 'string') {
      console.error(`messages.${id} is not a string`);
      return false;
    }
    return true;
  }
}

export function loadConfig(dir: string): Config {
  const file = readFileSync(join(dir, 'config.json'), 'utf-8');
  const obj = JSON.parse(file);
  if (!validateConfig(obj)) {
    console.error('Config is invalid');
    process.exit(1);
  }
  return obj;
}
