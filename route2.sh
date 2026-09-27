#!/bin/bash
TOKEN=$(sudo sqlite3 -readonly /root/.survhub/survhub.db "select token from sessions order by created_at desc limit 1;" | tr -d '\r')
SERVICE_ID=$(sudo sqlite3 -readonly /root/.survhub/survhub.db "select id from services where name='WiiAreGamers' order by created_at desc limit 1;" | tr -d '\r')

echo "Setting domain in DB..."
sudo sqlite3 /root/.survhub/survhub.db "update services set domain='wii.mast3kmedia.dk' where id='$SERVICE_ID';"

echo "Adding proxy route..."
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"serviceId\":\"$SERVICE_ID\", \"domain\":\"wii.mast3kmedia.dk\", \"targetPort\":8080}" http://localhost:8787/proxy/routes
