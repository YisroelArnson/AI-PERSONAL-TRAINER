import SwiftUI

struct VoiceBottomBar: View {
    let recording: Bool
    let hasAnswer: Bool
    let onMic: () -> Void
    let onNext: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            if recording {
                // Recording state: expanded pill with waveform
                Button(action: onMic) {
                    HStack(spacing: 12) {
                        Image(systemName: "stop.fill")
                            .font(.system(size: 14))
                            .foregroundColor(AppTheme.Colors.danger)

                        WaveformView(active: true)
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 14)
                    .background(AppTheme.Colors.danger.opacity(0.1))
                    .clipShape(Capsule())
                }

                Spacer()
            } else {
                // Idle state: mic button + spacer + chevron
                Button(action: onMic) {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 20))
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .frame(width: 52, height: 52)
                        .background(AppTheme.Colors.surface)
                        .clipShape(Circle())
                }

                Spacer()

                ChevronButton(enabled: hasAnswer, action: onNext)
            }
        }
        .padding(.top, 12)
        .padding(.horizontal, 20)
        .padding(.bottom, 32)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: recording)
    }
}
