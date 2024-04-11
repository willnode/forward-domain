import { client } from "./sni.js";
import { findTxtRecord, isHostBlacklisted, combineURLs, isIpAddress, blacklistRedirectUrl, isExceedLabelLimit, validateCAARecords, isExceedHostLimit } from "./util.js";

/**
 * @typedef {Object} Cache
 * @property {string} url
 * @property {boolean} expand
 * @property {boolean} blacklisted
 * @property {number} expire
 * @property {number} httpStatus
 */
/**
 * @type {Record<string, Cache>}
 */
const resolveCache = {};
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
    if (await validateCAARecords(host)) {
        // https://community.letsencrypt.org/t/199119/2
        throw new Error('CAA record is not "letsencrypt.org"');
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
    if (!['301', '302'].includes(httpStatus)) {
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
        const host = (req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
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
    catch (error) {
        const message = error?.message;
        res.writeHead(message ? 400 : 500);
        res.write(message || 'Unknown error');
    }
    finally {
        res.end();
    }
};
export default listener;
