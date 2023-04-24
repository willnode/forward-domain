# CHANGES

## v2.5 (2023-04-24)

+ Add `http-status` TXT record option to set HTTP status code. Contributed by [@dzegarra](https://github.com/willnode/forward-domain/pull/4)
+ Improve lock mechanism when a website is verificating certs.

## v2.4 (2023-04-21)

+ Fix global service lock when a website is verificating certs.
+ Update code deps, refactor imports to ESM.

## v2.3 (2022-08-16)

+ Add stat API `s.forwarddomain.net`, separate node script.

## v2.2 (2022-06-16)

+ Moving all parameters to `.env` file
+ Add a domain blacklist mechanism (we received a report that this service is used for phising activity, for the first time)

## v2.1 (2022-01-03)

+ Added `AAAA` record in `r.forwarddomain.net` for IPv6 support. (see [#2](https://github.com/willnode/forward-domain/issues/2#issuecomment-1003831835) for apex domains setup)

## v2.0 (2021-09-21)

+ Dropped `forward-domain-cert-maintainer=` record (as of [LE explanation](https://letsencrypt.org/docs/integration-guide/#who-is-the-subscriber) the provider is the bearer).
+ The software is now keeping LE's account keypair instead of generating new one every restart.
+ Changed IPv4 from `206.189.61.89` to `167.172.5.31` (we use DO's floating IP address now)
+ Changed TXT location to subdomain `_` (because TXT can't be put together with CNAME)
+ Dropped IPv6 record.

## v1.0 (2021-08-23)

+ First release
