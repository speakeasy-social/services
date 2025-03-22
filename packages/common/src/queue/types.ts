// Job data type definitions
export interface AddRecipientToSessionJob {
  authorDid: string
  recipientDid: string
}

// Union type of all job data
export type SessionJobData = AddRecipientToSessionJob
