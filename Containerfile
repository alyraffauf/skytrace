FROM docker.io/oven/bun:1.3.14-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG SITE_URL=http://localhost
RUN SITE_URL="$SITE_URL" bun run build

FROM docker.io/nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
