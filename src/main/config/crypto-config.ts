/**
 * AES-256-CBC encryption/decryption for local configuration files.
 * Key derivation: scryptSync with machine-identity salt (D3b: cross-machine non-decryptable).
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { hostname, userInfo } from 'os'

const ALGORITHM = 'aes-256-cbc'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const SCRYPT_COST = 16384

function getMachineIdentity(): string {
  return `${hostname()}-${userInfo().username}`
}

function deriveKey(salt: string): Buffer {
  return scryptSync(getMachineIdentity(), salt, KEY_LENGTH, { N: SCRYPT_COST })
}

export function encryptConfig(plaintext: string): Buffer {
  const salt = randomBytes(16).toString('hex')
  const key = deriveKey(salt)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  // Format: salt(32 hex chars) + iv(16 bytes) + ciphertext
  const saltBuf = Buffer.from(salt, 'utf8')
  return Buffer.concat([saltBuf, iv, encrypted])
}

export function decryptConfig(data: Buffer): string {
  const salt = data.subarray(0, 32).toString('utf8')
  const iv = data.subarray(32, 32 + IV_LENGTH)
  const ciphertext = data.subarray(32 + IV_LENGTH)
  const key = deriveKey(salt)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  return decipher.update(ciphertext) + decipher.final('utf8')
}
