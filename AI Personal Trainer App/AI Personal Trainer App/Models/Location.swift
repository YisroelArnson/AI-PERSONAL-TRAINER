//
//  Location.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import Foundation
import CoreLocation

// MARK: - Equipment Item Model

struct EquipmentItem: Identifiable, Codable, Equatable {
    let id: UUID
    var name: String
    var type: String // "free_weights", "machine", "cardio", "bodyweight", "other"
    var weights: [Double]?
    var unit: String? // "kg", "lbs"
    var brand: String?
    var notes: String?
    
    init(
        id: UUID = UUID(),
        name: String,
        type: String,
        weights: [Double]? = nil,
        unit: String? = nil,
        brand: String? = nil,
        notes: String? = nil
    ) {
        self.id = id
        self.name = name
        self.type = type
        self.weights = weights
        self.unit = unit
        self.brand = brand
        self.notes = notes
    }
}

// MARK: - Location Model

struct Location: Identifiable, Equatable {
    let id: Int64
    var name: String
    var description: String?
    var equipment: [EquipmentItem]
    var currentLocation: Bool
    var geoData: CLLocationCoordinate2D?
    var createdAt: Date?
    
    init(
        id: Int64,
        name: String,
        description: String? = nil,
        equipment: [EquipmentItem] = [],
        currentLocation: Bool = false,
        geoData: CLLocationCoordinate2D? = nil,
        createdAt: Date? = nil
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.equipment = equipment
        self.currentLocation = currentLocation
        self.geoData = geoData
        self.createdAt = createdAt
    }
    
    // Custom Equatable implementation
    static func == (lhs: Location, rhs: Location) -> Bool {
        return lhs.id == rhs.id &&
               lhs.name == rhs.name &&
               lhs.description == rhs.description &&
               lhs.equipment == rhs.equipment &&
               lhs.currentLocation == rhs.currentLocation &&
               lhs.createdAt == rhs.createdAt &&
               coordinatesEqual(lhs.geoData, rhs.geoData)
    }
    
    private static func coordinatesEqual(_ lhs: CLLocationCoordinate2D?, _ rhs: CLLocationCoordinate2D?) -> Bool {
        guard let lhs = lhs, let rhs = rhs else {
            return lhs == nil && rhs == nil
        }
        return abs(lhs.latitude - rhs.latitude) < 0.000001 &&
               abs(lhs.longitude - rhs.longitude) < 0.000001
    }
}

// MARK: - Location Codable Implementation

extension Location: Codable {
    enum CodingKeys: String, CodingKey {
        case id
        case name
        case description
        case equipment
        case currentLocation
        case geoData
        case createdAt
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        
        id = try container.decode(Int64.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        equipment = try container.decode([EquipmentItem].self, forKey: .equipment)
        currentLocation = try container.decode(Bool.self, forKey: .currentLocation)
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt)
        
        // Decode geoData as String (PostGIS format) and convert to CLLocationCoordinate2D
        if let geoDataString = try container.decodeIfPresent(String.self, forKey: .geoData) {
            geoData = Location.coordinateFromPostGIS(geoDataString)
        } else {
            geoData = nil
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encode(equipment, forKey: .equipment)
        try container.encode(currentLocation, forKey: .currentLocation)
        try container.encodeIfPresent(createdAt, forKey: .createdAt)
        
        // Encode geoData as String (PostGIS format)
        if let geoData = geoData {
            try container.encode(Location.postGISFromCoordinate(geoData), forKey: .geoData)
        } else {
            try container.encodeNil(forKey: .geoData)
        }
    }
}

// MARK: - Location Database Model

struct LocationDB: Codable {
    let id: Int64
    let user_id: UUID
    let name: String
    let description: String?
    let geo_data: String? // PostGIS geography stored as WKT string "POINT(lon lat)"
    let equipment: [EquipmentItem]? // JSONB array
    let current_location: Bool?
    let created_at: Date?
    
    enum CodingKeys: String, CodingKey {
        case id
        case user_id
        case name
        case description
        case geo_data
        case equipment
        case current_location
        case created_at
    }
    
