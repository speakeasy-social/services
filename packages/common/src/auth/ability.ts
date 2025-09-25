import { Response, NextFunction } from 'express';
import { AuthorizationError } from '../errors.js';
import { User, Service, ExtendedRequest } from '../express-extensions.js';

/**
 * Resolve a potentially nested property path on an object.
 * Supports dot notation for traversing nested objects.
 * When encountering arrays, extracts values from all array elements.
 *
 * @example
 * getNestedValue({ session: { authorDid: 'did:example' } }, 'session.authorDid')
 * // Returns: 'did:example'
 *
 * @example
 * getNestedValue({ authorDid: 'did:example' }, 'authorDid')
 * // Returns: 'did:example'
 *
 * @example
 * getNestedValue({ recipients: [{ did: 'did:1' }, { did: 'did:2' }] }, 'recipients.did')
 * // Returns: ['did:1', 'did:2']
 */
const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
  const parts = path.split('.');
  let current: unknown = obj;

  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];

    // If current is an array, map over each element and continue traversal
    if (Array.isArray(current)) {
      const remainingPath = parts.slice(i).join('.');
      return current.flatMap((item) => {
        if (remainingPath) {
          const result = getNestedValue(item as Record<string, unknown>, remainingPath);
          return Array.isArray(result) ? result : [result];
        }
        return item;
      }).filter((item) => item !== undefined && item !== null);
    }

    // Normal traversal
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }

    const currentObj = current as Record<string, unknown>;
    if (!(key in currentObj)) {
      return undefined;
    }

    current = currentObj[key];
  }

  return current;
};

/**
 * Check if a nested property path exists on an object.
 * Returns true if all segments of the path exist and are not undefined.
 * When encountering arrays, checks that all elements have the remaining path segments.
 */
