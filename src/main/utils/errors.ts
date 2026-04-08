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

export class AiProxyError extends BidWiseError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause)
    this.name = 'AiProxyError'
  }
}

export class TaskQueueError extends BidWiseError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause)
    this.name = 'TaskQueueError'
  }
}

export class DocumentNotFoundError extends BidWiseError {
  constructor(message: string, cause?: unknown) {
    super(ErrorCode.DOCUMENT_NOT_FOUND, message, cause)
    this.name = 'DocumentNotFoundError'
  }
}

export class DocumentSaveError extends BidWiseError {
  constructor(message: string, cause?: unknown) {
    super(ErrorCode.DOCUMENT_SAVE_FAILED, message, cause)
    this.name = 'DocumentSaveError'
  }
}

export class DocxBridgeError extends BidWiseError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause)
    this.name = 'DocxBridgeError'
  }
}
