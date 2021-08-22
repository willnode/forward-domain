const crypto = require('crypto')
const fs = require('fs')

const ACCOUNT_KEY_ALGORITHM = 'ES256'
const CERTIFICATE_KEY_ALGORITHM = 'RS256'

const env = (process.env.NODE_ENV || '').trim().toLowerCase()

const DIRECTORY_URL = ['development', 'test'].includes(env)
  ? 'https://acme-staging-v02.api.letsencrypt.org/directory'
  : 'https://acme-v02.api.letsencrypt.org/directory'

const PRIVATE_KEY_CIPHER = 'aes-256-cbc'
const PRIVATE_KEY_FORMAT = 'pem'
const PRIVATE_KEY_PERMISSIONS = 0o600
const PRIVATE_KEY_TYPE = 'pkcs8'

const PUBLIC_KEY_FORMAT = 'pem'
const PUBLIC_KEY_PERMISSIONS = 0o666
const PUBLIC_KEY_TYPE = 'spki'

/**
 * @param  {crypto.KeyObject} privateKey
 * @param  {String}           [passphrase]
 *
 * @return {String}
 */
const exportPrivateKey = (privateKey, passphrase) => {
  const privateKeyOpts = {
    type: PRIVATE_KEY_TYPE,
    format: PRIVATE_KEY_FORMAT
  }

  if (passphrase) {
    privateKeyOpts.cipher = PRIVATE_KEY_CIPHER
    privateKeyOpts.passphrase = passphrase
  }

  return privateKey.export(privateKeyOpts)
}

/**
 * @param  {crypto.KeyObject} publicKey
 *
 * @return {String}
 */
const exportPublicKey = publicKey => {
  return publicKey.export({
    type: PUBLIC_KEY_TYPE,
    format: PUBLIC_KEY_FORMAT
  })
}

/**
 * @param  {String} privateKeyData
 * @param  {String} [passphrase]
 *
 * @return {String}
 */
const importPrivateKey = (privateKeyData, passphrase) => {
  const privateKeyOpts = {
    key: privateKeyData,
    format: PRIVATE_KEY_FORMAT,
    type: PRIVATE_KEY_TYPE
  }

  if (passphrase) {
    privateKeyOpts.passphrase = passphrase
  }

  try {
    return crypto.createPrivateKey(privateKeyOpts)
  } catch {
    throw new Error('Failed to import private key')
  }
}

/**
 * @param  {String} publicKeyData
 *
 * @return {crypto.KeyObject}
 */
const importPublicKey = publicKeyData => {
  try {
    return crypto.createPublicKey({
      key: publicKeyData,
      format: PUBLIC_KEY_FORMAT,
      type: PUBLIC_KEY_TYPE
    })
  } catch {
    throw new Error('Failed to import public key')
  }
}

/**
 * @param  {String}                    dirname
 * @param  {(crypto.KeyObject|String)} key
 * @param  {String}                    [passphrase]
 *
 * @return {Promise}
 */
const writeKeyToFile = async (filename, key, passphrase) => {
  if (typeof key === 'string') {
    key = key.includes('PRIVATE KEY')
      ? importPrivateKey(key, passphrase)
      : importPublicKey(key)
  } else if (!(key instanceof crypto.KeyObject)) {
    throw new Error('Expected "key" to be crypto.KeyObject or string')
  }

  const isPrivateKey = key.type === 'private'

  const keyData = isPrivateKey
    ? exportPrivateKey(key, passphrase)
    : exportPublicKey(key)

  const mode = isPrivateKey ? PRIVATE_KEY_PERMISSIONS : PUBLIC_KEY_PERMISSIONS

  await fs.promises.writeFile(filename, keyData, { mode })
}

module.exports = {
  ACCOUNT_KEY_ALGORITHM,
  CERTIFICATE_KEY_ALGORITHM,
  DIRECTORY_URL,
  PRIVATE_KEY_CIPHER,
  PRIVATE_KEY_FORMAT,
  PRIVATE_KEY_PERMISSIONS,
  PRIVATE_KEY_TYPE,
  PUBLIC_KEY_FORMAT,
  PUBLIC_KEY_PERMISSIONS,
  PUBLIC_KEY_TYPE,
  env,
  exportPrivateKey,
  exportPublicKey,
  importPrivateKey,
  importPublicKey,
  writeKeyToFile
}
