import { expect, test } from "bun:test";
import {
    isIpAddress,
    isExceedLabelLimit,
    findTxtRecord,
    isHostBlacklisted,
    validateCAARecords,
    isExceedHostLimit,
    derToPem,
    pemToDer,
    getCertExpiry,
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

test('pem der conversion for cert works', async () => {
    let cert = `-----BEGIN CERTIFICATE-----
MIIDTjCCAjagAwIBAgIIBgAQy/0qNmkwDQYJKoZIhvcNAQELBQAwKDEmMCQGA1UE
AxMdUGViYmxlIEludGVybWVkaWF0ZSBDQSA2NjRhMmMwHhcNMjQwODAzMDYyMzI3
WhcNMjkwODAzMDYyMzI2WjAAMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC
AQEAxcls2hAh1rgy7cfjklKeIvsj5hmUhKWPUG/9CBERWiTlJS04vJdWW6/w8f38
CN/fttWlWVYeCag+hGVmShUjBUnuYrzeCO2rq1dkgqhrTW9bFpAhkmtVxieSrXuU
mugG+Q7MW/KwyQxz5fThbNM8Fjn97eerZgzSLDj90BgYVB7Bm5FmqfpoDJRBKayA
W5wrzDgmwUkbsu8ji1Dx9NTjoEhl3+7sjTCxVVJYHPdb/ISPcE5bRcVLT/oA5xXt
L+f4n+/Lydnc9wwcB4cUo2X2Y17CtdxGLkn2XJcjh1Ca0iMZ+1oaSQPRF4MqsmHV
4ojXW5TeRNw0S8Ogbf3x0HTrEwIDAQABo4GjMIGgMA4GA1UdDwEB/wQEAwIFoDAd
BgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwDAYDVR0TAQH/BAIwADAdBgNV
HQ4EFgQUfWQn1UGpENf3nNNzo2B+2SJBvFowHwYDVR0jBBgwFoAUwJ7TbCOeTnd2
4R9a31dcDsTM+V0wIQYDVR0RAQH/BBcwFYITci5mb3J3YXJkZG9tYWluLm5ldDAN
BgkqhkiG9w0BAQsFAAOCAQEAxhkKy9meD5MmvuOU0E0uFFNwmGM5u24lnuZ/RcAM
Xp9jhyIfWamTs4xH7EXzMsForLAudQNwvdi7ewUgXnDRRAuBy79tRN4YwsxzYUBu
sKVpB+c99uAcEufdMjUUQqgDhtVWcVesrvx65EM4/r2YbseDduZEAIyvlZAxNNo/
1Ox2m/V7yYmlnJ4WKPF5JrkKXLIfVc/puKwk16tEK6SM78hzS5HTUfksBzMauk32
9mvKLjflTx3sQseVqDX9m3l7pLagM15nL8IoBw+M4Hqx/E21CG89okL1PrmBDM+K
izrL6bydOGcPEbqwRk5V0rm7w6qBYHN6OWAypSQ0UYYG+w==
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIDUDCCAjigAwIBAgIIVd1bNP8Jx4IwDQYJKoZIhvcNAQELBQAwIDEeMBwGA1UE
AxMVUGViYmxlIFJvb3QgQ0EgMzJiNzJkMCAXDTI0MDgwMzA2MjAyMFoYDzIwNTQw
ODAzMDYyMDIwWjAoMSYwJAYDVQQDEx1QZWJibGUgSW50ZXJtZWRpYXRlIENBIDY2
NGEyYzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAM4MmkMcMy1HmfaB
uOGsnI2CA2m2sVm/QXi0mfZeffmaH8kz3zfqKzjm9Y19+4dHOOjwm8wrgxqKRLjQ
SEnF30Lhb1RmnfX9loe2vkP66wAxhW3/Up+zBxSUJa5LsnzTy229aY1Y8Mbb6ENC
bYIC0ZxBCwo/szvdxnaOPzAxeoV1/UsWkNbp0/Huu7WpnqhoPTrjRHNCU1xIv1ZE
rKTig5NHwTqjzeqt3vT21inUmmwmEl5+HQFYWBpZyIKhfC0JaK4mjd3efMnUcqG8
Ws1NvmSWkBc9JsL4JmWGEjv7aX6roCxrpOfFhWtog7BDcZ+EM25DCgxM5WxUGdrc
VN1kZ8ECAwEAAaOBgzCBgDAOBgNVHQ8BAf8EBAMCAoQwHQYDVR0lBBYwFAYIKwYB
BQUHAwEGCCsGAQUFBwMCMA8GA1UdEwEB/wQFMAMBAf8wHQYDVR0OBBYEFMCe02wj
nk53duEfWt9XXA7EzPldMB8GA1UdIwQYMBaAFPkmTsD1ef0Otc7VLA4MxnJK12fP
MA0GCSqGSIb3DQEBCwUAA4IBAQAFNlkf6EdNFcfwuSANT6OM9g72Yt0jRZxzlWO2
bCO+TqSjoF3TKNpTwgi+aXQ+/mjKSrv8y8jRw/QM4brLpFDJ+L4KNEt6KNEeIL2F
87fuUihlTGjD34KKAwI+OfgfIaNpkcshlLs+V4hWXoROVdioLAj+rOExDjuriu/L
5v7Ke4iqIIoeoiWTjbmqxpOyYmfWm+kfo7vbR8uSjK2LQx7uWqgRCFAhwPbEFuEy
JHTqTbvIWRYsjyFiMEIUh10sLqqMYcZoJBgmX//KH8Iw0PDEam+RGhod1Rb46Sm+
7rOGV9tVAr/t6UsRAImu/Rrpst817EhR6vv07GiBDAH65XdZ
-----END CERTIFICATE-----
`

    let certs = pemToDer(cert);
    let newCert = derToPem(certs, "certificate");

    expect(newCert).toEqual(cert);
    expect(getCertExpiry(cert)).toEqual(1880432606000);
    expect(getCertExpiry(newCert)).toEqual(1880432606000);
})

test('pem der conversion for key works', async () => {
    let key = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDFyWzaECHWuDLt
x+OSUp4i+yPmGZSEpY9Qb/0IERFaJOUlLTi8l1Zbr/Dx/fwI39+21aVZVh4JqD6E
ZWZKFSMFSe5ivN4I7aurV2SCqGtNb1sWkCGSa1XGJ5Kte5Sa6Ab5Dsxb8rDJDHPl
9OFs0zwWOf3t56tmDNIsOP3QGBhUHsGbkWap+mgMlEEprIBbnCvMOCbBSRuy7yOL
UPH01OOgSGXf7uyNMLFVUlgc91v8hI9wTltFxUtP+gDnFe0v5/if78vJ2dz3DBwH
hxSjZfZjXsK13EYuSfZclyOHUJrSIxn7WhpJA9EXgyqyYdXiiNdblN5E3DRLw6Bt
/fHQdOsTAgMBAAECggEAJsUdk78uyuavgQG6P6/3NJczCcNA5CGJ7rQNDvw9gQST
cE6lfP5TXMSnv9/P/DNaKH5Hm7PwTmdO3ef8fZAYHczIsE0iXvCrwnnuh1gZNIQc
AFe/ZPKqTR3ruBrt3dGWsFJwx6NSeQ56V3zBhXIAqMC0YGKVq/reZfHD+vsGJdLL
PVabyGQugZWJrqvhJMv8Nmj0nvg9ostL+qA1MKAZRNc5GURL4w6f147IE5Qbebhx
daulsXnCfcP86OIPV1rDu8btj58exLLIsCyNtwDe0X/LHcKx6m5EX1yjBN7zssCL
0uwuc5MYYrwEg7PoiNL7y2PKmjD3roFqoWpH72W9iQKBgQDtFP53gJF9wjQrUIw1
YY6NS9EVs6zwRyXjYSMOxm6bSNSdfwzRASpBTtaGMTFWMlPH0ADJ48oWeC86NbqA
HNs85vAjlWfLF1jbGGkww4L4isxh3ie67XDnyTWEuZxDA1tsX17qoeYQJapxkUaR
4cNA6BQGikJ9aunELClJTwAKSQKBgQDVkbn63oXISeqG7uLHsK/ozcIa8t60roPb
dk8XKm2eOIjlsTGOUB9eebZsptSPCN/cMvzscIJqd7YoVKeOFhEQ17QxxiwtCez/
A61fAZAJWMimGZRoPO2vmSFYoNkWj4jss2LVBuMq1VyrObVrvnZc9mp+eTdxo/C5
fy36C8AqewKBgA/OE3zB/HEGzlWI5B/25frzb/fjZ4cJJzR2WFD2147QlyP8wUz5
p+h8qf5+LwzRBBbQ/gx3fBRtZLCbvlgmFFOGDcJBho7aepj4kqKmlgedsSxhFAL5
K0q4djHn8cvh4GlkHj7EFkNDT46Moci95TdhgVxCQVZ9FyJ10zbI5nbJAoGBAJnM
5D5B2d4vPPIHPtHH8CabZtm5ZaCAvPxi6von1+FFnXCsdp+iG7URucntKs4G+g+9
uF8ddw3tQAUzUacFRSz36hCeQln89+t+XnA4092nTngvm6yllBYNFPKagzu4CkdL
uDTpTNcf6Ch22qvI8bxoyLBj4wW3pjgv2pBjvfPZAoGBAOzrNQ6lWJow1rG8sQAF
bfoxVpX6y9JJArJuT7bQO0TZOtPTTwjo94EyPUMpOlRLHko8r5buEl9EPW/mCOrX
gLIo1xC6QTia+mZ/aK+vHuFhuGy37az8nJzR/1Ud61C7og+BoXEsJZi7+J0M/6Nr
vV1rSGF5+dMeo8CldZlyMHDi
-----END PRIVATE KEY-----
`

    let keys = pemToDer(key);
    let newKey = derToPem(keys, "private");

    expect(newKey).toEqual(key);
    
})
