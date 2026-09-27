#!/bin/bash
TOKEN=$(sudo sqlite3 -readonly /root/.survhub/survhub.db "select token from sessions order by created_at desc limit 1;" | tr -d '\r')
PROJECT_ID="lmEM0U_nbzv4a0SfKkqUp"
SERVICE_ID=$(sudo sqlite3 -readonly /root/.survhub/survhub.db "select id from services where name='WiiAreGamers' limit 1;" | tr -d '\r')

echo "Deleting old service (if it exists)..."
if [ ! -z "$SERVICE_ID" ]; then
    curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "http://localhost:8787/services/$SERVICE_ID?purgeDisk=true"
fi

echo "Triggering new deploy-from-github..."
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"projectId\":\"$PROJECT_ID\", \"name\":\"WiiAreGamers\", \"repoUrl\":\"https://github.com/Flyvendedk799/WiiAreGamers\", \"port\":8080, \"startAfterDeploy\":true, \"autoPull\":true, \"type\":\"docker\"}" http://localhost:8787/services/deploy-from-github
