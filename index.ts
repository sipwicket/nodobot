import { Telegraf } from 'telegraf';
import {
  directMentionHandler,
  entityMessageHandler,
  photoMessageHandler,
  replyHandler,
} from './src/handlers/index';

import config from './config.json';
import { getComparisonSetting, setComparisonSetting } from './src/utils';

const THRESHOLD_CHANGE = 0.05;

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

// commands
bot.command(config.messages.increaseSensitivityCommand, (ctx) => {
  const THRESHOLD_CHANGE = 0.05;
  const currentThreshold = getComparisonSetting('threshold');
  let newThreshold = currentThreshold - THRESHOLD_CHANGE;
  if (newThreshold < 0.05) {
    newThreshold = 0.05;
  }

  setComparisonSetting('threshold', newThreshold);

  return ctx.reply(config.messages.increaseSensitivityMessage);
});

// actions
bot.action(config.messages.reduceSensitivityAction, (ctx, next) => {
  const currentThreshold = getComparisonSetting('threshold');
  let newThreshold = currentThreshold + THRESHOLD_CHANGE;
  if (newThreshold > 0.95) {
    newThreshold = 0.95;
  }

  setComparisonSetting('threshold', newThreshold);

  return ctx
    .reply(
      `${config.messages.reduceSensitivityMessage}
🔍 ${currentThreshold} ➡ ${newThreshold}`
    )
    .then(() => next());
});

// Set up handlers
bot.on('text', (ctx, next) => {
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
