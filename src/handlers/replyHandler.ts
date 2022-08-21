import { Context, NarrowedContext } from 'telegraf/typings'
import { Update } from 'telegraf/typings/core/types/typegram'
import {
  MessageSubType,
  MountMap,
  UpdateType,
} from 'telegraf/typings/telegram-types'

type MatchedContext<
  C extends Context,
  T extends UpdateType | MessageSubType
> = NarrowedContext<C, MountMap[T]>

export const replyHandler = (ctx: MatchedContext<Context<Update>, 'text'>) => {
  return ctx.reply(
    `Please refrain from @ing me in the future, ${ctx.message.from.first_name}.`,
    { reply_to_message_id: ctx.message.message_id }
  )
}
