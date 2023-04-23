import tls from "tls";
import { Client, writeKeyToFile } from "./certnode/lib/index.js";
import fs from "fs";
import path from "path";
import { md5, ensureDir } from "./util.js";
import AsyncLock from 'async-lock';

const lock = new AsyncLock();
const __dirname = new URL('.', import.meta.url).pathname;
const certsDir = path.join(__dirname, '../.certs');
const accountDir = path.join(__dirname, '../.certs/account');
const client = new Client();

/**
 * @typedef {Object} Cache
 * @property {string} cert
 * @property {string} key
 * @property {number} expire
 * 
 */

/**
 * @type {Object<string, Cache>}
 */
const resolveCache = {};

/**
 * @param {string} host
 */
function getCertCachePath(host) {
    const hash = md5(host);
    return path.join(certsDir, hash.substring(0, 2), hash.substring(2), host);
}
/**
 * @param {string} host
 */
async function buildCache(host) {
    const dir = getCertCachePath(host);
    const keyP = path.join(dir, 'privateKey.pem');
    const certP = path.join(dir, 'publicKey.pem');
    const extP = path.join(dir, 'expire');
    await ensureDir(dir);
    try {
        await fs.promises.access(keyP, fs.constants.R_OK | fs.constants.W_OK);
        await fs.promises.access(certP, fs.constants.R_OK | fs.constants.W_OK);
        await fs.promises.access(extP, fs.constants.R_OK | fs.constants.W_OK);
        const expire = parseInt((await fs.promises.readFile(extP)).toString('utf8'));
        if (Date.now() > expire)
            throw new Error('expired'); // expired
        const cert = await fs.promises.readFile(certP, 'utf8');
        const key = await fs.promises.readFile(keyP, 'utf8');
        return {
            cert,
            key,
            expire
        };
    }
    catch (error) {
        // only one process can generate certificate at a time
        return await lock.acquire('cert', async () => {
            const { certificate, privateKeyData } = await client.generateCertificate(host);
            await fs.promises.writeFile(certP, certificate);
            await writeKeyToFile(keyP, privateKeyData, '');
            const expire = (Date.now() + 45 * 86400 * 1000);
            await fs.promises.writeFile(extP, expire.toString());
            return {
                cert: certificate,
                key: privateKeyData,
                expire
            };
        });
    }
}
/**
 * @param {string} servername
 */
async function getKeyCert(servername) {
    // Had to use lock because the best authenticator
    // library seems don't yet fully stateless.
    servername = servername.toLowerCase();
    let cache = resolveCache[servername];
    await ensureDir(certsDir);
    if (!cache || (Date.now() > cache.expire)) {
        cache = await buildCache(servername);
        resolveCache[servername] = cache;
    }
    return {
        key: cache.key,
        cert: cache.cert,
    };
}
/**
 * @param {string} servername
 * @param {(err: any, cb: tls.SecureContext|undefined) => void} ctx
 */
async function SniListener(servername, ctx) {
    // Generate fresh account keys for Let's Encrypt
    try {
        ctx(null, tls.createSecureContext(await getKeyCert(servername)));
    }
    catch (error) {
        console.log(error);
        ctx(error, undefined);
    }
}
const SniPrepare = async () => {
    await ensureDir(certsDir);
    await ensureDir(accountDir);
    if (fs.existsSync(path.join(accountDir, 'privateKey.pem')) &&
        fs.existsSync(path.join(accountDir, 'publicKey.pem'))) {
        await client.importAccountKeyPair(accountDir, '');
    }
    else {
        await client.generateAccountKeyPair();
        await client.exportAccountKeyPair(accountDir, '');
    }
};
export { SniListener, SniPrepare, client };
