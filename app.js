// production endpoint (use pm2/phusion/whatever)

const argv = require('minimist')(process.argv.slice(2));
const app = require("./index.js");

const https = require('https');
const tls = require('tls');
const certnode = require('certnode')
const fs = require('fs');
const {
    default: axios
} = require('axios');
const path = require('path');
const record_email_prefix = 'forward-domain-cert-maintainer=';
const client = new certnode.Client();
const certsDir = path.join(__dirname, '.certs');
var crypto = require('crypto');

/**
 * @type {Object<string, {cert: any, key: any, expire: number}>}
 */
const resolveCache = {};

function md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

function getCertCachePath(host) {
    const hash = md5(host);
    return path.join(certsDir, hash.substr(0, 2), hash.substr(2), host);
}
async function findMaintainerEmail(host) {
    const resolve = await axios(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=TXT`);
    for (const head of resolve.data.Answer) {
        return head.data.slice(record_email_prefix.length);
    }
    throw new Error(record_email_prefix + ' TXT is missing');
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
            throw null; // expired
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

async function ensureDir(dir) {
    try {
        await fs.promises.access(dir, fs.constants.W_OK | fs.constants.O_DIRECTORY);
    } catch (error) {
        await fs.promises.mkdir(dir, {
            recursive: true
        });
    }
}
const main = async () => {
    await client.generateAccountKeyPair()
    await ensureDir(certsDir);
    const httpsServer = https.createServer({
        SNICallback: async (servername, ctx) => {
            // Generate fresh account keys for Let's Encrypt
            try {
                return tls.createSecureContext(await getKeyCert(servername))
            } catch (error) {
                ctx(error, null);
            }
        }
    }, app.listeners[0]);

};


// if (!argv.maintainerEmail)
//     throw new Error('--maintainerEmail is required');

// require("greenlock-express")
//     .init({
//         packageRoot: __dirname,
//         configDir: "./greenlock.d",
//         // contact for security and critical bug notices
//         maintainerEmail: argv.maintainerEmail,
//         // whether or not to run at cloudscale
//         cluster: false
//     })
//     // Serves on 80 and 443
//     // Get's SSL certificates magically!
//     .serve(app);