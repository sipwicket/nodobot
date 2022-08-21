import { Context, NarrowedContext, Telegraf } from 'telegraf/typings'
import { Update } from 'telegraf/typings/core/types/typegram'
import {
  MessageSubType,
  MountMap,
  UpdateType,
} from 'telegraf/typings/telegram-types'
import { downloadToBuffer, resizeImage } from '../utils/index'

type MatchedContext<
  C extends Context,
  T extends UpdateType | MessageSubType
> = NarrowedContext<C, MountMap[T]>

export const imageHandler = async (
  ctx: MatchedContext<Context<Update>, 'photo'>,
  bot: Telegraf<Context<Update>>
) => {
  const photoId = ctx?.message?.photo[0]?.file_id
  if (!photoId) {
    return
  }

  const fileUrl = await bot.telegram.getFileLink(photoId)
  if (!fileUrl?.href) {
    return
  }

  const imageBuffer = await downloadToBuffer(fileUrl.href)
  const resized = await resizeImage(imageBuffer)

  console.log(imageBuffer)
  console.log(resized)
}