const hasNestedProperty = (obj: Record<string, unknown>, path: string): boolean => {
  const parts = path.split('.');
  let current: unknown = obj;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // If current is an array, check that all elements have the remaining path
    if (Array.isArray(current)) {
      if (current.length === 0) {
        return false; // Empty arrays don't have any properties
      }
      const remainingPath = parts.slice(i).join('.');
      return current.every((item) => hasNestedProperty(item as Record<string, unknown>, remainingPath));
    }

    // Normal traversal
    if (current === null || current === undefined || typeof current !== 'object' || !(part in current)) {
      return false;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return true;
};

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
  | 'testimonial'
  | 'invite_code'
  | 'media'
  | 'key';

export type Ability = {
  action: Action;
  subject: Subject;
  conditions?: Record<string, string>;
};

/**
 * INTERNAL: Create an ability rule (legacy API)
 *
 * WARNING: The condition syntax can be confusing!
 * - The KEY is a property name on the USER/SERVICE object
 * - The VALUE is a property name on the RECORD object (or literal with '=' prefix)
 *
 * Example: can('delete', 'private_post', { did: 'authorDid' })
 * Means: user.did must equal record.authorDid
 *
 * Consider using canIf() for clearer, self-documenting code.
 */
const can = (
  action: Action,
  subject: Subject,
  conditions?: Record<string, string>,
) => ({
  action,
  subject,
  conditions,
});

/**
 * Create an ability rule with explicit, self-documenting parameter names.
 * This helper makes it impossible to confuse which property belongs where.
 *
 * @example
 * // Check that user's 'did' property matches the record's 'authorDid' property
 * canIf('delete', 'private_post', {
 *   userProperty: 'did',
 *   matchesRecordProperty: 'authorDid'
 * })
 *
 * @example
 * // Check that user's 'name' property equals a literal value
 * canIf('get', 'key', {
 *   userProperty: 'name',
 *   equalsLiteral: 'private-sessions'
 * })
 */
const canIf = (
  action: Action,
  subject: Subject,
  mapping: {
    userProperty: string;
    matchesRecordProperty?: string;
    equalsLiteral?: string;
  },
) => {
  if (mapping.matchesRecordProperty && mapping.equalsLiteral) {
    throw new Error('canIf: Cannot specify both matchesRecordProperty and equalsLiteral');
  }
  if (!mapping.matchesRecordProperty && !mapping.equalsLiteral) {
    throw new Error('canIf: Must specify either matchesRecordProperty or equalsLiteral');
  }

  const value = mapping.equalsLiteral
    ? `=${mapping.equalsLiteral}`
    : mapping.matchesRecordProperty!;

  return can(action, subject, { [mapping.userProperty]: value });
};

/**
 * Define what users are allowed to do
 *
 * IMPORTANT SYNTAX REMINDER:
 * Conditions use the format: { userProperty: 'recordProperty' }
 *                              ^^^^^^^^^^^^   ^^^^^^^^^^^^^^
 *                              Property on    Property on
 *                              User object    Record object
 *
 * Example: { did: 'authorDid' } means "user.did must equal record.authorDid"
 *
 * COMMON MISTAKE: Writing { authorDid: 'did' } - this is BACKWARDS!
 * Users don't have an 'authorDid' property, they have a 'did' property.
 *
 * TIP: Use canIf() instead of can() for self-documenting, mistake-proof syntax:
 *   canIf('*', 'private_post', { userProperty: 'did', matchesRecordProperty: 'authorDid' })
 */
const userAbilities = [
  // User-level trust permissions
  // user.did must match record.authorDid (user owns the trust relationship)
  canIf('*', 'trusted_user', {
    userProperty: 'did',
    matchesRecordProperty: 'authorDid',
  }),

  // Authors can manage their own sessions and posts
  // user.did must match record.authorDid (user created the session/post)
  canIf('create', 'private_session', {
    userProperty: 'did',
    matchesRecordProperty: 'authorDid',
  }),
  canIf('revoke', 'private_session', {
    userProperty: 'did',
    matchesRecordProperty: 'authorDid',
  }),
  canIf('add_recipient', 'private_session', {
    userProperty: 'did',
    matchesRecordProperty: 'authorDid',
  }),
  // For getting a session via sessionKey (which has nested session.authorDid)
  canIf('get', 'private_session', {
    userProperty: 'did',
    matchesRecordProperty: 'session.authorDid',
  }),
  canIf('*', 'private_post', {
    userProperty: 'did',
    matchesRecordProperty: 'authorDid',
  }),

  // Recipients can read posts shared with them
  // user.did must match one of record.session.sessionKeys.recipientDid (user is a recipient)
  canIf('list', 'private_post', {
    userProperty: 'did',
    matchesRecordProperty: 'session.sessionKeys.recipientDid',
  }),
  canIf('list', 'session_key', {
    userProperty: 'did',
    matchesRecordProperty: 'recipientDid',
  }),

  // User-specific features and operations
  // user.did must match record.userDid (various user-owned resources)
  canIf('list', 'feature', {
    userProperty: 'did',
    matchesRecordProperty: 'userDid',
  }),
  canIf('apply', 'invite_code', {
    userProperty: 'did',
    matchesRecordProperty: 'userDid',
  }),
  canIf('*', 'notification', {
    userProperty: 'did',
    matchesRecordProperty: 'userDid',
  }),
  canIf('*', 'reaction', {
    userProperty: 'did',
    matchesRecordProperty: 'userDid',
  }),

  // Media creation doesn't require ownership checks (usage tracked elsewhere)
  can('create', 'media'),
  can('create', 'testimonial'),

  // Users can manage their own keys
  // user.did must match record.authorDid (user owns the key)
  canIf('*', 'key', {
    userProperty: 'did',
    matchesRecordProperty: 'authorDid',
  }),
  // Anyone can read public keys (no conditions = no ownership check)
  can('get', 'key'),
];

/**
 * What services are allowed to do
 *
 * NOTE: Service conditions use literal values with the 'equalsLiteral' parameter
 * Example: canIf('get', 'key', { userProperty: 'name', equalsLiteral: 'private-sessions' })
 */
const serviceAbilities = [
  // private-sessions service can access keys and trust relationships
  // service.name must equal 'private-sessions'
  canIf('get', 'key', {
    userProperty: 'name',
    equalsLiteral: 'private-sessions',
  }),
  canIf('get_private', 'key', {
    userProperty: 'name',
    equalsLiteral: 'private-sessions',
  }),
  canIf('list_private', 'key', {
    userProperty: 'name',
    equalsLiteral: 'private-sessions',
  }),
  canIf('list', 'trusted_user', {
    userProperty: 'name',
    equalsLiteral: 'private-sessions',
  }),

  // user-keys service can update sessions
  // service.name must equal 'user-keys'
  canIf('update', 'private_session', {
    userProperty: 'name',
    equalsLiteral: 'user-keys',
  }),

  // private-sessions service can delete media
  // service.name must equal 'private-sessions'
  canIf('delete', 'media', {
    userProperty: 'name',
    equalsLiteral: 'private-sessions',
  }),
];

/**
 * Middleware that sets up the ability based on whether the request is from a user or service.
 * Attaches the appropriate set of authorization abilities to the request
 */
export async function authorizationMiddleware(req: ExtendedRequest, res: Response, next: NextFunction) {
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
 * Check if a specific action is allowed on a subject, throwing if not authorized.
 *
 * This function validates authorization based on the abilities defined for the current
 * user or service. It compares user/service properties against record properties
 * according to the ability conditions.
 *
 * @param req - The Express request with attached user/service and abilities
 * @param action - The action being performed ('create', 'delete', 'list', etc.)
 * @param subject - The subject/resource type ('private_post', 'key', etc.)
 * @param record - Optional record or array of records to check ownership against
 *
 * @throws {AuthorizationError} If the user/service is not authorized for the action
 *
 * @example
 * // Check if user can delete a specific post
 * const post = await getPost(postId);
 * authorize(req, 'delete', 'private_post', post);
 *
 * @example
 * // Check if user can list multiple session keys
 * const keys = await getSessionKeys(sessionId);
 * authorize(req, 'list', 'session_key', keys);
 *
 * @example
 * // Check if user can create media (no record needed)
 * authorize(req, 'create', 'media');
 */
export function authorize(
  req: ExtendedRequest,
  action: Action,
  subject: Subject,
  record?: Record<string, unknown> | Array<Record<string, unknown>>,
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
  record?: Record<string, unknown>,
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

          // DEV/TEST ONLY: Validate condition mappings to catch configuration errors
          if (process.env.NODE_ENV !== 'production') {
            const userHasProperty = key in user;
            const isLiteralValue = value.startsWith('=');

            // Check if user property exists
            if (!userHasProperty) {
              // Check if the key exists on the record (suggesting backwards condition)
              const recordHasProperty = hasNestedProperty(record, key);
              if (recordHasProperty && !isLiteralValue) {
                // Property exists on record but not user - likely backwards!
                const recordPropertyValue = value as string;
                throw new AuthorizationError(
                  `Authorization condition appears backwards!\n` +
                  `  User has no property '${key}' but record does.\n` +
                  `  Did you mean: { ${recordPropertyValue}: '${key}' } instead of { ${key}: '${recordPropertyValue}' }?\n` +
                  `  Remember: { userProperty: 'recordProperty' }`,
                  { key, value, userProperties: Object.keys(user), recordProperties: Object.keys(record) }
                );
              }
              throw new AuthorizationError(
                `Authorization condition error: User/Service has no property '${key}'.\n` +
                `  Available properties: ${Object.keys(user).join(', ')}\n` +
                `  Condition was: { ${key}: '${value}' }`,
                { key, value, userProperties: Object.keys(user) }
              );
            }

            // If not a literal value, check that record has the referenced property (supports nested paths)
            if (!isLiteralValue && !hasNestedProperty(record, value)) {
              throw new AuthorizationError(
                `Authorization condition error: Record has no property '${value}'.\n` +
                `  Available properties: ${Object.keys(record).join(', ')}\n` +
                `  Condition was: { ${key}: '${value}' }\n` +
                `  TIP: For nested properties, use dot notation (e.g., 'session.authorDid')`,
                { key, value, recordProperties: Object.keys(record) }
              );
            }
          }

          // If the condition is prefixed with =, check if user[key] has that exact value
          // Otherwise, check if user[key] matches record[value] (supports nested paths via dot notation)
          const expectedValue = value.startsWith('=')
            ? value.slice(1)
            : getNestedValue(record, value);

          const userValue = user[key as keyof (User | Service)];

          // If expectedValue is an array, ALL elements must match the user's value.
          // Empty arrays fail authorization (no elements to match).
          //
          // IMPORTANT: We use `every()` intentionally, NOT `some()`. Using `some()` would be
          // a security risk - it would allow access if ANY element matches, potentially
          // leaking records where only some nested values are permitted. If you need to
          // check membership in an array, ensure the query/include filters the array to
          // only contain the relevant user's entries BEFORE authorization, then use a
          // direct property match (e.g., add `recipientDid` directly to the record).
          let matches: boolean;
          if (Array.isArray(expectedValue)) {
            matches = expectedValue.length > 0 && expectedValue.every((val) => userValue === val);
          } else {
            matches = userValue === expectedValue;
          }

          if (process.env.DEBUG_AUTH) console.log(`Comparing: user.${key}="${userValue}" vs expected="${expectedValue}" => ${matches}`);
          return matches;
        })
      );
    }

    return isAllowed;
  });
}
