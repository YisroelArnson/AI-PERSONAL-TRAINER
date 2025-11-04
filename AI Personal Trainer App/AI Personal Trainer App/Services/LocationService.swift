//
//  LocationService.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import Foundation
import CoreLocation
import Combine

/// Service for handling GPS location permissions and coordinate retrieval
@MainActor
class LocationService: NSObject, ObservableObject {
    static let shared = LocationService()
    
    private let locationManager = CLLocationManager()
    @Published var authorizationStatus: CLAuthorizationStatus
    @Published var currentCoordinate: CLLocationCoordinate2D?
    @Published var error: Error?
    
    private var locationContinuation: CheckedContinuation<CLLocationCoordinate2D?, Error>?
    private var authorizationContinuation: CheckedContinuation<CLAuthorizationStatus, Never>?
    
    override init() {
        self.authorizationStatus = locationManager.authorizationStatus
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
    }
    
    /// Request location permission
    func requestPermission() {
        locationManager.requestWhenInUseAuthorization()
    }
    
    /// Wait for authorization status to change after requesting permission
    /// Returns the final authorization status
    func waitForAuthorization() async -> CLAuthorizationStatus {
        // If already authorized, return immediately
        if authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways {
            return authorizationStatus
        }
        
        // If already denied, return immediately
        if authorizationStatus == .denied || authorizationStatus == .restricted {
            return authorizationStatus
        }
        
        // Wait for authorization status to change (not .notDetermined)
        return await withCheckedContinuation { continuation in
            self.authorizationContinuation = continuation
            
            // Set a timeout to avoid waiting forever
            Task {
                try? await Task.sleep(nanoseconds: 10_000_000_000) // 10 seconds timeout
                if let continuation = self.authorizationContinuation {
                    self.authorizationContinuation = nil
                    continuation.resume(returning: self.authorizationStatus)
                }
            }
        }
    }
    
    /// Get current location coordinates
    /// Returns nil if permission denied or location unavailable
    func getCurrentLocation() async throws -> CLLocationCoordinate2D? {
        guard authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways else {
            print("⚠️ getCurrentLocation: Permission not granted. Status: \(authorizationStatus.rawValue)")
            throw LocationError.permissionDenied
        }
        
        // If there's already a pending request, cancel it first
        if let existingContinuation = locationContinuation {
            print("⚠️ getCurrentLocation: Cancelling existing request")
            locationContinuation = nil
            existingContinuation.resume(throwing: LocationError.locationUnavailable)
        }
        
        print("📍 getCurrentLocation: Starting location request...")
        
        return try await withCheckedThrowingContinuation { continuation in
            self.locationContinuation = continuation
            
            // Set a timeout to ensure continuation is always resumed
            Task {
                try? await Task.sleep(nanoseconds: 15_000_000_000) // 15 seconds timeout
                // Use atomic check-and-clear pattern
                let timeoutContinuation = self.locationContinuation
                if timeoutContinuation != nil {
                    print("⚠️ getCurrentLocation: Timeout after 15 seconds")
                    self.locationContinuation = nil
                    timeoutContinuation?.resume(throwing: LocationError.locationUnavailable)
                }
            }
            
            // Call requestLocation() asynchronously to avoid blocking main thread
            Task { @MainActor in
                // Double-check authorization status before requesting
                if self.authorizationStatus == .authorizedWhenInUse || self.authorizationStatus == .authorizedAlways {
                    self.locationManager.requestLocation()
                } else {
                    // Authorization changed between check and request
                    let continuation = self.locationContinuation
                    self.locationContinuation = nil
                    continuation?.resume(throwing: LocationError.permissionDenied)
                }
            }
        }
    }
    
    /// Convert CLLocationCoordinate2D to PostGIS WKT format
    static func postGISFromCoordinate(_ coordinate: CLLocationCoordinate2D) -> String {
        return "POINT(\(coordinate.longitude) \(coordinate.latitude))"
    }
    
    /// Convert PostGIS WKT string to CLLocationCoordinate2D
    static func coordinateFromPostGIS(_ wkt: String?) -> CLLocationCoordinate2D? {
        guard let wkt = wkt else { return nil }
        
        // Parse "POINT(lon lat)" format
        let pattern = #"POINT\(([-\d.]+)\s+([-\d.]+)\)"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: wkt, range: NSRange(wkt.startIndex..., in: wkt)),
              match.numberOfRanges == 3,
              let lonRange = Range(match.range(at: 1), in: wkt),
              let latRange = Range(match.range(at: 2), in: wkt),
              let lon = Double(String(wkt[lonRange])),
              let lat = Double(String(wkt[latRange])) else {
            return nil
        }
        
        return CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }
    
    // MARK: - Auto-Detection Helpers
    
