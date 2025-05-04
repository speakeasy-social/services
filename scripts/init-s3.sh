#!/bin/bash
set -e

echo "Setting up S3 bucket in localstack..."

# Define variables
LOCALSTACK_URL="http://localhost:4566"
BUCKET_NAME="speakeasy-develop"
ACCESS_KEY="s3_test_key"
SECRET_KEY="s3_test_secret"
REGION="us-east-1"
DATE=$(date -u +%Y%m%dT%H%M%SZ)
DATE_STAMP=$(date -u +%Y%m%d)

# Wait for localstack to be ready
RETRIES=30
echo "Waiting for localstack to be ready..."
until curl --silent --fail --output /dev/null $LOCALSTACK_URL; do
  if [ $RETRIES -eq 0 ]; then
    echo "Localstack service is not available, giving up"
    exit 1
  fi
  
  echo "Waiting for localstack... ($RETRIES retries left)"
  RETRIES=$((RETRIES-1))
  sleep 1
done

echo "Localstack is running, creating S3 bucket..."

# Create the bucket using curl
# For localstack, we can use a simplified authorization header
echo "Creating bucket $BUCKET_NAME..."
curl -s -X PUT "$LOCALSTACK_URL/$BUCKET_NAME" \
  -H "Host: localhost:4566" \
  -H "X-Amz-Date: $DATE" \
  -H "Authorization: AWS4-HMAC-SHA256 Credential=$ACCESS_KEY/$DATE_STAMP/$REGION/s3/aws4_request, SignedHeaders=host;x-amz-date, Signature=localstack" \
  -H "Content-Length: 0"

# Check if the bucket was created successfully
echo "Verifying bucket creation..."
BUCKET_CHECK=$(curl -s -X GET "$LOCALSTACK_URL" \
  -H "Host: localhost:4566" \
  -H "X-Amz-Date: $DATE" \
  -H "Authorization: AWS4-HMAC-SHA256 Credential=$ACCESS_KEY/$DATE_STAMP/$REGION/s3/aws4_request, SignedHeaders=host;x-amz-date, Signature=localstack")

if echo "$BUCKET_CHECK" | grep -q "$BUCKET_NAME"; then
  echo "Bucket created successfully!"
else
  echo "Failed to create bucket. Response: $BUCKET_CHECK"
  # Continue anyway, as it might already exist
fi

# Configure CORS for the bucket
echo "Configuring CORS..."
CORS_CONFIG='<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CORSRule>
    <AllowedOrigin>*</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedMethod>DELETE</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <MaxAgeSeconds>3000</MaxAgeSeconds>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
  </CORSRule>
</CORSConfiguration>'

curl -s -X PUT "$LOCALSTACK_URL/$BUCKET_NAME/?cors" \
  -H "Host: localhost:4566" \
  -H "X-Amz-Date: $DATE" \
  -H "Content-Type: application/xml" \
  -H "Authorization: AWS4-HMAC-SHA256 Credential=$ACCESS_KEY/$DATE_STAMP/$REGION/s3/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=localstack" \
  -d "$CORS_CONFIG"

echo "S3 bucket '$BUCKET_NAME' created and configured successfully!" 