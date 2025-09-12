# Private Posts API

This document outlines the required XRPC endpoints for the private posts service. All endpoints will be implemented using the AT Protocol's XRPC server and lexicons.

## Endpoint Overview

Each line represents a required XRPC endpoint with its purpose:

```
# Trust Management (Graph)
social.spkeasy.graph.getTrusted               - List users trusted by the given author DID
social.spkeasy.graph.addTrusted               - Add a new trusted user
social.spkeasy.graph.removeTrusted            - Remove a trusted user

# Session Management
social.spkeasy.privateSession.revoke          - Revoke an active session
social.spkeasy.privateSession.addUser         - Add new trusted user to the current session
social.spkeasy.privateSession.getSession      - Get the currecnt active session

# Post Management
social.spkeasy.privatePosts.getPosts          - List private posts accessible to a recipient
social.spkeasy.privatePosts.createPost        - Create a new private post
social.spkeasy.privatePosts.deletePost        - Delete a private post

social.spkeasy.reaction.createReaction        - Create like
social.spkeasy.reaction.deleteReaction        - Delete like

social.spkeasy.notification.getUnreadCount    - Get count of unread notifications
social.spkeasy.notification.listNotification  - List notifications
social.spkeasy.notification.updateSeen        - Update last seen time for notifications

# User management
social.spkeasy.actor.getProfile               - Returns encrypted private profile
social.spkeasy.actor.putProfile               - Update encrypted private profile

# Feature Management
social.spkeasy.actor.getFeatures              - Get features enabled for an actor
social.spkeasy.actor.applyInviteCode          - Apply a code to enable a feature
social.spkeasy.actor.createCheckoutSession    - Create a checkout session with the Stripe API
social.spkeasy.actor.createSubscription    - Create a subscription with the Stripe API

# Key Management                              - Swiss service
social.spkeasy.keys.getPublicKey              - Get user's public key for encryption
social.spkeasy.keys.getPrivateKey             - Get user's private key (owner only)
social.spkeasy.keys.rotate                    - Request key rotation
```

## Trust Management

### Get Users Who Trust a DID

```typescript
GET / xrpc / social.spkeasy.graph.getTrusts;
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
POST / xrpc / social.spkeasy.graph.addTrusted;
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
POST / xrpc / social.spkeasy.graph.removeTrusted;
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

### Revoke Session

```typescript
POST / xrpc / social.spkeasy.privateSession.revoke;
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
POST / xrpc / social.spkeasy.privateSession.addUser;
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

## Post Management

### Fetch Posts for a Recipient

```typescript
GET / xrpc / social.spkeasy.privatePosts.getPosts;
```

Returns a list of private posts that the specified recipient has access to.

**Parameters:**

- `recipient` (required): The DID of the recipient
- `limit` (optional): Number of posts to return (default: 50)
- `cursor` (optional): Pagination cursor
- `uris` (optional): Array of specific post URIs to fetch

**Response:**

```typescript
{
  "posts": Array<{
    uri: string
    rkey: string
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

### Create Post

```typescript
POST / xrpc / social.spkeasy.privatePosts.createPost;
```

Creates a new private post in the specified session.

**Request Body:**

```typescript
{
  "sessionId": string
  "text": string
  "recipients": string[]  // Array of recipient DIDs
}
```

**Response:**

```typescript
{
  "uri": string
  "rkey": string
  "author": {
    "did": string
    "handle": string
  }
  "text": string
  "createdAt": string
  "sessionId": string
}
```

### Delete Post

```typescript
POST / xrpc / social.spkeasy.privatePosts.deletePost;
```

Deletes a private post. Only the author can delete their own posts.

**Request Body:**

```typescript
{
  "uri": string  // The URI of the post to delete
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
GET / xrpc / social.spkeasy.keys.getPublicKey;
```

Returns a user's public key for encryption.

**Parameters:**

- `did` (required): The DID of the user whose public key to fetch

**Response:**

```typescript
{
  "publicKey": string  // Base64 encoded public key
}
```

### Get Private Key

```typescript
GET / xrpc / social.spkeasy.keys.getPrivateKey;
```

Returns the authenticated user's private key. Only accessible to the key owner.

**Response:**

```typescript
{
  "privateKey": string  // Base64 encoded private key
}
```

### Rotate Keys

```typescript
POST / xrpc / social.spkeasy.keys.rotate;
```

Requests rotation of the user's key pair.

**Response:**

```typescript
{
  "success": boolean
}
```
