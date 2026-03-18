import type { TenantId } from "../types.ts";

export type MediaKind = "image" | "video";

export type MediaItem = {
  kind: MediaKind;
  // Local path on disk that adapters can stream from.
  path: string;
  // Optional caption for first item (Telegram limitation applies).
  caption?: string;
};

export type ProgressReporter = (text: string) => Promise<void>;

export interface TempFilePort {
  createTempDir(prefix: string): Promise<string>;
  removePath(path: string): Promise<void>;
}

export interface HttpDownloadPort {
  downloadToFile(url: string, outPath: string): Promise<void>;
  downloadToBytes(url: string): Promise<Uint8Array>;
}

export interface TranscoderPort {
  webmToMp4(
    inputPath: string,
    outputPath: string,
    opts: {
      mode: "standard" | "ultraFast";
      crf: number;
      audioBitrateKbps: number;
      ffmpegPreset: "ultrafast";
    },
  ): Promise<void>;
}

export interface TelegramActionsPort {
  deleteMessage(chatId: string, messageId: number): Promise<void>;
  replyText(chatId: string, replyToMessageId: number | undefined, text: string, opts?: {
    parseMode?: "HTML" | "MarkdownV2";
    disableWebPreview?: boolean;
  }): Promise<void>;
  sendText(chatId: string, text: string, opts?: { parseMode?: "HTML" | "MarkdownV2"; disableWebPreview?: boolean }): Promise<void>;
  sendVideo(chatId: string, videoPath: string, opts?: { caption?: string; parseMode?: "HTML" | "MarkdownV2" }): Promise<void>;
  sendPhoto(chatId: string, photoBytes: Uint8Array, opts?: { caption?: string; parseMode?: "HTML" | "MarkdownV2" }): Promise<void>;
  sendMediaGroup(chatId: string, items: MediaItem[]): Promise<void>;
  editText(chatId: string, messageId: number, text: string, opts?: { parseMode?: "HTML" | "MarkdownV2" }): Promise<void>;
}

export type TenantScoped = { tenantId: TenantId };

