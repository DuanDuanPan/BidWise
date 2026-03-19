import { describe, it, expect } from 'vitest'
import { BidWiseError, ValidationError, NotFoundError, DatabaseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'

describe('BidWiseError hierarchy', () => {
  it('should create BidWiseError with code and message', () => {
    const error = new BidWiseError('TEST_CODE', 'test message')
    expect(error.code).toBe('TEST_CODE')
    expect(error.message).toBe('test message')
    expect(error.name).toBe('BidWiseError')
    expect(error).toBeInstanceOf(Error)
  })

  it('should create BidWiseError with cause', () => {
    const cause = new Error('original')
    const error = new BidWiseError('TEST', 'wrapped', cause)
    expect(error.cause).toBe(cause)
  })

  it('should create ValidationError', () => {
    const error = new ValidationError('invalid input')
    expect(error.code).toBe(ErrorCode.VALIDATION)
    expect(error.name).toBe('ValidationError')
    expect(error).toBeInstanceOf(BidWiseError)
  })

  it('should create NotFoundError', () => {
    const error = new NotFoundError('not found')
    expect(error.code).toBe(ErrorCode.NOT_FOUND)
    expect(error.name).toBe('NotFoundError')
    expect(error).toBeInstanceOf(BidWiseError)
  })

  it('should create DatabaseError', () => {
    const error = new DatabaseError('db failed')
    expect(error.code).toBe(ErrorCode.DATABASE)
    expect(error.name).toBe('DatabaseError')
    expect(error).toBeInstanceOf(BidWiseError)
  })
})
