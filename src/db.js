
import sqlite3 from "sqlite3";
import * as sqlite from "sqlite";
import { derToPem } from "./util.js";
import { X509Certificate, createPrivateKey } from "crypto";


/**
 * @typedef {Object} CertCache
 * @property {string} cert PEM
 * @property {string} key PEM
 * @property {number} expire
 * 
 */

/**
 * @typedef {Object} CertRow
 * @property {string} domain
 * @property {Buffer} key DER
 * @property {Buffer} cert DER
 * @property {number} expire
 */

export class CertsDB {
    constructor() {
        this.db = null
    }
    /**
     * @param {string} path
     */
    async initialize(path) {
        this.db = await sqlite.open({
            driver: sqlite3.Database,
            filename: path,
        })
        // stored as BLOB DER format (fewer bytes), but node need PEM
        await this.db.run(`CREATE TABLE IF NOT EXISTS certs (
            domain TEXT UNIQUE,
            key BLOB,
            cert BLOB,
            expire INTEGER
        )`);
        await this.db.run(`CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);
        await this.db.run(`INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)`,
            ['version', '3'],
        )
    }
    initialized() {
        return this.db !== null;
    }
    /**
     * 
     * @param {string} domain 
     * @returns {Promise<CertRow | undefined>}
     */
    async resolveCert(domain) {
        if (!this.db) {
            throw new Error("DB is not initialized")
        }
        return await this.db.get(`SELECT * FROM certs WHERE domain = ?`, [domain]);
    }
    /**
     * @param {string} domain 
     * @returns {Promise<CertCache>}
     */
    async resolveCertAsCache(domain) {
        if (!this.db) {
            throw new Error("DB is not initialized")
        }
        const row = await this.resolveCert(domain);
        if (!row) {
            throw new Error("Domain not found")
        }
        return {
            cert: derToPem(row.cert, "public"),
            key: derToPem(row.key, "private"),
            expire: row.expire,
        };
    }
    /**
     * @param {string} domain 
     * @param {Buffer} key
     * @param {Buffer} cert
     * @param {number} expire
     * @returns {Promise<CertRow>}
     */
    async saveCert(domain, key, cert, expire) {
        if (!this.db) {
            throw new Error("DB is not initialized")
        }
        const insertQuery = `INSERT INTO certs (domain, key, cert, expire) VALUES (?, ?, ?, ?)`;
        await this.db.run(insertQuery, [domain,
            key,
            cert,
            expire,
        ]);
        return {
            domain, key, cert, expire
        }
    }
    /**
     * @param {string} domain 
     * @param {string} key
     * @param {string} cert
     */
    async saveCertFromCache(domain, key, cert) {
        const x509 = new X509Certificate(cert);
        return await this.saveCert(domain, createPrivateKey({
                key: key,
                type: "pkcs8",
                format: "pem",
            }).export({
                format: "der",
                type: "pkcs8",
            }),
            x509.raw,
            Date.parse(x509.validTo),
        )
    }
}