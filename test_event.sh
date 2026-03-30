#!/bin/bash
TOKEN=$(curl -s -X POST https://food-share-system-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@foodshare.org","password":"Admin@123"}' | jq -r .token)

echo "Testing GET /donations..."
curl -s -H "Authorization: Bearer $TOKEN" https://food-share-system-production.up.railway.app/api/donations | head -n 2

echo -e "\nTesting POST /events..."
curl -s -X POST https://food-share-system-production.up.railway.app/api/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Event","scheduled_date":"2026-03-30","donation_id":"","volunteer_id":"","beneficiary_id":"","pickup_location":"","delivery_location":"","notes":""}' | jq .
