# v2.0 (2021-09-21)

+ Dropped `forward-domain-cert-maintainer=` record (as of [LE explanation](https://letsencrypt.org/docs/integration-guide/#who-is-the-subscriber) the provided is the bearer).
+ The software is now keeping LE's account keypair instead of generating new one every restart.
+ Changed IPv4 from `206.189.61.89` to `167.172.5.31` (we use DO's floating IP address now)
+ Changed TXT location to subdomain `_` (because TXT can't be put together with CNAME)
+ Dropped IPv6 record.

# v1.0 (2021-08-23)

+ First release
