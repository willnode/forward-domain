const tls = require('tls');
const certnode = require('./certnode/lib');
const fs = require('fs');
const path = require('path');
const {
    md5,
    ensureDir,
    findTxtRecord
} = require('./util');
const { default: AwaitLock } = require('await-lock');
const record_email_prefix = 'forward-domain-cert-maintainer=';
const client = new certnode.Client();
const certsDir = path.join(__dirname, '../.certs');

/**
 * @type {Object<string, {cert: any, key: any, expire: number}>}
 */
const resolveCache = {};

function getCertCachePath(host) {
    const hash = md5(host);
    return path.join(certsDir, hash.substr(0, 2), hash.substr(2), host);
}

async function findMaintainerEmail(host) {
    return await findTxtRecord(host, record_email_prefix);
}

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
        const key = await fs.promises.readFile(keyP, 'utf8')
        return {
            cert,
            key,
            expire
        };
    } catch (error) {
        const {
            certificate,
            privateKeyData
        } = await client.generateCertificate(host, await findMaintainerEmail(host));
        await fs.promises.writeFile(certP, certificate);
        await certnode.writeKeyToFile(keyP, privateKeyData, '');
        const expire = (Date.now() + 45 * 86400 * 1000);
        await fs.promises.writeFile(extP, expire.toString());
        return {
            cert: certificate,
            key: privateKeyData,
            expire
        };
    }

}

async function getKeyCert(servername) {
    let cache = resolveCache[servername];
    await ensureDir(certsDir);
    if (!cache || (Date.now() > cache.expire)) {
        cache = await buildCache(servername);
        resolveCache[servername] = cache;
    }
    return {
        key: cache.key,
        cert: cache.cert,
    }
}

let lock = new AwaitLock();

const SniListener = async (servername, ctx) => {
    // Generate fresh account keys for Let's Encrypt
    await lock.acquireAsync();
    try {
        ctx(null, tls.createSecureContext(await getKeyCert(servername)));
    } catch (error) {
        console.log(JSON.stringify(error));
        ctx(error, null);
    } finally {
        lock.release();
    }
}

const SniPrepare = async () => {
    await client.generateAccountKeyPair()
    await ensureDir(certsDir);
}

module.exports = {
    SniListener,
    SniPrepare,
    client,
}