    // Custom decoder to handle PostGIS geography and JSONB equipment
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        
        id = try container.decode(Int64.self, forKey: .id)
        user_id = try container.decode(UUID.self, forKey: .user_id)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        geo_data = try container.decodeIfPresent(String.self, forKey: .geo_data)
        current_location = try container.decodeIfPresent(Bool.self, forKey: .current_location)
        created_at = try container.decodeIfPresent(Date.self, forKey: .created_at)
        
        // Decode equipment JSONB array - handle both array and null cases
        if container.contains(.equipment) {
            do {
                // Try to decode as array directly
                equipment = try container.decodeIfPresent([EquipmentItem].self, forKey: .equipment)
            } catch {
                // If direct decode fails, try decoding as JSON data and then parsing
                print("⚠️ Failed to decode equipment directly: \(error)")
                // Set to empty array if decoding fails
                equipment = []
            }
        } else {
            equipment = nil
        }
    }
}

// MARK: - PostGIS Geography Helpers

extension Location {
    /// Convert PostGIS format (WKT string or EWKB hex) to CLLocationCoordinate2D
    static func coordinateFromPostGIS(_ geoData: String?) -> CLLocationCoordinate2D? {
        guard let geoData = geoData else { 
            print("📍 coordinateFromPostGIS: geoData is nil")
            return nil 
        }
        
        print("📍 coordinateFromPostGIS: parsing geoData: \(geoData)")
        
        // Helper function to check if character is hex digit
        func isHexDigit(_ char: Character) -> Bool {
            return char.isNumber || ("a"..."f").contains(char.lowercased())
        }
        
        // Check if it's EWKB hex format (starts with "01" or "00" and is all hex)
        if geoData.hasPrefix("01") || geoData.hasPrefix("00"), 
           geoData.count >= 32,
           geoData.allSatisfy({ isHexDigit($0) }) {
            // Try to parse EWKB hex format
            if let coordinate = parseEWKBHex(geoData) {
                print("✅ coordinateFromPostGIS: Successfully parsed EWKB - Lat: \(coordinate.latitude), Lon: \(coordinate.longitude)")
                return coordinate
            }
        }
        
        // Try WKT format patterns
        // Pattern 1: "POINT(lon lat)" - standard WKT format
        let pattern1 = #"POINT\(([-\d.]+)\s+([-\d.]+)\)"#
        // Pattern 2: "POINT(lon lat)" with optional spaces
        let pattern2 = #"POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)"#
        // Pattern 3: Handle scientific notation: "POINT(1.23e+00 4.56e+00)"
        let pattern3 = #"POINT\s*\(\s*([-\d.Ee+-]+)\s+([-\d.Ee+-]+)\s*\)"#
        
        let patterns = [pattern1, pattern2, pattern3]
        
        for pattern in patterns {
            if let regex = try? NSRegularExpression(pattern: pattern),
               let match = regex.firstMatch(in: geoData, range: NSRange(geoData.startIndex..., in: geoData)),
               match.numberOfRanges == 3,
               let lonRange = Range(match.range(at: 1), in: geoData),
               let latRange = Range(match.range(at: 2), in: geoData) {
                
                let lonString = String(geoData[lonRange])
                let latString = String(geoData[latRange])
                
                if let lon = Double(lonString),
                   let lat = Double(latString) {
                    let coordinate = CLLocationCoordinate2D(latitude: lat, longitude: lon)
                    print("✅ coordinateFromPostGIS: Successfully parsed WKT - Lat: \(lat), Lon: \(lon)")
                    return coordinate
                }
            }
        }
        
        print("⚠️ coordinateFromPostGIS: Failed to parse geoData with all patterns: \(geoData)")
        return nil
    }
    
