import { Telegraf } from 'telegraf';
import {
  directMentionHandler,
  entityMessageHandler,
  photoMessageHandler,
  replyHandler,
} from './src/handlers/index';
import {
  Config,
  clearImageCache,
  getComparisonSetting,
  getImageDimensions,
  loadConfig,
  setComparisonSetting,
  setResizeDimensions,
} from './src/utils';

const THRESHOLD_CHANGE = 0.05;

export const config: Config = loadConfig(__dirname);

// Quit on missing env var
if (!process.env?.TELEGRAM_TOKEN) {
  console.error('Failed to get TELEGRAM_TOKEN from env.');
  process.exit(1);
}

// Instantiate bot
const bot = new Telegraf(process.env?.TELEGRAM_TOKEN);

// commands
bot.command('help', (ctx) => {
  const strings = [
    config.messages.setThresholdCommand,
    config.messages.setResolutionCommand,
    config.messages.increaseSensitivityCommand,
  ].map((str) => `/${str}`);
  return ctx.reply(strings.join('; '));
});

bot.command(config.messages.increaseSensitivityCommand, (ctx) => {
  const currentThreshold = getComparisonSetting('threshold');

  let newThreshold = currentThreshold + THRESHOLD_CHANGE;
  if (newThreshold < 0.05) {
    newThreshold = 0.05;
  }
  newThreshold = Number(newThreshold.toFixed(2));

  setComparisonSetting('threshold', newThreshold);

  return ctx.reply(`${config.messages.increaseSensitivityMessage}
${currentThreshold} ➡ ${newThreshold}`);
});
bot.command(config.messages.setResolutionCommand, (ctx) => {
  const [, resolution] = ctx.update.message.text.split(' ');

  if (!resolution || isNaN(Number(resolution))) {
    return ctx.reply(`${config.messages.invalidResolution}`);
  }

  const success = setResizeDimensions(Number(resolution));

  if (success) {
    clearImageCache();
  } else {
    return ctx.reply(`${config.messages.invalidResolution}`);
  }

  const totalPixels = Number(resolution) * Number(resolution);
  const minimumNumSimilarPixels = Math.ceil(totalPixels / 10);
  setComparisonSetting('similarNumPixels', Number(minimumNumSimilarPixels));

  console.log(bot);

  return ctx.reply(
    `${config.messages.resolutionSetMessage} ${resolution}px. ${config.messages.thresholdSetMessage} ${minimumNumSimilarPixels}/${totalPixels}`
  );
});
bot.command(config.messages.setThresholdCommand, (ctx) => {
  const [, threshold] = ctx.update.message.text.split(' ');

  if (!threshold || isNaN(Number(threshold))) {
    return ctx.reply(`${config.messages.invalidThreshold}`);
  }

  const success = setComparisonSetting('similarNumPixels', Number(threshold));

  if (!success) {
    return ctx.reply(`${config.messages.invalidThreshold}`);
  }

  const { x: sizeX, y: sizeY } = getImageDimensions();
  console.log({ x: sizeX, y: sizeY });
  const totalPixels = sizeX * sizeY;

  return ctx.reply(
    `${config.messages.thresholdSetMessage} ${threshold}/${totalPixels}.`
  );
});

// actions
bot.action(config.messages.reduceSensitivityAction, (ctx, next) => {
  const currentThreshold = getComparisonSetting('threshold');

  let newThreshold = currentThreshold - THRESHOLD_CHANGE;
  if (newThreshold > 0.95) {
    newThreshold = 0.95;
  }
  newThreshold = Number(newThreshold.toFixed(2));

  setComparisonSetting('threshold', newThreshold);

  return ctx
    .reply(
      `${config.messages.reduceSensitivityMessage}
${currentThreshold} ➡ ${newThreshold}`
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
  return;

  photoMessageHandler(ctx, bot);
});

// launch bot
bot.launch();
console.log('SIPCHAN ONLINE.');

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
