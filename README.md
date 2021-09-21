# Forward Domain

> We're back with improvements! See [CHANGES.md](CHANGES.md)

This services forwards domains using 301 HTTP redirects.

Possible scenarios:

+ Forward non-www to www URLs or inversely
+ Forward old URLs to new URLs

Why using this service?

+ No coding required
+ No hosting required
+ No registration required
+ Completely anonymous
+ Completely free

How it is possible?

+ Point your domain to us using CNAME or A/AAAA records
+ Tell us where to forward using TXT records
+ We handle HTTPS certificates for you

## Get Started

To forward from `www.old.com` to `old.com`, add these records to your DNS:

```
www.old.com     IN    CNAME   r.forwarddomain.net
_.www.old.com   IN    TXT     forward-domain=https://old.com/*
```

Because CNAME can't be used in apex domains, you can use A/AAAA records.<br>
To forward from `old.com` to `new.net`, add these records to your DNS:

```
old.com     IN    A       167.172.5.31
_.old.com   IN    TXT     forward-domain=https://new.net/*
```

## FAQ

### Is it really free?

Forwarding domains should be easy to setup.<br>
I use this internally for [domcloud.io](https://domcloud.io).<br>

### How can I check redirects will work?

This service uses Google's [Public DNS Resolver](https://dns.google).<br>
Once first accessed, values will be cached for a day.<br>
For right now there's no way to flush the cache sorry.

### Why it loads slowly?

It only slow at first time because it has to sign HTTPS certificates.

### How can I support this service?

Star our repo and spread the word, please :)

## Usual Disclaimer

```
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
