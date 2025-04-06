import pino from 'pino';

export interface LoggerOptions {
  serviceName: string;
  level?: string;
  pretty?: boolean;
}

export function createLogger({ serviceName, level = 'info', pretty = true }: LoggerOptions) {
  const options: pino.LoggerOptions = {
    level,
    base: {
      service: serviceName,
    },
  };

  if (pretty) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        translateTime: 'SYS:standard',
        clearScreen: false
      },
    };
  }

  return pino.pino(options);
}
