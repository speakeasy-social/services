import { speakeasyApiRequest } from '@speakeasy-services/common';
import type { DeleteMediaJob } from './types.js';

export function createDeleteMediaHandler() {
  return async (job: { data: DeleteMediaJob }) => {
    const { key } = job.data;

    await speakeasyApiRequest(
      {
        method: 'POST',
        path: 'social.spkeasy.media.delete',
        fromService: 'private-sessions',
        toService: 'media',
      },
      { key },
    );
  };
}
