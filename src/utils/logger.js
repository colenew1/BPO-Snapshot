const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase() || 'info'] ?? LOG_LEVELS.info;

function log(level, message, data = null) {
  if (LOG_LEVELS[level] <= currentLevel) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (data) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
}

export const logger = {
  error: (message, data) => log('error', message, data),
  warn: (message, data) => log('warn', message, data),
  info: (message, data) => log('info', message, data),
  debug: (message, data) => log('debug', message, data),
};

