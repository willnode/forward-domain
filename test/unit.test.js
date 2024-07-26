import { expect, test } from "bun:test";
import {
    isIpAddress,
    isExceedLabelLimit,
    findTxtRecord,
    isHostBlacklisted,
    validateCAARecords,
    isExceedHostLimit,
} from "../src/util.js";

test('blacklist works', () => {
    const mockEnv = {
        BLACKLIST_HOSTS: "evil.domain,evil.sub.domain"
    }
    expect(isHostBlacklisted("evil.domain", mockEnv)).toBe(true);
    expect(isHostBlacklisted("evil.sub.domain", mockEnv)).toBe(true);
    expect(isHostBlacklisted("sub.evil.sub.domain", mockEnv)).toBe(true);
    expect(isHostBlacklisted("suba.suba.evil.sub.domain", mockEnv)).toBe(true);
    expect(isHostBlacklisted("sub.evil.domain", mockEnv)).toBe(true);
    expect(isHostBlacklisted("domain.evil", mockEnv)).toBe(false);
    expect(isHostBlacklisted("sub.domain", mockEnv)).toBe(false);
    expect(isHostBlacklisted("domain", mockEnv)).toBe(false);
});

test('whitelist works', () => {
    const mockEnv = {
        WHITELIST_HOSTS: "my.domain,my.sub.domain"
    }
    expect(isHostBlacklisted("my.domain", mockEnv)).toBe(false);
    expect(isHostBlacklisted("my.sub.domain", mockEnv)).toBe(false);
    expect(isHostBlacklisted("sub.my.sub.domain", mockEnv)).toBe(false);
    expect(isHostBlacklisted("suba.suba.my.sub.domain", mockEnv)).toBe(false);
    expect(isHostBlacklisted("sub.my.domain", mockEnv)).toBe(false);
    expect(isHostBlacklisted("domain.my", mockEnv)).toBe(true);
    expect(isHostBlacklisted("sub.domain", mockEnv)).toBe(true);
    expect(isHostBlacklisted("domain", mockEnv)).toBe(true);
});

test('client validation works', async () => {
    expect(isIpAddress("1.2.3.4")).toBe(true);
    expect(isIpAddress("::1")).toBe(true);
    expect(isExceedLabelLimit("a.b.c.d.e.f.g.h.i.j.net")).toBe(true);
    expect(isExceedHostLimit("very-long-domain-you-will-never-encounter-anyway.yes-it-happened-tho.net")).toBe(true);
});

test('caa resolver works', async () => {
    expect(await validateCAARecords("forwarddomain.net")).toBe(null);
    expect((await validateCAARecords("github.com"))?.sort()).toEqual([
        "0 issue \"digicert.com\"",
        "0 issue \"globalsign.com\"",
        "0 issue \"sectigo.com\""
    ]);
});

test('txt resolver works', async () => {
    expect(await findTxtRecord("example.com")).toEqual(null);
    expect(await findTxtRecord("r.forwarddomain.net")).toEqual({
        url: "https://forwarddomain.net/*",
        httpStatus: '302',
    });
});


