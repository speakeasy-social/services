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
        colorize: true,
        translateTime: 'SYS:standard',
      },
    };
  }

  return pino.pino(options);
}
