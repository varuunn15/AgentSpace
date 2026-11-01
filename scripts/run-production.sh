#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
elif [ -f "$SCRIPT_DIR/../.env" ]; then
  set -a
  source "$SCRIPT_DIR/../.env"
  set +a
fi

DOMAIN="${DOMAIN:-agentspace.3.109.242.157.nip.io}"
PREVIEW_DOMAIN="${PREVIEW_DOMAIN:-preview.agentspace.3.109.242.157.nip.io}"

echo "=== [1/5] Ensuring lightweight K3s service is active for workspace pods ==="
sudo systemctl start k3s 2>/dev/null || true

echo "=== [2/5] Cleaning up old microservice containers ==="
for c in frontend auth sandbox router ai notification; do
  sudo docker stop "$c" 2>/dev/null || true
  sudo docker rm -f "$c" 2>/dev/null || true
done

echo "=== [3/5] Starting AgentSpace Microservices directly in Docker ==="

# 1. Frontend
sudo docker run -d \
  --name frontend \
  --restart always \
  -p 5173:5173 \
  -e VITE_SANDBOX_DOMAIN="$DOMAIN" \
  -e VITE_SANDBOX_API_TARGET=http://127.0.0.1:3000 \
  -e VITE_AUTH_API_TARGET=http://127.0.0.1:3001 \
  -e VITE_AI_API_TARGET=http://127.0.0.1:3002 \
  frontend:latest

# 2. Auth Service
sudo docker run -d \
  --name auth \
  --restart always \
  -p 3001:3000 \
  -e PORT=3000 \
  -e NODE_ENV="development" \
  -e FRONTEND_URL="http://$DOMAIN" \
  -e COOKIE_DOMAIN="" \
  -e COOKIE_SECURE="false" \
  -e AUTH_MONGO_URI="$AUTH_MONGO_URI" \
  -e RABBITMQ_URL="$RABBITMQ_URL" \
  -e JWT_SECRET="$JWT_SECRET" \
  -e GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  -e GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
  -e GOOGLE_CALLBACK_URL="http://$DOMAIN/api/auth/google/callback" \
  -e EMAIL_USER="$EMAIL_USER" \
  auth:latest

# 3. Sandbox Server
sudo docker run -d \
  --name sandbox \
  --restart always \
  --net=host \
  -v /etc/rancher/k3s/k3s.yaml:/root/.kube/config:ro \
  -e KUBECONFIG=/root/.kube/config \
  -e PORT=3000 \
  -e MONGO_URI="$SANDBOX_MONGO_URI" \
  -e REDIS_URL="$REDIS_URL" \
  -e JWT_SECRET="$JWT_SECRET" \
  -e SANDBOX_DOMAIN="$DOMAIN" \
  -e PREVIEW_DOMAIN="$PREVIEW_DOMAIN" \
  -e SANDBOX_PROTOCOL="http" \
  -e AWS_REGION="$AWS_REGION" \
  -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
  -e BUCKET_NAME="$BUCKET_NAME" \
  sandbox:latest

# 4. Sandbox Router
sudo docker run -d \
  --name router \
  --restart always \
  -p 3003:3000 \
  --dns 10.43.0.10 \
  --dns-search default.svc.cluster.local \
  --dns-search svc.cluster.local \
  --dns-search cluster.local \
  -e PORT=3000 \
  -e REDIS_URL="$REDIS_URL" \
  router:latest

# 5. AI Orchestration
sudo docker run -d \
  --name ai \
  --restart always \
  -p 3002:3000 \
  -e PORT=3000 \
  -e MONGO_URI="$AI_MONGO_URI" \
  -e MISTRALAI_API_KEY="$MISTRAL_API_KEY" \
  -e MISTRAL_API_KEY="$MISTRAL_API_KEY" \
  -e MISTRAL_MODEL="${MISTRAL_MODEL:-open-mistral-7b}" \
  ai-orchestration:latest

# 6. Notification Service
sudo docker run -d \
  --name notification \
  --restart always \
  -p 4000:4000 \
  -e PORT=4000 \
  -e RABBITMQ_URL="$RABBITMQ_URL" \
  -e GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  -e GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
  -e GOOGLE_REFRESH_TOKEN="$GOOGLE_REFRESH_TOKEN" \
  -e EMAIL_USER="$EMAIL_USER" \
  notification:latest

echo "=== [4/5] Configuring NGINX Reverse Proxy on Port 80 ==="
sudo apt-get update -y
sudo apt-get install -y nginx

cat << 'EOF' | sudo tee /etc/nginx/sites-available/default
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # AI Service
    location /api/ai/ {
        proxy_pass http://127.0.0.1:3002/api/ai/;
    }
    location /api/ai {
        proxy_pass http://127.0.0.1:3002/api/ai;
    }

    # Auth Service
    location /api/auth/ {
        proxy_pass http://127.0.0.1:3001/api/auth/;
    }
    location /api/auth {
        proxy_pass http://127.0.0.1:3001/api/auth;
    }

    # Sandbox API
    location /api/sandbox/ {
        proxy_pass http://127.0.0.1:3000/api/sandbox/;
    }
    location /api/sandbox {
        proxy_pass http://127.0.0.1:3000/api/sandbox;
    }

    # Frontend UI
    location / {
        proxy_pass http://127.0.0.1:5173;
    }
}

server {
    listen 80;
    server_name ~^(?<subdomain>.+)\.preview\..+$ ~^(?<subdomain2>.+)\.agent\..+$;

    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location / {
        proxy_pass http://127.0.0.1:3003;
    }
}
EOF

sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

echo "=== [5/5] Deployment Finished Successfully! ==="
echo "Primary Live URL: http://$DOMAIN"
