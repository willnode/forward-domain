import fs from "fs";
import path from "path";
import { promisify } from "util";
import fromKeyLike from "jose/jwk/from_key_like";
import generateKeyPair from "jose/util/generate_key_pair";
import calculateThumbprint from "jose/jwk/thumbprint";
import SignJWT from "jose/jwt/sign";
import CompactSign from "jose/jws/compact/sign";
import pem from "pem";
import * as common from "./common.js";
import request from "./request.js";
const createCsr = promisify(pem.createCSR);
/**
 * Represents a Let's Encrypt account and
 * sends requests to get valid TLS certificates.
 */
class Client {
    /**
     * @param  {String} [directoryUrl]
     */
    constructor(directoryUrl = common.DIRECTORY_URL) {
        this.accountPrivateJwk = null;
        /** @type {import('crypto').KeyObject|null} */
        this.accountPrivateKey = null;
        /** @type {import("jose/types.js").JWK | undefined} */
        this.accountPublicJwk = undefined;
        /** @type {import('crypto').KeyObject|null} */
        this.accountPublicKey = null;
        this.directoryUrl = directoryUrl;
        this.challengeCallbacks = null;
        this.hasDirectory = false;
        this.myAccountUrl = '';
        this.newAccountUrl = '';
        this.newNonceUrl = '';
        this.newOrderUrl = '';
        this.replayNonce = '';
        this.thumbprint = '';
    }
    /**
     * Export account public and private keys to a directory.
     *
     * @param  {String} dirname      - name of directory to write key files to
     * @param  {String} [passphrase] - optional passphrase to encrypt private key with
     *
     * @return {Promise}
     */
    exportAccountKeyPair(dirname, passphrase) {
        if (this.accountPrivateKey == null || this.accountPublicKey == null) {
            return Promise.reject(new Error('Account key pair not generated'));
        }
        const privateKeyFile = path.join(dirname, 'privateKey.pem');
        const publicKeyFile = path.join(dirname, 'publicKey.pem');
        return Promise.all([
            common.writeKeyToFile(privateKeyFile, this.accountPrivateKey, passphrase),
            common.writeKeyToFile(publicKeyFile, this.accountPublicKey)
        ]);
    }
    /**
     * Generate new account public and private keys.
     *
     * @return {Promise}
     */
    async generateAccountKeyPair() {
        const { privateKey, publicKey } = await generateKeyPair(common.ACCOUNT_KEY_ALGORITHM);
        // @ts-ignore
        this.accountPrivateKey = privateKey;
        // @ts-ignore
        this.accountPublicKey = publicKey;
        await this.initAccountJwks();
    }
    /**
     * Generate a certificate from Let's Encrypt for your domain.
     *
     * @param  {String} domain - the domain you want a certificate for
     *
     * @return {Promise}
     */
    async generateCertificate(domain) {
        await this.directory();
        await this.newNonce();
        if (!this.myAccountUrl)
            await this.newAccount();
        const { authzUrls, finalizeUrl } = await this.newOrder(domain);
        const { challenge } = await this.authz(authzUrls[0]);
        await this.completeChallenge(challenge, domain);
        await this.pollAuthz(authzUrls[0]);
        const { certificate, privateKeyData } = await this.finalizeOrder(finalizeUrl, domain);
        return {
            certificate,
            privateKeyData
        };
    }
    /**
     * Import account public and private keys from a directory.
     *
     * @param  {String} dirname      - name of directory to read key files from
     * @param  {String} [passphrase] - optional passphrase to decrypt private key with
     *
     * @return {Promise}
     */
    async importAccountKeyPair(dirname, passphrase) {
        const [privateKeyData, publicKeyData] = await Promise.all([
            fs.promises.readFile(path.join(dirname, 'privateKey.pem'), 'utf8'),
            fs.promises.readFile(path.join(dirname, 'publicKey.pem'), 'utf8')
        ]);
        this.accountPrivateKey = common.importPrivateKey(privateKeyData, passphrase);
        this.accountPublicKey = common.importPublicKey(publicKeyData);
        await this.initAccountJwks();
    }
    async authz(authzUrl) {
        const data = await this.sign({
            kid: this.myAccountUrl,
            nonce: this.replayNonce,
            url: authzUrl
        });
        const res = await request(authzUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/jose+json'
            },
            data
        });
        this.setReplayNonce(res);
        if (res.statusCode !== 200) {
            throw new Error(`authz() Status Code: ${res.statusCode} Data: ${res.data}`);
        }
        const { challenges, identifier, ...rest } = res.data;
        const challenge = challenges.find(({ type }) => type === 'http-01');
        return {
            challenge,
            domain: identifier.value,
            ...rest
        };
    }
    async completeChallenge(challenge, domain) {
        await this.readyChallenge(challenge);
        await this.receiveServerRequest(challenge, domain);
    }
    async directory() {
        if (this.hasDirectory)
            return false;
        const res = await request(this.directoryUrl);
        if (res.statusCode !== 200) {
            throw new Error(`directory() Status Code: ${res.statusCode} Data: ${res.data}`);
        }
        this.hasDirectory = true;
        this.newAccountUrl = res.data.newAccount;
        this.newNonceUrl = res.data.newNonce;
        this.newOrderUrl = res.data.newOrder;
        return true;
    }
    async fetchCertificate(certificateUrl) {
        const data = await this.sign({
            kid: this.myAccountUrl,
            nonce: this.replayNonce,
            url: certificateUrl
        });
        const res = await request(certificateUrl, {
            method: 'POST',
            headers: {
                accept: 'application/pem-certificate-chain',
                'content-type': 'application/jose+json'
            },
            data
        });
        this.setReplayNonce(res);
        if (res.statusCode !== 200) {
            throw new Error(`fetchCertificate() Status Code: ${res.statusCode} Data: ${res.data}`);
        }
        return res.data;
    }
    async finalizeOrder(finalizeUrl, domain) {
        const { privateKey } = await generateKeyPair(common.CERTIFICATE_KEY_ALGORITHM);
        // @ts-ignore
        const clientKey = common.exportPrivateKey(privateKey);
        let { csr
        // @ts-ignore
         } = await createCsr({
            clientKey,
            commonName: domain,
        });
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
            .replace(/=/g, '');
        const data = await this.sign({
            kid: this.myAccountUrl,
            nonce: this.replayNonce,
            url: finalizeUrl
        }, {
            csr
        });
        const res = await request(finalizeUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/jose+json'
            },
            data
        });
        this.setReplayNonce(res);
        if (res.statusCode !== 200) {
            throw new Error(`finalizeOrder() Status Code: ${res.statusCode} Data: ${res.data}`);
        }
        const certificate = await this.fetchCertificate(res.data.certificate);
        return {
            certificate,
            privateKeyData: clientKey
        };
    }
    async initAccountJwks() {
        if (this.accountPrivateKey == null || this.accountPublicKey == null) {
            return Promise.reject(new Error('Account key pair not generated'));
        }
        const [publicJwk, accountPrivateJwk] = await Promise.all([
            fromKeyLike(this.accountPublicKey),
            fromKeyLike(this.accountPrivateKey)
        ]);
        this.accountPublicJwk = publicJwk;
        this.accountPrivateJwk = accountPrivateJwk;
        this.thumbprint = await calculateThumbprint(publicJwk);
    }
    async newAccount(...emails) {
        const data = await this.sign({
            jwk: this.accountPublicJwk,
            nonce: this.replayNonce,
            url: this.newAccountUrl
        }, {
            termsOfServiceAgreed: true
        });
        const res = await request(this.newAccountUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/jose+json'
            },
            data
        });
        this.setReplayNonce(res);
        if (![200, 201].includes(res.statusCode)) {
            throw new Error(`newAccount() Status Code: ${res.statusCode} Data: ${res.data}`);
        }
        this.myAccountUrl = res.headers.location;
        return res.statusCode === 201;
    }
    async newNonce() {
        if (this.replayNonce)
            return false;
        const res = await request(this.newNonceUrl, {
            method: 'HEAD'
        });
        if (res.statusCode !== 200) {
            throw new Error(`newNonce() Status Code: ${res.statusCode} Data: ${res.data}`);
        }
        this.setReplayNonce(res);
        return true;
    }
    async newOrder(...domains) {
        const identifiers = domains.map(domain => ({
            type: 'dns',
            value: domain
        }));
        const data = await this.sign({
            kid: this.myAccountUrl,
            nonce: this.replayNonce,
            url: this.newOrderUrl
        }, {
            identifiers
        });
        const res = await request(this.newOrderUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/jose+json'
            },
            data
        });
        this.setReplayNonce(res);
        if (res.statusCode !== 201) {
            throw new Error(`newOrder() Status Code: ${res.statusCode} Data: ${res.data}`);
        }
        const orderUrl = res.headers.location;
        const { authorizations: authzUrls, finalize: finalizeUrl } = res.data;
        return {
            authzUrls,
            domains,
            finalizeUrl,
            orderUrl
        };
    }
    async pollAuthz(authzUrl) {
        for (let i = 0; i < 10; i++) {
            const result = await this.authz(authzUrl);
            if (result.status === 'pending') {
                await new Promise(resolve => setTimeout(resolve, 1e3));
                continue;
            }
            if (result.status === 'invalid') {
                throw new Error('pollAuthz() authorization is invalid: ' + JSON.stringify(result, null, 2));
            }
            return result;
        }
        throw new Error('pollAuthz() timed out');
    }
    async readyChallenge(challenge) {
        const data = await this.sign({
            kid: this.myAccountUrl,
            nonce: this.replayNonce,
            url: challenge.url
        }, {});
        const res = await request(challenge.url, {
            method: 'POST',
            headers: {
                'content-type': 'application/jose+json'
            },
            data
        });
        this.setReplayNonce(res);
        if (res.statusCode !== 200) {
            throw new Error(`readyChallenge() Status Code: ${res.statusCode} Data: ${res.data}`);
        }
    }
    receiveServerRequest(challenge, domain) {
        return new Promise((resolve, reject) => {
            const time = setTimeout(() => {
                reject(new Error('Timed out waiting for server request'));
            }, 10e3);
            let hasResolved = false;
            this.challengeCallbacks = () => {
                if (!hasResolved)
                    setTimeout(resolve, 100);
                else
                    return challenge.token + '.' + this.thumbprint;
                hasResolved = true;
                clearTimeout(time);
                // wanted to clear callbacks here but LE does the call multiple times.
                // remember we're in mutex lock so no worries for racing.
                return challenge.token + '.' + this.thumbprint;
            };
        });
    }
    setReplayNonce(res) {
        const replayNonce = (res.headers['replay-nonce'] || '').trim();
        if (!replayNonce) {
            throw new Error('No Replay-Nonce header in response');
        }
        this.replayNonce = replayNonce;
    }
    /**
     * @param {import("jose/types.js").JWSHeaderParameters} header
     * @param {import("jose/types.js").JWTPayload | undefined} [payload]
     */
    async sign(header, payload) {
        if (this.accountPrivateKey == null) {
            return Promise.reject(new Error('Account key pair not generated'));
        }
        let data;
        if (payload) {
            data = await new SignJWT(payload)
                .setProtectedHeader({
                alg: common.ACCOUNT_KEY_ALGORITHM,
                ...header
            })
                .sign(this.accountPrivateKey);
        }
        else {
            // SignJWT constructor only accepts object but RFC8555 requires empty payload
            // Workaround: manually pass empty Uint8Array to CompactSign constructor
            const sig = new CompactSign(new Uint8Array());
            sig.setProtectedHeader({
                alg: common.ACCOUNT_KEY_ALGORITHM,
                ...header
            });
            data = await sig.sign(this.accountPrivateKey);
        }
        const [b64Header, b64Payload, b64Signature] = data.split('.');
        return JSON.stringify({
            protected: b64Header,
            payload: b64Payload,
            signature: b64Signature
        });
    }
}
export default Client;
