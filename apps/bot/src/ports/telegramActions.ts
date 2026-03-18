import type { Bot } from "npm:grammy@1.36.0";
import { InputFile } from "npm:grammy@1.36.0";
import type { BotContext } from "../context.ts";
import type { MediaItem, TelegramActionsPort } from "@core/contracts/mediaPorts.ts";

export function createTelegramActions(bot: Bot<BotContext>): TelegramActionsPort {
  return {
    async deleteMessage(chatId, messageId) {
      await bot.api.deleteMessage(chatId, messageId);
    },
    async replyText(chatId, replyToMessageId, text, opts) {
      await bot.api.sendMessage(chatId, text, {
        reply_to_message_id: replyToMessageId,
        parse_mode: opts?.parseMode,
        disable_web_page_preview: opts?.disableWebPreview,
      });
    },
    async sendText(chatId, text, opts) {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: opts?.parseMode,
        disable_web_page_preview: opts?.disableWebPreview,
      });
    },
    async sendVideo(chatId, videoPath, opts) {
      await bot.api.sendVideo(chatId, new InputFile(videoPath), {
        caption: opts?.caption,
        parse_mode: opts?.parseMode,
      });
    },
    async sendPhoto(chatId, photoBytes, opts) {
      await bot.api.sendPhoto(chatId, new InputFile(photoBytes), {
        caption: opts?.caption,
        parse_mode: opts?.parseMode,
      });
    },
    async sendMediaGroup(chatId, items: MediaItem[]) {
      const media = items.map((it, idx) => {
        const input = new InputFile(it.path);
        if (it.kind === "video") {
          return { type: "video" as const, media: input, caption: idx === 0 ? it.caption : undefined, parse_mode: "HTML" as const };
        }
        return { type: "photo" as const, media: input, caption: idx === 0 ? it.caption : undefined, parse_mode: "HTML" as const };
      });
      await bot.api.sendMediaGroup(chatId, media);
    },
    async editText(chatId, messageId, text, opts) {
      await bot.api.editMessageText(chatId, messageId, text, { parse_mode: opts?.parseMode });
    },
  };
}

