import 'dotenv/config';
import { Telegraf } from 'telegraf';
import {
  entityMessageHandler,
  photoMessageHandler,
} from './src/handlers/index.ts';
import { Config, loadConfig } from './src/utils/index.ts';
import { logger } from './src/utils/logger.ts';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const THRESHOLD_CHANGE = 0.05;


export const config: Config = loadConfig(__dirname);

// Quit on missing env var
if (!process.env?.TELEGRAM_TOKEN) {
  logger.error('Failed to get TELEGRAM_TOKEN from env.');
  process.exit(1);
}

// Instantiate bot
export const bot = new Telegraf(process.env?.TELEGRAM_TOKEN);

// commands
bot.command('help', (ctx) => {
  const strings = [
    config.messages.setThresholdCommand,
    config.messages.setResolutionCommand,
    config.messages.increaseSensitivityCommand,
  ].map((str) => `/${str}`);
  return ctx.reply(strings.join('; '));
});

// Set up handlers
bot.on('text', (ctx, next) => {
  try {
    entityMessageHandler(ctx);
  } catch (error) {
    logger.error('Error in bot.on(text):', error);
  }

  next();
});

bot.on('photo', (ctx) => {
  photoMessageHandler(ctx, bot);
});

bot.catch((err, ctx) => {
  ctx?.reply?.('sipchan died lol');
  logger.error('Bot error:', err);
});

// launch bot
bot.launch();
logger.log('SIPCHAN ONLINE.');

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
