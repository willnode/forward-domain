import { client } from "./sni.js";
import { findTxtRecord, isHostBlacklisted, combineURLs } from "./util.js";

/**
 * @typedef {Object} Cache
 * @property {string} url
 * @property {boolean} expand
 * @property {boolean} blacklisted
 * @property {number} expire
 * @property {number} httpStatus
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
    let recordData = await findTxtRecord(host);
    if (!recordData) {
        throw new Error(`The record data for "${host}" is missing`);
    }
    let {url, httpStatus = '301'} = recordData;
    if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
        throw new Error(url + ' in TXT record is not an absolute URL');
    }
    if (url.endsWith('*')) {
        url = url.slice(0, -1);
        expand = true;
    }
    if(!['301', '302'].includes(httpStatus)) {
        httpStatus = '301';
        throw new Error(`The record "${url}" wants to use the http status code ${httpStatus} which is not allowed (only 301 and 302)`);
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
            res.writeHead(302, {
                'Location': (process.env.BLACKLIST_REDIRECT || 'https://forwarddomain.net/blacklisted') + "?d=" + req.headers.host,
            });
            return;
        }
        res.writeHead(cache.httpStatus, {
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
