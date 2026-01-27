import { writeFileSync, appendFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const LOG_FILE = 'bot.log';

/**
 * Get log file path
 */
function getLogFilePath(): string {
  // Log file in project root
  return join(process.cwd(), LOG_FILE);
}

/**
 * Clear log file
 */
export function clearLogFile(): void {
  const logPath = getLogFilePath();
  if (existsSync(logPath)) {
    try {
      unlinkSync(logPath);
    } catch (error) {
      console.error('Failed to clear log file:', error);
    }
  }
}

/**
 * Format log message with timestamp
 */
function formatLogMessage(level: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}\n`;
}

/**
 * Write to log file
 */
function writeToLog(level: string, message: string): void {
  const logPath = getLogFilePath();
  const formattedMessage = formatLogMessage(level, message);
  
  try {
    appendFileSync(logPath, formattedMessage, 'utf8');
  } catch (error) {
    // Fallback to console if file write fails
    console.error('Failed to write to log file:', error);
    console.log(formattedMessage.trim());
  }
}

/**
 * Logger utility
 */
export const logger = {
  log: (message: string, ...args: any[]) => {
    const fullMessage = args.length > 0 ? `${message} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}` : message;
    console.log(message, ...args);
    writeToLog('INFO', fullMessage);
  },
  
  error: (message: string, ...args: any[]) => {
    const fullMessage = args.length > 0 ? `${message} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}` : message;
    console.error(message, ...args);
    writeToLog('ERROR', fullMessage);
  },
  
  warn: (message: string, ...args: any[]) => {
    const fullMessage = args.length > 0 ? `${message} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}` : message;
    console.warn(message, ...args);
    writeToLog('WARN', fullMessage);
  },
  
  info: (message: string, ...args: any[]) => {
    const fullMessage = args.length > 0 ? `${message} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}` : message;
    console.info(message, ...args);
    writeToLog('INFO', fullMessage);
  },
};
