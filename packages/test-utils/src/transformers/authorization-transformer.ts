import { ApiTest } from '../api-test-generator.js';

export function authorizationTransformer(route: ApiTest) {
  return [
    // Original test as is
    test,
    // Test without token
    {
      ...route,
      note: `${route.note} - without token`,
      bearer: undefined,
      expectedStatus: 401,
      expectedBody: { error: 'Unauthorized' },
    },
    // Test with wrong user token
    {
      ...route,
      note: `${route.note} - with wrong user token`,
      bearer: 'wrong-user-token',
      expectedStatus: 403,
      expectedBody: { error: 'Forbidden' },
    },
  ];
}
