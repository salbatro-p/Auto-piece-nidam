FROM node:24.16.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY db ./db
RUN npm run typecheck && npm run build

FROM dependencies AS api
RUN mkdir -p /var/lib/autoparts/media && chown node:node /var/lib/autoparts/media
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=4310 MEDIA_STORAGE_DIR=/var/lib/autoparts/media
USER node
EXPOSE 4310
CMD ["node","--import=tsx","apps/api/src/server.ts"]

FROM nginx:1.28.0-alpine AS business
COPY infrastructure/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=dependencies /app/apps/business/dist /usr/share/nginx/html
EXPOSE 80
