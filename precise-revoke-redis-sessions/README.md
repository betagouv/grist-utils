# Precisely revoke sessions in Redis

## Description

This script runs in `redis-cli`.
It requires access to the Redis instances used by Grist.
Because the session object in Redis is a JSON object, the script simplifies by just checking if the object contains the username.
If the username is underspecified, it might delete sessions for other users with similar names.

## Usage

If you have access with `kubectl`, you can copy the script to the instance and prepare the shell like so:
```bash
# specify context and/or namespace
KUBECTL="kubectl -n grist-anct"
REDIS_POD=redis--re-0
# copy the script to the redis instance
$KUBECTL cp redis.lua $REDIS_POD:/tmp/redis.lua
# run a shell on the redis instance
$KUBECTL exec -it $REDIS_POD -- sh

REDIS_FULL_URL="redis://default:$PASS@$REDIS__RE_PORT_6379_TCP_ADDR:$REDIS__RE_SERVICE_PORT"
# load the script in redis, it won't be executed yet
SCRIPTSHA=$(redis-cli -u "$REDIS_FULL_URL" -x script load < /tmp/redis.lua)
# run the script, specifying the user to revoke
redis-cli -u "$REDIS_FULL_URL" evalsha $SCRIPTSHA 0 firstname.surname
```