    /// Parse EWKB hex string to extract coordinates
    /// EWKB format: [endian][type][SRID][coordinates]
    /// For POINT: endian (1 byte) + type (4 bytes) + SRID (4 bytes) + X (8 bytes double) + Y (8 bytes double)
    private static func parseEWKBHex(_ hex: String) -> CLLocationCoordinate2D? {
        guard hex.count >= 34 else { return nil } // Minimum for POINT with SRID
        
        // Convert hex string to Data
        var hexString = hex
        var data = Data()
        var index = hexString.startIndex
        
        while index < hexString.endIndex {
            let nextIndex = hexString.index(index, offsetBy: 2, limitedBy: hexString.endIndex) ?? hexString.endIndex
            if nextIndex > index {
                let hexByte = String(hexString[index..<nextIndex])
                if let byte = UInt8(hexByte, radix: 16) {
                    data.append(byte)
                } else {
                    return nil
                }
                index = nextIndex
            } else {
                break
            }
        }
        
        guard data.count >= 25 else { return nil } // Need at least 25 bytes for POINT with SRID
        
        // Parse EWKB structure
        // Byte 0: Endianness (01 = little endian, 00 = big endian)
        let endianness = data[0]
        let isLittleEndian = endianness == 0x01
        
        // Helper function to read UInt32 from bytes
        func readUInt32(from bytes: Data, littleEndian: Bool) -> UInt32 {
            let bytesArray = Array(bytes)
            if littleEndian {
                return UInt32(bytesArray[0]) |
                       (UInt32(bytesArray[1]) << 8) |
                       (UInt32(bytesArray[2]) << 16) |
                       (UInt32(bytesArray[3]) << 24)
            } else {
                return (UInt32(bytesArray[0]) << 24) |
                       (UInt32(bytesArray[1]) << 16) |
                       (UInt32(bytesArray[2]) << 8) |
                       UInt32(bytesArray[3])
            }
        }
        
        // Helper function to read Double from bytes (8 bytes)
        func readDouble(from bytes: Data, littleEndian: Bool) -> Double {
            let bytesArray = Array(bytes)
            guard bytesArray.count == 8 else { return 0 }
            
            // Use bitPattern to construct Double from bytes
            var value: UInt64 = 0
            if littleEndian {
                for i in 0..<8 {
                    value |= UInt64(bytesArray[i]) << (i * 8)
                }
            } else {
                for i in 0..<8 {
                    value |= UInt64(bytesArray[7-i]) << (i * 8)
                }
            }
            return Double(bitPattern: value)
        }
        
        // Bytes 1-4: Geometry type
        guard data.count >= 5 else { return nil }
        let typeBytes = data[1..<5]
        let typeValue = readUInt32(from: typeBytes, littleEndian: isLittleEndian)
        
        // Type 0x00000001 = POINT (without SRID), 0x20000001 = POINT with SRID
        guard typeValue == 0x00000001 || typeValue == 0x20000001 else { 
            print("⚠️ parseEWKBHex: Unexpected geometry type: \(String(typeValue, radix: 16))")
            return nil 
        }
        
        // Check if SRID is present (typeValue & 0x20000000)
        let hasSRID = (typeValue & 0x20000000) != 0
        let offset = hasSRID ? 9 : 5 // Skip SRID if present (4 bytes)
        
        // Ensure we have enough bytes for coordinates (16 bytes: 8 for X, 8 for Y)
        guard data.count >= offset + 16 else { 
            print("⚠️ parseEWKBHex: Not enough data for coordinates. Have \(data.count) bytes, need \(offset + 16)")
            return nil 
        }
        
        // X coordinate (longitude) as double (8 bytes)
        // Y coordinate (latitude) as double (8 bytes)
        let xBytes = data[offset..<offset+8]
        let yBytes = data[offset+8..<offset+16]
        
        let longitude = readDouble(from: xBytes, littleEndian: isLittleEndian)
        let latitude = readDouble(from: yBytes, littleEndian: isLittleEndian)
        
        print("📍 parseEWKBHex: Extracted coordinates - Lat: \(latitude), Lon: \(longitude)")
        
        return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
    
    /// Convert CLLocationCoordinate2D to PostGIS WKT string
    static func postGISFromCoordinate(_ coordinate: CLLocationCoordinate2D) -> String {
        return "POINT(\(coordinate.longitude) \(coordinate.latitude))"
    }
}


