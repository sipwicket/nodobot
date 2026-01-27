/**
 * Logger utility
 */
export const logger = {
  log: (message: string, ...args: any[]) => {
    console.log(message, ...args);
  },

  error: (message: string, ...args: any[]) => {
    console.error(message, ...args);
  },

  warn: (message: string, ...args: any[]) => {
    console.warn(message, ...args);
  },

  info: (message: string, ...args: any[]) => {
    console.info(message, ...args);
  },
};
