import { Context, Telegraf } from 'telegraf/typings';
import { Update } from 'telegraf/typings/core/types/typegram';
import { config } from '../../index.ts';
import { MatchedContext } from '../types.ts';
import { getRandomImage } from '../utils/index.ts';

export const directMentionHandler = async (
  ctx: MatchedContext<Context<Update>, 'text'>,
  bot: Telegraf<Context<Update>>
) => {
  if (bot.botInfo?.username) {
    if (ctx.message.text === `@${bot.botInfo?.username}`) {
      const randomImageUrl = await getRandomImage();

      return ctx.reply(
        `${config.messages.sendingRandomImage} ${randomImageUrl}`,
        {
          reply_to_message_id: ctx.message.message_id,
        }
      );
    }
  }
};
