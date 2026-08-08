-- Debug helpers injected by pi-playdate at DAP connect time.

local ad = {}

local function ad_is_identifier(value)
  return type(value) == "string" and value:match("^[_%a][_%w]*$") ~= nil
end

local function ad_quote_string(value)
  return string.format("%q", value)
end

local AD_MAX_DEPTH = 4
local AD_MAX_ITEMS = 12

local function ad_is_sequence_key(key, sequenceEnd)
  return type(key) == "number" and key >= 1 and key < sequenceEnd and key % 1 == 0
end

local function ad_resolve_path(value, path)
  local current = value
  if path == nil or path == "" then return true, current end

  for segment in string.gmatch(path, "[^.]+") do
    if type(current) ~= "table" then
      return false, "non-table at '" .. segment .. "'"
    end

    local key = tonumber(segment)
    if key == nil then key = segment end
    current = current[key]

    if current == nil then
      return false, "missing key '" .. segment .. "'"
    end
  end

  return true, current
end

local function ad_slice_value(value, start, maxItems)
  if type(value) ~= "table" or start == nil or start <= 1 then return value end

  local sliced = {}
  local out = 0
  local index = start
  while rawget(value, index) ~= nil and out < maxItems do
    out = out + 1
    sliced[out] = value[index]
    index = index + 1
  end
  if rawget(value, index) ~= nil then
    sliced[out + 1] = "<truncated>"
  end
  return sliced
end

local function ad_collect_keys(value, start, maxItems)
  if type(value) ~= "table" then return value end

  local keys = {}
  local count = 0
  local sequenceStart = start or 1
  local index = sequenceStart

  while rawget(value, index) ~= nil and count < maxItems do
    count = count + 1
    keys[count] = index
    index = index + 1
  end

  for key in pairs(value) do
    if not ad_is_sequence_key(key, index) then
      if type(key) ~= "number" or key < sequenceStart or key % 1 ~= 0 then
        if count >= maxItems then
          count = count + 1
          keys[count] = "<truncated>"
          break
        end
        count = count + 1
        keys[count] = key
      end
    end
  end

  return keys
end

local function ad_dump_value(value, seen, depth, maxDepth, maxItems)
  local valueType = type(value)

  if value == nil then return "nil" end
  if valueType == "string" then return ad_quote_string(value) end
  if valueType == "number" or valueType == "boolean" then return tostring(value) end
  if valueType ~= "table" then return string.format("<%s>", valueType) end

  if seen[value] then return "<cycle>" end
  if depth >= maxDepth then return "<max-depth>" end

  seen[value] = true

  local parts = {}
  local count = 0
  local index = 1

  while rawget(value, index) ~= nil do
    if count >= maxItems then
      count = count + 1
      parts[count] = "<truncated>"
      break
    end
    count = count + 1
    parts[count] = ad_dump_value(value[index], seen, depth + 1, maxDepth, maxItems)
    index = index + 1
  end

  if count < maxItems then
    for key, nested in pairs(value) do
      if not ad_is_sequence_key(key, index) then
        if count >= maxItems then
          count = count + 1
          parts[count] = "<truncated>"
          break
        end
        local renderedKey
        if ad_is_identifier(key) then
          renderedKey = key
        else
          renderedKey = "[" .. ad_dump_value(key, seen, depth + 1, maxDepth, maxItems) .. "]"
        end
        count = count + 1
        parts[count] = renderedKey .. " = " .. ad_dump_value(nested, seen, depth + 1, maxDepth, maxItems)
      end
    end
  end

  seen[value] = nil
  return "{ " .. table.concat(parts, ", ") .. " }"
end

function ad.dump(...)
  local n = select("#", ...)
  if n == 0 then return "nil" end

  local args = table.pack(...)
  if n == 1 then return ad_dump_value(args[1], {}, 0, AD_MAX_DEPTH, AD_MAX_ITEMS) end

  local parts = {}
  for i = 1, n do
    parts[i] = ad_dump_value(args[i], {}, 0, AD_MAX_DEPTH, AD_MAX_ITEMS)
  end
  return "(" .. table.concat(parts, ", ") .. ")"
end

function ad.inspect(value, opts)
  opts = opts or {}
  local maxDepth = opts.depth or AD_MAX_DEPTH
  local maxItems = opts.items or AD_MAX_ITEMS
  local start = opts.start or 1

  local ok, selected = ad_resolve_path(value, opts.keypath)
  if not ok then return "<error: " .. selected .. ">" end

  if opts.keysOnly then
    selected = ad_collect_keys(selected, start, maxItems)
  else
    selected = ad_slice_value(selected, start, maxItems)
  end

  return ad_dump_value(selected, {}, 0, maxDepth, maxItems)
end

function ad.state()
  local function tri(fn)
    local ok, a, b, c = pcall(fn)
    if not ok then return nil, nil, nil end
    return a, b, c
  end

  local ax, ay, az = tri(function() return playdate.readAccelerometer() end)
  local parts = {
    "crank_pos=" .. tostring(playdate.getCrankPosition()),
    "crank_change=" .. tostring(playdate.getCrankChange()),
    "crank_docked=" .. tostring(playdate.isCrankDocked()),
    "accel_x=" .. tostring(ax),
    "accel_y=" .. tostring(ay),
    "accel_z=" .. tostring(az),
    "btn_up=" .. tostring(playdate.buttonIsPressed(playdate.kButtonUp)),
    "btn_down=" .. tostring(playdate.buttonIsPressed(playdate.kButtonDown)),
    "btn_left=" .. tostring(playdate.buttonIsPressed(playdate.kButtonLeft)),
    "btn_right=" .. tostring(playdate.buttonIsPressed(playdate.kButtonRight)),
    "btn_a=" .. tostring(playdate.buttonIsPressed(playdate.kButtonA)),
    "btn_b=" .. tostring(playdate.buttonIsPressed(playdate.kButtonB)),
    "fps=" .. tostring(playdate.getFPS()),
    "elapsed_time=" .. tostring(playdate.getElapsedTime()),
    "current_time_ms=" .. tostring(playdate.getCurrentTimeMilliseconds()),
    "battery_pct=" .. tostring(playdate.getBatteryPercentage()),
  }
  return table.concat(parts, "|")
end

return ad
