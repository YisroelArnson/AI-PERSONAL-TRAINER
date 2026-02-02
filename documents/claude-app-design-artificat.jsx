import React, { useState, useEffect, useRef } from 'react';

const fontStack = "'SF Pro Display', -apple-system, system-ui, sans-serif";

const radius = {
  large: '15px',
  medium: '11px',
  small: '7px',
  pill: '44px',
};

const themes = {
  dark: {
    background: '#000000',
    surface: '#111111',
    surfaceHover: '#1A1A1A',
    text: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.6)',
    textTertiary: 'rgba(255,255,255,0.4)',
    accent: '#FFFFFF',
    highlight: 'rgba(255,255,255,0.1)',
  },
  light: {
    background: '#FFFFFF',
    surface: '#F5F5F7',
    surfaceHover: '#EBEBED',
    text: '#000000',
    textSecondary: 'rgba(0,0,0,0.6)',
    textTertiary: 'rgba(0,0,0,0.4)',
    accent: '#000000',
    highlight: 'rgba(0,0,0,0.06)',
  },
};

// AI Orb Component
const AIOrb = ({ size = 50, onClick }) => (
  <button
    onClick={onClick}
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      background: `
        radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.9) 0%, transparent 50%),
        radial-gradient(ellipse at 70% 80%, rgba(0,150,255,0.8) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 50%, rgba(100,180,255,0.9) 0%, rgba(30,144,255,1) 60%, rgba(0,100,200,1) 100%)
      `,
      boxShadow: '0 3px 12px rgba(30,144,255,0.3)',
      flexShrink: 0,
      transition: 'transform 0.2s ease',
    }}
    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
  />
);

// Stat highlight component
const Stat = ({ children, colors }) => (
  <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0px 5px',
    background: colors.highlight,
    borderRadius: '4px',
    fontWeight: '600',
  }}>
    {children}
  </span>
);

// Thin Top Bar - Reusable component for consistent header styling
const ThinTopBar = ({ colors, leftIcon, leftAction, centerText, rightIcon, rightAction }) => (
  <div style={{ 
    padding: '12px 20px', 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    minHeight: '44px',
  }}>
    <button 
      onClick={leftAction} 
      style={{ 
        background: 'none', 
        border: 'none', 
        padding: '8px',
        margin: '-8px',
        cursor: 'pointer', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        color: colors.textSecondary,
        minWidth: '36px',
      }}
    >
      {leftIcon}
    </button>
    {centerText && (
      <span style={{ fontSize: '14px', fontWeight: '500', color: colors.textSecondary }}>{centerText}</span>
    )}
    {rightIcon ? (
      <button 
        onClick={rightAction} 
        style={{ 
          background: 'none', 
          border: 'none', 
          padding: '8px',
          margin: '-8px',
          cursor: 'pointer', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          color: colors.textSecondary,
          minWidth: '36px',
        }}
      >
        {rightIcon}
      </button>
    ) : (
      <div style={{ minWidth: '36px' }} />
    )}
  </div>
);

// Icons
const ChevronLeft = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" />
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const PlusIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const PencilIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

