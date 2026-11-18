# Included by every location in nginx.conf. nginx does not inherit add_header
# into a location that defines its own add_header, hence a shared snippet.
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
add_header Content-Security-Policy "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" always;
