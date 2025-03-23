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
social.speakeasy.private_sessions.revoke      - Revoke an active session
social.speakeasy.private_sessions.add_user    - Add new trusted user to existing session

# Post Management
social.speakeasy.private_posts.get_posts     - List private posts accessible to a recipient
social.speakeasy.private_posts.get_bulk      - Bulk fetch posts by IDs
social.speakeasy.private_posts.create        - Create a new private post
social.speakeasy.private_posts.delete        - Delete a private post

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

### Revoke Session

```typescript
POST / xrpc / social.speakeasy.private_sessions.revoke;
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
POST / xrpc / social.speakeasy.private_sessions.add_user;
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
GET / xrpc / social.speakeasy.private_posts.get_posts;
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

### Bulk Fetch Posts

```typescript
POST / xrpc / social.speakeasy.private_posts.get_bulk;
```

Returns post details for multiple post IDs in a single request.

**Request Body:**

```typescript
{
  "postIds": string[]
}
```

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
  }>
}
```

### Create Post

```typescript
POST / xrpc / social.speakeasy.private_posts.create;
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
  "cid": string
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
POST / xrpc / social.speakeasy.private_posts.delete;
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
