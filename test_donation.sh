#!/bin/bash
TOKEN=$(curl -s -X POST https://food-share-system-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@foodshare.org","password":"Admin@123"}' | jq -r .token)

curl -s -X POST https://food-share-system-production.up.railway.app/api/donations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"food_name":"Test Food","category":"other","quantity":10,"unit":"kg","pickup_address":"123 Test St"}' | jq .
