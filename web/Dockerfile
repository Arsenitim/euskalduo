# syntax=docker/dockerfile:1
# Build context: repository root (the admin bundle embeds ./samples as examples).

FROM node:22-alpine AS build
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
COPY samples/ /build/samples/
RUN npm run build

# Lint + unit tests: docker compose --profile test run --rm web-test
FROM build AS test
CMD ["sh", "-c", "npm run lint && npm run typecheck && npm test"]

FROM nginxinc/nginx-unprivileged:stable-alpine AS prod
COPY web/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY web/docker/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /build/web/dist /usr/share/nginx/html
EXPOSE 8080
