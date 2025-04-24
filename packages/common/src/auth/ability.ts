import { AuthorizationError } from '../errors.js';
import { User, Service, ExtendedRequest } from '../express-extensions.js';

// Define the actions that can be performed
export type Action =
  | '*'
  | 'list'
  | 'create'
  | 'delete'
  | 'revoke'
  | 'update'
  | 'add_recipient'
  | 'get_public_key'
  | 'get_private_key';

// Define the subjects that can be acted upon
export type Subject =
  | 'private_post'
  | 'private_session'
  | 'session_key'
  | 'trusted_user'
  | 'group'
  | 'feature'
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
  can('*', 'trusted_user', { authorDid: 'did' }),

  // Authors can manage their own sessions and posts
  // FIXME the second param needs to === subject.constructor.name
  can('create', 'private_session', { authorDid: 'did' }),
  can('revoke', 'private_session', { authorDid: 'did' }),
  can('*', 'private_post', { authorDid: 'did' }),
  // Recipients can read posts shared with them
  can('list', 'private_post', { recipientDid: 'did' }),
  can('list', 'session_key', { recipientDid: 'did' }),
  can('list', 'feature', { userDid: 'did' }),

  // Users can manage their own keys
  can('*', 'key', { authorDid: 'did' }),
  // Anyone can read public keys
  can('get_public_key', 'key'),
];

/**
 * What services are allowed to do
 */
const serviceAbilities = [
  can('get_public_key', 'key', { name: '=private-sessions}' }),
  can('list', 'trusted_user', { name: '=private-sessions' }),
  can('update', 'private_session', { name: '=user-keys' }),
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

  const isAllowed = Array.isArray(subject)
    ? subject.every((s) =>
        isAuthorized(req.abilities!, req.user!, action, s, record),
      )
    : isAuthorized(req.abilities, req.user, action, subject, record);

  if (!isAllowed) {
    if (process.env.DEBUG_AUTH) console.log({ user: req.user, record: record });
    throw new AuthorizationError(`Not authorized to ${action} ${subject}`);
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

          return user[key as keyof (User | Service)] === expectedValue;
        })
      );
    }

    return isAllowed;
  });
}
