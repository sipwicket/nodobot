import { Context } from 'telegraf/typings';
import { Update } from 'telegraf/typings/core/types/typegram';
import { MatchedContext } from '../types';

import config from '../../config.json' assert { type: 'json' };

export const replyHandler = (ctx: MatchedContext<Context<Update>, 'text'>) => {
  return ctx.reply(
    `${config.messages.directReplyNoOp} ${ctx.message.from.first_name}.`,
    { reply_to_message_id: ctx.message.message_id }
  );
};