// Running Map Component
const RunningMap = ({ colors, isDark, compact = false }) => (
  <div style={{ width: '100%', height: '100%', background: isDark ? '#0a0a0a' : '#E8E8E8', position: 'relative', overflow: 'hidden', borderRadius: compact ? radius.large : 0 }}>
    <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.3 }}>
      <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'} strokeWidth="1"/></pattern></defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
    <svg width="100%" height="100%" style={{ position: 'absolute' }}>
      <line x1="0" y1="60" x2="100%" y2="60" stroke={isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'} strokeWidth="8" />
      <line x1="0" y1="140" x2="100%" y2="140" stroke={isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'} strokeWidth="8" />
      <line x1="80" y1="0" x2="80" y2="100%" stroke={isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'} strokeWidth="8" />
      <line x1="200" y1="0" x2="200" y2="100%" stroke={isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'} strokeWidth="8" />
    </svg>
    <svg width="100%" height="100%" style={{ position: 'absolute' }}>
      <defs><linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#64B4FF" /><stop offset="100%" stopColor="#1E90FF" /></linearGradient></defs>
      <path d="M 40 180 L 40 100 L 80 100 L 80 60 L 200 60 L 200 100 L 250 100" fill="none" stroke="url(#routeGradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="40" cy="180" r="6" fill={isDark ? '#FFFFFF' : '#000000'} />
      <circle cx="250" cy="100" r="10" fill="rgba(30,144,255,0.3)"><animate attributeName="r" values="10;14;10" dur="2s" repeatCount="indefinite" /></circle>
      <circle cx="250" cy="100" r="5" fill="#1E90FF" />
    </svg>
  </div>
);

// Scrolling text component
const ScrollingText = ({ text, colors }) => {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [offset, setOffset] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (containerRef.current && textRef.current) {
      setShouldScroll(textRef.current.offsetWidth > containerRef.current.offsetWidth);
    }
  }, [text]);

  useEffect(() => {
    if (!shouldScroll) return;
    const maxOffset = (textRef.current?.offsetWidth || 0) - (containerRef.current?.offsetWidth || 0) + 8;
    const interval = setInterval(() => {
      setOffset(prev => {
        const next = prev + direction * 0.4;
        if (next >= maxOffset) { setTimeout(() => setDirection(-1), 1000); return maxOffset; }
        if (next <= 0) { setTimeout(() => setDirection(1), 1000); return 0; }
        return next;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [shouldScroll, direction]);

  return (
    <div ref={containerRef} style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
      <span ref={textRef} style={{ display: 'inline-block', whiteSpace: 'nowrap', transform: `translateX(-${offset}px)`, fontSize: '14px', fontWeight: '500', color: colors.text }}>{text}</span>
    </div>
  );
};

// ============================================
// WORKOUT WRAPPER - The consistent shell
// ============================================
const WorkoutWrapper = ({ 
  colors, 
  onClose, 
  onChat,
  onEdit,
  currentExercise, 
  totalExercises, 
  progress,
  mainButton,
  children,
  showEditModal,
  editModalContent,
  onCloseModal,
  timerValue,
  timerLabel,
  showTimer,
}) => {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: fontStack, color: colors.text, background: colors.background, position: 'relative' }}>
      {showEditModal && (
        <>
          <div onClick={onCloseModal} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: colors.background, borderTopLeftRadius: '20px', borderTopRightRadius: '20px', padding: '12px 20px 32px', zIndex: 100 }}>
            <div style={{ width: '36px', height: '4px', background: colors.textTertiary, borderRadius: '2px', margin: '0 auto 20px' }} />
            {editModalContent}
          </div>
        </>
      )}

      <ThinTopBar 
        colors={colors}
        leftIcon={<ChevronLeft />}
        leftAction={onClose}
        centerText={`${currentExercise} of ${totalExercises}`}
        rightIcon={<PencilIcon />}
        rightAction={onEdit}
      />

      <div style={{ padding: '0 20px 16px' }}>
        <div style={{ height: '3px', background: colors.surface, borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: colors.text, borderRadius: '2px', transition: 'width 0.3s ease' }} />
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {children}
      </div>

      <div style={{ padding: '16px 20px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        {showTimer && (
          <div style={{ 
            height: '50px',
            padding: '0 16px',
            background: colors.surface, 
            borderRadius: radius.pill,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            <span style={{ fontSize: '15px', fontWeight: '600', color: colors.text, fontVariantNumeric: 'tabular-nums' }}>{timerValue}</span>
            {timerLabel && <span style={{ fontSize: '11px', fontWeight: '500', color: colors.textTertiary, textTransform: 'uppercase' }}>{timerLabel}</span>}
          </div>
        )}
        {mainButton}
        <AIOrb size={50} onClick={onChat} />
      </div>
    </div>
  );
};

// ============================================
// EXERCISE CONTENT COMPONENTS
// ============================================

const StrengthContent = ({ colors, exercise, currentSet, totalSets }) => (
  <div style={{ padding: '0 20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
    <p style={{ fontSize: '18px', fontWeight: '400', margin: 0, lineHeight: 1.6, color: colors.text }}>
      <Stat colors={colors}>{exercise.name}</Stat> — Set <Stat colors={colors}>{currentSet}</Stat> of <Stat colors={colors}>{totalSets}</Stat>. 
      Aim for <Stat colors={colors}>{exercise.reps} reps</Stat> at <Stat colors={colors}>{exercise.weight}</Stat>. 
      Keep your shoulder blades pinched together throughout the movement.
    </p>
  </div>
);

const RunningContent = ({ colors }) => {
  const isDark = colors.background === '#000000';
  const runData = { distance: '2.84', pace: '10:52', calories: '287', heartRate: '156', time: '30:47' };
  
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: '40%', padding: '0 20px' }}>
        <RunningMap colors={colors} isDark={isDark} compact />
      </div>
      <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <p style={{ fontSize: '10px', fontWeight: '500', color: colors.textTertiary, margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time</p>
            <p style={{ fontSize: '32px', fontWeight: '700', margin: 0, letterSpacing: '-0.02em' }}>{runData.time}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '10px', fontWeight: '500', color: colors.textTertiary, margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Distance</p>
            <p style={{ fontSize: '32px', fontWeight: '700', margin: 0, letterSpacing: '-0.02em' }}>{runData.distance}<span style={{ fontSize: '16px', fontWeight: '500', color: colors.textSecondary, marginLeft: '2px' }}>mi</span></p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
          {[{ v: runData.pace, l: 'Pace' }, { v: runData.calories, l: 'Cal' }, { v: runData.heartRate, l: 'BPM' }].map((item, i) => (
            <div key={i} style={{ background: colors.surface, borderRadius: radius.medium, padding: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 2px 0' }}>{item.v}</p>
              <p style={{ fontSize: '9px', color: colors.textTertiary, margin: 0, textTransform: 'uppercase' }}>{item.l}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const YogaContent = ({ colors, pose }) => (
  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '0 20px' }}>
    <p style={{ fontSize: '18px', fontWeight: '400', margin: 0, lineHeight: 1.6, color: colors.text }}>
      <Stat colors={colors}>{pose.name}</Stat> — Hold for <Stat colors={colors}>{pose.duration} seconds</Stat>. 
      {pose.instruction}
    </p>
  </div>
);

const HIITContent = ({ colors, exercise, isRest, nextExercise }) => (
  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '0 20px' }}>
    <p style={{ fontSize: '18px', fontWeight: '400', margin: 0, lineHeight: 1.6, color: colors.text }}>
      {isRest ? (
        <>
          <Stat colors={colors}>Rest</Stat> — Catch your breath. Up next: <Stat colors={colors}>{nextExercise}</Stat>. 
          Shake out your arms and stay light on your feet.
        </>
      ) : (
        <>
          <Stat colors={colors}>{exercise.name}</Stat> — <Stat colors={colors}>{exercise.duration}</Stat>. 
          {exercise.instruction} You're halfway through this round.
        </>
      )}
    </p>
  </div>
);

// ============================================
// WORKOUT SCREEN WITH SWIPE
// ============================================
const WorkoutScreen = ({ colors, onNavigate }) => {
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentSet, setCurrentSet] = useState(2);
  const [yogaTime, setYogaTime] = useState(12);
  const [hiitTime, setHiitTime] = useState(25);
  const [isRunning, setIsRunning] = useState(true);
  const [isRest, setIsRest] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  
  const exerciseTypes = ['strength', 'running', 'yoga', 'hiit'];
  const currentType = exerciseTypes[exerciseIndex];
  
  const strengthExercise = { name: 'Dumbbell Bench Press', reps: '10-12', weight: '25 lb' };
  const yogaPose = { name: 'Downward Dog', duration: 30, instruction: 'Press your palms firmly into the mat. Lift your hips high and press your heels toward the floor. Breathe deeply and hold.' };
  const hiitExercise = { name: 'Burpees', duration: '30 seconds', instruction: 'Explode up with hands overhead, then drop down into a plank. Keep your core tight.' };
  
  const getTimerInfo = () => {
    if (currentType === 'yoga') return { show: true, value: `0:${yogaTime.toString().padStart(2, '0')}`, label: null };
    if (currentType === 'hiit') return { show: true, value: `0:${hiitTime.toString().padStart(2, '0')}`, label: isRest ? 'rest' : 'work' };
    if (currentType === 'running') return { show: true, value: '30:47', label: null };
    return { show: false, value: null, label: null };
  };
  const timerInfo = getTimerInfo();
  
  const minSwipeDistance = 50;
  const onTouchStart = (e) => { setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); };
  const onTouchMove = (e) => { setTouchEnd(e.targetTouches[0].clientX); };
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance && exerciseIndex < exerciseTypes.length - 1) setExerciseIndex(prev => prev + 1);
    if (distance < -minSwipeDistance && exerciseIndex > 0) setExerciseIndex(prev => prev - 1);
  };
  
  const getEditOptions = () => {
    const baseOptions = [{ icon: 'swap', label: 'Swap exercise' }, { icon: 'skip', label: 'Skip' }];
    if (currentType === 'strength') return [...baseOptions, { icon: 'adjust', label: 'Adjust weight/reps' }, { icon: 'delete', label: 'Remove exercise' }];
    if (currentType === 'yoga' || currentType === 'hiit') return [...baseOptions, { icon: 'time', label: 'Adjust duration' }];
    if (currentType === 'running') return [{ icon: 'skip', label: 'End run early' }];
    return baseOptions;
  };
  
  const editIcons = {
    swap: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>,
    adjust: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /></svg>,
    skip: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" /></svg>,
    delete: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
    time: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  };
  
  const getMainButton = () => {
    if (currentType === 'running') {
      return (
        <button onClick={() => setIsRunning(!isRunning)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 20px', background: colors.accent, color: colors.background, border: 'none', borderRadius: radius.pill, cursor: 'pointer', fontFamily: fontStack, fontSize: '14px', fontWeight: '600', flex: 1 }}>
          {isRunning ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>Pause</> : <><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>Resume</>}
        </button>
      );
    }
    return (
      <button onClick={() => currentType === 'strength' && setCurrentSet(prev => Math.min(prev + 1, 3))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 20px', background: colors.accent, color: colors.background, border: 'none', borderRadius: radius.pill, cursor: 'pointer', fontFamily: fontStack, fontSize: '14px', fontWeight: '600', flex: 1 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        Done
      </button>
    );
  };
  
  const getContent = () => {
    switch (currentType) {
      case 'strength': return <StrengthContent colors={colors} exercise={strengthExercise} currentSet={currentSet} totalSets={3} />;
      case 'running': return <RunningContent colors={colors} />;
      case 'yoga': return <YogaContent colors={colors} pose={yogaPose} />;
      case 'hiit': return <HIITContent colors={colors} exercise={hiitExercise} isRest={isRest} nextExercise="Mountain Climbers" />;
      default: return null;
    }
  };
  
  return (
    <WorkoutWrapper colors={colors} onClose={() => onNavigate('home')} onChat={() => onNavigate('chat')} onEdit={() => setShowEditModal(true)} currentExercise={exerciseIndex + 1} totalExercises={4} progress={((exerciseIndex + 1) / 4) * 100} mainButton={getMainButton()} showEditModal={showEditModal} onCloseModal={() => setShowEditModal(false)} showTimer={timerInfo.show} timerValue={timerInfo.value} timerLabel={timerInfo.label}
      editModalContent={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {getEditOptions().map((option, i) => (
            <button key={i} onClick={() => setShowEditModal(false)} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', background: colors.surface, border: 'none', borderRadius: radius.medium, cursor: 'pointer', fontFamily: fontStack, textAlign: 'left', color: option.icon === 'delete' ? '#FF3B30' : colors.text }}>
              <span style={{ color: option.icon === 'delete' ? '#FF3B30' : colors.textSecondary }}>{editIcons[option.icon]}</span>
              <span style={{ fontSize: '15px', fontWeight: '500' }}>{option.label}</span>
            </button>
          ))}
        </div>
      }
    >
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} style={{ height: '100%', position: 'relative' }}>
        {getContent()}
      </div>
    </WorkoutWrapper>
  );
};

// ============================================
// AI CHAT SHEET COMPONENT
// ============================================
const AIChatSheet = ({ colors, isOpen, isExpanded, onClose, onToggleExpand, isListening, onOrbPress, shouldFocusInput, conversation, onSendMessage }) => {
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const [touchStart, setTouchStart] = useState(null);
  
  // Focus input when sheet opens via tap
  useEffect(() => {
    if (isOpen && shouldFocusInput && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, shouldFocusInput]);

  // Scroll to bottom when conversation updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation]);

  const handleSend = () => {
    if (!message.trim()) return;
    onSendMessage(message);
    setMessage('');
  };

  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientY);
  };

  const handleTouchEnd = (e) => {
    if (!touchStart) return;
    const touchEnd = e.changedTouches[0].clientY;
    const diff = touchStart - touchEnd;
    
    if (diff > 50 && !isExpanded) {
      onToggleExpand(true);
    } else if (diff < -50 && isExpanded) {
      onToggleExpand(false);
    } else if (diff < -50 && !isExpanded) {
      onClose();
    }
    setTouchStart(null);
  };

  if (!isOpen) return null;

  const sheetHeight = isExpanded ? '75%' : '35%';

  return (
    <div 
      style={{ 
        position: 'absolute', 
        bottom: 0, 
        left: 0,
        right: 0,
        height: sheetHeight,
        background: colors.surface, 
        borderTopLeftRadius: '20px',
        borderTopRightRadius: '20px',
        zIndex: 55,
        display: 'flex',
        flexDirection: 'column',
        transition: 'height 0.3s ease',
      }}
    >
      {/* Drag Handle */}
      <div 
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ 
          padding: '12px 0 8px', 
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <div style={{ 
          width: '36px', 
          height: '4px', 
          background: colors.textTertiary, 
          borderRadius: '2px', 
          margin: '0 auto',
        }} />
      </div>

      {/* Conversation Area */}
      <div 
        ref={scrollRef}
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '8px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {conversation.length === 0 ? (
          <div style={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: colors.textTertiary,
            fontSize: '14px',
          }}>
            Ask me anything
          </div>
        ) : (
          conversation.map((msg, i) => (
            <div 
              key={i} 
              style={{ 
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
              }}
            >
              <div style={{ 
                padding: '10px 14px', 
                background: msg.role === 'user' ? colors.accent : colors.background,
                color: msg.role === 'user' ? colors.background : colors.text,
                borderRadius: '16px',
                borderBottomRightRadius: msg.role === 'user' ? '4px' : '16px',
                borderBottomLeftRadius: msg.role === 'ai' ? '4px' : '16px',
                fontSize: '14px',
                lineHeight: 1.4,
              }}>
                {msg.text}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input Area */}
      <div style={{ 
        padding: '12px 20px 24px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '10px',
      }}>
        {/* Text Input with inline send button */}
        <div style={{ 
          flex: 1, 
          background: colors.background, 
          borderRadius: radius.pill, 
          padding: '6px 6px 6px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <input 
            ref={inputRef}
            type="text" 
            placeholder="Message..." 
            value={message} 
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            style={{ 
              flex: 1,
              border: 'none', 
              outline: 'none', 
              fontSize: '15px', 
              fontFamily: fontStack, 
              color: colors.text, 
              background: 'transparent',
            }} 
          />
          {message.trim() && (
            <button 
              onClick={handleSend}
              style={{ 
                width: '32px', 
                height: '32px', 
                borderRadius: '50%', 
                background: colors.accent, 
                border: 'none', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                color: colors.background,
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </div>

        {/* AI Orb */}
        <div style={{ position: 'relative' }}>
          {isListening && (
            <>
              <div style={{
                position: 'absolute',
                inset: '-4px',
                borderRadius: '50%',
                border: '2px solid #FF3B30',
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
              <style>{`
                @keyframes pulse {
                  0%, 100% { transform: scale(1); opacity: 1; }
                  50% { transform: scale(1.15); opacity: 0.5; }
                }
              `}</style>
            </>
          )}
          <AIOrb 
            size={50} 
            onClick={onOrbPress}
          />
        </div>
      </div>
    </div>
  );
};

// ============================================
// HOME SCREEN
// ============================================
const HomeScreen = ({ colors, onNavigate }) => {
  const [fabOpen, setFabOpen] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [chatSheetOpen, setChatSheetOpen] = useState(false);
  const [chatSheetExpanded, setChatSheetExpanded] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [shouldFocusInput, setShouldFocusInput] = useState(false);
  const [conversation, setConversation] = useState([]);
  const holdTimer = useRef(null);
  const isHolding = useRef(false);
  
  const sendMessage = (text) => {
    setConversation(prev => [...prev, { role: 'user', text }]);
    // Simulate AI response
    setTimeout(() => {
      setConversation(prev => [...prev, { role: 'ai', text: "Got it! I'll keep that in mind for your next workout." }]);
    }, 1000);
  };

  const handleOrbTap = () => {
    if (chatSheetOpen) {
      // If sheet is open, tapping orb starts listening
      setIsListening(true);
      setShouldFocusInput(false);
      setTimeout(() => {
        setIsListening(false);
        sendMessage("Check my form on this set");
      }, 2000);
    }
  };

  const handleOrbClick = () => {
    if (!isHolding.current) {
      if (!chatSheetOpen) {
        setChatSheetOpen(true);
        setShouldFocusInput(true);
      } else {
        handleOrbTap();
      }
    }
    isHolding.current = false;
  };

  const handleOrbHoldStart = () => {
    holdTimer.current = setTimeout(() => {
      isHolding.current = true;
      setIsListening(true);
    }, 300);
  };

  const handleOrbHoldEnd = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
    }
    if (isListening && isHolding.current) {
      setIsListening(false);
      sendMessage("How am I doing today?");
    }
  };

  const handleCloseSheet = () => {
    setChatSheetOpen(false);
    setChatSheetExpanded(false);
    setIsListening(false);
    setShouldFocusInput(false);
  };
  
  const plusMenuOptions = [
    { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" /></svg>, label: 'Generate custom workout', action: () => onNavigate('intake') },
    { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>, label: 'Schedule a workout', action: () => {} },
    { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="2" /><path d="M7 20l3-6-2-1-3 4" /><path d="M17 20l-3-6 2-1 3 4" /><path d="M12 11v3" /></svg>, label: 'Start a run', action: () => onNavigate('workout') },
  ];

  const fabMenuItems = [
    { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>, label: 'History', action: () => onNavigate('history') },
    { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>, label: 'Profile', action: () => onNavigate('profile') },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: fontStack, color: colors.text, background: colors.background, position: 'relative' }}>
      {fabOpen && (
        <>
          <div onClick={() => setFabOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: '52px', left: '20px', background: colors.surface, borderRadius: radius.large, padding: '6px', zIndex: 50, minWidth: '160px' }}>
            {fabMenuItems.map((item, i) => (
              <button key={i} onClick={() => { item.action(); setFabOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'transparent', border: 'none', borderRadius: radius.medium, cursor: 'pointer', fontFamily: fontStack, textAlign: 'left', color: colors.text }} onMouseEnter={(e) => e.currentTarget.style.background = colors.highlight} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <span style={{ color: colors.textSecondary }}>{item.icon}</span>
                <span style={{ fontSize: '15px', fontWeight: '500' }}>{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {plusMenuOpen && (
        <>
          <div onClick={() => setPlusMenuOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: '52px', right: '20px', background: colors.surface, borderRadius: radius.large, padding: '6px', zIndex: 50, minWidth: '220px' }}>
            {plusMenuOptions.map((option, i) => (
              <button key={i} onClick={() => { option.action(); setPlusMenuOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'transparent', border: 'none', borderRadius: radius.medium, cursor: 'pointer', fontFamily: fontStack, textAlign: 'left', color: colors.text }} onMouseEnter={(e) => e.currentTarget.style.background = colors.highlight} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <span style={{ color: colors.textSecondary }}>{option.icon}</span>
                <span style={{ fontSize: '15px', fontWeight: '500' }}>{option.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <ThinTopBar 
        colors={colors}
        leftIcon={fabOpen ? <CloseIcon /> : <MenuIcon />}
        leftAction={() => setFabOpen(!fabOpen)}
        rightIcon={<PlusIcon />}
        rightAction={() => setPlusMenuOpen(!plusMenuOpen)}
      />

      <div style={{ padding: '8px 20px', flex: 1 }}>
        <p style={{ fontSize: '19px', fontWeight: '400', margin: 0, lineHeight: 1.55, color: colors.text }}>
          You've completed <Stat colors={colors}>3 workouts</Stat> this week. Your push strength is up <Stat colors={colors}>12%</Stat> from last month. Day <Stat colors={colors}>12</Stat> of your streak. Let's keep building.
        </p>
      </div>

      {/* Bottom bar - always visible */}
      <div style={{ padding: '16px 20px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button onClick={() => onNavigate('workout')} style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '10px 10px 10px 16px', background: colors.surface, border: 'none', borderRadius: radius.pill, cursor: 'pointer', fontFamily: fontStack, flex: 1, minWidth: 0 }}>
          <ScrollingText text="Upper Body Strength (45 min)" colors={colors} />
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: colors.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill={colors.background} style={{ marginLeft: '1px' }}><polygon points="5 3 19 12 5 21 5 3" /></svg>
          </div>
        </button>
        <div
          onMouseDown={handleOrbHoldStart}
          onMouseUp={handleOrbHoldEnd}
          onMouseLeave={handleOrbHoldEnd}
          onTouchStart={handleOrbHoldStart}
          onTouchEnd={handleOrbHoldEnd}
          style={{ position: 'relative' }}
        >
          {isListening && !chatSheetOpen && (
            <>
              <div style={{
                position: 'absolute',
                inset: '-4px',
                borderRadius: '50%',
                border: '2px solid #FF3B30',
                animation: 'pulse 1.5s ease-in-out infinite',
                zIndex: 10,
              }} />
              <style>{`
                @keyframes pulse {
                  0%, 100% { transform: scale(1); opacity: 1; }
                  50% { transform: scale(1.15); opacity: 0.5; }
                }
              `}</style>
            </>
          )}
          <AIOrb size={50} onClick={handleOrbClick} />
        </div>
      </div>

      {/* AI Chat Sheet */}
      <AIChatSheet 
        colors={colors}
        isOpen={chatSheetOpen}
        isExpanded={chatSheetExpanded}
        onClose={handleCloseSheet}
        onToggleExpand={setChatSheetExpanded}
        isListening={isListening && chatSheetOpen}
        onOrbPress={handleOrbTap}
        shouldFocusInput={shouldFocusInput}
        conversation={conversation}
        onSendMessage={sendMessage}
      />
    </div>
  );
};

// ============================================
// HISTORY SCREEN
// ============================================
const HistoryScreen = ({ colors, onNavigate, onSelectWorkout }) => {
  const workoutHistory = [
    { id: 0, date: 'Today', name: 'Outdoor Run', duration: '33 min', exercises: 1, completed: true, type: 'run' },
    { id: 1, date: 'Yesterday', name: 'Lower Body Power', duration: '38 min', exercises: 5, completed: true, type: 'strength' },
    { id: 2, date: 'Mon, Jan 20', name: 'Full Body HIIT', duration: '30 min', exercises: 8, completed: true, type: 'strength' },
    { id: 3, date: 'Sun, Jan 19', name: 'Easy Run', duration: '28 min', exercises: 1, completed: true, type: 'run' },
    { id: 4, date: 'Sat, Jan 18', name: 'Upper Body Strength', duration: '45 min', exercises: 6, completed: true, type: 'strength' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: fontStack, color: colors.text, background: colors.background }}>
      <ThinTopBar colors={colors} leftIcon={<ChevronLeft />} leftAction={() => onNavigate('home')} centerText="History" />
      
      <div style={{ padding: '8px 20px 20px' }}>
        <p style={{ fontSize: '16px', fontWeight: '400', margin: 0, lineHeight: 1.55, color: colors.text }}>
          You've completed <Stat colors={colors}>12 workouts</Stat> this month, averaging <Stat colors={colors}>38 min</Stat> per session. Your consistency is <Stat colors={colors}>↑ 20%</Stat> from last month.
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
        {workoutHistory.map((workout, i) => (
          <button key={i} onClick={() => workout.completed && onSelectWorkout(workout)} style={{ width: '100%', padding: '16px', background: colors.surface, borderRadius: radius.large, marginBottom: '8px', opacity: workout.completed ? 1 : 0.6, border: 'none', cursor: workout.completed ? 'pointer' : 'default', fontFamily: fontStack, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '500', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{workout.date}</span>
              {workout.completed && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
            </div>
            <p style={{ fontSize: '15px', fontWeight: '600', margin: '0 0 6px 0', color: colors.text }}>{workout.name}</p>
            <p style={{ fontSize: '13px', color: colors.textSecondary, margin: 0 }}>{workout.duration} · {workout.type === 'run' ? 'Run' : `${workout.exercises} exercises`}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

// ============================================
// WORKOUT DETAIL SCREEN
// ============================================
const workoutData = {
  id: 1, date: 'Yesterday', fullDate: 'Saturday, January 25, 2025', name: 'Lower Body Power', duration: '38 min', totalVolume: '4,250 lb',
  exercises: [
    { id: 1, name: 'Barbell Back Squat', sets: [{ reps: 8, weight: '135 lb', completed: true }, { reps: 8, weight: '155 lb', completed: true }, { reps: 6, weight: '175 lb', completed: true }], muscles: ['Quadriceps', 'Glutes', 'Hamstrings', 'Core'], goals: ['Build strength', 'Increase leg power'], aiReasoning: 'The barbell back squat is the foundation of your lower body work. Based on your goal to build overall leg strength and your available equipment, this compound movement will give you the most efficient muscle recruitment.' },
    { id: 2, name: 'Romanian Deadlift', sets: [{ reps: 10, weight: '95 lb', completed: true }, { reps: 10, weight: '95 lb', completed: true }, { reps: 10, weight: '95 lb', completed: true }], muscles: ['Hamstrings', 'Glutes', 'Lower Back'], goals: ['Posterior chain development', 'Improve hip hinge'], aiReasoning: 'Romanian deadlifts complement your squats by targeting the posterior chain. This exercise addresses the slight hamstring imbalance I noticed in your movement patterns.' },
    { id: 3, name: 'Walking Lunges', sets: [{ reps: 12, weight: '25 lb DBs', completed: true }, { reps: 12, weight: '25 lb DBs', completed: true }, { reps: 10, weight: '25 lb DBs', completed: true }], muscles: ['Quadriceps', 'Glutes', 'Hip Flexors'], goals: ['Single-leg stability', 'Functional movement'], aiReasoning: 'Walking lunges add a unilateral component to your training, which helps identify and correct any strength imbalances between your legs.' },
  ],
};

const WorkoutDetailScreen = ({ colors, onNavigate, onSelectExercise }) => {
  const workout = workoutData;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: fontStack, color: colors.text, background: colors.background }}>
      <ThinTopBar colors={colors} leftIcon={<ChevronLeft />} leftAction={() => onNavigate('history')} centerText={workout.name} />
      
      <div style={{ padding: '8px 20px 16px' }}>
        <p style={{ fontSize: '13px', fontWeight: '500', color: colors.textTertiary, margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{workout.fullDate}</p>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[{ v: workout.duration, l: 'Duration' }, { v: workout.exercises.length, l: 'Exercises' }, { v: workout.totalVolume, l: 'Volume' }].map((item, i) => (
            <div key={i} style={{ flex: 1, background: colors.surface, borderRadius: radius.medium, padding: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 2px 0' }}>{item.v}</p>
              <p style={{ fontSize: '11px', color: colors.textTertiary, margin: 0, textTransform: 'uppercase' }}>{item.l}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
        <p style={{ fontSize: '12px', fontWeight: '500', color: colors.textTertiary, margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Exercises</p>
        {workout.exercises.map((exercise, i) => (
          <button key={i} onClick={() => onSelectExercise(exercise)} style={{ width: '100%', padding: '14px 16px', background: colors.surface, borderRadius: radius.large, marginBottom: '8px', border: 'none', cursor: 'pointer', fontFamily: fontStack, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '15px', fontWeight: '600', margin: '0 0 4px 0', color: colors.text }}>{exercise.name}</p>
              <p style={{ fontSize: '13px', color: colors.textSecondary, margin: 0 }}>{exercise.sets.length} sets · {exercise.sets.map(s => s.reps).join(', ')} reps</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.textTertiary} strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        ))}
      </div>
    </div>
  );
};

// ============================================
// EXERCISE DETAIL SCREEN
// ============================================
const ExerciseDetailScreen = ({ colors, onNavigate, exercise }) => (
  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: fontStack, color: colors.text, background: colors.background }}>
    <ThinTopBar colors={colors} leftIcon={<ChevronLeft />} leftAction={() => onNavigate('workoutDetail')} centerText={exercise.name} />
    
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontSize: '12px', fontWeight: '500', color: colors.textTertiary, margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Sets</p>
        {exercise.sets.map((set, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: colors.surface, borderRadius: radius.medium, marginBottom: '6px' }}>
            <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: colors.highlight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '600' }}>{i + 1}</span>
            <span style={{ fontSize: '15px', fontWeight: '500', flex: 1 }}>{set.reps} reps</span>
            <span style={{ fontSize: '15px', color: colors.textSecondary }}>{set.weight}</span>
            {set.completed && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>}
          </div>
        ))}
      </div>

      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontSize: '12px', fontWeight: '500', color: colors.textTertiary, margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Muscles Targeted</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {exercise.muscles.map((muscle, i) => <span key={i} style={{ padding: '8px 12px', background: colors.surface, borderRadius: radius.pill, fontSize: '13px', fontWeight: '500' }}>{muscle}</span>)}
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontSize: '12px', fontWeight: '500', color: colors.textTertiary, margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Goals Addressed</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {exercise.goals.map((goal, i) => <span key={i} style={{ padding: '8px 12px', background: colors.surface, borderRadius: radius.pill, fontSize: '13px', fontWeight: '500' }}>{goal}</span>)}
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <AIOrb size={24} onClick={() => {}} />
          <p style={{ fontSize: '12px', fontWeight: '500', color: colors.textTertiary, margin: 0, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Why This Exercise</p>
        </div>
        <p style={{ fontSize: '15px', fontWeight: '400', margin: 0, lineHeight: 1.6, color: colors.text }}>{exercise.aiReasoning}</p>
      </div>
    </div>
  </div>
);

// ============================================
// PROFILE SCREEN
// ============================================
const ProfileScreen = ({ colors, onNavigate }) => {
  const stats = [{ label: 'Workouts', value: '47' }, { label: 'Hours', value: '32' }, { label: 'Streak', value: '12' }];
  const menuItems = [
    { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>, label: 'Goals', subtitle: 'Build muscle, 4x/week' },
    { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 5v14M18 5v14M6 9h12M6 15h12M2 9h4M2 15h4M18 9h4M18 15h4" /></svg>, label: 'Equipment', subtitle: 'Dumbbells, bench, bands' },
    { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>, label: 'Schedule', subtitle: 'Mon, Tue, Thu, Sat' },
    { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>, label: 'Settings', subtitle: 'Notifications, preferences' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: fontStack, color: colors.text, background: colors.background }}>
      <ThinTopBar colors={colors} leftIcon={<ChevronLeft />} leftAction={() => onNavigate('home')} centerText="Profile" />
      
      <div style={{ padding: '8px 20px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: colors.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '600', color: colors.textSecondary }}>Y</div>
        <div>
          <p style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 4px 0' }}>Yisroel</p>
          <p style={{ fontSize: '14px', color: colors.textSecondary, margin: 0 }}>Training since Dec 2024</p>
        </div>
      </div>

      <div style={{ padding: '0 20px 24px', display: 'flex', gap: '8px' }}>
        {stats.map((stat, i) => (
          <div key={i} style={{ flex: 1, background: colors.surface, borderRadius: radius.large, padding: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>{stat.value}</p>
            <p style={{ fontSize: '12px', color: colors.textTertiary, margin: 0, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{stat.label}</p>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, padding: '0 20px' }}>
        {menuItems.map((item, i) => (
          <button key={i} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', background: colors.surface, border: 'none', borderRadius: radius.large, marginBottom: '8px', cursor: 'pointer', fontFamily: fontStack, textAlign: 'left' }}>
            <span style={{ color: colors.textSecondary }}>{item.icon}</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '15px', fontWeight: '500', margin: '0 0 2px 0', color: colors.text }}>{item.label}</p>
              <p style={{ fontSize: '13px', color: colors.textTertiary, margin: 0 }}>{item.subtitle}</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.textTertiary} strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        ))}
      </div>
    </div>
  );
};

// ============================================
// INTAKE SCREEN
// ============================================
const IntakeScreen = ({ colors, onNavigate }) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [conversation, setConversation] = useState([]);
  const scrollRef = useRef(null);

  const questions = [
    "What are your main fitness goals? Are you looking to build muscle, lose weight, improve endurance, or something else?",
    "How would you describe your current fitness level? Beginner, intermediate, or advanced?",
    "What equipment do you have access to? Gym, home gym, dumbbells, bodyweight only?",
    "How many days per week can you realistically commit to working out?",
    "Do you have any injuries or physical limitations I should know about?",
    "What time of day do you prefer to exercise?",
    "Have you tried any workout programs before? What worked or didn't work for you?",
    "What's your biggest challenge when it comes to staying consistent with fitness?"
  ];

  const totalQuestions = questions.length;
  const progress = ((currentQuestion + 1) / totalQuestions) * 100;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [conversation, currentQuestion]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    setConversation(prev => [...prev, { question: questions[currentQuestion], answer: inputText }]);
    setInputText('');
    if (currentQuestion < totalQuestions - 1) setCurrentQuestion(prev => prev + 1);
    else onNavigate('home');
  };

  const handleMicPress = () => {
    setIsRecording(!isRecording);
    if (!isRecording) setTimeout(() => { setInputText("Build muscle and improve overall strength"); setIsRecording(false); }, 1500);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: fontStack, color: colors.text, background: colors.background }}>
      <ThinTopBar colors={colors} leftIcon={<CloseIcon />} leftAction={() => onNavigate('home')} centerText={`${currentQuestion + 1} of ${totalQuestions}`} />

      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ height: '3px', background: colors.surface, borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: colors.text, borderRadius: '2px', transition: 'width 0.3s ease' }} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '0 20px 24px' }}>
        <AIOrb size={100} onClick={() => {}} />
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '30px', background: `linear-gradient(to bottom, ${colors.background}, transparent)`, zIndex: 1, pointerEvents: 'none' }} />
        <div ref={scrollRef} style={{ height: '100%', overflowY: 'auto', padding: '20px 20px 40px 20px' }}>
          {conversation.map((item, i) => (
            <div key={i} style={{ marginBottom: '24px', opacity: 0.5 }}>
              <p style={{ fontSize: '22px', fontWeight: '400', margin: '0 0 12px 0', lineHeight: 1.4, color: colors.text }}>{item.question}</p>
              <p style={{ fontSize: '18px', fontWeight: '400', margin: 0, lineHeight: 1.5, color: colors.textSecondary }}>{item.answer}</p>
            </div>
          ))}
          <p style={{ fontSize: '24px', fontWeight: '400', margin: 0, lineHeight: 1.4, color: colors.text }}>{questions[currentQuestion]}</p>
          {inputText && <p style={{ fontSize: '18px', fontWeight: '400', margin: '16px 0 0 0', lineHeight: 1.5, color: colors.textSecondary }}>{inputText}</p>}
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50px', background: `linear-gradient(to top, ${colors.background}, transparent)`, zIndex: 1, pointerEvents: 'none' }} />
      </div>

      <div style={{ padding: '16px 20px 24px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={handleMicPress} style={{ width: '50px', height: '50px', borderRadius: '50%', background: isRecording ? 'rgba(255,59,48,0.2)' : colors.surface, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isRecording ? '#FF3B30' : colors.text, flexShrink: 0, transition: 'all 0.2s ease' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
          </button>
          <div style={{ flex: 1, background: colors.surface, borderRadius: radius.pill, padding: '12px 16px' }}>
            <input type="text" placeholder="Type your answer..." value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSend()} style={{ width: '100%', border: 'none', outline: 'none', fontSize: '15px', fontFamily: fontStack, color: colors.text, background: 'transparent' }} />
          </div>
          <button onClick={handleSend} style={{ width: '50px', height: '50px', borderRadius: '50%', background: inputText.trim() ? colors.accent : colors.surface, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: inputText.trim() ? colors.background : colors.textTertiary, flexShrink: 0, transition: 'all 0.2s ease' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// CHAT SCREEN
// ============================================
const ChatScreen = ({ colors, onNavigate }) => {
  const [message, setMessage] = useState('');
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: fontStack, color: colors.text, background: colors.background }}>
      <ThinTopBar colors={colors} leftIcon={<ChevronLeft />} leftAction={() => onNavigate('home')} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
        <AIOrb size={100} onClick={() => {}} />
        <p style={{ fontSize: '16px', color: colors.textSecondary, textAlign: 'center', marginTop: '24px', lineHeight: 1.5 }}>How can I help with your training?</p>
      </div>

      <div style={{ padding: '0 20px 16px', display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
        {['Form check', 'Modify exercise', 'I need rest', 'Skip this'].map((prompt, i) => (
          <button key={i} style={{ padding: '10px 14px', background: colors.surface, border: 'none', borderRadius: radius.medium, fontSize: '13px', fontWeight: '500', color: colors.textSecondary, cursor: 'pointer', fontFamily: fontStack }}>{prompt}</button>
        ))}
      </div>

      <div style={{ padding: '16px 20px 24px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button style={{ width: '50px', height: '50px', borderRadius: '50%', background: colors.surface, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.text, flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
          </button>
          <div style={{ flex: 1, background: colors.surface, borderRadius: radius.pill, padding: '12px 16px' }}>
            <input type="text" placeholder="Ask anything..." value={message} onChange={(e) => setMessage(e.target.value)} style={{ width: '100%', border: 'none', outline: 'none', fontSize: '15px', fontFamily: fontStack, color: colors.text, background: 'transparent' }} />
          </div>
          <button style={{ width: '50px', height: '50px', borderRadius: '50%', background: message.trim() ? colors.accent : colors.surface, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: message.trim() ? colors.background : colors.textTertiary, flexShrink: 0, transition: 'all 0.2s ease' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// PHONE FRAME
// ============================================
const PhoneFrame = ({ children, themeName }) => (
  <div style={{ width: '375px', height: '812px', background: themes[themeName].background, borderRadius: '52px', overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.15)', border: themeName === 'dark' ? '10px solid #1a1a1a' : '10px solid #e8e8e8', position: 'relative' }}>
    <div style={{ position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', width: '120px', height: '36px', background: '#000000', borderRadius: '20px', zIndex: 10 }} />
    <div style={{ height: '100%', paddingTop: '56px', overflow: 'hidden' }}>{children}</div>
    <div style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', width: '134px', height: '5px', background: themeName === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)', borderRadius: '3px' }} />
  </div>
);

// ============================================
// MAIN APP
// ============================================
export default function WorkoutFlowComplete() {
  const [theme, setTheme] = useState('light');
  const [screen, setScreen] = useState('home');
  const [selectedExercise, setSelectedExercise] = useState(workoutData.exercises[0]);
  const colors = themes[theme];

  const handleSelectWorkout = (workout) => {
    if (workout.type === 'run') setScreen('workoutDetail');
    else setScreen('workoutDetail');
  };

  const handleSelectExercise = (exercise) => {
    setSelectedExercise(exercise);
    setScreen('exerciseDetail');
  };

  const screenLabels = {
    home: 'Home', workout: 'Workout', history: 'History', workoutDetail: 'Wk Detail', 
    exerciseDetail: 'Ex Detail', profile: 'Profile', intake: 'Intake', chat: 'Chat'
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg, #1a1a1a 0%, #0a0a0a 100%)', padding: '40px 20px', fontFamily: fontStack, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#FFFFFF', margin: '0 0 8px 0', letterSpacing: '-0.03em' }}>Workout Flow Complete</h1>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>All screens with consistent thin top bar</p>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.08)', padding: '4px', borderRadius: '10px' }}>
          {['light', 'dark'].map((t) => (
            <button key={t} onClick={() => setTheme(t)} style={{ padding: '8px 14px', background: theme === t ? '#FFFFFF' : 'transparent', color: theme === t ? '#000000' : 'rgba(255,255,255,0.6)', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: fontStack, textTransform: 'capitalize' }}>{t}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.08)', padding: '4px', borderRadius: '10px', flexWrap: 'wrap' }}>
          {Object.keys(screenLabels).map((s) => (
            <button key={s} onClick={() => setScreen(s)} style={{ padding: '8px 8px', background: screen === s ? '#FFFFFF' : 'transparent', color: screen === s ? '#000000' : 'rgba(255,255,255,0.6)', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: fontStack }}>{screenLabels[s]}</button>
          ))}
        </div>
      </div>

      <PhoneFrame themeName={theme}>
        {screen === 'home' && <HomeScreen colors={colors} onNavigate={setScreen} />}
        {screen === 'workout' && <WorkoutScreen colors={colors} onNavigate={setScreen} />}
        {screen === 'history' && <HistoryScreen colors={colors} onNavigate={setScreen} onSelectWorkout={handleSelectWorkout} />}
        {screen === 'workoutDetail' && <WorkoutDetailScreen colors={colors} onNavigate={setScreen} onSelectExercise={handleSelectExercise} />}
        {screen === 'exerciseDetail' && <ExerciseDetailScreen colors={colors} onNavigate={setScreen} exercise={selectedExercise} />}
        {screen === 'profile' && <ProfileScreen colors={colors} onNavigate={setScreen} />}
        {screen === 'intake' && <IntakeScreen colors={colors} onNavigate={setScreen} />}
        {screen === 'chat' && <ChatScreen colors={colors} onNavigate={setScreen} />}
      </PhoneFrame>

      <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '24px', textAlign: 'center' }}>
        On Workout screen: swipe left/right to switch between Strength · Running · Yoga · HIIT
      </p>
    </div>
  );
}