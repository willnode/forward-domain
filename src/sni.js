import tls from "tls";
import { Client } from "./certnode/lib/index.js";
import fs from "fs";
import path from "path";
import { ensureDir, blacklistRedirectUrl, isIpAddress, isHostBlacklisted, ensureDirSync } from "./util.js";
import AsyncLock from 'async-lock';
import { CertsDB } from "./db.js";

const lock = new AsyncLock();
// the regex is for Windows shenanigans
const __dirname = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:\/)/, '$1');
const certsDir = path.join(__dirname, '../.certs');
const accountDir = path.join(__dirname, '../.certs/account');
const dbFile = path.join(__dirname, '../.certs/db.sqlite');
const client = new Client();
ensureDirSync(certsDir);
const db = new CertsDB(dbFile);

/**
 * @type {Record<string, import("./db.js").CertCache>}
 */
let resolveCache = {};

function pruneCache() {
    resolveCache = {};
}

/**
 * @param {string} host
 * @returns {Promise<import("./db.js").CertCache | null>}
 */
async function buildCache(host) {
    try {
        let data = db.resolveCertAsCache(host);
        if (Date.now() > data.expire)
            throw new Error('expired');
        return data;
    }
    catch {
        if ((isHostBlacklisted(host) && !blacklistRedirectUrl) || isIpAddress(host)) {
            return null;
        }

        // can only process one certificate generation at a time
        return await lock.acquire('cert', async () => {
            const { cert, key } = await client.generateCertificate(host);
            const { expire } = db.saveCertFromCache(host, key, cert);
            return {
                cert,
                key,
                expire,
            };
        });
    }
}
/**
 * @param {string} servername
 */
async function getKeyCert(servername) {
    servername = servername.toLowerCase();
    const cache = resolveCache[servername];
    if (!cache || (Date.now() > cache.expire)) {
        let cacheNew = await buildCache(servername);
        if (!cacheNew) {
            return undefined;
        }
        resolveCache[servername] = cacheNew;
        return {
            key: cacheNew.key,
            cert: cacheNew.cert,
        }
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
        const keyCert = await getKeyCert(servername);
        ctx(null, keyCert && tls.createSecureContext(keyCert));
    }
    catch (error) {
        console.log(error);
        ctx(error, undefined);
    }
}

const SniPrepare = async () => {
    await ensureDir(accountDir);
    if (fs.existsSync(path.join(accountDir, 'privateKey.pem')) &&
        fs.existsSync(path.join(accountDir, 'publicKey.pem'))) {
        await client.importAccountKeyPair(accountDir, '');
    } else {
        console.log("Creating new account key pair");
        await client.generateAccountKeyPair();
        await client.exportAccountKeyPair(accountDir, '');
    }
};

const SniDispose = () => {
    db.close();
}

export {
    SniListener,
    SniPrepare,
    SniDispose,
    pruneCache,
    client,
};
