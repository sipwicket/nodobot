import { Context, NarrowedContext } from 'telegraf/typings'
import {
  MessageSubType,
  MountMap,
  UpdateType,
} from 'telegraf/typings/telegram-types'

export type MatchedContext<
  C extends Context,
  T extends UpdateType | MessageSubType
> = NarrowedContext<C, MountMap[T]>
