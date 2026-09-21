# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Baked in at build time: Vite inlines VITE_* into the bundle, so the API
# location must be known before the static files are produced, not at start.
# Leave it as /api for same-origin deploys; set it to an absolute URL when the
# frontend and API are on different hosts.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ---------- serve ----------
FROM nginx:alpine
COPY --from=build /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# nginx listens on 80. Hosting platforms that assign a port read this variable
# to know where to route, so it is declared rather than left to detection.
ENV PORT=80
EXPOSE 80
