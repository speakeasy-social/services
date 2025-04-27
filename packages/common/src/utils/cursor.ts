import { Buffer } from 'buffer';

export interface CursorData {
  createdAt: Date;
  id: string;
}

/**
 * Encodes cursor data into a base64 string
 */
export function encodeCursor(data: CursorData): string {
  return Buffer.from(`${data.createdAt.toISOString()}#${data.id}`).toString(
    'base64',
  );
}

/**
 * Decodes a base64 cursor string into its components
 */
export function decodeCursor(cursor: string): CursorData {
  const decodedCursor = Buffer.from(cursor, 'base64').toString('utf-8');
  const [createdAt, id] = decodedCursor.split('#');
  return {
    createdAt: new Date(createdAt),
    id,
  };
}

/**
 * Creates a cursor-based where clause for Prisma queries
 */
export function createCursorWhereClause(cursor: string | undefined): any {
  if (!cursor) {
    return {};
  }

  const { createdAt, id } = decodeCursor(cursor);
  return {
    OR: [
      { createdAt: { lt: createdAt } },
      {
        AND: [{ createdAt }, { id: { lt: id } }],
      },
    ],
  };
}
