import request from "./certnode/lib/request.js";
import crypto from "node:crypto";
import fs from "node:fs";
import { isIPv4, isIPv6 } from "node:net";
import { fileURLToPath } from "node:url";
const recordParamDestUrl = 'forward-domain';
const recordParamHttpStatus = 'http-status';

let blacklistMap = null;
let whitelistMap = null;

/**
 * @type {string?}
 */
export let blacklistRedirectUrl = null;

/**
 * @param {crypto.BinaryLike} str
 */
export function md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * @param {string} str
 * @return {Record<string, true>}
 */
function csvToMap(str) {
    return (str || "").split(',').reduce((acc, host) => {
        acc[host.toLowerCase()] = true;
        return acc;
    }, {})
}

/**
 * @param {string} domain
 * @return {string}
 */
function getCanonDomain(domain) {
    // TODO: This is a wild approximation to get 
    // "example.com" out of "subdomain.example.com"
    // should use PSL for accuracy but I don't want to 
    // compromise performance here
    if (domain.length > 6) {
        let p = domain.lastIndexOf('.', domain.length - 6);
        if (p > 0) {
            domain = domain.substring(p + 1);
        }
    }
    return domain;
}

export function isHostBlacklisted(domain = '') {
    if (blacklistMap === null) {
        if (process.env.WHITELIST_HOSTS) {
            whitelistMap = csvToMap(process.env.WHITELIST_HOSTS || "");
        }
        blacklistMap = csvToMap(process.env.BLACKLIST_HOSTS || "");
        blacklistRedirectUrl = process.env.BLACKLIST_REDIRECT || null;
    }

    if (whitelistMap === null) {
        return blacklistMap[getCanonDomain(domain)];
    } else {
        return !whitelistMap[getCanonDomain(domain)];
    }
}
/**
 * @param {string} host
 */
export function isIpAddress(host) {
    return isIPv4(host) || isIPv6(host)
}
/**
 * @param {string} host
 */
export function isExceedLabelLimit(host) {
    return [...host].filter(x => x === '.').length >= 10
}
/**
 * @param {string} host
 */
export function isExceedHostLimit(host) {
    return host.length > 64
}

/**
 * @param {fs.PathLike} dir
 */
export async function ensureDir(dir) {
    try {
        await fs.promises.access(dir, fs.constants.W_OK | fs.constants.O_DIRECTORY);
    }
    catch (error) {
        await fs.promises.mkdir(dir, {
            recursive: true
        });
    }
}

/**
 * @param {string} value
 */
const parseTxtRecordData = (value) => {
    const result = {};
    for (const part of value.split(';')) {
        const [key, ...value] = part.split('=');
        if (key && value.length > 0) {
            result[key] = value.join('=');
        }
    }
    return result;
}

/**
 * @param {string} host
 * @return {Promise<string | null>}
 */
export async function validateCAARecords(host) {
    const resolve = await request(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=CAA`);
    if (!resolve.data.Answer) {
        return null;
    }
    for (const head of resolve.data.Answer) {
        if (head.type !== 257) { // RR type of CAA is 257
            continue;
        }
        const caaData = head.data;
        if (typeof caaData === 'string' && caaData !== "0 issue \"letsencrypt.org\"") {
            return caaData;
        }
    }
    return null;
}

/**
 * @param {string} host
 * @return {Promise<{url: string, httpStatus?: string} | null>}
 */
export async function findTxtRecord(host) {
    const resolve = await request(`https://dns.google/resolve?name=_.${encodeURIComponent(host)}&type=TXT`);
    if (!resolve.data.Answer) {
        return null;
    }
    for (const head of resolve.data.Answer) {
        if (head.type !== 16) { // RR type of TXT is 16
            continue;
        }
        const txtData = parseTxtRecordData(head.data);
        if (!txtData[recordParamDestUrl]) continue;
        return {
            url: txtData[recordParamDestUrl],
            httpStatus: txtData[recordParamHttpStatus],
        };
    }
    return null;
}

/**
 * @param {string} baseURL
 * @param {string} relativeURL
 */
export function combineURLs(baseURL, relativeURL) {
    if (!relativeURL) {
        return baseURL;
    }
    return baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '');
}

/**
 * @param {string} metaURL
 */
export function isMainProcess(metaURL) {
    return [process.argv[1], process.env.pm_exec_path].includes(fileURLToPath(metaURL));
}
