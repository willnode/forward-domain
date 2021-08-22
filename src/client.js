const record_prefix = 'forward-domain=';
const path = require('path');
const {
    client
} = require('./sni');
const {
    findTxtRecord
} = require('./util');

/**
 * @type {Object<string, {expire: number, expand: boolean, url: string}>}
 */
const resolveCache = {};

async function buildCache(host) {
    let expand = false;
    let url = await findTxtRecord(host, record_prefix);
    if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
        throw new Error(url + ' in TXT record is not an absolute URL');
    }
    if (url.endsWith('*')) {
        url = url.slice(0, -1);
        expand = true;
    }
    return {
        url,
        expand,
        expire: Date.now() + 86400 * 1000,
    };
}

const acme_prefix = '/.well-known/acme-challenge/';

const listener = async function (/** @type {import('http').IncomingMessage} */ req, /** @type {import('http').ServerResponse} */ res) {
    try {
        if (req.url.startsWith(acme_prefix)) {
            const token = req.url.slice(acme_prefix.length);
            if (client.challengeCallbacks[token]) {
                res.write(client.challengeCallbacks[token]());
            } else {
                res.writeHead(404)
            }
            return;
        }

        let cache = resolveCache[req.headers.host];
        if (!cache || (Date.now() > cache.expire)) {
            cache = await buildCache(req.headers.host);
            resolveCache[req.headers.host] = cache;
        }
        res.writeHead(301, {
            'Location': cache.expand ? path.join(cache.url, req.url) : cache.url,
        });
        return;
    } catch (error) {
        res.writeHead(400);
        res.write(error.message || 'Unknown error');
    } finally {
        res.end();
    }
}

module.exports = listener;