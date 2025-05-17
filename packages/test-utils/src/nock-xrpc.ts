import nock from 'nock';

export type Reply {
    status: number,
    body: object,
}

export function nockXrpc(
  host: string,
  method: string,
  path: string,
  queryOrBody?: any,
  reply?: Reply,
): nock.Scope {
  return nock(`${host}/xrpc/`)
    [method](path)
    .reply(() => {
      if (queryOrBody) {
        if (method === 'get') {
          // Turn query to object
          const queryObj = uri;
          expect(queryObj).toEqual(queryOrBody);
        } else {
          expect(req.body).toEqual(queryOrBody);
        }
      }
      return reply ? [reply.status, reply.body] : [200, { success: true }];
    });
}
