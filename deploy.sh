#!/bin/bash
TOKEN=$(sudo sqlite3 -readonly /root/.survhub/survhub.db "select token from sessions order by created_at desc limit 1;" | tr -d '\r')
PROJECT_ID=$(sudo sqlite3 -readonly /root/.survhub/survhub.db "select id from projects where name='WiiAreGamers' limit 1;" | tr -d '\r')
echo "Project ID: $PROJECT_ID"
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"projectId\":\"$PROJECT_ID\", \"name\":\"WiiAreGamers\", \"repoUrl\":\"https://github.com/Flyvendedk799/WiiAreGamers\", \"port\":8080, \"startAfterDeploy\":true, \"autoPull\":true, \"type\":\"docker\"}" http://localhost:8787/services/deploy-from-github
