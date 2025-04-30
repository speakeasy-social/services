import { createLogger } from '@speakeasy-services/common';
import { Request, Response } from 'express';

export function healthCheckAPI(
  healthCheck: () => Promise<void>,
  logger: ReturnType<typeof createLogger>,
) {
  return async (req: Request, res: Response) => {
    try {
      await healthCheck();
    } catch (error) {
      logger.error(error, 'Health check failed');
      res.status(500).json({ status: 'unhealthy' });
      return;
    }
    res.status(200).json({ status: 'ok' });
  };
}
