import SwiftUI

struct TrainerDataHubView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Gradients.background
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: AppTheme.Spacing.lg) {
                        DataHubCard(
                            title: "Goals",
                            subtitle: "Review your active goal contract",
                            destination: AnyView(GoalsView())
                        )

                        DataHubCard(
                            title: "Program",
                            subtitle: "View and edit your training program",
                            destination: AnyView(ProgramDesignView())
                        )

                        DataHubCard(
                            title: "Calendar",
                            subtitle: "Upcoming sessions and rescheduling",
                            destination: AnyView(TrainerCalendarView())
                        )

                        DataHubCard(
                            title: "Measurements",
                            subtitle: "Track weight, waist, and more",
                            destination: AnyView(MeasurementsView())
                        )

                        DataHubCard(
                            title: "Coach Memory",
                            subtitle: "Preferences and constraints your coach uses",
                            destination: AnyView(CoachMemoryView())
                        )

                        DataHubCard(
                            title: "Weekly Reports",
                            subtitle: "Progress summaries and adjustments",
                            destination: AnyView(WeeklyReportsView())
                        )

                        DataHubCard(
                            title: "Check-ins",
                            subtitle: "Quick weekly check-in",
                            destination: AnyView(CheckinView())
                        )
                    }
                    .padding(.horizontal, AppTheme.Spacing.xl)
                    .padding(.top, AppTheme.Spacing.lg)
                    .padding(.bottom, AppTheme.Spacing.xxxl)
                }
            }
            .navigationTitle("Your Data")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

struct DataHubCard: View {
    let title: String
    let subtitle: String
    let destination: AnyView

    var body: some View {
        NavigationLink(destination: destination) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                Text(title)
                    .font(AppTheme.Typography.cardTitle)
                    .foregroundColor(AppTheme.Colors.primaryText)
                Text(subtitle)
                    .font(AppTheme.Typography.cardSubtitle)
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(AppTheme.Spacing.lg)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                    .fill(AppTheme.Colors.surface)
            )
        }
    }
}
