# Backend URL Discovery Optimization

## Overview
Optimized the iOS app's backend URL detection to significantly reduce connection time when testing multiple URLs across different network locations.

## Problem
Previously, the app would sequentially test each fallback URL with a 5-30 second timeout, meaning it could take 15-90 seconds to find the working backend URL when the first few URLs were unreachable.

## Solution

### 1. **Parallel URL Discovery**
- All URLs are now tested **concurrently** instead of sequentially
- Uses Swift's `TaskGroup` to test all URLs at the same time
- Returns immediately when the first working URL is found
- Fast 2-second timeout per URL for discovery

### 2. **Persistent Caching**
- Working URL is cached in `UserDefaults` with key `CachedWorkingAPIURL`
- Cache persists across app launches
- Cached URL is prioritized in the fallback list
- Significantly faster on subsequent app launches

### 3. **Reduced Timeouts**
- Discovery health check: **2 seconds** (down from 5-30 seconds)
- Regular API requests: **3 seconds** (down from 5 seconds)
- Streaming requests: **60 seconds** (unchanged, needed for long operations)

### 4. **Smart Discovery Triggering**
- URL discovery only runs when no working URL is known
- Discovery is skipped if:
  - A manual override URL is set
  - A working URL is already cached
  - Discovery is already in progress

## Performance Improvements

### Before:
- **Worst case**: 4 URLs × 5 seconds = **20 seconds**
- **Sequential testing**: One URL at a time
- **No caching**: Re-discovers every app launch

### After:
- **Worst case**: 2 seconds (all URLs tested in parallel)
- **Best case**: < 1 second (using cached URL)
- **Parallel testing**: All URLs tested simultaneously
- **Persistent caching**: Instant on subsequent launches

## API Changes

### APIService & AgentService

#### New Methods:
```swift
// Manually trigger URL discovery
func discoverURL() async

// Clear cached URL to force re-discovery
func clearCachedURL()
```

#### Updated Methods:
```swift
// Now also updates the cache
func setAPIBaseURL(_ url: String?)
```

## Usage

### Normal Operation
The optimization works automatically. On first launch or when switching networks:
1. App attempts to use cached URL
2. If cached URL fails, triggers parallel discovery
3. First working URL is cached and used
4. Subsequent requests use the cached URL immediately

### Manual Network Switch
If you switch networks and need to force re-discovery:

```swift
// Clear the cache
APIService.shared.clearCachedURL()
AgentService.shared.clearCachedURL()

// Optionally trigger immediate discovery
await APIService.shared.discoverURL()
await AgentService.shared.discoverURL()
```

### Manual URL Override
To set a specific URL (bypasses discovery):

```swift
APIService.shared.setAPIBaseURL("http://192.168.1.100:3000")
```

## Technical Details

### Fallback URLs (Physical Device)
```swift
[
    "http://10.0.0.105:3000",
    "http://192.168.1.171:3000",
    "http://192.168.1.2:3000",
    "http://192.168.1.4:3000"
]
```

### URL Priority Order
1. Manual override (`APIBaseURL` in UserDefaults)
2. In-memory working URL (`workingBaseURL`)
3. Cached URL from previous session (`CachedWorkingAPIURL`)
4. Default (localhost for simulator, first fallback for device)

### Health Check Endpoint
- Tests the root endpoint: `GET /`
- Expects 2xx status code
- 2-second timeout
- No authentication required

## Files Modified
- `AI Personal Trainer App/Services/APIService.swift`
- `AI Personal Trainer App/Services/AgentService.swift`

## Testing Recommendations

1. **First Launch**: Verify discovery works and caches the URL
2. **Subsequent Launches**: Verify cached URL is used immediately
3. **Network Switch**: Test `clearCachedURL()` and re-discovery
4. **Unreachable URLs**: Verify fast failover (should complete in ~2 seconds)
5. **Manual Override**: Test `setAPIBaseURL()` bypasses discovery

## Logging

Look for these console messages:

```
🔍 Starting parallel URL discovery for 4 URLs...
✅ Found working URL: http://192.168.1.171:3000
💾 Cached working URL: http://192.168.1.171:3000
```

Or for subsequent requests:
```
🔄 Trying API request to: http://192.168.1.171:3000
✅ Successfully connected to: http://192.168.1.171:3000
```
