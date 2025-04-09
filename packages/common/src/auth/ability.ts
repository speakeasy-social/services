import { PureAbility, AbilityBuilder, InferSubjects } from "@casl/ability";
import { XRPCReqContext, HandlerOutput } from "@atproto/xrpc-server";
import { AuthorizationError } from "../errors.js";

interface CustomXRPCReqContext extends XRPCReqContext {
  ability?: AppAbility;
}

// Define the actions that can be performed
export type Action =
  | "manage"
  | "list"
  | "create"
  | "delete"
  | "revoke"
  | "get_public_key";

// Define the subjects that can be acted upon
export type Subject =
  | "private_post"
  | "private_session"
  | "trust"
  | "group"
  | "keys";

// Define the ability type with strict tuple typing
export type AppAbility = PureAbility<[Action, Subject]>;

/**
 * Creates an ability instance with permissions for a user based on their DID.
 *
 * Permission rules are defined using the `can` method with three parameters:
 * 1. action: The operation being performed (e.g. 'manage', 'list')
 * 2. subject: The type of resource being accessed (e.g. 'private_post', 'trust')
 * 3. conditions: An object that must match the properties of the subject being accessed
 *
 * When checking permissions with authorize(request, action, subject):
 * - The action must match exactly (unless it's 'manage' which is a wildcard)
 * - The subject must be an instance of the specified type (subject.constructor.name must match the string defined in can())
 * - The subject must have properties that exactly match the conditions object
 *
 * Example:
 *   Rule: can('manage', 'trust', { authorDid: did })
 *   This means the user can manage a trust object only if:
 *   - The action is 'manage'
 *   - The subject is an instance of 'trust' (subject.constructor.name === 'trust')
 *   - The subject has properties that match exactly:
 *     - subject.authorDid === did
 *
 * Note: All conditions must match exactly - partial matches will fail.
 */
export function defineUserAbilities(did: string): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(PureAbility);

  // User-level trust permissions
  can("manage", "trust", { authorDid: did });

  // Authors can manage their own sessions and posts
  // FIXME the second param needs to === subject.constructor.name
  can("revoke", "private_session", { authorDid: did });
  can("manage", "private_post", { authorDid: did });
  // Recipients can read posts shared with them
  can("list", "private_post", { recipientDid: did });

  // Users can manage their own keys
  can("manage", "keys", { did: did });
  // Anyone can read public keys
  can("get_public_key", "keys");

  return build();
}

/**
 * Define what other services calling the API are allowed to do
 */
export function defineServiceAbilities(serviceName: string): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(PureAbility);

  // Service-specific permissions
  if (serviceName === "private-sessions") {
    can("list", "trust");
  } else if (serviceName === "trusted-users") {
    can("manage", "private_session");
  }

  return build();
}

/**
 * Middleware that sets up the ability based on whether the request is from a user or service.
 * Attaches the appropriate set of authorization abilities to the request
 */
export async function authorizationMiddleware(req: any, res: any, next: any) {
  // Check if this is a service request
  const userDid = req.user?.did;
  if (userDid) {
    req.ability = defineUserAbilities(userDid);
  } else if (req.service) {
    req.ability = defineServiceAbilities(req.service.name);
  } else {
    throw new AuthorizationError("Request must be authenticated");
  }

  next();
}

/**
 * Helper function to check if a specific action is allowed on a subject.
 * Throws AuthorizationError if the action is not permitted.
 */
export function authorize(
  ctx: CustomXRPCReqContext,
  action: Action,
  subject: any,
): void {
  const ability = ctx.ability as AppAbility;
  if (!ability.can(action, subject)) {
    throw new AuthorizationError(`Not authorized to ${action} ${subject}`);
  }
}
