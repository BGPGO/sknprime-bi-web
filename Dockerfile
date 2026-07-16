# Coolify deploy — serve estática BI SKN Prime via nginx
FROM nginx:alpine

# Static files
COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY data.js /usr/share/nginx/html/
COPY data-extras.js /usr/share/nginx/html/
COPY reports.js /usr/share/nginx/html/
COPY app.bundle.js /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets

# Reports IA pré-gerados
COPY report*.json /usr/share/nginx/html/

# Config nginx — SPA fallback + gzip + cache
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