    /// Calculate distance in meters between two coordinates
    static func distance(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> CLLocationDistance {
        let fromLocation = CLLocation(latitude: from.latitude, longitude: from.longitude)
        let toLocation = CLLocation(latitude: to.latitude, longitude: to.longitude)
        return fromLocation.distance(from: toLocation)
    }
    
    /// Find the nearest location within a given radius
    /// Returns nil if no locations are within the radius or if no locations have GPS coordinates
    /// - Parameters:
    ///   - currentCoordinate: The current GPS coordinate to search from
    ///   - radius: Maximum distance in meters (default: 500)
    ///   - locations: Array of Location objects to search through
    /// - Returns: The nearest Location within radius, or nil if none found
    func findNearestLocation(
        from currentCoordinate: CLLocationCoordinate2D,
        within radius: CLLocationDistance = 500,
        from locations: [Location]
    ) -> Location? {
        // Filter locations that have GPS coordinates
        let locationsWithGPS = locations.filter { $0.geoData != nil }
        
        guard !locationsWithGPS.isEmpty else {
            print("📍 findNearestLocation: No locations with GPS coordinates")
            return nil
        }
        
        // Calculate distances and find the nearest
        var nearestLocation: Location?
        var nearestDistance: CLLocationDistance = radius
        
        for location in locationsWithGPS {
            guard let locationCoordinate = location.geoData else { continue }
            
            let distance = LocationService.distance(from: currentCoordinate, to: locationCoordinate)
            
            print("📍 Location '\(location.name)' is \(Int(distance))m away")
            
            // Check if this location is closer and within radius
            if distance <= nearestDistance {
                nearestDistance = distance
                nearestLocation = location
            }
        }
        
        if let nearest = nearestLocation {
            print("✅ Nearest location found: '\(nearest.name)' at \(Int(nearestDistance))m")
        } else {
            print("📍 No locations found within \(Int(radius))m radius")
        }
        
        return nearestLocation
    }
}

// MARK: - CLLocationManagerDelegate

extension LocationService: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            // Use a lock-like pattern: check and clear continuation atomically
            let continuation = self.locationContinuation
            guard continuation != nil else {
                print("📍 didUpdateLocations: No continuation, ignoring update")
                return // Continuation already resumed or cancelled
            }
            
            // Clear continuation immediately to prevent race conditions
            self.locationContinuation = nil
            
            if let location = locations.first {
                let coordinate = location.coordinate
                print("✅ didUpdateLocations: Got location - Lat: \(coordinate.latitude), Lon: \(coordinate.longitude)")
                self.currentCoordinate = coordinate
                continuation?.resume(returning: coordinate)
            } else {
                print("⚠️ didUpdateLocations: Empty locations array")
                continuation?.resume(returning: nil)
            }
        }
    }
    
    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            // Use a lock-like pattern: check and clear continuation atomically
            let continuation = self.locationContinuation
            guard continuation != nil else {
                print("📍 didFailWithError: No continuation, ignoring error")
                return // Continuation already resumed or cancelled
            }
            
            // Clear continuation immediately to prevent race conditions
            self.locationContinuation = nil
            
            let clError = error as? CLError
            let errorCode = clError?.code.rawValue ?? -1
            
            print("⚠️ didFailWithError: \(error.localizedDescription) (Code: \(errorCode))")
            
            // Handle specific CLError codes
            if let clError = clError {
                switch clError.code {
                case .locationUnknown:
                    // Location is temporarily unavailable, but we might get it later
                    print("📍 Location temporarily unknown, this might resolve")
                    self.error = error
                    continuation?.resume(throwing: LocationError.locationUnavailable)
                case .denied:
                    print("📍 Location access denied")
                    self.error = error
                    continuation?.resume(throwing: LocationError.permissionDenied)
                case .network:
                    print("⚠️ Location network error")
                    self.error = error
                    continuation?.resume(throwing: LocationError.locationUnavailable)
                default:
                    print("⚠️ Other location error: \(clError.localizedDescription)")
                    self.error = error
                    continuation?.resume(throwing: error)
                }
            } else {
                self.error = error
                continuation?.resume(throwing: error)
            }
        }
    }
    
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            let newStatus = manager.authorizationStatus
            self.authorizationStatus = newStatus
            
            // Resume any waiting authorization continuation
            if let continuation = self.authorizationContinuation {
                self.authorizationContinuation = nil
                continuation.resume(returning: newStatus)
            }
        }
    }
}

// MARK: - Location Errors

enum LocationError: LocalizedError {
    case permissionDenied
    case locationUnavailable
    
    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Location permission denied. Please enable location access in Settings."
        case .locationUnavailable:
            return "Unable to determine current location."
        }
    }
}

