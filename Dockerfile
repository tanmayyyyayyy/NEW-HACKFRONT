FROM node:24-bookworm-slim AS build
ARG APP_ORIGIN
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=10000 ACCOUNT_DATABASE=.local/accounts.sqlite
WORKDIR /app
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/next.config.mjs ./
COPY --from=build /app/data ./data
COPY --from=build /app/public ./public
RUN install -d -m 0700 -o node -g node /app/.local /var/data
USER node
CMD ["sh","-c","exec ./node_modules/.bin/next start --hostname 0.0.0.0 --port \"$PORT\""]
