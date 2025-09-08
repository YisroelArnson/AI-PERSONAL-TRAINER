//
//  ProfileView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 8/22/25.
//

import SwiftUI

struct ProfileView: View {
  @ObservedObject var locationManager: UserLocationManager
  
  init(locationManager: UserLocationManager) {
    self.locationManager = locationManager
  }
  @State var first_name = ""
  @State var last_name = ""
  
  // Body stats fields
  @State var sex = ""
  @State var dob = Date()
  @State var height_cm = ""
  @State var weight_kg = ""
  @State var body_fat_pct = ""

  @State var isLoading = false

  // Goals state - muscles
  @State var muscleGoals: [UserMuscleAndWeightRow] = []
  @State var newMuscleName: String = ""
  @State var newMuscleWeight: String = ""

  // Goals state - categories
  @State var categoryGoals: [UserCategoryAndWeightsRow] = []
  @State var newCategoryName: String = ""
  @State var newCategoryUnits: String = "min"
  @State var newCategoryDescription: String = ""
  @State var newCategoryEnabled: Bool = true
  @State var newCategoryWeight: String = ""

  // Allowed units for category goals (must match DB enum exactly)
  let categoryUnitOptions: [String] = ["min", "sets", "distance_km", "points"]

  // Preferences state
  @State var userPreferences: [UserPreferenceRow] = []
  @State var newPreferenceType: String = ""
  @State var newPreferenceDescription: String = ""
  @State var newPreferenceUserTranscription: String = ""
  @State var newPreferenceGuidance: String = ""
  @State var newPreferenceExpireTime: Date = Date()
  @State var newPreferenceDeleteAfterCall: Bool = false

  // Preference type options
  let preferenceTypeOptions: [String] = ["workout", "diet", "lifestyle", "equipment", "schedule", "other"]

  // Locations state
  @State var newLocationName: String = ""
  @State var newLocationDescription: String = ""
  @State var newLocationGeoData: String = ""
  @State var newLocationEquipment: [String] = []
  @State var newLocationCurrent: Bool = false
  @State var newEquipmentItem: String = ""

  // Equipment options for quick selection
  let commonEquipmentOptions: [String] = [
    "dumbbells", "barbell", "kettlebell", "resistance_bands", "bench", "squat_rack",
    "pull_up_bar", "treadmill", "elliptical", "rowing_machine", "yoga_mat", "foam_roller"
  ]

