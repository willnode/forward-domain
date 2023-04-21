import { client } from "./sni.js";
import { findTxtRecord, isHostBlacklisted, combineURLs } from "./util.js";
const record_prefix = 'forward-domain=';
/**
 * @typedef {Object} Cache
 * @property {string} url
 * @property {boolean} expand
 * @property {boolean} blacklisted
 * @property {number} expire
 */
/**
 * @type {Object<string, Cache>}
 */
const resolveCache = {};
/**
 * @param {string} host
 * @returns {Promise<Cache>}
 */
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
        blacklisted: isHostBlacklisted(host),
        expire: Date.now() + 86400 * 1000,
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
        const host = (req.headers.host || '').toLowerCase();
        if (!host) {
            res.writeHead(400);
            res.write('Host header is required');
            return;
        }
        let cache = resolveCache[host];
        if (!cache || (Date.now() > cache.expire)) {
            cache = await buildCache(host);
            resolveCache[host] = cache;
        }
        if (cache.blacklisted) {
            res.writeHead(301, {
                'Location': (process.env.BLACKLIST_REDIRECT || 'https://forwarddomain.net/blacklisted') + "?d=" + req.headers.host,
            });
            return;
        }
        res.writeHead(301, {
            'Location': cache.expand ? combineURLs(cache.url, url) : cache.url,
        });
        return;
    }
    catch (error) {
        res.writeHead(400);
        res.write(error.message || 'Unknown error');
    }
    finally {
        res.end();
    }
};
export default listener;
