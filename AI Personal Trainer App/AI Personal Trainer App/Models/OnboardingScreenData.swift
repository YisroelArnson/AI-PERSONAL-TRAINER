import Foundation

// MARK: - Screen Types

enum OnboardingScreenType: String, Codable {
    case introHero
    case introNarration
    case introCTA
    case textInput
    case birthdayPicker
    case heightPicker
    case weightPicker
    case simpleSelect
    case voice
    case guidedVoice
    case complete
}

// MARK: - Section Labels (for segmented progress bar)

enum OnboardingSection: String, CaseIterable {
    case aboutYou = "ABOUT YOU"
    case yourGoals = "YOUR GOALS"
    case trainingHistory = "TRAINING HISTORY"
    case bodyMetrics = "BODY METRICS"
    case fitnessBaseline = "FITNESS BASELINE"
    case health = "HEALTH"
    case lifestyle = "LIFESTYLE"
    case equipment = "EQUIPMENT"
    case preferences = "PREFERENCES"
    case almostDone = "ALMOST DONE"
}

// MARK: - Screen Definition

struct OnboardingScreen: Identifiable {
    let id: String
    let type: OnboardingScreenType

    // Intro screens
    var headline: String?
    var body: String?
    var orbSize: CGFloat?
    var cta: String?

    // Question screens
    var label: OnboardingSection?
    var question: String?
    var sub: String?
    var placeholder: String?
    var field: String?

    // Birthday picker
    var birthdayDefault: DateComponents?

    // Height picker
    var heightDefaultInches: Int?
    var heightMinInches: Int?
    var heightMaxInches: Int?

    // Weight picker
    var weightDefaultLbs: Double?
    var weightMinLbs: Double?
    var weightMaxLbs: Double?
    var weightStepLbs: Double?

    // Select
    var options: [String]?

    // Voice / Guided Voice
    var pills: [String]?
    var prompts: [String]?
}

// MARK: - Screen Definitions

enum OnboardingScreens {

