//
//  ProfileView.swift
//  AI Personal Trainer App
//
//  Rebuilt profile screen.
//

import SwiftUI

struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var userSettings = UserSettings.shared

    @State private var profileEmail: String = ""

    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: AppTheme.Spacing.xxl) {
                        accountSection
                        preferencesSection
                    }
                    .padding(.horizontal, AppTheme.Spacing.xl)
                    .padding(.top, AppTheme.Spacing.xl)
                    .padding(.bottom, AppTheme.Spacing.xxxl)
                }
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .task {
                await userSettings.fetchSettings()
                await loadAccountDetails()
            }
        }
    }

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            Text("Account")
                .font(AppTheme.Typography.screenTitle)
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(.horizontal, AppTheme.Spacing.md)

            VStack(spacing: 0) {
                profileRow(label: "Email", value: profileEmail.isEmpty ? "Not available" : profileEmail)
            }
            .background(AppTheme.Colors.cardBackground)
            .cornerRadius(AppTheme.CornerRadius.medium)
        }
    }

    private var preferencesSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            Text("Preferences")
                .font(AppTheme.Typography.screenTitle)
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(.horizontal, AppTheme.Spacing.md)

            VStack(spacing: 0) {
                weightUnitRow

                Divider()
                    .background(AppTheme.Colors.divider)

                distanceUnitRow
            }
            .background(AppTheme.Colors.cardBackground)
            .cornerRadius(AppTheme.CornerRadius.medium)
        }
    }

    private func profileRow(label: String, value: String) -> some View {
        HStack(alignment: .top, spacing: AppTheme.Spacing.md) {
            Text(label)
                .font(AppTheme.Typography.cardTitle)
                .foregroundColor(AppTheme.Colors.primaryText)

            Spacer(minLength: AppTheme.Spacing.md)

            Text(value)
                .font(AppTheme.Typography.cardSubtitle)
                .foregroundColor(AppTheme.Colors.secondaryText)
                .multilineTextAlignment(.trailing)
                .lineLimit(2)
        }
        .padding(AppTheme.Spacing.md)
    }

    private var weightUnitRow: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Weight Unit")
                    .font(AppTheme.Typography.cardTitle)
                    .foregroundColor(AppTheme.Colors.primaryText)

                Text("Used for exercise and body metrics")
                    .font(AppTheme.Typography.cardSubtitle)
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }

            Spacer()

            Picker("Weight", selection: Binding(
                get: { userSettings.weightUnit },
                set: { newValue in
                    Task {
                        await userSettings.updateWeightUnit(newValue)
                    }
                }
            )) {
                ForEach(WeightUnit.allCases, id: \.self) { unit in
                    Text(unit.rawValue).tag(unit)
                }
            }
            .pickerStyle(.segmented)
            .frame(width: 120)
        }
        .padding(AppTheme.Spacing.md)
    }

    private var distanceUnitRow: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Distance Unit")
                    .font(AppTheme.Typography.cardTitle)
                    .foregroundColor(AppTheme.Colors.primaryText)

                Text("Used for cardio and run tracking")
                    .font(AppTheme.Typography.cardSubtitle)
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }

            Spacer()

            Picker("Distance", selection: Binding(
                get: { userSettings.distanceUnit },
                set: { newValue in
                    Task {
                        await userSettings.updateDistanceUnit(newValue)
                    }
                }
            )) {
                ForEach(DistanceUnit.allCases, id: \.self) { unit in
                    Text(unit.rawValue).tag(unit)
                }
            }
            .pickerStyle(.segmented)
            .frame(width: 120)
        }
        .padding(AppTheme.Spacing.md)
    }

    private func loadAccountDetails() async {
        do {
            let session = try await supabase.auth.session
            await MainActor.run {
                profileEmail = session.user.email ?? ""
            }
        } catch {
            await MainActor.run {
                profileEmail = ""
            }
            print("❌ Failed to load profile account details: \(error)")
        }
    }
}

#Preview {
    ProfileView()
}
