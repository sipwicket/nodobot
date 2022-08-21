import { Telegraf } from 'telegraf'
import { replyHandler, imageHandler } from './src/handlers/index'

const TELEGRAM_TOKEN = '1937797030:AAHvmInHqtFuAgEmZTdLmkN2pxn1U_3Uk5s'
const bot = new Telegraf(TELEGRAM_TOKEN)

bot.on('text', (ctx) => {
  if (ctx?.update?.message?.reply_to_message) {
    return replyHandler(ctx)
  }
})

bot.on('photo', (ctx) => {
  imageHandler(ctx, bot)
})

bot.launch()
console.log('SIPCHAN ONLINE.')

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
