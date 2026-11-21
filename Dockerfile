FROM node:24-bookworm-slim AS build
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
RUN mkdir -p /app/.local /var/data && chown -R node:node /app/.local /var/data && chmod 777 /app/.local /var/data 2>/dev/null || true
USER node
CMD ["sh","-c","exec ./node_modules/.bin/next start --hostname 0.0.0.0 --port \"$PORT\""]
