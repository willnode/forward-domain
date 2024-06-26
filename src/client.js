import { client, getStat } from "./sni.js";
import { HashMap } from "hashmap-with-ttl";
import {
    findTxtRecord,
    isHostBlacklisted,
    combineURLs,
    isIpAddress,
    blacklistRedirectUrl,
    isExceedLabelLimit,
    validateCAARecords,
    isExceedHostLimit,
    isHttpCodeAllowed
} from "./util.js";

/**
 * @typedef {Object} Cache
 * @property {string} url
 * @property {boolean} expand
 * @property {boolean} blacklisted
 * @property {number} expire
 * @property {number} httpStatus
 */
/**
 * @type {HashMap<Cache>}
 */
let resolveCache = new HashMap({ capacity: 10000 });

function pruneCache() {
    resolveCache = new HashMap({ capacity: 10000 });
}

/**
 * @param {string} host
 * @returns {Promise<Cache>}
 */
async function buildCache(host) {
    if (isIpAddress(host)) {
        // https://community.letsencrypt.org/t/90635/2
        throw new Error('unable to serve with direct IP address');
    }
    if (isExceedHostLimit(host)) {
        // https://stackoverflow.com/q/39035571/3908409
        throw new Error('Host name is too long (Must no more than 64 char)');
    }
    if (isExceedLabelLimit(host)) {
        // https://community.letsencrypt.org/t/138688/5
        throw new Error('Host parts is too long (Must less than 10 dots)');
    }
    let caaRecords = await validateCAARecords(host);
    if (caaRecords) {
        // https://community.letsencrypt.org/t/199119/2
        throw new Error(`CAA record is not "letsencrypt.org". Records found: ${caaRecords}.`);
    }
    let expand = false;
    let recordData = await findTxtRecord(host);
    if (!recordData) {
        throw new Error(`The TXT record data for "_.${host}" is missing`);
    }
    let { url, httpStatus = '301' } = recordData;
    if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
        throw new Error(`The TXT record data for "_.${host}" is not an absolute URL`);
    }
    if (url.endsWith('*')) {
        url = url.slice(0, -1);
        expand = true;
    }
    if (!isHttpCodeAllowed(httpStatus)) {
        throw new Error(`The record "${url}" wants to use the http status code ${httpStatus} which is not allowed (only 301, 302, 307 and 308)`);
    }
    return {
        url,
        expand,
        blacklisted: isHostBlacklisted(host),
        expire: Date.now() + 86400 * 1000,
        httpStatus: parseInt(httpStatus),
    };
}

const acme_prefix = '/.well-known/acme-challenge/';

/**
 * @type {import('http').RequestListener}
 */
const listener = async function (req, res) {
    try {
        const url = req.url || '';
        if (url.startsWith(acme_prefix)) {
            if (client.challengeCallbacks) {
                res.writeHead(200, {
                    // This is important :)
                    'content-type': 'application/octet-stream'
                });
                res.write(client.challengeCallbacks());
            }
            else {
                res.writeHead(404);
            }
            return;
        }
        const host = (req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
        if (!host) {
            res.writeHead(400);
            res.write('Host header is required');
            return;
        }
        if (host === process.env.HOME_DOMAIN) {
            // handle CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.setHeader('Access-Control-Max-Age', '86400');
            if (req.method === 'OPTIONS') {
                res.statusCode = 204;
                return;
            }

            switch (url) {
                case '/stat':
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.write(JSON.stringify(getStat()));
                    return;
                case '/health':
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.write("ok");
                    return;
            }
        }
        let cache = resolveCache.get(host);
        if (!cache || (Date.now() > cache.expire)) {
            cache = await buildCache(host);
            resolveCache.update(host, cache);
        }
        if (cache.blacklisted) {
            if (blacklistRedirectUrl) {
                res.writeHead(302, {
                    'Location': blacklistRedirectUrl + "?d=" + encodeURIComponent(req.headers.host + ""),
                });
            } else {
                res.writeHead(403);
                res.write('Host is forbidden');
            }
            return;
        }
        res.writeHead(cache.httpStatus, {
            'Location': cache.expand ? combineURLs(cache.url, url) : cache.url,
        });
        return;
    }

    catch (/** @type {any} */ error) {
        const message = error?.message;
        res.writeHead(message ? 400 : 500);
        res.write(message || 'Unknown error');
    }
    finally {
        res.end();
    }
};

export {
    listener,
    pruneCache,
    buildCache,
}