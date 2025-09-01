import { Context } from 'telegraf/typings';
import { Update } from 'telegraf/typings/core/types/typegram';
import { MatchedContext } from '../types';

import { config } from '../../index.ts';

export const replyHandler = (ctx: MatchedContext<Context<Update>, 'text'>) => {
  if (config.messages.noReplying) {
    const messageIndex = Math.floor(
      Math.random() * config.messages.noReplying.length
    );

    if (config.messages.noReplying[messageIndex]) {
      return ctx.reply(`${config.messages.noReplying[messageIndex]}`, {
        reply_to_message_id: ctx.message.message_id,
      });
    }
  }

  return ctx.reply(
    `${config.messages.directReplyNoOp} ${ctx.message.from.first_name}.`,
    { reply_to_message_id: ctx.message.message_id }
  );
};
