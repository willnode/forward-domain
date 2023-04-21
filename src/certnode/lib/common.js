import crypto from "crypto";
import jose from "jose";
import fs from "fs";
const ACCOUNT_KEY_ALGORITHM = 'ES256';
const CERTIFICATE_KEY_ALGORITHM = 'RS256';
const env = (process.env.NODE_ENV || '').trim().toLowerCase();
const DIRECTORY_URL = ['development', 'test'].includes(env)
    ? 'https://acme-staging-v02.api.letsencrypt.org/directory'
    : 'https://acme-v02.api.letsencrypt.org/directory';
const PRIVATE_KEY_CIPHER = 'aes-256-cbc';
const PRIVATE_KEY_FORMAT = 'pem';
const PRIVATE_KEY_PERMISSIONS = 0o600;
const PRIVATE_KEY_TYPE = 'pkcs8';
const PUBLIC_KEY_FORMAT = 'pem';
const PUBLIC_KEY_PERMISSIONS = 0o666;
const PUBLIC_KEY_TYPE = 'spki';
/**
 * @param  {jose.KeyLike} privateKey
 *
 */
const exportPrivateKey = (privateKey) => {
    return jose.exportPKCS8(privateKey);
};
/**
 * @param  {crypto.KeyObject} publicKey
 */
const exportPublicKey = publicKey => {
    /** @type {crypto.KeyExportOptions<'pem'>} */
    return publicKey.export({
        type: PUBLIC_KEY_TYPE,
        format: PUBLIC_KEY_FORMAT
    });
};
/**
 * @param  {String} privateKeyData
 *
 * @return {Promise<jose.KeyLike>}
 */
const  importPrivateKey = (privateKeyData) => {
    try {
        return jose.importPKCS8(privateKeyData, "");
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
const importPublicKey = publicKeyData => {
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
 * @param  {import('jose').KeyLike|string} key
 *
 * @return {Promise}
 */
const writeKeyToFile = async (filename, key) => {
    if (typeof key === 'string') {
        key = key.includes('PRIVATE KEY')
            ? importPrivateKey(key)
            : importPublicKey(key);
    }
    else if (!(key instanceof crypto.KeyObject)) {
        throw new Error('Expected "key" to be crypto.KeyObject or string');
    }
    const isPrivateKey = key.type === 'private';
    const keyData = isPrivateKey
        ? exportPrivateKey(key)
        : exportPublicKey(key);
    const mode = isPrivateKey ? PRIVATE_KEY_PERMISSIONS : PUBLIC_KEY_PERMISSIONS;
    await fs.promises.writeFile(filename, keyData, { mode });
};
export { ACCOUNT_KEY_ALGORITHM };
export { CERTIFICATE_KEY_ALGORITHM };
export { DIRECTORY_URL };
export { PRIVATE_KEY_CIPHER };
export { PRIVATE_KEY_FORMAT };
export { PRIVATE_KEY_PERMISSIONS };
export { PRIVATE_KEY_TYPE };
export { PUBLIC_KEY_FORMAT };
export { PUBLIC_KEY_PERMISSIONS };
export { PUBLIC_KEY_TYPE };
export { env };
export { exportPrivateKey };
export { exportPublicKey };
export { importPrivateKey };
export { importPublicKey };
export { writeKeyToFile };
export default {
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
};
