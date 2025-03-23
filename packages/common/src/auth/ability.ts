import { PureAbility, AbilityBuilder, InferSubjects } from '@casl/ability';
import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthorizationError } from '../errors.js';

// Define the actions that can be performed
export type Action =
  | 'manage'
  | 'list'
  | 'create'
  | 'delete'
  | 'revoke'
  | 'get_public_key';

// Define the subjects that can be acted upon
export type Subject =
  | 'private_post'
  | 'private_session'
  | 'trust'
  | 'group'
  | 'keys';

// Define the ability type with strict tuple typing
export type AppAbilityTuple = [Action, Subject];
export interface AppAbility extends PureAbility<AppAbilityTuple> {}

// Define abilities for a user
export function defineUserAbilities(did: string): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(PureAbility);

  // User-level trust permissions
  can('manage', 'trust', { scope: 'authorDid', authorDid: did });

  // Authors can manage their own sessions and posts
  can('revoke', 'private_session', { scope: 'authorDid', authorDid: did });
  can('manage', 'private_post', { scope: 'authorDid', authorDid: did });
  can('list', 'private_post', { scope: 'recipientDid', recipientDid: did });

  // Recipients can read posts shared with them
  can('manage', 'keys', { did: did });
  can('get_public_key', 'keys');

  return build();
}

// Define abilities for a service
export function defineServiceAbilities(serviceName: string): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(PureAbility);

  // Service-specific permissions
  if (serviceName === 'private-sessions') {
    can('list', 'trust', { scope: 'recipientDid' });
  } else if (serviceName === 'trusted-users') {
    can('manage', 'private_session', { scope: 'authorDid' });
  }

  return build();
}

// Authorization middleware
export async function authorizationMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Check if this is a service request (has service in JWT) or user request (has did)
  const serviceName = request.user?.service as string | undefined;
  const userDid = request.user?.did;

  if (!serviceName && !userDid) {
    throw new AuthorizationError('Request must be authenticated as either a user or service');
  }

  const ability = serviceName
    ? defineServiceAbilities(serviceName)
    : defineUserAbilities(userDid!);

  request.ability = ability;
}

// Helper function to authorize actions
export function authorize(
  request: FastifyRequest,
  action: Action,
  subject: Subject,
  conditions?: Record<string, unknown>
): void {
  const ability = request.ability as AppAbility;
  if (!ability.can(action, subject, conditions)) {
    throw new AuthorizationError(`Not authorized to ${action} ${subject}`);
  }
}
