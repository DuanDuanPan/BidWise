import { ErrorCode } from '@shared/constants'

export class BidWiseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'BidWiseError'
  }
}

export class ValidationError extends BidWiseError {
  constructor(message: string, cause?: unknown) {
    super(ErrorCode.VALIDATION, message, cause)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends BidWiseError {
  constructor(message: string, cause?: unknown) {
    super(ErrorCode.NOT_FOUND, message, cause)
    this.name = 'NotFoundError'
  }
}

export class DatabaseError extends BidWiseError {
  constructor(message: string, cause?: unknown) {
    super(ErrorCode.DATABASE, message, cause)
    this.name = 'DatabaseError'
  }
}
