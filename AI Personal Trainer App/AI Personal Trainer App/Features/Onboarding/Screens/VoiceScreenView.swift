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
    @State private var textBeforeRecording: String = ""
    @FocusState private var isTextEditorFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Question — tap to dismiss keyboard
            Text(screen.question ?? "")
                .font(.system(size: 32, weight: .bold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.top, 32)
                .contentShape(Rectangle())
                .onTapGesture { isTextEditorFocused = false }

            // Sub text
            if let sub = screen.sub {
                Text(sub)
                    .font(.system(size: 15))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .contentShape(Rectangle())
                    .onTapGesture { isTextEditorFocused = false }
            }

            // Text area with clear button
            ZStack(alignment: .topTrailing) {
                TextEditor(text: $text)
                    .font(.system(size: 18))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, 16)
                    .padding(.top, 28)
                    .focused($isTextEditorFocused)
                    .onChange(of: text) { _, newValue in
                        if let field = screen.field {
                            onChange(field, newValue)
                        }
                    }

                // Clear button
                if !text.isEmpty && !isRecording {
                    Button {
                        Haptic.light()
                        text = ""
                        selectedPill = nil
                        if let field = screen.field {
                            onChange(field, "")
                        }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 18))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                    }
                    .padding(.top, 32)
                    .padding(.trailing, 20)
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
        .simultaneousGesture(
            DragGesture(minimumDistance: 30)
                .onEnded { value in
                    if value.translation.height > 30 {
                        isTextEditorFocused = false
                    }
                }
        )
        .onAppear {
            text = value
        }
        .onChange(of: speechManager.partialTranscript) { _, transcript in
            if isRecording && !transcript.isEmpty {
                if textBeforeRecording.isEmpty {
                    text = transcript
                } else {
                    text = textBeforeRecording + " " + transcript
                }
            }
        }
        .onChange(of: speechManager.finalTranscript) { _, transcript in
            if !transcript.isEmpty {
                if textBeforeRecording.isEmpty {
                    text = transcript
                } else {
                    text = textBeforeRecording + " " + transcript
                }
                // Save accumulated text so the next segment appends
                textBeforeRecording = text.trimmingCharacters(in: .whitespacesAndNewlines)
                // Auto-restart if user hasn't tapped stop
                if isRecording {
                    speechManager.stopListening()
                    Task {
                        await speechManager.startListening()
                    }
                }
            }
        }
    }

    private func toggleRecording() {
        if isRecording {
            speechManager.stopListening()
            isRecording = false
        } else {
            // Save existing text so new speech appends to it
            textBeforeRecording = text.trimmingCharacters(in: .whitespacesAndNewlines)
            selectedPill = nil
            isRecording = true
            Task {
                await speechManager.startListening()
            }
        }
    }
}
