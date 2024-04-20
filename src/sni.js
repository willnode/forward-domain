import tls from "tls";
import { Client } from "./certnode/lib/index.js";
import fs from "fs";
import path from "path";
import { ensureDir, blacklistRedirectUrl, isIpAddress, isHostBlacklisted, derToPem } from "./util.js";
import AsyncLock from 'async-lock';
import sqlite3 from "sqlite3";
import * as sqlite from "sqlite";
import { X509Certificate, createPrivateKey } from "crypto";

const lock = new AsyncLock();
// the regex is for Windows shenanigans
const __dirname = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:\/)/, '$1');
const certsDir = path.join(__dirname, '../.certs');
const accountDir = path.join(__dirname, '../.certs/account');
const dbDir = path.join(__dirname, '../.certs/db.sqlite');
const client = new Client();
/**
 * @type {sqlite.Database<sqlite3.Database, sqlite3.Statement>}
 */
let db;

/**
 * @typedef {Object} Cache
 * @property {string} cert
 * @property {string} key
 * @property {number} expire
 * 
 */

/**
 * @type {Record<string, Cache>}
 */
const resolveCache = {};

/**
 * @param {string} host
 */
async function buildCache(host) {
    if (!db) {
        throw new Error("db is not initialized");
    }
    try {
        let data = await db.get(`SELECT * FROM certs WHERE domain = ?`, [host]);
        if (Date.now() > data.expirationDate)
            throw new Error('expired'); // expired
        return {
            cert: derToPem(data.publicKey, "public"),
            key: derToPem(data.privateKey, "private"),
            expire: data.expirationDate,
        };
    }
    catch {
        if ((isHostBlacklisted(host) && !blacklistRedirectUrl) || isIpAddress(host)) {
            return null;
        }

        // can only process one certificate generation at a time
        return await lock.acquire('cert', async () => {
            const insertQuery = `INSERT INTO certs (domain, privateKey, publicKey, expirationDate) VALUES (?, ?, ?, ?)`;
            const { certificate, privateKeyData } = await client.generateCertificate(host);
            const expire = Date.now() + 45 * 86400 * 1000;
            await db.run(insertQuery, [host,
                createPrivateKey({
                    key: privateKeyData,
                    type: "pkcs8",
                    format: "pem",
                }).export({
                    format: "der",
                    type: "pkcs8",
                }),
                new X509Certificate(certificate).raw,
                expire,
            ]);
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
    servername = servername.toLowerCase();
    const cache = resolveCache[servername];
    if (!cache || (Date.now() > cache.expire)) {
        await ensureDir(certsDir);
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
    await ensureDir(certsDir);
    await ensureDir(accountDir);
    if (fs.existsSync(path.join(accountDir, 'privateKey.pem')) &&
        fs.existsSync(path.join(accountDir, 'publicKey.pem'))) {
        await client.importAccountKeyPair(accountDir, '');
    } else {
        console.log("Creating new account key pair");
        await client.generateAccountKeyPair();
        await client.exportAccountKeyPair(accountDir, '');
    }
    db = await sqlite.open({
        driver: sqlite3.Database,
        filename: dbDir,
    })
    // stored as BLOB DER format (fewer bytes), but node need PEM
    await db.run(`CREATE TABLE IF NOT EXISTS certs (
        domain TEXT UNIQUE,
        privateKey BLOB,
        publicKey BLOB,
        expirationDate INTEGER
    )`);
    await db.run(`CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);
    await db.run(`INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)`,
        ['version', '1'],
    )
};
export { SniListener, SniPrepare, client };
