import request from "./certnode/lib/request.js";
import crypto from "crypto";
import fs from "fs";
import { isIPv4, isIPv6 } from "net";
import { fileURLToPath } from "url";

const recordParamDestUrl = 'forward-domain';
const recordParamHttpStatus = 'http-status';

let blacklistURL = null;

/**
 * @param {crypto.BinaryLike} str
 */
export function md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

export function isHostBlacklisted(domain = '') {
    if (!blacklistURL) {
        blacklistURL = (process.env.BLACKLIST_HOSTS || "").split(',').reduce((acc, host) => {
            acc[host] = true;
            return acc;
        }, {})
    }
    if (domain.length > 6) {
        let p = domain.lastIndexOf('.', domain.length - 6);
        if (p > 0) {
            domain = domain.substring(p + 1);
        }
    }
    return blacklistURL[domain];
}
/**
 * @param {string} host
 */
export function isIpAddress(host) {
    return isIPv4(host) || isIPv6(host)
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
 * @return {Promise<{url: string, httpStatus?: string} | null>}
 */
export async function findTxtRecord(host) {
    const resolve = await request(`https://dns.google/resolve?name=_.${encodeURIComponent(host)}&type=TXT`);
    if (resolve.data.Answer) {
        for (const head of resolve.data.Answer) {
            const txtData = parseTxtRecordData(head.data);
            if (!txtData[recordParamDestUrl]) continue;
            return {
                url: txtData[recordParamDestUrl], 
                httpStatus: txtData[recordParamHttpStatus],
            };
        }
    }
    return null;
}

/**
 * @param {string} baseURL
 * @param {string} relativeURL
 */
export function combineURLs(baseURL, relativeURL) {
    return relativeURL
        ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
        : baseURL;
}

/**
 * @param {string} metaURL
 */
export function isMainProcess(metaURL) {
    return [process.argv[1], process.env.pm_exec_path].includes(fileURLToPath(metaURL));
}
