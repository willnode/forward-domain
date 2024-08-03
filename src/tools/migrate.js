import fs from 'fs';
import path from 'path';

/**
 * @param {string} dir
 * @param {import('../db.js').CertsDB} db
 */
function migrateWalkDir(dir, db, count = 0) {
    const files = fs.readdirSync(dir);
    /**
     * @type {string[]}
     */
    let curFiles = []
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            count = migrateWalkDir(filePath, db, count); // Recurse into subdirectory
        } else {
            curFiles.push(file); // Add file path to list
        }
    });
    if (curFiles.includes("expire") && curFiles.includes("privateKey.pem") && curFiles.includes("publicKey.pem")) {
        let host = path.basename(dir);
        // add to db if not exists
        if (!db.resolveCert(host)) {
            process.stdout.write(`Added ${++count} domains from v2\r`);
            db.saveCertFromCache(host,
                fs.readFileSync(path.join(dir, "privateKey.pem"), { encoding: 'utf-8' }),
                fs.readFileSync(path.join(dir, "publicKey.pem"), { encoding: 'utf-8' }),
            )
        } else {
            process.stdout.write(`skipped ${count}\n`);

        }
    }

    return count;
}

/**
 * @param {string} dir
 * @param {import('../db.js').CertsDB} db
 */
export function migrateFromV2(dir, db) {
    // check if v2 account exists, try migrate then.

    if (!fs.existsSync(path.join(dir, "account/privateKey.pem")) || !fs.existsSync(path.join(dir, "account/publicKey.pem"))) {
        return;
    }
    process.stdout.write(`Begin v2 -> v3 migration sessions\n`);

    let config = db.getConfig();
    if (!config.accountPrivateKey || !config.accountPublicKey) {
        process.stdout.write(`Account keys imported from v2\n`);
        config.accountPrivateKey = fs.readFileSync(path.join(dir, "account/privateKey.pem"), { encoding: 'utf-8' });
        config.accountPublicKey = fs.readFileSync(path.join(dir, "account/publicKey.pem"), { encoding: 'utf-8' });
        db.saveConfig('accountPublicKey', config.accountPublicKey || '');
        db.saveConfig('accountPrivateKey', config.accountPrivateKey || '');
    }

    migrateWalkDir(dir, db);
    process.stdout.write(`\nImport completed\n`);
}

/**
 * @param {import('../db.js').CertsDB} db
 */
export function migrateFromV3({ db }) {
    // check if v2 account exists, try migrate then.

    process.stdout.write(`Begin v3 -> v4 migration sessions\n`);

    db.prepare(`ALTER TABLE certs ADD COLUMN ca BLOB`).run();

    process.stdout.write(`\nImport completed\n`);
}
