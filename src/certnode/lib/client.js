const fs = require('fs')
const http = require('http')
const path = require('path')
const { promisify } = require('util')
const { fromKeyLike } = require('jose-node-cjs-runtime/jwk/from_key_like')
const { generateKeyPair } = require('jose-node-cjs-runtime/util/generate_key_pair')
const { calculateThumbprint } = require('jose-node-cjs-runtime/jwk/thumbprint')
const { SignJWT } = require('jose-node-cjs-runtime/jwt/sign')
const { CompactSign } = require('jose-node-cjs-runtime/jws/compact/sign')
const pem = require('pem')
const common = require('./common')
const request = require('./request')

const createCsr = promisify(pem.createCSR)

/**
 * Represents a Let's Encrypt account and
 * sends requests to get valid TLS certificates.
 */
class Client {
  /**
   * @param  {String} [directoryUrl]
   */
  constructor (directoryUrl = common.DIRECTORY_URL) {
    this.accountPrivateJwk = null
    this.accountPrivateKey = null
    this.accountPublicJwk = null
    this.accountPublicKey = null
    this.directoryUrl = directoryUrl
    this.hasDirectory = false
    this.myAccountUrl = ''
    this.newAccountUrl = ''
    this.newNonceUrl = ''
    this.newOrderUrl = ''
    this.replayNonce = ''
    this.server = null
    this.thumbprint = ''
  }

  /**
   * Export account public and private keys to a directory.
   *
   * @param  {String} dirname      - name of directory to write key files to
   * @param  {String} [passphrase] - optional passphrase to encrypt private key with
   *
   * @return {Promise}
   */
  exportAccountKeyPair (dirname, passphrase) {
    const privateKeyFile = path.join(dirname, 'privateKey.pem')
    const publicKeyFile = path.join(dirname, 'publicKey.pem')

    return Promise.all([
      common.writeKeyToFile(privateKeyFile, this.accountPrivateKey, passphrase),
      common.writeKeyToFile(publicKeyFile, this.accountPublicKey)
    ])
  }

  /**
   * Generate new account public and private keys.
   *
   * @return {Promise}
   */
  async generateAccountKeyPair () {
    const { privateKey, publicKey } = await generateKeyPair(common.ACCOUNT_KEY_ALGORITHM)

    this.accountPrivateKey = privateKey
    this.accountPublicKey = publicKey

    await this.initAccountJwks()
  }

  /**
   * Generate a certificate from Let's Encrypt for your domain.
   *
   * @param  {String} domain - the domain you want a certificate for
   * @param  {String} email  - the email used to register the certificate
   *
   * @return {Promise}
   */
  async generateCertificate (domain, email) {
    await this.directory()
    await this.newNonce()
    await this.newAccount(email)

    const { authzUrls, finalizeUrl } = await this.newOrder(domain)
    const { challenge } = await this.authz(authzUrls[0])

    await this.completeChallenge(challenge)
    await this.pollAuthz(authzUrls[0])
    const { certificate, privateKeyData } = await this.finalizeOrder(finalizeUrl, domain, email)

    this.server?.close()

    return { certificate, privateKeyData }
  }

  /**
   * Import account public and private keys from a directory.
   *
   * @param  {String} dirname      - name of directory to read key files from
   * @param  {String} [passphrase] - optional passphrase to decrypt private key with
   *
   * @return {Promise}
   */
  async importAccountKeyPair (dirname, passphrase) {
    const [privateKeyData, publicKeyData] = await Promise.all([
      fs.promises.readFile(path.join(dirname, 'privateKey.pem'), 'utf8'),
      fs.promises.readFile(path.join(dirname, 'publicKey.pem'), 'utf8')
    ])

    this.accountPrivateKey = common.importPrivateKey(privateKeyData, passphrase)
    this.accountPublicKey = common.importPublicKey(publicKeyData)

    await this.initAccountJwks()
  }

