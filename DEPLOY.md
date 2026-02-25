# Deployment Guide

This guide explains how to deploy and manage the Speakeasy Services on an Ubuntu server.

## Prerequisites

- Ubuntu server with Docker and Docker Compose installed
- SSH access to the server
- PostgreSQL database accessible to the server
- SSL certificates for your domain

## Initial Setup

1. Create the necessary Docker secrets for each service:

```bash
# Private Sessions Service
echo "your_private_sessions_db_user" | docker secret create private_sessions_postgres_user -
echo "your_private_sessions_db_password" | docker secret create private_sessions_postgres_password -
echo "your_private_sessions_db_name" | docker secret create private_sessions_postgres_db -

# Trusted Users Service
echo "your_trusted_users_db_user" | docker secret create trusted_users_postgres_user -
echo "your_trusted_users_db_password" | docker secret create trusted_users_postgres_password -
echo "your_trusted_users_db_name" | docker secret create trusted_users_postgres_db -

# User Keys Service
echo "your_user_keys_db_user" | docker secret create user_keys_postgres_user -
echo "your_user_keys_db_password" | docker secret create user_keys_postgres_password -
echo "your_user_keys_db_name" | docker secret create user_keys_postgres_db -

# Media Service
echo "your_media_keys_db_user" | docker secret create user_keys_postgres_user -
echo "your_user_keys_db_password" | docker secret create user_keys_postgres_password -
echo "your_user_keys_db_name" | docker secret create user_keys_postgres_db -
```

2. Set up non-sensitive environment variables:

```bash
# Create a .env file with non-sensitive configuration
cat > /home/speakeasy-services/.env << EOF
POSTGRES_HOST=your_postgres_host
POSTGRES_PORT=5432
EOF
```

3. Set up nginx:

```bash
# Create SSL certificate directory
sudo mkdir -p /etc/nginx/ssl

# Copy SSL certificates
sudo cp your_ssl_cert.crt /etc/nginx/ssl/speakeasy.services.crt
sudo cp your_ssl_key.key /etc/nginx/ssl/speakeasy.services.key

# Set proper permissions
sudo chmod 600 /etc/nginx/ssl/speakeasy.services.key
sudo chown root:root /etc/nginx/ssl/speakeasy.services.key

# Copy nginx configuration
sudo cp nginx.conf /etc/nginx/nginx.conf

# Test nginx configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
```

## Updating Secrets

To update a secret for a service:

```bash
# Example: Update private sessions database password
echo "new_password" | docker secret update private_sessions_postgres_password -

# After updating secrets, restart the affected service
docker-compose -f /home/speakeasy-services/docker-compose.prod.yml restart private-sessions
```

## Managing Services

### View Current Secrets

```bash
# List all secrets
docker secret ls

# Inspect a specific secret
docker secret inspect private_sessions_postgres_password
```

### Restart Services

```bash
# Restart a specific service
docker-compose -f /home/speakeasy-services/docker-compose.prod.yml restart <service-name>

# Restart all services
docker-compose -f /home/speakeasy-services/docker-compose.prod.yml restart
```

### View Service Logs

```bash
# View logs for a specific service
docker-compose -f /home/speakeasy-services/docker-compose.prod.yml logs <service-name>

# Follow logs in real-time
docker-compose -f /home/speakeasy-services/docker-compose.prod.yml logs -f <service-name>
```

## Security Notes

1. Docker secrets are:
   - Encrypted at rest
   - Only accessible to services that explicitly request them
   - Never stored in environment variables or files
   - Persist across container restarts and server reboots

2. Each service has its own set of secrets for:
   - Database user
   - Database password
   - Database name

3. Non-sensitive configuration is stored in the `.env` file:
   - Database host
   - Database port

4. SSL/TLS Configuration:
   - Uses modern TLS protocols (TLSv1.2 and TLSv1.3)
   - Implements secure cipher suites
   - Includes security headers
   - Enforces HTTPS redirect
   - Implements rate limiting

## Troubleshooting

If a service fails to start:

1. Check the service logs:

```bash
docker-compose -f /home/speakeasy-services/docker-compose.prod.yml logs <service-name>
```

2. Verify secrets exist:

```bash
docker secret ls
```

3. Verify environment variables:

```bash
cat /home/speakeasy-services/.env
```

4. Check service status:

```bash
docker-compose -f /home/speakeasy-services/docker-compose.prod.yml ps
```

5. Check nginx logs:

```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

6. Test nginx configuration:

```bash
sudo nginx -t
```
