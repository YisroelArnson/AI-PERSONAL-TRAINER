import SwiftUI

struct VoiceScreenView: View {
    let screen: OnboardingScreen
    let value: String
    let onChange: (String, String) -> Void
    let onNext: () -> Void

    @StateObject private var speechManager = SpeechManager()
    @State private var text: String = ""
    @State private var isRecording = false
    @State private var selectedPill: String? = nil

    var body: some View {
        VStack(spacing: 0) {
            // Question
            Text(screen.question ?? "")
                .font(.system(size: 32, weight: .bold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.top, 32)

            // Sub text
            if let sub = screen.sub {
                Text(sub)
                    .font(.system(size: 15))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
            }

            // Text area
            TextEditor(text: $text)
                .font(.system(size: 18))
                .foregroundColor(AppTheme.Colors.primaryText)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 16)
                .padding(.top, 28)
                .onChange(of: text) { _, newValue in
                    if let field = screen.field {
                        onChange(field, newValue)
                    }
                }

            Spacer()

            // Pills row (shown when empty and not recording)
            if let pills = screen.pills, text.isEmpty && !isRecording {
                PillsRow(pills: pills, selected: selectedPill) { pill in
                    selectedPill = pill
                    text = pill
                    if let field = screen.field {
                        onChange(field, pill)
                    }
                }
                .padding(.bottom, 8)
            }

            // Voice bottom bar
            VoiceBottomBar(
                recording: isRecording,
                hasAnswer: !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                onMic: {
                    toggleRecording()
                },
                onNext: {
                    if let field = screen.field {
                        onChange(field, text.trimmingCharacters(in: .whitespacesAndNewlines))
                    }
                    onNext()
                }
            )
        }
        .onAppear {
            text = value
        }
        .onChange(of: speechManager.partialTranscript) { _, transcript in
            if isRecording && !transcript.isEmpty {
                text = transcript
            }
        }
        .onChange(of: speechManager.finalTranscript) { _, transcript in
            if !transcript.isEmpty {
                text = transcript
                isRecording = false
            }
        }
    }

    private func toggleRecording() {
        if isRecording {
            speechManager.stopListening()
            isRecording = false
        } else {
            text = ""
            selectedPill = nil
            isRecording = true
            Task {
                await speechManager.startListening()
            }
        }
    }
}
