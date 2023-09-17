import { Telegraf } from 'telegraf';
import {
  directMentionHandler,
  entityMessageHandler,
  photoMessageHandler,
  replyHandler,
} from './src/handlers/index.ts';
import {
  Config,
  loadConfig,
} from './src/utils/index.ts';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const THRESHOLD_CHANGE = 0.05;

export const config: Config = loadConfig(__dirname);

// Quit on missing env var
if (!process.env?.TELEGRAM_TOKEN) {
  console.error('Failed to get TELEGRAM_TOKEN from env.');
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
  console.log(ctx);

  if (ctx?.update?.message?.reply_to_message) {
    const replyUser = ctx?.update?.message?.reply_to_message?.from?.id;
    const botId = bot.botInfo?.id;

    if (replyUser === botId) {
      return replyHandler(ctx);
    }
  }

  entityMessageHandler(ctx);
  directMentionHandler(ctx, bot);

  next();
});

bot.on('photo', (ctx) => {
  photoMessageHandler(ctx, bot);
});

// launch bot
bot.launch();
console.log('SIPCHAN ONLINE.');

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
