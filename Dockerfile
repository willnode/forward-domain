ARG NODE_VERSION=lts

#
# --- Build Stage ---
#

FROM node:${NODE_VERSION}-alpine as build

# Install dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --frozen-lockfile

# Copy codebase
COPY . .

#
# --- Base Stage ---
#

FROM node:${NODE_VERSION}-alpine as base

USER nobody

# Copy codebase
WORKDIR /app
COPY --from=build --chown=nobody /app/package.json /app/index.js ./
COPY --from=build --chown=nobody /app/node_modules node_modules
COPY --from=build --chown=nobody /app/src src

# Location of generated SSL certificates
VOLUME /app/.certs

#
# --- App Stage ---
#

FROM base as app

ENV NODE_ENV=production
COPY --from=build --chown=nobody /app/app.js .

# A comma-separated list of root domains to whitelist
ENV WHITELIST_HOSTS=
# A comma-separated list of root domains to blacklist
ENV BLACKLIST_HOSTS=
# The URL to redirect to when a blacklisted host is accessed
ENV BLACKLIST_REDIRECT=
# The host to enable `/stat` endpoint
ENV HOME_DOMAIN=

ENV HTTP_PORT=8080 HTTPS_PORT=8443
EXPOSE 8080 8443

ENTRYPOINT ["node"]
CMD ["app.js"]
