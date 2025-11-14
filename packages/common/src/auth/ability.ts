import { AuthorizationError } from '../errors.js';
import { User, Service, ExtendedRequest } from '../express-extensions.js';

// Define the actions that can be performed
export type Action =
  | '*'
  | 'list'
  | 'create'
  | 'delete'
  | 'count'
  | 'revoke'
  | 'update'
  | 'apply'
  | 'get'
  | 'add_recipient'
  | 'list_private'
  | 'get_private';

// Define the subjects that can be acted upon
export type Subject =
  | 'private_post'
  | 'private_session'
  | 'session_key'
  | 'trusted_user'
  | 'group'
  | 'feature'
  | 'notification'
  | 'reaction'
  | 'invite_code'
  | 'media'
  | 'key';

export type Ability = {
  action: Action;
  subject: Subject;
  conditions?: Record<string, any>;
};

const can = (
  action: Action,
  subject: Subject,
  conditions?: Record<string, any>,
) => ({
  action,
  subject,
  conditions,
});

/**
 * Define what users are allowed to do
 */
const userAbilities = [
  // User-level trust permissions
  can('*', 'trusted_user', { did: 'authorDid' }),

  // Authors can manage their own sessions and posts
  can('create', 'private_session', { did: 'authorDid' }),
  can('revoke', 'private_session', { did: 'authorDid' }),
  can('*', 'private_post', { did: 'authorDid' }),
  // Recipients can read posts shared with them
  can('list', 'private_post', { did: 'recipientDid' }),
  can('list', 'session_key', { did: 'recipientDid' }),
  can('list', 'feature', { did: 'userDid' }),
  can('apply', 'invite_code', { did: 'userDid' }),

  can('*', 'notification', { did: 'userDid' }),
  can('*', 'reaction', { did: 'userDid' }),

  can('create', 'media'),

  // Users can manage their own keys
  can('*', 'key', { did: 'authorDid' }),
  // Anyone can read public keys
  can('get', 'key'),
];

/**
 * What services are allowed to do
 */
const serviceAbilities = [
  can('get', 'key', { name: '=private-sessions' }),
  can('get_private', 'key', { name: '=private-sessions' }),
  can('list_private', 'key', { name: '=private-sessions' }),
  can('list', 'trusted_user', { name: '=private-sessions' }),
  can('update', 'private_session', { name: '=user-keys' }),
  can('delete', 'media', { name: '=private-sessions' }),
];

/**
 * Middleware that sets up the ability based on whether the request is from a user or service.
 * Attaches the appropriate set of authorization abilities to the request
 */
export async function authorizationMiddleware(req: any, res: any, next: any) {
  // Check if this is a user or service authenticated request
  if (req.user?.type === 'user') {
    req.abilities = userAbilities;
  } else if (req.user?.type === 'service') {
    req.abilities = serviceAbilities;
  } else {
    throw new AuthorizationError('Request must be authenticated');
  }

  next();
}

/**
 * Helper function to check if a specific action is allowed on a subject.
 * Throws AuthorizationError if the action is not permitted.
 */
export function authorize(
  req: ExtendedRequest,
  action: Action,
  subject: Subject,
  record?: Record<string, any>,
): void {
  if (!req.abilities) {
    throw new AuthorizationError('Internal authorization error');
  }

  if (!req.user) {
    throw new AuthorizationError('Not authenticated');
  }

  const isAllowed = Array.isArray(record)
    ? record.every((rec) =>
        isAuthorized(req.abilities!, req.user!, action, subject, rec),
      )
    : isAuthorized(req.abilities, req.user, action, subject, record);

  if (!isAllowed) {
    if (process.env.DEBUG_AUTH) console.log({ user: req.user, record: record });
    throw new AuthorizationError(`Not authorized to ${action} on ${subject}`, {
      action,
      subject,
      user: req.user,
    });
  }
}

function isAuthorized(
  abilities: Ability[],
  user: User | Service,
  action: Action,
  subject: Subject,
  record?: Record<string, any>,
): boolean {
  if (!user) {
    return false;
  }

  return abilities.some((ability) => {
    let isAllowed =
      ability.subject === subject &&
      (ability.action === '*' || ability.action === action);

    if (process.env.DEBUG_AUTH)
      console.log(
        `#### ${action} ===  ${ability.action}, ${subject} === ${ability.subject} isAlllowed: ${isAllowed} ####`,
      );

    if (isAllowed && ability.conditions) {
      isAllowed = !!(
        record &&
        Object.entries(ability.conditions).every(([key, value]) => {
          if (process.env.DEBUG_AUTH) console.log({ key, value, record });

          // If the condition is prefixed with =, check if user[key] has that exact value
          // Otherwise, check if user[key] matches record[value]
          let expectedValue = value.startsWith('=')
            ? value.slice(1)
            : record[value];

          const userValue = user[key as keyof (User | Service)];
          const matches = userValue === expectedValue;
          if (process.env.DEBUG_AUTH) console.log(`Comparing: user.${key}="${userValue}" vs expected="${expectedValue}" => ${matches}`);
          return matches;
        })
      );
    }

    return isAllowed;
  });
}