    /// All onboarding screens in order (3 intro + 22 questions + 1 complete = 26 total)
    static let all: [OnboardingScreen] = [
        // ── Intro (no section label, no progress bar) ──────────────

        OnboardingScreen(
            id: "introHero",
            type: .introHero,
            orbSize: 140
        ),

        OnboardingScreen(
            id: "introNarration",
            type: .introNarration
        ),

        OnboardingScreen(
            id: "introCTA",
            type: .introCTA,
            headline: "Let's build your program.",
            body: "I'll ask some questions — talk or type. The more I know, the better your plan.",
            orbSize: 56,
            cta: "Get Started"
        ),

        // ── ABOUT YOU ──────────────────────────────────────────────

        OnboardingScreen(
            id: "name",
            type: .textInput,
            label: .aboutYou,
            question: "What should I call you?",
            placeholder: "Your first name",
            field: "name"
        ),

        OnboardingScreen(
            id: "birthday",
            type: .birthdayPicker,
            label: .aboutYou,
            question: "When were you born?",
            field: "birthday",
            birthdayDefault: DateComponents(year: 1996, month: 6, day: 15)
        ),

        OnboardingScreen(
            id: "gender",
            type: .simpleSelect,
            label: .aboutYou,
            question: "What's your biological sex?",
            sub: "This helps me tailor recovery, volume, and baseline expectations.",
            field: "gender",
            options: ["Male", "Female"]
        ),

        // ── YOUR GOALS ────────────────────────────────────────────

        OnboardingScreen(
            id: "goals",
            type: .guidedVoice,
            label: .yourGoals,
            question: "Tell me about your goals.",
            field: "goals",
            pills: ["Lose fat", "Build muscle", "Get stronger", "Improve endurance", "General health"],
            prompts: [
                "What's your main goal right now?",
                "What's motivating you to start?",
                "Any secondary goals beyond the main one?",
            ]
        ),

        OnboardingScreen(
            id: "timeline",
            type: .voice,
            label: .yourGoals,
            question: "Do you have a timeline in mind?",
            sub: "A wedding, a vacation, a sport season — or are you in no rush? This helps me set realistic milestones.",
            field: "timeline",
            pills: ["No deadline", "3 months", "6 months", "1 year"]
        ),

        // ── TRAINING HISTORY ──────────────────────────────────────

        OnboardingScreen(
            id: "experienceLevel",
            type: .voice,
            label: .trainingHistory,
            question: "How would you describe your experience?",
            sub: "Have you trained before? How long? What kind of training?",
            field: "experienceLevel",
            pills: ["Complete beginner", "Some experience", "Intermediate", "Advanced"]
        ),

        OnboardingScreen(
            id: "frequency",
            type: .voice,
            label: .trainingHistory,
            question: "How many days a week can you train?",
            sub: "How many days, which days work best, and how much time do you have per session?",
            field: "frequency"
        ),

        OnboardingScreen(
            id: "currentRoutine",
            type: .voice,
            label: .trainingHistory,
            question: "Tell me about your current routine.",
            sub: "What does a typical week of exercise look like for you?",
            field: "currentRoutine"
        ),

        OnboardingScreen(
            id: "pastAttempts",
            type: .voice,
            label: .trainingHistory,
            question: "Have you tried a program before that didn't stick?",
            sub: "What happened? Too time-consuming, got bored, got hurt? Knowing what hasn't worked helps me build something that will.",
            field: "pastAttempts",
            pills: ["This is my first time"]
        ),

        OnboardingScreen(
            id: "hobbySports",
            type: .voice,
            label: .trainingHistory,
            question: "Do you play any sports or have active hobbies?",
            sub: "Recreational leagues, hiking, martial arts, cycling — anything physical I should program around.",
            field: "hobbySports",
            pills: ["None right now"]
        ),

        // ── BODY METRICS ──────────────────────────────────────────

        OnboardingScreen(
            id: "height",
            type: .heightPicker,
            label: .bodyMetrics,
            question: "How tall are you?",
            field: "heightInches",
            heightDefaultInches: 67,
            heightMinInches: 48,
            heightMaxInches: 96
        ),

        OnboardingScreen(
            id: "weight",
            type: .weightPicker,
            label: .bodyMetrics,
            question: "What's your current weight?",
            field: "weightLbs",
            weightDefaultLbs: 160.0,
            weightMinLbs: 60.0,
            weightMaxLbs: 500.0,
            weightStepLbs: 0.1
        ),

        OnboardingScreen(
            id: "bodyComp",
            type: .voice,
            label: .bodyMetrics,
            question: "Do you know your body composition?",
            sub: "Body fat percentage, DEXA scan results, or just a general sense — are you carrying extra fat, feeling lean, somewhere in between?",
            field: "bodyComp",
            pills: ["Not sure"]
        ),

        // ── FITNESS BASELINE ──────────────────────────────────────

        OnboardingScreen(
            id: "physicalBaseline",
            type: .guidedVoice,
            label: .fitnessBaseline,
            question: "Let's get a quick snapshot of where you are.",
            field: "physicalBaseline",
            prompts: [
                "Can you do a full squat? Roughly how many?",
                "How about push-ups? How many can you do?",
                "Can you touch your toes?",
                "Any movements that cause pain or discomfort?",
            ]
        ),

        OnboardingScreen(
            id: "mobility",
            type: .voice,
            label: .fitnessBaseline,
            question: "How's your flexibility and mobility?",
            sub: "Any joints that feel stiff or restricted? Areas where your range of motion is limited? This is the foundation everything else is built on.",
            field: "mobility",
            pills: ["Pretty flexible", "Average", "Very stiff"]
        ),

        // ── HEALTH ────────────────────────────────────────────────

        OnboardingScreen(
            id: "injuries",
            type: .voice,
            label: .health,
            question: "Any injuries or conditions I should know about?",
            sub: "Past surgeries, chronic pain, joint issues — anything that affects how you move.",
            field: "injuries",
            pills: ["None — I'm good"]
        ),

        OnboardingScreen(
            id: "healthNuances",
            type: .voice,
            label: .health,
            question: "Any other health things I should know?",
            sub: "Digestive issues, food allergies, asthma, medications you're on — anything that could affect how you train or eat.",
            field: "healthNuances",
            pills: ["Nothing comes to mind"]
        ),

        OnboardingScreen(
            id: "supplements",
            type: .voice,
            label: .health,
            question: "Are you taking any supplements or vitamins?",
            sub: "Protein powder, creatine, multivitamins, pre-workout — whatever you're currently using.",
            field: "supplements",
            pills: ["None right now"]
        ),

        // ── LIFESTYLE ─────────────────────────────────────────────

        OnboardingScreen(
            id: "activityLevel",
            type: .voice,
            label: .lifestyle,
            question: "How active are you outside of training?",
            sub: "Think about your daily life — desk job, on your feet, physical labor?",
            field: "activityLevel",
            pills: ["Sedentary", "Lightly active", "Active", "Very active"]
        ),

        OnboardingScreen(
            id: "sleep",
            type: .voice,
            label: .lifestyle,
            question: "How's your sleep?",
            sub: "Recovery starts with rest.",
            field: "sleep",
            pills: ["Poor", "Fair", "Good", "Great"]
        ),

        OnboardingScreen(
            id: "nutrition",
            type: .voice,
            label: .lifestyle,
            question: "Tell me about how you eat.",
            sub: "Are you tracking calories? Any dietary restrictions? How many meals a day? I'm not judging — I just need to know what we're working with.",
            field: "nutrition"
        ),

        // ── EQUIPMENT ─────────────────────────────────────────────

        OnboardingScreen(
            id: "environment",
            type: .voice,
            label: .equipment,
            question: "Describe your training space.",
            sub: "Where do you train? What equipment do you have? How much room do you have to work with?",
            field: "environment"
        ),

        // ── PREFERENCES ───────────────────────────────────────────

        OnboardingScreen(
            id: "movementPrefs",
            type: .voice,
            label: .preferences,
            question: "What kind of movement do you actually enjoy?",
            sub: "Lifting, running, yoga, swimming, group classes, being outdoors — I want to build something you'll look forward to, not dread.",
            field: "movementPrefs"
        ),

        OnboardingScreen(
            id: "coachingStyle",
            type: .voice,
            label: .preferences,
            question: "How do you like to be coached?",
            sub: "Everyone responds differently — what works for you?",
            field: "coachingStyle",
            pills: ["Tough love", "Balanced", "Encouraging", "Just tell me what to do"]
        ),

        // ── ALMOST DONE ───────────────────────────────────────────

        OnboardingScreen(
            id: "anythingElse",
            type: .voice,
            label: .almostDone,
            question: "Anything else I should know?",
            sub: "Work schedule, stress levels, things on your mind — anything that helps me build the right program.",
            field: "anythingElse"
        ),

        // ── COMPLETE ──────────────────────────────────────────────

        OnboardingScreen(
            id: "complete",
            type: .complete,
            field: "_complete"
        ),
    ]

    /// Number of intro screens (no progress bar shown)
    static let introCount = 3

    /// Index of first intake question (after intro screens)
    static let intakeStartIndex = introCount

    /// Intake screens only (excludes intro and complete)
    static var intakeScreens: ArraySlice<OnboardingScreen> {
        let endIndex = all.count - 1 // Exclude complete screen
        return all[intakeStartIndex..<endIndex]
    }

    /// Computed sections from intake screens for the segmented progress bar
    static let sections: [(label: OnboardingSection, startIndex: Int, count: Int)] = {
        var result: [(label: OnboardingSection, startIndex: Int, count: Int)] = []
        var current: (label: OnboardingSection, startIndex: Int, count: Int)?

        for (index, screen) in all.enumerated() {
            guard let label = screen.label else { continue }
            if let c = current, c.label == label {
                current = (c.label, c.startIndex, c.count + 1)
            } else {
                if let c = current {
                    result.append(c)
                }
                current = (label, index, 1)
            }
        }
        if let c = current {
            result.append(c)
        }
        return result
    }()
}
