import { test, expect } from "bun:test";
import request from "./src/certnode/lib/request";
import { $ } from "bun";

test("HTTP integrated test", () => {
    return new Promise((resolve, reject) => {
        // assume running with test/main.go
        const port = parseInt(process.env.HTTP_PORT || "3000");
        request(`http://localhost:${port}/hello`, {
            timeout: 60000,
            headers: {
                "host": "r.forwarddomain.net",
                "accept": "text/plain",
                "user-agent": "test",
            }
        }).then(x => {
            // forward-domain=https://forwarddomain.net/*;http-status=302
            expect(x.statusCode).toBe(302);
            expect(x.headers.location).toBe("https://forwarddomain.net/hello");
        }).then(resolve).catch(reject);
    });
});


test("HTTPS integrated test", () => {
    return new Promise((resolve, reject) => {
        // assume running with test/main.go
        const port = parseInt(process.env.HTTPS_PORT || "3000");
        request(`https://localhost:${port}/hello`, {
            timeout: 60000,
            headers: {
                "host": "r.forwarddomain.net",
                "accept": "text/plain",
                "user-agent": "test",
            }
        }).then(x => {
            // forward-domain=https://forwarddomain.net/*;http-status=302
            expect(x.statusCode).toBe(302);
            expect(x.headers.location).toBe("https://forwarddomain.net/hello");
        }).then(resolve).catch(reject);
    });
});