  var body: some View {
    NavigationStack {
      Form {
        Section("Personal Information") {
          TextField("First name", text: $first_name)
            .textContentType(.givenName)
          TextField("Last name", text: $last_name)
            .textContentType(.familyName)
          
          Button("Update Personal Information") {
            updatePersonalInfoButtonTapped()
          }
          .bold()
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
          .background(Color.green)
          .foregroundColor(.white)
          .cornerRadius(8)
        }
        
        Section("Body Statistics") {
          Picker("Sex", selection: $sex) {
            Text("Select...").tag("")
            Text("Male").tag("male")
            Text("Female").tag("female")
            Text("Other").tag("other")
          }
          
          DatePicker("Date of Birth", selection: $dob, displayedComponents: .date)
          
          HStack {
            TextField("Height", text: $height_cm)
              .keyboardType(.decimalPad)
            Text("cm")
          }
          
          HStack {
            TextField("Weight", text: $weight_kg)
              .keyboardType(.decimalPad)
            Text("kg")
          }
          
          HStack {
            TextField("Body Fat %", text: $body_fat_pct)
              .keyboardType(.decimalPad)
            Text("%")
        }

          Button("Update Body Statistics") {
            updateBodyStatsButtonTapped()
          }
          .bold()
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
          .background(Color.orange)
          .foregroundColor(.white)
          .cornerRadius(8)
        }

        Section("Muscle Goals") {
          if muscleGoals.isEmpty {
            Text("No muscle goals yet.").foregroundStyle(.secondary)
          }
          ForEach(muscleGoals, id: \ .id) { goal in
            HStack {
              VStack(alignment: .leading) {
                Text(goal.muscle).font(.body)
                Text("Weight: \(goal.weight, specifier: "%.2f")").font(.caption).foregroundStyle(.secondary)
              }
              Spacer()
              Button(role: .destructive) {
                Task { await deleteMuscleGoal(goalId: goal.id) }
              } label: {
                Image(systemName: "trash")
              }
            }
          }
          HStack {
            TextField("Muscle", text: $newMuscleName)
            TextField("Weight", text: $newMuscleWeight).keyboardType(.decimalPad)
            Button("Add") { Task { await addMuscleGoal() } }
              .disabled(newMuscleName.isEmpty || Double(newMuscleWeight) == nil)
          }
        }

        Section("Category Goals") {
          if categoryGoals.isEmpty {
            Text("No category goals yet.").foregroundStyle(.secondary)
          }
          ForEach(categoryGoals, id: \ .id) { goal in
            VStack(alignment: .leading) {
              HStack {
                VStack(alignment: .leading) {
                  Text(goal.category).font(.body)
                  Text("Units: \(goal.units)  •  Weight: \(goal.weight, specifier: "%.2f")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                  if !goal.description.isEmpty {
                    Text(goal.description).font(.caption2).foregroundStyle(.secondary)
                  }
                  Text(goal.enabled ? "Enabled" : "Disabled").font(.caption2)
                }
                Spacer()
                Button(role: .destructive) {
                  Task { await deleteCategoryGoal(goalId: goal.id) }
                } label: {
                  Image(systemName: "trash")
                }
              }
            }
          }
          VStack(spacing: 8) {
            TextField("Category", text: $newCategoryName)
            HStack {
              Text("Units:")
              Picker("Units", selection: $newCategoryUnits) {
                ForEach(categoryUnitOptions, id: \.self) { unit in
                  Text(unit).tag(unit)
                }
              }
              .pickerStyle(MenuPickerStyle())
            }
            TextField("Description", text: $newCategoryDescription)
            Toggle("Enabled", isOn: $newCategoryEnabled)
            HStack {
              TextField("Weight", text: $newCategoryWeight).keyboardType(.decimalPad)
            }
            Button("Add Category Goal") { Task { await addCategoryGoal() } }
              .disabled(newCategoryName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !categoryUnitOptions.contains(newCategoryUnits) || Double(newCategoryWeight) == nil)
              .frame(maxWidth: .infinity)
              .padding(.vertical, 8)
              .background(Color.blue)
              .foregroundColor(.white)
              .cornerRadius(8)
          }
        }

        Section("User Preferences") {
          if userPreferences.isEmpty {
            Text("No preferences set yet.").foregroundStyle(.secondary)
          } else {
            ForEach(userPreferences, id: \.id) { preference in
              VStack(alignment: .leading, spacing: 4) {
                HStack {
                  VStack(alignment: .leading) {
                    Text(preference.type.capitalized).font(.subheadline).fontWeight(.semibold)
                    Text(preference.description).font(.caption).foregroundStyle(.secondary)
                    if let userTranscription = preference.user_transcription, !userTranscription.isEmpty {
                      Text("Note: \(userTranscription)").font(.caption2).foregroundStyle(.secondary)
                    }
                    if let guidance = preference.recommendations_guidance, !guidance.isEmpty {
                      Text("Guidance: \(guidance)").font(.caption2).foregroundStyle(.secondary)
                    }
                    if let expireTime = preference.expire_time {
                      Text("Expires: \(expireTime)").font(.caption2).foregroundStyle(.secondary)
                    }
                    Text(preference.delete_after_call ? "Delete after call" : "Keep after call").font(.caption2)
                  }
                  Spacer()
                  Button(role: .destructive) {
                    Task { await deletePreference(preferenceId: preference.id) }
                  } label: {
                    Image(systemName: "trash")
                  }
                }
              }
              .padding(8)
              .background(Color.gray.opacity(0.1))
              .cornerRadius(8)
            }
          }
          
          VStack(spacing: 8) {
            Picker("Type", selection: $newPreferenceType) {
              Text("Select type...").tag("")
              ForEach(preferenceTypeOptions, id: \.self) { type in
                Text(type.capitalized).tag(type)
              }
            }
            .pickerStyle(MenuPickerStyle())
            
            TextField("Description", text: $newPreferenceDescription)
            TextField("User Note (optional)", text: $newPreferenceUserTranscription)
            TextField("Guidance for AI (optional)", text: $newPreferenceGuidance)
            
            DatePicker("Expire Time (optional)", selection: $newPreferenceExpireTime, displayedComponents: [.date, .hourAndMinute])
            
            Toggle("Delete after call", isOn: $newPreferenceDeleteAfterCall)
          }
          
          // Separate button section to avoid tap conflicts
          Button("Add Preference") { Task { await addPreference() } }
            .disabled(newPreferenceType.isEmpty || newPreferenceDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Color.purple)
            .foregroundColor(.white)
            .cornerRadius(8)
            .padding(.top, 8)
        }

        Section("User Locations") {
          HStack {
            Text("User Locations")
            Spacer()
            Button(action: { Task { await locationManager.refreshLocations() } }) {
              Image(systemName: "arrow.clockwise")
                .foregroundColor(.blue)
            }
          }
          
          if locationManager.userLocations.isEmpty {
            Text("No locations set yet.").foregroundStyle(.secondary)
          } else {
            ForEach(locationManager.userLocations, id: \.id) { location in
              VStack(alignment: .leading, spacing: 4) {
                HStack {
                  VStack(alignment: .leading) {
                    HStack {
                      Text(location.name).font(.subheadline).fontWeight(.semibold)
                      if location.current_location {
                        Text("(Current)").font(.caption).foregroundColor(.green)
                      }
                    }
                    if let description = location.description, !description.isEmpty {
                      Text(description).font(.caption).foregroundStyle(.secondary)
                    }
                    if let equipment = location.equipment, !equipment.isEmpty {
                      Text("Equipment: \(equipment.joined(separator: ", "))").font(.caption2).foregroundStyle(.secondary)
                    }
                  }
                  Spacer()
                  VStack(spacing: 12) {
                    // Current location toggle
                    Button(action: {
                      if !location.current_location {
                        Task { await updateCurrentLocation(locationId: location.id) }
                      }
                    }) {
                      HStack(spacing: 6) {
                        Image(systemName: location.current_location ? "checkmark.circle.fill" : "circle")
                          .foregroundColor(location.current_location ? .green : .blue)
                          .font(.system(size: 16))
                        Text(location.current_location ? "Current" : "Set Current")
                          .font(.caption)
                          .foregroundColor(location.current_location ? .green : .blue)
                      }
                      .padding(.horizontal, 12)
                      .padding(.vertical, 8)
                      .background(Color.blue.opacity(0.1))
                      .cornerRadius(8)
                    }
                    .disabled(location.current_location)
                    .buttonStyle(PlainButtonStyle())
                    
                    // Delete button
                    Button(role: .destructive) {
                      Task { await deleteLocation(locationId: location.id) }
                    } label: {
                      HStack(spacing: 6) {
                        Image(systemName: "trash")
                          .foregroundColor(.red)
                          .font(.system(size: 16))
                        Text("Delete")
                          .font(.caption)
                          .foregroundColor(.red)
                      }
                      .padding(.horizontal, 12)
                      .padding(.vertical, 8)
                      .background(Color.red.opacity(0.1))
                      .cornerRadius(8)
                    }
                    .buttonStyle(PlainButtonStyle())
                  }
                }
              }
              .padding(8)
              .background(Color.gray.opacity(0.1))
              .cornerRadius(8)
            }
          }
          
          VStack(spacing: 8) {
            TextField("Location Name", text: $newLocationName)
            TextField("Description (optional)", text: $newLocationDescription)
            TextField("Geo Data (optional)", text: $newLocationGeoData)
            
            VStack(alignment: .leading, spacing: 4) {
              Text("Equipment:")
                .font(.caption)
                .foregroundColor(.secondary)
              
              // Quick equipment selection
              LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 8) {
                ForEach(commonEquipmentOptions, id: \.self) { equipment in
                  Button(action: {
                    print("Tapped equipment: \(equipment)")
                    print("Current array: \(newLocationEquipment)")
                    
                    // Create a new array to ensure state update
                    var updatedEquipment = newLocationEquipment
                    if updatedEquipment.contains(equipment) {
                      updatedEquipment.removeAll { $0 == equipment }
                      print("Removed \(equipment), new array: \(updatedEquipment)")
                    } else {
                      updatedEquipment.append(equipment)
                      print("Added \(equipment), new array: \(updatedEquipment)")
                    }
                    newLocationEquipment = updatedEquipment
                  }) {
                    Text(equipment.replacingOccurrences(of: "_", with: " "))
                      .font(.caption)
                      .padding(.horizontal, 8)
                      .padding(.vertical, 4)
                      .background(newLocationEquipment.contains(equipment) ? Color.blue : Color.gray.opacity(0.3))
                      .foregroundColor(newLocationEquipment.contains(equipment) ? .white : .primary)
                      .cornerRadius(6)
                  }
                  .buttonStyle(PlainButtonStyle())
                }
              }
              
              // Custom equipment input
              HStack {
                TextField("Add custom equipment", text: $newEquipmentItem)
                Button("Add") {
                  if !newEquipmentItem.isEmpty {
                    newLocationEquipment.append(newEquipmentItem)
                    newEquipmentItem = ""
                  }
                }
                .disabled(newEquipmentItem.isEmpty)
              }
              
              // Show selected equipment
              if !newLocationEquipment.isEmpty {
                Text("Selected: \(newLocationEquipment.joined(separator: ", "))")
                  .font(.caption2)
                  .foregroundColor(.secondary)
              }
            }
            
            Toggle("Set as current location", isOn: $newLocationCurrent)
          }
          
          Button("Add Location") { Task { await addLocation() } }
            .disabled(newLocationName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Color.indigo)
            .foregroundColor(.white)
            .cornerRadius(8)
            .padding(.top, 8)
        }

        Section {
          if isLoading {
            ProgressView()
          }
        }
      }
      .navigationTitle("Profile")
      .toolbar(content: {
        ToolbarItem(placement: .topBarLeading){
          Button("Sign out", role: .destructive) {
            Task {
              try? await supabase.auth.signOut()
            }
          }
        }
      })
    }
    .task {
      await getInitialProfile()
    }
  }

  func getInitialProfile() async {
    do {
      let currentUser = try await supabase.auth.session.user

      // Fetch user profile
      let row: UserRow =
      try await supabase
        .from("app_user")
        .select()
        .eq("user_id", value: currentUser.id)
        .single()
        .execute()
        .value

      self.first_name = row.first_name ?? ""
      self.last_name = row.last_name ?? ""
      
      // Fetch body stats
      let bodyStats: BodyStatsRow? = try? await supabase
        .from("body_stats")
        .select()
        .eq("user_id", value: currentUser.id)
        .single()
        .execute()
        .value
      
      if let stats = bodyStats {
        self.sex = stats.sex ?? ""
        if let dobString = stats.dob {
          let formatter = DateFormatter()
          formatter.dateFormat = "yyyy-MM-dd"
          self.dob = formatter.date(from: dobString) ?? Date()
        }
        self.height_cm = stats.height_cm?.description ?? ""
        self.weight_kg = stats.weight_kg?.description ?? ""
        self.body_fat_pct = stats.body_fat_pct?.description ?? ""
      }

      // Fetch goals: muscles
      let muscleRows: [UserMuscleAndWeightRow] = try await supabase
        .from("user_muscle_and_weight")
        .select()
        .eq("user_id", value: currentUser.id)
        .order("created_at", ascending: true)
        .execute()
        .value
      self.muscleGoals = muscleRows

      // Fetch goals: categories
      let categoryRows: [UserCategoryAndWeightsRow] = try await supabase
        .from("user_category_and_weight")
        .select()
        .eq("user_id", value: currentUser.id)
        .order("created_at", ascending: true)
        .execute()
        .value
      self.categoryGoals = categoryRows

      // Fetch user preferences
      let preferenceRows: [UserPreferenceRow] = try await supabase
        .from("preferences")
        .select()
        .eq("user_id", value: currentUser.id)
        .order("created_at", ascending: true)
        .execute()
        .value
      self.userPreferences = preferenceRows

      // Fetch user locations
      await locationManager.refreshLocations()

    } catch {
      debugPrint(error)
    }
  }

  func updatePersonalInfoButtonTapped() {
    Task {
      isLoading = true
      defer { isLoading = false }
      do {
        let currentUser = try await supabase.auth.session.user

        // Update user profile
        try await supabase
          .from("app_user")
          .update(
            UpdateUserParams(
              first_name: first_name.isEmpty ? nil : first_name,
              last_name: last_name.isEmpty ? nil : last_name
            )
          )
          .eq("user_id", value: currentUser.id)
          .execute()
      } catch {
        debugPrint(error)
      }
    }
  }

  func updateBodyStatsButtonTapped() {
    Task {
      isLoading = true
      defer { isLoading = false }
      do {
        let currentUser = try await supabase.auth.session.user
        
        // Update or insert body stats
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        let dobString = dateFormatter.string(from: dob)
        
        let bodyStatsParams = UpdateBodyStatsParams(
          sex: sex.isEmpty ? nil : sex,
          dob: dobString,
          height_cm: Double(height_cm),
          weight_kg: Double(weight_kg),
          body_fat_pct: Double(body_fat_pct)
        )
        print("currentUser.id.uuidString: \(currentUser.id.uuidString)")

        // Use upsert to insert or update the body_stats record for the current user
        let upsertParams = BodyStatsUpsertParams(
          user_id: currentUser.id.uuidString,
          sex: bodyStatsParams.sex,
          dob: bodyStatsParams.dob,
          height_cm: bodyStatsParams.height_cm,
          weight_kg: bodyStatsParams.weight_kg,
          body_fat_pct: bodyStatsParams.body_fat_pct
        )
        try await supabase
          .from("body_stats")
          .upsert(upsertParams, onConflict: "user_id")
          .eq("user_id", value: currentUser.id)
          .execute()
      } catch {
        debugPrint(error)
      }
    }
  }

  // MARK: - Muscle Goals CRUD
  func addMuscleGoal() async {
    do {
      let currentUser = try await supabase.auth.session.user
      guard let weight = Double(newMuscleWeight) else { return }
      let insert = InsertUserMuscleAndWeightParams(user_id: currentUser.id.uuidString, muscle: newMuscleName, weight: weight)
      let inserted: [UserMuscleAndWeightRow] = try await supabase
        .from("user_muscle_and_weight")
        .insert(insert)
        .select()
        .execute()
        .value
      if let first = inserted.first {
        muscleGoals.append(first)
        newMuscleName = ""
        newMuscleWeight = ""
      }
    } catch { debugPrint(error) }
  }

  func deleteMuscleGoal(goalId: String) async {
    do {
      _ = try await supabase
        .from("user_muscle_and_weight")
        .delete()
        .eq("id", value: goalId)
        .execute()
      muscleGoals.removeAll { $0.id == goalId }
    } catch { debugPrint(error) }
  }

  // MARK: - Category Goals CRUD
  func addCategoryGoal() async {
    do {
      let currentUser = try await supabase.auth.session.user
      // Sanitize and validate inputs
      let category = newCategoryName.trimmingCharacters(in: .whitespacesAndNewlines)
      let description = newCategoryDescription.trimmingCharacters(in: .whitespacesAndNewlines)
      guard let weight = Double(newCategoryWeight), weight.isFinite else { return }
      guard categoryUnitOptions.contains(newCategoryUnits) else { return }
      let insert = InsertUserCategoryAndWeightsParams(
        user_id: currentUser.id.uuidString,
        category: category,
        units: newCategoryUnits,
        description: description,
        enabled: newCategoryEnabled,
        weight: weight
      )
      let inserted: [UserCategoryAndWeightsRow] = try await supabase
        .from("user_category_and_weight")
        .insert(insert)
        .select()
        .execute()
        .value
      if let first = inserted.first {
        categoryGoals.append(first)
        newCategoryName = ""
        newCategoryUnits = categoryUnitOptions.first ?? "min"
        newCategoryDescription = ""
        newCategoryEnabled = true
        newCategoryWeight = ""
      }
    } catch { debugPrint(error) }
  }

  func deleteCategoryGoal(goalId: String) async {
    do {
      print("Attempting to delete category goal with ID: \(goalId)")
      _ = try await supabase
        .from("user_category_and_weight")
        .delete()
        .eq("id", value: goalId)
        .execute()
      categoryGoals.removeAll { $0.id == goalId }
      print("Category goal deleted successfully")
    } catch { 
      print("Error deleting category goal: \(error)")
      print("Error details: \(String(describing: error))")
    }
  }

  // MARK: - Preferences CRUD
  func addPreference() async {
    do {
      let currentUser = try await supabase.auth.session.user
      
      // Format expire time if set
      let dateFormatter = DateFormatter()
      dateFormatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss'Z'"
      dateFormatter.timeZone = TimeZone(abbreviation: "UTC")
      let expireTimeString = newPreferenceExpireTime > Date() ? dateFormatter.string(from: newPreferenceExpireTime) : nil
      
      let insert = InsertUserPreferenceParams(
        user_id: currentUser.id.uuidString,
        type: newPreferenceType,
        description: newPreferenceDescription.trimmingCharacters(in: .whitespacesAndNewlines),
        user_transcription: newPreferenceUserTranscription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : newPreferenceUserTranscription.trimmingCharacters(in: .whitespacesAndNewlines),
        recommendations_guidance: newPreferenceGuidance.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : newPreferenceGuidance.trimmingCharacters(in: .whitespacesAndNewlines),
        expire_time: expireTimeString,
        delete_after_call: newPreferenceDeleteAfterCall
      )
      
      let inserted: [UserPreferenceRow] = try await supabase
        .from("preferences")
        .insert(insert)
        .select()
        .execute()
        .value
      
      if let first = inserted.first {
        userPreferences.append(first)
        // Reset form
        newPreferenceType = ""
        newPreferenceDescription = ""
        newPreferenceUserTranscription = ""
        newPreferenceGuidance = ""
        newPreferenceExpireTime = Date()
        newPreferenceDeleteAfterCall = false
      }
    } catch { 
      debugPrint("Error adding preference: \(error)")
    }
  }

  func deletePreference(preferenceId: Int) async {
    do {
      _ = try await supabase
        .from("preferences")
        .delete()
        .eq("id", value: preferenceId)
        .execute()
      userPreferences.removeAll { $0.id == preferenceId }
    } catch { 
      debugPrint("Error deleting preference: \(error)")
    }
  }

  // MARK: - Locations CRUD
  func addLocation() async {
    do {
      let currentUser = try await supabase.auth.session.user
      let insert = InsertUserLocationParams(
        user_id: currentUser.id.uuidString,
        name: newLocationName.trimmingCharacters(in: .whitespacesAndNewlines),
        description: newLocationDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : newLocationDescription.trimmingCharacters(in: .whitespacesAndNewlines),
        geo_data: newLocationGeoData.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : newLocationGeoData.trimmingCharacters(in: .whitespacesAndNewlines),
        equipment: newLocationEquipment.isEmpty ? nil : newLocationEquipment,
        current_location: newLocationCurrent
      )
      let inserted: [UserLocationRow] = try await supabase
        .from("user_locations")
        .insert(insert)
        .select()
        .execute()
        .value
      if let first = inserted.first {
        resetLocationForm()
        await locationManager.refreshLocations()
      }
    } catch { debugPrint(error) }
  }
  
  func resetLocationForm() {
    newLocationName = ""
    newLocationDescription = ""
    newLocationGeoData = ""
    newLocationEquipment = []
    newLocationCurrent = false
    newEquipmentItem = ""
  }

  func deleteLocation(locationId: Int) async {
    do {
      print("Attempting to delete location with ID: \(locationId)")
      print("Current locations count: \(locationManager.userLocations.count)")
      
      let result = try await supabase
        .from("user_locations")
        .delete()
        .eq("id", value: locationId)
        .execute()
      
      print("Delete operation completed successfully")
      print("Delete result: \(result)")
      
      // Refresh locations to get updated state
      await locationManager.refreshLocations()
      
    } catch { 
      print("Error deleting location: \(error)")
      print("Error details: \(String(describing: error))")
      
      // Try to refresh locations to see current state
      await locationManager.refreshLocations()
    }
  }
  


  func updateCurrentLocation(locationId: Int) async {
    do {
      let currentUser = try await supabase.auth.session.user
      print("Updating current location to ID: \(locationId) for user: \(currentUser.id)")
      
      // First, set all locations to not current
      let resetAllResult = try await supabase
        .from("user_locations")
        .update(["current_location": false])
        .eq("user_id", value: currentUser.id)
        .execute()
      
      print("Reset all locations to not current: \(resetAllResult)")
      
      // Then, set the selected location as current
      let updateCurrentResult = try await supabase
        .from("user_locations")
        .update(["current_location": true])
        .eq("id", value: locationId)
        .eq("user_id", value: currentUser.id)
        .execute()
      
      print("Set location \(locationId) as current: \(updateCurrentResult)")
      
      // Refresh locations to get updated state
      await locationManager.refreshLocations()
      
    } catch { 
      print("Error updating current location: \(error)")
      print("Error details: \(String(describing: error))")
    }
  }
}
