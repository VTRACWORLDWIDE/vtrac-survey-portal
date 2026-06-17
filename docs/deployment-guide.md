# VTRAC Survey Portal Google Cloud VM Deployment Guide

## 1. Install Server Dependencies

Use an Ubuntu VM and allow HTTP/HTTPS traffic.

```bash
sudo apt update
sudo apt install -y nodejs npm postgresql postgresql-contrib nginx git
```

For production, Node.js 20 is recommended.

## 2. Configure PostgreSQL

```bash
sudo -u postgres createdb vtrac_survey
sudo -u postgres psql -c "CREATE USER vtrac_user WITH PASSWORD 'change-this-password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE vtrac_survey TO vtrac_user;"
psql postgresql://vtrac_user:change-this-password@localhost:5432/vtrac_survey < vtrac-survey-portal/db/schema.sql
```

## 3. Backend

```bash
cd vtrac-survey-portal/backend
npm install --omit=dev
cp .env.example .env
```

Set `.env`:

```text
PORT=8081
DATABASE_URL=postgres://vtrac_user:change-this-password@localhost:5432/vtrac_survey
CORS_ORIGIN=https://your-domain.example
```

Create a service:

```bash
sudo tee /etc/systemd/system/vtrac-survey-api.service >/dev/null <<'EOF'
[Unit]
Description=VTRAC Survey API
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/ubuntu/vtrac-survey-portal/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=ubuntu

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now vtrac-survey-api
```

## 4. Frontend and Nginx

```bash
cd vtrac-survey-portal/frontend
npm install
npm run build
```

```bash
sudo tee /etc/nginx/sites-available/vtrac-survey >/dev/null <<'EOF'
server {
  listen 80;
  server_name _;

  root /home/ubuntu/vtrac-survey-portal/frontend/dist;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:8081/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri /index.html;
  }
}
EOF

sudo ln -s /etc/nginx/sites-available/vtrac-survey /etc/nginx/sites-enabled/vtrac-survey
sudo nginx -t
sudo systemctl reload nginx
```

## 5. Pilot Checks

- Open `/` on mobile and submit one response.
- Capture GPS once from a mobile browser.
- Open `/admin` and confirm totals update.
- Download CSV and Excel.
- Restart the VM and confirm the API restarts with `systemctl status vtrac-survey-api`.

