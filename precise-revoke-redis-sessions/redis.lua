local cursor = 0
local dels = 0
local user = ARGV[1]

if string.len(user) < 5 then
  return "user too short"
end

repeat
    local result = redis.call('SCAN', cursor, 'MATCH', 'sess:*', 'COUNT', 1000)

    for _, key in ipairs(result[2]) do
        local token = redis.call('GET', key)
        if string.find(token, user) then
          redis.call('UNLINK', key)
          dels = dels + 1
        end
    end

    cursor = tonumber(result[1])
until cursor == 0

return dels

