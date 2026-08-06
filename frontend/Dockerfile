# =============================================================================
#  ShopFlow dashboard - multi-stage build
#  Vite build -> static bundle served by nginx, which also reverse-proxies
#  /api/* to the backend services (see nginx.conf).
# =============================================================================
FROM node:24-alpine AS builder
WORKDIR /app

COPY package*.json ./
# `npm ci` when a lockfile is present, `npm install` otherwise.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

FROM nginx:1.31-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
