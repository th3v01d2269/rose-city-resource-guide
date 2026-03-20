#!/bin/bash

RENDER_URL="https://rose-city-resource-guide.onrender.com"
TIMESTAMP=$(date +%s)
TEST_NAME="Persistence Test $TIMESTAMP"
TEST_CATEGORY="Test Category"

echo "🔹 Adding test resource: $TEST_NAME"
POST_RESPONSE=$(curl -s -X POST "$RENDER_URL/api/resources" \
    -H "Content-Type: application/json" \
    -d "{
        \"name\": \"$TEST_NAME\",
        \"category\": \"$TEST_CATEGORY\",
        \"description\": \"Temporary resource for persistence test\",
        \"phone\": \"555-1234\",
        \"state\": \"Test\"
    }")

if echo "$POST_RESPONSE" | grep -q '"id"'; then
    TEST_ID=$(echo "$POST_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
    echo "✅ Test resource added with ID: $TEST_ID"
else
    echo "❌ Failed to add test resource. Response:"
    echo "$POST_RESPONSE"
    exit 1
fi

echo ""
echo "⏸️  Now restart your Render service manually (or push a dummy commit to trigger auto-deploy)."
read -p "Press Enter AFTER the service has restarted..." </dev/tty

FOUND_AFTER=$(curl -s "$RENDER_URL/api/resources?q=$(echo $TEST_NAME | sed 's/ /%20/g')" | grep -o "\"name\":\"$TEST_NAME\"")
if [[ -n "$FOUND_AFTER" ]]; then
    echo "✅✅ SUCCESS: Test resource persisted after restart!"
else
    echo "❌❌ FAILURE: Test resource disappeared."
fi
