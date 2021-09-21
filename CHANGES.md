# v2.0 (2021-09-21)

+ Dropped `forward-domain-cert-maintainer=` record.
+ Changed IPv4 from `206.189.61.89` to `167.172.5.31`
+ Changed TXT location to subdomain `_` (because TXT can't be put together with CNAME)
+ Dropped IPv6 for now (internally we use DO's floating IP address so we hope this won't force me to change IP addresses).

# v1.0 (2021-08-23)

+ First release
