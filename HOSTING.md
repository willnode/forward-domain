# Self-Hosting Guide

This guide will walk you through the process of setting up your own instance of ForwardDomain. This is not a guide for setting up a development environment, but rather a guide for setting up a production instance.

## Prerequisites

- [Node.js](https://nodejs.org/en/) (version 16 or higher).
- A machine with public IP address installed.

## Installation

1. Clone the repository: `git clone https://github.com/willnode/forward-domain.git`
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in the values
4. Run the app: `npm start`

## Configuration

### Environment Variables

| Variable | Description |
| --- | --- |
HTTP_PORT | The port to listen for HTTP requests
HTTPS_PORT | The port to listen for HTTPS requests
STAT_PORT | The port to listen for getting API metrics
BLACKLIST_HOSTS | A comma-separated list of hosts to blacklist
BLACKLIST_REDIRECT | The URL to redirect to when a blacklisted host is accessed

### SSL Certificates

SSL certificates is saved in `./.certs` directory. No additional configuration is needed. 

## Running the App

`sudo npm start` is recommended to run the app. This is because the app needs to listen to port 80 and 443 directly, which requires root access.

If you want to run the app without root access, or wanted to filter some domains for other services, you have to use NGINX with stream plugin 

## NGINX + Stream Plugin

[NGINX Stream plugin](http://nginx.org/en/docs/stream/ngx_stream_core_module.html) is used to filter some domain while still be able forwards HTTPS connection directly. It has to be that way since NGINX doesn't handle HTTPS certificates.

This configuration below, setups the following:
+ Port `80` is listened by `http` block, with default site forwards connection to port `5080`.
+ Port `443` is listened by `stream` block, with default stream forwards connection to port `5443`.
+ All normal HTTPS connection in `http` block listen to `6443`, to be cached by some domains in `stream` block.
+ Port `5080` and `5443` is set for `forward-domain` service listened to.


```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log;
pid /run/nginx.pid;

include /usr/share/nginx/modules/*.conf;

events {
    worker_connections  1024;
}
stream {
    upstream main {
        server 167.172.5.31:6443;
    }
    upstream forwarder {
        server 167.172.5.31:5443;
    }

    map $ssl_preread_server_name $upstream {
        s.forwarddomain.net main;
        default forwarder;
    }

    server {
        listen 167.172.5.31:443;
        listen [2400:6180:0:d0::e08:a001]:443;
        resolver 1.1.1.1;
        proxy_pass $upstream;
        ssl_preread on;
    }
}
http {       
    server {
        server_name _ default_server;
        listen 167.172.5.31;
        listen [2400:6180:0:d0::e08:a001];
        location / {
            proxy_pass http://127.0.0.1:5080;
            proxy_set_header Host $host;
        }
    }
        
    server {
        server_name s.forwarddomain.net;
        listen 167.172.5.31;
        listen [2400:6180:0:d0::e08:a001];
        location / {
            proxy_pass http://127.0.0.1:5900;
            proxy_set_header Host $host;
        }
        listen 167.172.5.31:6443 ssl;
        listen [2400:6180:0:d0::e08:a001]:6443 ssl;
        ssl_certificate /home/s/ssl.combined;
        ssl_certificate_key /home/s/ssl.key;
    }
}
```
