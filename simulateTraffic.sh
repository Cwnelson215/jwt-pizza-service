#!/bin/bash

# Simulate traffic for jwt-pizza-service metrics
HOST="https://pizza.cwnel.com"
TOKENS=()

while true; do
  echo "--- Sending traffic batch ---"

  # Randomly decide target active users (1-4)
  TARGET=$((RANDOM % 4 + 1))
  CURRENT=${#TOKENS[@]}

  # Login more users if needed
  while [ $CURRENT -lt $TARGET ]; do
    TOKEN=$(curl -s -X PUT "$HOST/api/auth" \
      -H 'Content-Type: application/json' \
      -d '{"email":"a@jwt.com","password":"admin"}' | jq -r '.token')

    if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
      TOKENS+=("$TOKEN")
      CURRENT=${#TOKENS[@]}
      echo "  Logged in user (active: $CURRENT)"
    else
      echo "  Login failed"
      break
    fi
  done

  # Logout users if we have too many
  while [ ${#TOKENS[@]} -gt $TARGET ]; do
    LOGOUT_TOKEN="${TOKENS[-1]}"
    curl -s -X DELETE "$HOST/api/auth" \
      -H "Authorization: Bearer $LOGOUT_TOKEN" > /dev/null
    unset 'TOKENS[-1]'
    echo "  Logged out user (active: ${#TOKENS[@]})"
  done

  # Use first token for requests
  TOKEN="${TOKENS[0]}"

  if [ -z "$TOKEN" ]; then
    echo "No active tokens, retrying..."
    sleep 5
    continue
  fi

  # Failed login attempt (auth failure)
  curl -s -X PUT "$HOST/api/auth" \
    -H 'Content-Type: application/json' \
    -d '{"email":"bad@jwt.com","password":"wrong"}' > /dev/null

  # GET requests
  curl -s "$HOST/api/order/menu" > /dev/null
  curl -s "$HOST/api/franchise" > /dev/null
  curl -s -H "Authorization: Bearer $TOKEN" "$HOST/api/order" > /dev/null

  # Order a pizza (POST = pizza sold + revenue + factory latency)
  curl -s -X POST "$HOST/api/order" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"franchiseId":1,"storeId":1,"items":[{"menuId":1,"description":"Veggie","price":0.0038}]}' > /dev/null

  # Another order
  curl -s -X POST "$HOST/api/order" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"franchiseId":1,"storeId":1,"items":[{"menuId":1,"description":"Veggie","price":0.0038},{"menuId":1,"description":"Veggie","price":0.0038}]}' > /dev/null

  # Trigger a factory failure (>20 pizzas)
  ITEMS=$(printf '{"menuId":1,"description":"Veggie","price":0.0038}%.0s,' {1..21})
  ITEMS="[${ITEMS%,}]"
  curl -s -X POST "$HOST/api/order" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"franchiseId\":1,\"storeId\":1,\"items\":$ITEMS}" > /dev/null

  echo "  Active users: ${#TOKENS[@]}, batch complete, waiting 10s..."
  sleep 10
done
