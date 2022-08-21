import { Telegraf } from 'telegraf';
import {
  replyHandler,
  photoMessageHandler,
  entityMessageHandler,
  directMentionHandler,
} from './src/handlers/index';

import config from './config.json';

// Quit on missing env var
if (!process.env?.TELEGRAM_TOKEN) {
  console.error('Failed to get TELEGRAM_TOKEN from env.');
  process.exit(1);
}
// Quit on missing messages json
if (!config) {
  console.error('Failed to get config.json in root folder');
  process.exit(1);
}

// Instantiate bot
const bot = new Telegraf(process.env?.TELEGRAM_TOKEN);

// Set up handlers
bot.on('text', (ctx) => {
  if (ctx?.update?.message?.reply_to_message) {
    const replyUser = ctx?.update?.message?.reply_to_message?.from?.id;
    const botId = bot.botInfo?.id;

    if (replyUser === botId) {
      return replyHandler(ctx);
    }
  }

  entityMessageHandler(ctx);
  directMentionHandler(ctx, bot);
});

bot.on('photo', (ctx) => {
  photoMessageHandler(ctx, bot);
});

bot.launch();
console.log('SIPCHAN ONLINE.');

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
