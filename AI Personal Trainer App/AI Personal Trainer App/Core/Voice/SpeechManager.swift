import Foundation
import AVFoundation
import Speech

@MainActor
final class SpeechManager: NSObject, ObservableObject {
    @Published var isListening = false
    @Published var partialTranscript = ""
    @Published var finalTranscript = ""
    @Published var errorMessage: String?
    @Published var microphoneDenied = false
    @Published var needsSettingsForMic = false

    private let audioEngine = AVAudioEngine()
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?

    func requestAuthorization() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }

    private func requestMicrophonePermission() async -> Bool {
        let session = AVAudioSession.sharedInstance()

        switch session.recordPermission {
        case .granted:
            return true
        case .denied:
            needsSettingsForMic = true
            return false
        case .undetermined:
            return await withCheckedContinuation { continuation in
                AVAudioApplication.requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            }
        @unknown default:
            return false
        }
    }

    func startListening() async {
        guard !isListening else { return }
        guard let speechRecognizer else {
            errorMessage = "Speech recognition is unavailable."
            return
        }

        // Check/request mic permission first
        let micGranted = await requestMicrophonePermission()
        guard micGranted else {
            microphoneDenied = true
            return
        }
        microphoneDenied = false
        needsSettingsForMic = false

        errorMessage = nil
        partialTranscript = ""
        finalTranscript = ""
        let authorized = await requestAuthorization()
        guard authorized else {
            errorMessage = "Speech recognition permission denied."
            return
        }

        do {
            try configureAudioSession()
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            if speechRecognizer.supportsOnDeviceRecognition == true {
                request.requiresOnDeviceRecognition = true
            }

            recognitionRequest = request
            recognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
                guard let self else { return }
                if let result = result {
                    self.partialTranscript = result.bestTranscription.formattedString
                    if result.isFinal {
                        self.finalTranscript = result.bestTranscription.formattedString
                    }
                }
                if let error = error {
                    self.errorMessage = error.localizedDescription
                    self.stopListening()
                }
            }

            let inputNode = audioEngine.inputNode
            let recordingFormat = inputNode.outputFormat(forBus: 0)
            inputNode.removeTap(onBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
                self?.recognitionRequest?.append(buffer)
            }

            audioEngine.prepare()
            try audioEngine.start()
            isListening = true
        } catch {
            errorMessage = error.localizedDescription
            stopListening()
        }
    }

    func stopListening() {
        guard isListening else { return }
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        isListening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func configureAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
        try session.setActive(true, options: .notifyOthersOnDeactivation)
    }
}