  async authz (authzUrl) {
    const data = await this.sign(
      {
        kid: this.myAccountUrl,
        nonce: this.replayNonce,
        url: authzUrl
      }
    )

    const res = await request(authzUrl, {
      method: 'POST',

      headers: {
        'content-type': 'application/jose+json'
      },

      data
    })

    this.setReplayNonce(res)

    if (res.statusCode !== 200) {
      throw new Error(`authz() Status Code: ${res.statusCode} Data: ${res.data}`)
    }

    const { challenges, identifier, ...rest } = res.data
    const challenge = challenges.find(({ type }) => type === 'http-01')

    return {
      challenge,
      domain: identifier.value,
      ...rest
    }
  }

  async completeChallenge (challenge, cb) {
    await this.readyChallenge(challenge)
    await this.receiveServerRequest(challenge, cb)
  }

  async directory () {
    if (this.hasDirectory) return false

    const res = await request(this.directoryUrl)

    if (res.statusCode !== 200) {
      throw new Error(`directory() Status Code: ${res.statusCode} Data: ${res.data}`)
    }

    this.hasDirectory = true
    this.newAccountUrl = res.data.newAccount
    this.newNonceUrl = res.data.newNonce
    this.newOrderUrl = res.data.newOrder

    return true
  }

  async fetchCertificate (certificateUrl) {
    const data = await this.sign({
      kid: this.myAccountUrl,
      nonce: this.replayNonce,
      url: certificateUrl
    })

    const res = await request(certificateUrl, {
      method: 'POST',

      headers: {
        accept: 'application/pem-certificate-chain',
        'content-type': 'application/jose+json'
      },

      data
    })

    this.setReplayNonce(res)

    if (res.statusCode !== 200) {
      throw new Error(`fetchCertificate() Status Code: ${res.statusCode} Data: ${res.data}`)
    }

    return res.data
  }

  async finalizeOrder (finalizeUrl, domain, email) {
    const { privateKey } = await generateKeyPair(common.CERTIFICATE_KEY_ALGORITHM)
    const clientKey = common.exportPrivateKey(privateKey)
    let { csr } = await createCsr({ clientKey, commonName: domain, email })

    // "The CSR is sent in the base64url-encoded version of the DER format.
    // (Note: Because this field uses base64url, and does not include headers,
    // it is different from PEM.)"
    csr = csr
      .split('\n')
      .filter(Boolean)
      .slice(1, -1)
      .join('')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

    const data = await this.sign(
      {
        kid: this.myAccountUrl,
        nonce: this.replayNonce,
        url: finalizeUrl
      },
      {
        csr
      }
    )

    const res = await request(finalizeUrl, {
      method: 'POST',

      headers: {
        'content-type': 'application/jose+json'
      },

      data
    })

    this.setReplayNonce(res)

    if (res.statusCode !== 200) {
      throw new Error(`finalizeOrder() Status Code: ${res.statusCode} Data: ${res.data}`)
    }

    const certificate = await this.fetchCertificate(res.data.certificate)

    return { certificate, privateKeyData: clientKey }
  }

  async initAccountJwks () {
    const [publicJwk, accountPrivateJwk] = await Promise.all([
      fromKeyLike(this.accountPublicKey),
      fromKeyLike(this.accountPrivateKey)
    ])

    this.accountPublicJwk = publicJwk
    this.accountPrivateJwk = accountPrivateJwk
    this.thumbprint = await calculateThumbprint(publicJwk)
  }

  async newAccount (...emails) {
    const data = await this.sign(
      {
        jwk: this.accountPublicJwk,
        nonce: this.replayNonce,
        url: this.newAccountUrl
      },
      {
        contact: emails.map(email => 'mailto:' + email),
        termsOfServiceAgreed: true
      }
    )

    const res = await request(this.newAccountUrl, {
      method: 'POST',

      headers: {
        'content-type': 'application/jose+json'
      },

      data
    })

    this.setReplayNonce(res)

    if (![200, 201].includes(res.statusCode)) {
      throw new Error(`newAccount() Status Code: ${res.statusCode} Data: ${res.data}`)
    }

    this.myAccountUrl = res.headers.location

    return res.statusCode === 201
  }

