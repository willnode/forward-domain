import crypto from "node:crypto";
import fs from "node:fs";
export const ACCOUNT_KEY_ALGORITHM = 'ES256';
export const CERTIFICATE_KEY_ALGORITHM = 'RS256';
export const DIRECTORY_URL = {
    'production': 'https://acme-v02.api.letsencrypt.org/directory',
    'development': 'https://acme-staging-v02.api.letsencrypt.org/directory',
    'test': 'http://localhost:8888/directory',
}[(process.env.NODE_ENV || 'development').trim().toLowerCase()]
export const PRIVATE_KEY_CIPHER = 'aes-256-cbc';
export const PRIVATE_KEY_FORMAT = 'pem';
export const PRIVATE_KEY_PERMISSIONS = 0o600;
export const PRIVATE_KEY_TYPE = 'pkcs8';
export const PUBLIC_KEY_FORMAT = 'pem';
export const PUBLIC_KEY_PERMISSIONS = 0o666;
export const PUBLIC_KEY_TYPE = 'spki';
/**
 * @param  {crypto.KeyObject} privateKey
 * @param  {String}           [passphrase]
 *
 */
export const exportPrivateKey = (privateKey, passphrase) => {
    /** @type {crypto.KeyExportOptions<'pem'>} */
    const privateKeyOpts = {
        type: PRIVATE_KEY_TYPE,
        format: PRIVATE_KEY_FORMAT
    };
    if (passphrase) {
        privateKeyOpts.cipher = PRIVATE_KEY_CIPHER;
        privateKeyOpts.passphrase = passphrase;
    }
    return privateKey.export(privateKeyOpts);
};
/**
 * @param  {crypto.KeyObject} publicKey
 */
export const exportPublicKey = publicKey => {
    /** @type {crypto.KeyExportOptions<'pem'>} */
    return publicKey.export({
        type: PUBLIC_KEY_TYPE,
        format: PUBLIC_KEY_FORMAT
    });
};
/**
 * @param  {String} privateKeyData
 * @param  {String} [passphrase]
 *
 * @return {crypto.KeyObject}
 */
export const importPrivateKey = (privateKeyData, passphrase) => {
    /** @type {crypto.PrivateKeyInput} */
    const privateKeyOpts = {
        key: privateKeyData,
        format: PRIVATE_KEY_FORMAT,
        type: PRIVATE_KEY_TYPE
    };
    if (passphrase) {
        privateKeyOpts.passphrase = passphrase;
    }
    try {
        return crypto.createPrivateKey(privateKeyOpts);
    }
    catch {
        throw new Error('Failed to import private key');
    }
};
/**
 * @param  {String} publicKeyData
 *
 * @return {crypto.KeyObject}
 */
export const importPublicKey = publicKeyData => {
    try {
        return crypto.createPublicKey({
            key: publicKeyData,
            format: PUBLIC_KEY_FORMAT,
            type: PUBLIC_KEY_TYPE
        });
    }
    catch {
        throw new Error('Failed to import public key');
    }
};
/**
 * @param  {String}                    filename
 * @param  {crypto.KeyObject|string} key
 * @param  {String}                    [passphrase]
 *
 * @return {Promise}
 */
export const writeKeyToFile = async (filename, key, passphrase) => {
    if (typeof key === 'string') {
        key = key.includes('PRIVATE KEY')
            ? importPrivateKey(key, passphrase)
            : importPublicKey(key);
    }
    else if (!(key instanceof crypto.KeyObject)) {
        throw new Error('Expected "key" to be crypto.KeyObject or string');
    }
    const isPrivateKey = key.type === 'private';
    const keyData = isPrivateKey
        ? exportPrivateKey(key, passphrase)
        : exportPublicKey(key);
    const mode = isPrivateKey ? PRIVATE_KEY_PERMISSIONS : PUBLIC_KEY_PERMISSIONS;
    await fs.promises.writeFile(filename, keyData, { mode });
};

