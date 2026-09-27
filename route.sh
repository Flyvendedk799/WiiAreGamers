#!/bin/bash
TOKEN=$(sudo sqlite3 -readonly /root/.survhub/survhub.db "select token from sessions order by created_at desc limit 1;" | tr -d '\r')
SERVICE_ID=$(sudo sqlite3 -readonly /root/.survhub/survhub.db "select id from services where name='WiiAreGamers' limit 1;" | tr -d '\r')

curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"serviceId\":\"$SERVICE_ID\", \"domain\":\"wii.flyvende.dk\", \"targetPort\":8080}" http://localhost:8787/proxy/routes