  async newNonce () {
    if (this.replayNonce) return false

    const res = await request(this.newNonceUrl, { method: 'HEAD' })

    if (res.statusCode !== 200) {
      throw new Error(`newNonce() Status Code: ${res.statusCode} Data: ${res.data}`)
    }

    this.setReplayNonce(res)

    return true
  }

  async newOrder (...domains) {
    const identifiers = domains.map(domain => ({ type: 'dns', value: domain }))

    const data = await this.sign(
      {
        kid: this.myAccountUrl,
        nonce: this.replayNonce,
        url: this.newOrderUrl
      },
      {
        identifiers
      }
    )

    const res = await request(this.newOrderUrl, {
      method: 'POST',

      headers: {
        'content-type': 'application/jose+json'
      },

      data
    })

    this.setReplayNonce(res)

    if (res.statusCode !== 201) {
      throw new Error(`newOrder() Status Code: ${res.statusCode} Data: ${res.data}`)
    }

    const orderUrl = res.headers.location
    const { authorizations: authzUrls, finalize: finalizeUrl } = res.data

    return {
      authzUrls,
      domains,
      finalizeUrl,
      orderUrl
    }
  }

  async pollAuthz (authzUrl) {
    for (let i = 0; i < 10; i++) {
      const result = await this.authz(authzUrl)

      if (result.status === 'pending') {
        await new Promise(resolve => setTimeout(resolve, 1e3))
        continue
      }

      if (result.status === 'invalid') {
        throw new Error('pollAuthz() authorization is invalid: ' + JSON.stringify(result, null, 2))
      }

      return result
    }

    throw new Error('pollAuthz() timed out')
  }

  async readyChallenge (challenge) {
    const data = await this.sign(
      {
        kid: this.myAccountUrl,
        nonce: this.replayNonce,
        url: challenge.url
      },
      {}
    )

    const res = await request(challenge.url, {
      method: 'POST',

      headers: {
        'content-type': 'application/jose+json'
      },

      data
    })

    this.setReplayNonce(res)

    if (res.statusCode !== 200) {
      throw new Error(`readyChallenge() Status Code: ${res.statusCode} Data: ${res.data}`)
    }
  }

  receiveServerRequest (challenge, cb) {
    this.server?.close()
    this.server = http.createServer()

    return new Promise((resolve, reject) => {
      this.server
        .once('error', reject)
        .on('request', (req, res) => {
          if (req.method !== 'GET') {
            res.writeHead(405)
            res.writeHead(http.STATUS_CODES[405])
            return
          }

          if (req.url !== '/.well-known/acme-challenge/' + challenge.token) {
            res.writeHead(404)
            res.end(http.STATUS_CODES[404])
            return
          }

          res.writeHead(200, {
            'content-type': 'application/octet-stream'
          })

          res.end(challenge.token + '.' + this.thumbprint)
          resolve()
        })

      this.server.listen(80, '0.0.0.0')

      setTimeout(() => {
        reject(new Error('Timed out waiting for server request'))
      }, 10e3)

      cb && cb()
    })
  }

  setReplayNonce (res) {
    const replayNonce = (res.headers['replay-nonce'] || '').trim()

    if (!replayNonce) {
      throw new Error('No Replay-Nonce header in response')
    }

    this.replayNonce = replayNonce
  }

  async sign (header, payload) {
    let data

    if (payload) {
      data = await new SignJWT(payload)
        .setProtectedHeader({ alg: common.ACCOUNT_KEY_ALGORITHM, ...header })
        .sign(this.accountPrivateKey)
    } else {
      // SignJWT constructor only accepts object but RFC8555 requires empty payload
      // Workaround: manually pass empty Uint8Array to CompactSign constructor
      const sig = new CompactSign(new Uint8Array())
      sig.setProtectedHeader({ alg: common.ACCOUNT_KEY_ALGORITHM, ...header })
      data = await sig.sign(this.accountPrivateKey)
    }

    const [b64Header, b64Payload, b64Signature] = data.split('.')

    return JSON.stringify({
      protected: b64Header,
      payload: b64Payload,
      signature: b64Signature
    })
  }
}

module.exports = Client
