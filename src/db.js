
import sqlite from "better-sqlite3";
import { derToPem, getCertExpiry, initMap, pemToDer } from "./util.js";
import { migrateFromV2, migrateFromV3 } from "./tools/migrate.js";
import { dirname } from "node:path";

/**
 * @typedef {Object} CertConfig
 * @property {string} version
 * @property {string} accountPrivateKey PEM
 * @property {string} accountPublicKey
 * 
 */

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
 * @property {Buffer} ca DER
 * @property {number} expire
 */

export class CertsDB {
    /**
     * @param {string} path
     */
    constructor(path) {
        const db = sqlite(path);
        // stored as BLOB DER format (fewer bytes), but node need PEM
        db.prepare(`CREATE TABLE IF NOT EXISTS certs (
                    domain TEXT UNIQUE,
                    key BLOB,
                    cert BLOB,
                    ca BLOB,
                    expire INTEGER
                )`).run();
        db.prepare(`CREATE TABLE IF NOT EXISTS config (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )`).run();


        this.load_conf_stmt = db.prepare(`SELECT * FROM config`)
        this.save_conf_stmt = db.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`)

        this.db = db;
        this.config = this.loadConfig();
        if (!this.config.version) {
            migrateFromV2(dirname(path), this);
            this.config.version = '4';
            this.saveConfig('version', this.config.version);
        } else if (this.config.version === '3') {
            migrateFromV3(this);
            this.config.version = '4';
            this.saveConfig('version', this.config.version);
        }

        this.save_cert_stmt = db.prepare(`INSERT OR REPLACE INTO certs (domain, key, cert, ca, expire) VALUES (?, ?, ?, ?, ?)`)
        this.load_cert_stmt = db.prepare(`SELECT * FROM certs WHERE domain = ?`)
        this.count_cert_stmt = db.prepare(`SELECT COUNT(*) as domains FROM certs`)
    }
    close() {
        this.db.close();
    }
    loadConfig() {
        const keys = initMap();

        for (const row of this.load_conf_stmt.all()) {
            // @ts-ignore
            keys[row.key] = row.value;
        }
        return keys;
    }
    /**
     * 
     * @returns {Partial<CertConfig>}
     */
    getConfig() {
        return this.config;
    }
    /**
     * @param {string} key
     * @param {string} value
     */
    saveConfig(key, value) {
        this.config[key] = value;
        this.save_conf_stmt.run(key, value);
    }
    /**
     * 
     * @param {string} domain 
     * @returns {CertRow}
     */
    resolveCert(domain) {
        // @ts-ignore
        return this.load_cert_stmt.get(domain);
    }
    /**
     * 
     * @returns {number}
     */
    countCert() {
        // @ts-ignore
        return this.count_cert_stmt.get().domains;
    }
    /**
     * @param {string} domain 
     * @returns {CertCache}
     */
    resolveCertAsCache(domain) {
        const row = this.resolveCert(domain);
        if (!row) {
            throw new Error("Domain not found")
        }
        return {
            cert: derToPem([row.cert, row.ca], "certificate"),
            key: derToPem(row.key, "private"),
            expire: row.expire,
        };
    }
    /**
     * @param {string} domain 
     * @param {Buffer} key
     * @param {Buffer} cert
     * @param {Buffer} ca
     * @param {number} expire
     * @returns {CertRow}
     */
    saveCert(domain, key, cert, ca, expire) {
        if (!this.save_cert_stmt) {
            throw new Error("DB is not initialized")
        }
        this.save_cert_stmt.run([domain,
            key,
            cert,
            ca,
            expire,
        ]);
        return {
            domain, key, cert, ca, expire
        }
    }
    /**
     * @param {string} domain 
     * @param {string} key
     * @param {string} cert
     */
    saveCertFromCache(domain, key, cert) {
        const keyBuffer = pemToDer(key)[0];
        const certBuffers = pemToDer(cert);
        return this.saveCert(domain,
            keyBuffer,
            certBuffers[0],
            certBuffers[1],
            getCertExpiry(cert),
        )
    }
}
