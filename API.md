# Private Posts API

This document outlines the required XRPC endpoints for the private posts service. All endpoints will be implemented using the AT Protocol's XRPC server and lexicons.

## Endpoint Overview

Each line represents a required XRPC endpoint with its purpose:

```
# Trust Management
social.speakeasy.users.get_trusted_by          - List users who trust a given DID
social.speakeasy.users.add_trusted             - Add a new trusted user
social.speakeasy.users.remove_trusted          - Remove a trusted user

# Session Management
social.speakeasy.follower_sessions.get_posts   - List private posts accessible to a recipient
social.speakeasy.follower_sessions.get_bulk    - Bulk fetch session details by IDs
social.speakeasy.follower_sessions.revoke      - Revoke an active session
social.speakeasy.follower_sessions.add_user    - Add new trusted user to existing session

# Key Management
social.speakeasy.keys.get_public_key          - Get user's public key for encryption
social.speakeasy.keys.get_private_key         - Get user's private key (owner only)
social.speakeasy.keys.request_rotation        - Request key rotation
```

## Trust Management

### Get Users Who Trust a DID

```typescript
GET / xrpc / social.speakeasy.users.get_trusted_by;
```

Returns a list of users who trust the specified DID.

**Parameters:**

- `did` (required): The DID to check for trust relationships

**Response:**

```typescript
{
  "trustedBy": Array<{
    did: string
    createdAt: string
  }>
}
```

### Add Trusted User

```typescript
POST / xrpc / social.speakeasy.users.add_trusted;
```

Adds a new user to the trusted followers list.

**Request Body:**

```typescript
{
  "did": string  // DID of the user to trust
}
```

**Response:**

```typescript
{
  "success": boolean
}
```

### Remove Trusted User

```typescript
POST / xrpc / social.speakeasy.users.remove_trusted;
```

Removes a user from the trusted followers list.

**Request Body:**

```typescript
{
  "did": string  // DID of the user to remove
}
```

**Response:**

```typescript
{
  "success": boolean
}
```

## Session Management

### Fetch Posts for a Recipient

```typescript
GET / xrpc / social.speakeasy.follower_sessions.get_posts;
```

Returns a list of private posts that the specified recipient has access to.

**Parameters:**

- `recipient` (required): The DID of the recipient
- `limit` (optional): Number of posts to return (default: 50)
- `cursor` (optional): Pagination cursor

**Response:**

```typescript
{
  "posts": Array<{
    uri: string
    cid: string
    author: {
      did: string
      handle: string
    }
    text: string
    createdAt: string
    sessionId: string
  }>,
  "cursor": string
}
```

### Bulk Fetch Sessions

```typescript
POST / xrpc / social.speakeasy.follower_sessions.get_bulk;
```

Returns session details for multiple session IDs in a single request.

**Request Body:**

```typescript
{
  "sessionIds": string[]
}
```

**Response:**

```typescript
{
  "sessions": Array<{
    sessionId: string
    authorDid: string
    createdAt: string
    expiresAt?: string
    revokedAt?: string
  }>
}
```

### Revoke Session

```typescript
POST / xrpc / social.speakeasy.follower_sessions.revoke;
```

Revokes an active session, forcing creation of a new session for future posts.

**Request Body:**

```typescript
{
  "sessionId": string
}
```

**Response:**

```typescript
{
  "success": boolean
}
```

### Add User to Session

```typescript
POST / xrpc / social.speakeasy.follower_sessions.add_user;
```

Adds a new trusted user to an existing session.

**Request Body:**

```typescript
{
  "sessionId": string
  "did": string
}
```

**Response:**

```typescript
{
  "success": boolean
}
```

## Key Management

### Get Public Key

```typescript
GET / xrpc / social.speakeasy.keys.get_public_key;
```

Returns a user's public key for encryption.

**Parameters:**

- `did` (required): The DID of the user whose public key to fetch

**Response:**

```typescript
{
  "publicKey": string  // Base64 encoded public key
  "createdAt": string
  "expiresAt": string
}
```

### Get Private Key

```typescript
GET / xrpc / social.speakeasy.keys.get_private_key;
```

Returns the authenticated user's private key. Only accessible to the key owner.

**Response:**

```typescript
{
  "privateKey": string  // Base64 encoded private key
  "createdAt": string
  "expiresAt": string
}
```

### Request Key Rotation

```typescript
POST / xrpc / social.speakeasy.keys.request_rotation;
```

Requests rotation of the user's key pair. Only accessible to the key owner.

**Response:**

```typescript
{
  "success": boolean
  "newPublicKey": string  // Base64 encoded new public key
  "createdAt": string
  "expiresAt": string
}
```

## Implementation Notes

1. All endpoints will use the AT Protocol's authentication system
2. Responses will be paginated where appropriate
3. Session fetching is optimized for bulk operations to reduce round trips
4. Posts are returned with their associated session IDs to enable efficient session lookup
5. All timestamps are in ISO 8601 format

## Future Considerations

1. Add filtering options for posts (e.g., by date range)
2. Add sorting options for posts
3. Consider adding a websocket endpoint for real-time updates
4. Add rate limiting and caching strategies
5. Consider adding batch operations for trust management
