/* ═══════════════════════════════════════════════════════════
   CELLSOURCE — CELLULAR HEALTH SNAPSHOT
   app.js v2.0 — Complete assessment logic
   ═══════════════════════════════════════════════════════════ */

// ─── AIRTABLE CONFIG (replace with real values before deploy) ───
const AIRTABLE_API_KEY   = 'YOUR_AIRTABLE_API_KEY';
const AIRTABLE_BASE_ID   = 'YOUR_BASE_ID';
const AIRTABLE_TABLE_NAME = 'Assessment Submissions';

// ─── ASSESSMENT STATE ────────────────────────────────────────────
const assessmentState = {
  currentScreen: 0,
  answers: {},         // qId → index (single) or [indices] (multi)
  scores: { cat1: 0, cat2: 0, cat3: 0, cat4: 0, cat5: 0 },
  cdScores: { cat1: 0, cat2: 0, cat3: 0, cat4: 0, cat5: 0 }, // points from C/D answers only
  openText: { q3: '', q9: '', q13: '' },
  q12flags: [],
  email: ''
};

// ─── QUESTIONS DATA ──────────────────────────────────────────────
const questions = [
  {
    id: 'q1', num: 1, type: 'single',
    text: 'When your alarm goes off, what is the first honest feeling in your body?',
    options: [
      { label: 'A', text: 'Ready. I wake up clear and rested', score: {} },
      { label: 'B', text: 'Okay once I get moving', score: {} },
      { label: 'C', text: 'Heavy. My body wants more sleep', score: { cat1: 1.5, cat4: 0.5 } },
      { label: 'D', text: 'Dread. Getting up feels like a real effort', score: { cat1: 2.5, cat4: 1 } }
    ]
  },
  {
    id: 'q2', num: 2, type: 'single',
    text: 'On a typical day, how much time do you spend doing something just for yourself?\nThink: a walk, a workout, a stretch, a face mask, anything that is just for you.',
    options: [
      { label: 'A', text: 'Two hours or more', score: {} },
      { label: 'B', text: 'Around an hour', score: {} },
      { label: 'C', text: 'Thirty minutes or less', score: { cat2: 1.5 } },
      { label: 'D', text: 'Barely anything if I am honest', score: { cat2: 2.5, cat1: 0.5 } }
    ]
  },
  {
    id: 'q3', num: 3, type: 'open',
    text: 'What does doing something for yourself actually look like?',
    placeholder: 'Keep it simple. Just describe what you typically do.',
    skipLabel: 'Skip this one',
    storeIn: 'q3'
  },
  {
    id: 'q4', num: 4, type: 'single',
    text: 'When you think about doing something for your health today, what comes up first?\nThink: heading to the gym, going for a walk, making a healthy meal, doing anything for your body.',
    options: [
      { label: 'A', text: 'Excited. I genuinely look forward to it', score: {} },
      { label: 'B', text: 'It is fine. More habit than anything', score: {} },
      { label: 'C', text: 'Resistance. I know I should but I do not want to', score: { cat1: 1.5, cat4: 0.5 } },
      { label: 'D', text: 'Exhausted just thinking about it', score: { cat1: 2.5, cat3: 1 } }
    ]
  },
  {
    id: 'q5', num: 5, type: 'single',
    text: 'It is 3pm. Your body hits a wall. What happens?',
    options: [
      { label: 'A', text: 'Nothing. My energy stays consistent', score: {} },
      { label: 'B', text: 'I slow down but push through', score: {} },
      { label: 'C', text: 'I reach for coffee or sugar to keep going', score: { cat1: 1.5, cat3: 0.5 } },
      { label: 'D', text: 'I struggle to function and just want to lie down', score: { cat1: 2.5, cat4: 1 } }
    ]
  },
  {
    id: 'q6', num: 6, type: 'single',
    text: 'After a physically demanding day or workout, how does your body feel?\nThink: a long workout, a full day on your feet, a hike.',
    options: [
      { label: 'A', text: 'Good. A little sore but I bounce back fast', score: {} },
      { label: 'B', text: 'Sore for a couple of days and it slows me down', score: {} },
      { label: 'C', text: 'My body holds onto it. Stiff and sore longer than it should', score: { cat2: 1.5, cat5: 0.5 } },
      { label: 'D', text: 'Recovery hurts enough that I have started avoiding it', score: { cat2: 2.5, cat1: 1 } }
    ]
  },
  {
    id: 'q7', num: 7, type: 'multi',
    text: 'When stress hits, where do you feel it first?',
    requireOne: true,
    options: [
      { label: '–', text: 'I don\'t really feel stress in my body', score: {} },
      { label: '–', text: 'Chest or breathing gets tight', score: { cat4: 0.5 } },
      { label: '–', text: 'Shoulders, jaw or neck lock up', score: { cat5: 0.5, cat4: 0.5 } },
      { label: '–', text: 'Head goes foggy and thinking slows down', score: { cat3: 0.5 } },
      { label: '–', text: 'Gut feels unsettled or off', score: { cat5: 0.5, cat1: 0.5 } }
    ]
  },
  {
    id: 'q8', num: 8, type: 'single',
    text: 'How well are you sleeping right now?',
    options: [
      { label: 'A', text: 'Deep and consistent', score: {} },
      { label: 'B', text: 'Okay but I don\'t always wake up feeling rested', score: {} },
      { label: 'C', text: 'I fall asleep but wake through the night', score: { cat4: 1.5 } },
      { label: 'D', text: 'Broken, light and never restful', score: { cat4: 2.5, cat1: 1 } }
    ]
  },
  {
    id: 'q9', num: 9, type: 'single-conditional',
    text: 'Does your body carry any tension, stiffness or discomfort that just will not fully go away?\nThink: a tight neck, achy joints, lower back, that thing you have just learned to live with.',
    conditionalTrigger: [2, 3], // indices C=2, D=3
    followupLabel: 'Where do you feel it most?',
    followupPlaceholder: 'e.g. lower back, neck, knees',
    storeFollowupIn: 'q9',
    options: [
      { label: 'A', text: 'No. I feel pretty comfortable physically', score: {} },
      { label: 'B', text: 'Some tension that comes and goes', score: {} },
      { label: 'C', text: 'Yes, one area that bothers me regularly', score: { cat5: 1.5 } },
      { label: 'D', text: 'Yes, multiple places and it affects my day', score: { cat5: 2.5, cat1: 0.5 } }
    ]
  },
  {
    id: 'q10', num: 10, type: 'single',
    text: 'When you sit down to focus on something important, what happens?\nThink: reading, working, planning something.',
    options: [
      { label: 'A', text: 'I lock in easily and stay there', score: {} },
      { label: 'B', text: 'I focus but drift after a while', score: {} },
      { label: 'C', text: 'I find myself rereading the same lines and it still isn\'t making sense', score: { cat3: 1.5 } },
      { label: 'D', text: 'Focusing feels genuinely hard most of the time', score: { cat3: 2.5, cat1: 0.5 } }
    ]
  },
  {
    id: 'q11', num: 11, type: 'single',
    text: 'How easy is it for you to fully switch off when you are not working or busy?',
    options: [
      { label: 'A', text: 'Easy. I transition well and genuinely relax', score: {} },
      { label: 'B', text: 'Takes a little time but I get there', score: { cat4: 1.5 } },
      { label: 'C', text: 'I find it hard to stop. My mind keeps running', score: { cat4: 2, cat3: 1.5 } },
      { label: 'D', text: 'I don\'t think I ever fully switch off', score: { cat4: 2.5, cat1: 1.5 } }
    ]
  },
  {
    id: 'q12', num: 12, type: 'multi-any',
    text: 'What have you already tried on your health journey?',
    alwaysEnabled: true,
    options: [
      { label: '–', text: 'Clean eating or changing your diet', flag: 'nutrition' },
      { label: '–', text: 'Supplements or vitamins', flag: 'supplementation' },
      { label: '–', text: 'Exercise or movement routines', flag: 'movement' },
      { label: '–', text: 'Improving sleep habits', flag: 'sleep' },
      { label: '–', text: 'Meditation, breathwork or stress management', flag: 'nervous system' },
      { label: '–', text: 'Nothing structured yet', flag: 'early awareness' }
    ]
  },
  {
    id: 'q13', num: 13, type: 'open',
    text: 'If your body could send you one message right now, what do you think it would say?',
    placeholder: 'First thing that comes to mind. No wrong answers.',
    skipLabel: 'Skip this one',
    storeIn: 'q13'
  }
];

// ─── RESULTS TEMPLATES ───────────────────────────────────────────
const RESULTS = {
  cat1: {
    name: 'Energy Drain and Fatigue',
    watermarkWord: 'ENERGY',
    brandResponse: 'We hear you.',
    primaryPattern: 'Your cells are the foundation of everything. Your energy, your focus, your sleep, your recovery. They all run from the same source. And right now, something at that source is worth paying attention to. That source is your cellular energy production. And it is running below where it should be.',
    secondaryPatterns: {
      cat2: 'Poor Recovery. Your body is taking longer to bounce back than it should.',
      cat3: 'Mental Fog. Your focus and clarity have taken a hit. Tasks that used to feel easy now take more effort than they should.',
      cat4: 'Disrupted Sleep. You are getting the hours but not the depth. Sleep is not restoring you the way it should.',
      cat5: 'Inflammation and Physical Pain. Your body is carrying a load that is draining your cellular resources.'
    },
    connector: 'These patterns are not separate problems. They are the same problem showing up in different places.',
    top3: [
      'You crash before the day is finished. Your energy drops hard in the afternoon. You reach for coffee or sugar just to get through. This is a cellular energy problem not a discipline problem.',
      'Your mind will not stay sharp. You sit down to focus and the clarity is not there. Your brain is working harder than it should for results below what you know you are capable of.',
      'Sleep is not doing its job. You are getting hours but waking up unrestored. Every day starts with yesterday\'s deficit still on board.'
    ],
    whyHappening: `Think of your cells like the battery inside your phone.

When the battery is fully charged, everything runs smoothly. Apps open fast. The screen is bright. It does everything you need without slowing down or overheating. But when that battery starts to degrade, none of that changes on the surface. You still use the phone the same way. You still plug it in each night. You still do everything right. And yet the battery drains faster, the performance drops, and no matter how many times you charge it, it never quite holds the way it used to.

Your cells work the same way. They run on bioelectrical energy. They communicate through electromagnetic signals. And just like a phone battery, they can deplete over time not because of anything you did wrong, but because most of the things we use to support our health work at the surface level. They charge the phone. They do not restore the battery itself.

PEMF and Terahertz frequency technology works at the battery level. Not the surface. The source. It works at the bioelectromagnetic layer where your cells actually produce energy, send signals, and coordinate repair. This is the layer that food, supplements, and sleep habits simply cannot reach.

For you, the battery has been draining faster than it is being restored. The goal is to get it charging properly again.`,
    dailyShifts: [
      'Move within thirty minutes of waking. Not a workout. Just movement. A walk, a stretch, anything that signals your cells to come online.',
      'Hydrate before you caffeinate. Drink water before your first coffee every morning. Hydration is the first input in the cellular energy chain.',
      'Create a wind-down signal. Thirty minutes before sleep lower your lights and remove screens. Your nervous system needs a clear signal the day is ending so your cells can enter repair mode.'
    ],
    dailyShiftsHeading: 'Daily Shifts to Start Rebuilding Your Energy',
    patternsToWatch: `Cellular health is not a one-and-done fix. It is not something you sort out once and leave alone.

Think about it like charging your phone. You do not charge it once and expect it to run forever. You charge it consistently, every single day, because that is how the battery stays functional. And over time, if you never give it a proper charge, the battery capacity itself starts to decline. Performance drops. Recovery slows. The phone starts doing less with the same input.

Your cells work the same way. They need consistent recharging. Not a course. Not a detox. A daily input that keeps the cellular battery running at the level your body is designed to operate at.

The technology exists to do exactly that.

Every day you give your cells the right input is a day your energy compounds. This is where that starts.`,
    bridgeSentence: `You have tried the surface layer. This is something different.

OlyLife is not a supplement. It is not a food or a diet. It is frequency technology that works at the bioelectromagnetic layer your cells actually run on. The layer everything else has been missing.`,
    products: [
      {
        name: 'OlyLife Tera P90+',
        description: 'The P90+ combines PEMF and Terahertz frequency technology with two additional attachments in one complete system. Twenty minutes on the footplate activates cellular energy production, improves microcirculation and supports the bioelectromagnetic environment your cells use to communicate and repair. The Revitaluxe attachment targets muscle recovery and localised tension. The Frost Age Beauty device supports skin and collagen at the cellular level. One device. Three modes of action. Twenty minutes a day.'
      },
      {
        name: 'H+ Molecular Hydrogen Infuser',
        description: 'Molecular hydrogen is one of the few antioxidants that crosses the blood-brain barrier. Added to your water through electrolysis, it reaches your cells with every sip and reduces the oxidative load that depletes cellular energy and disrupts neural signalling. Upgraded hydration working at the cellular level.'
      }
    ],
    dailyProtocol: `Morning: H+ bottle first thing before anything else.
Evening: 20 minutes on the Tera P90+. Sit, wind down while it works.`,
    nextStepLine: 'You have been doing everything right at the surface level. Now you know what has been missing.'
  },

  cat2: {
    name: 'Poor Recovery',
    watermarkWord: 'RECOVERY',
    brandResponse: 'We hear you.',
    primaryPattern: 'Your cells are the foundation of everything. Your energy, your focus, your sleep, your recovery. They all run from the same source. And right now, something at that source is worth paying attention to. That source is your cellular repair cycle. And it is not completing the way it needs to.',
    secondaryPatterns: {
      cat1: 'Energy Drain and Fatigue. The depletion does not just show up after exercise. It runs through your whole day.',
      cat3: 'Mental Fog. The cellular depletion affecting your recovery is also affecting your mental clarity.',
      cat4: 'Disrupted Sleep. Without deep restorative sleep your body cannot complete the repair cycle it needs.',
      cat5: 'Inflammation and Physical Pain. Your body is holding tension that recovery alone is not clearing.'
    },
    connector: 'These patterns are connected. When your cells cannot recover efficiently inflammation builds, energy drops and the whole system slows down together.',
    top3: [
      'Your body holds onto effort longer than it should. One hard day becomes three days of paying for it. You have started planning your life around recovery without even realising.',
      'Soreness and stiffness have become your normal. There is always something tight, something aching. You have learned to live with it but it is not supposed to be there.',
      'You are pulling back from things you used to do. Not because you want to. Because the cost has started to outweigh the reward.'
    ],
    whyHappening: `Think of your cells like the battery inside your phone.

When the battery is fully charged, everything runs smoothly. Apps open fast. The screen is bright. It does everything you need without slowing down or overheating. But when that battery starts to degrade, none of that changes on the surface. You still use the phone the same way. You still plug it in each night. You still do everything right. And yet the battery drains faster, the performance drops, and no matter how many times you charge it, it never quite holds the way it used to.

Your cells work the same way. They run on bioelectrical energy. They communicate through electromagnetic signals. And just like a phone battery, they can deplete over time not because of anything you did wrong, but because most of the things we use to support our health work at the surface level. They charge the phone. They do not restore the battery itself.

PEMF and Terahertz frequency technology works at the battery level. Not the surface. The source. It works at the bioelectromagnetic layer where your cells actually produce energy, send signals, and coordinate repair. This is the layer that food, supplements, and sleep habits simply cannot reach.

For you, the battery is running out of charge before the repair cycle completes. The goal is to give it enough power to finish the job.`,
    dailyShifts: [
      'Move gently the day after hard effort. Light movement keeps circulation active and helps your cells clear the waste causing prolonged soreness.',
      'Prioritise protein in your first meal of the day. Your cells need amino acids to rebuild. Timing matters more than quantity.',
      'End your shower cold. Thirty seconds of cold water activates circulation and reduces the inflammatory response in muscle tissue.'
    ],
    dailyShiftsHeading: 'Daily Shifts to Start Accelerating Your Recovery',
    patternsToWatch: `Cellular health is not a one-and-done fix. It is not something you sort out once and leave alone.

Think about it like charging your phone. You do not charge it once and expect it to run forever. You charge it consistently, every single day, because that is how the battery stays functional. And over time, if you never give it a proper charge, the battery capacity itself starts to decline. Performance drops. Recovery slows. The phone starts doing less with the same input.

Your cells work the same way. They need consistent recharging. Not a course. Not a detox. A daily input that keeps the cellular battery running at the level your body is designed to operate at.

The technology exists to do exactly that.

Every day you support your cellular repair environment is a day your body gets closer to bouncing back the way it used to. This is where that starts.`,
    bridgeSentence: `You have tried the surface layer. This is something different.

OlyLife is not a supplement. It is not a food or a diet. It is frequency technology that works at the bioelectromagnetic layer your cells actually run on. The layer everything else has been missing.`,
    products: [
      {
        name: 'OlyLife Tera P90+',
        description: 'The P90+ combines PEMF and Terahertz frequency technology with two additional attachments in one complete system. Twenty minutes on the footplate activates cellular energy production, improves microcirculation and supports the bioelectromagnetic environment your cells use to communicate and repair. The Revitaluxe attachment targets muscle recovery and localised tension. The Frost Age Beauty device supports skin and collagen at the cellular level. One device. Three modes of action. Twenty minutes a day.'
      },
      {
        name: 'Vitality Wand',
        description: 'Handheld Terahertz frequency technology designed for localised areas of tension, stiffness and discomfort. Improves microcirculation directly in the tissue holding the problem. Five to fifteen minutes on any affected area.{{bodyPartNote}} Direct. Precise. Effective.'
      }
    ],
    dailyProtocol: `Morning: 10 minutes with the Vitality Wand on your primary area before movement.
Evening: 20 minutes on the Tera P90+. Sit, wind down while it works.`,
    nextStepLine: 'Your body has not lost the ability to recover. It has lost the conditions it needs. Now you know what those are.'
  },

  cat3: {
    name: 'Mental Fog',
    watermarkWord: 'CLARITY',
    brandResponse: 'We hear you.',
    primaryPattern: 'Your cells are the foundation of everything. Your energy, your focus, your sleep, your recovery. They all run from the same source. And right now, something at that source is worth paying attention to. That source is cellular energy reaching your brain. And the signal is weaker than it used to be.',
    secondaryPatterns: {
      cat1: 'Energy Drain and Fatigue. The mental depletion does not stay in your head. Your energy and your focus are drawing from the same depleted reserve.',
      cat2: 'Poor Recovery. The same cellular environment affecting your physical recovery is affecting your cognitive recovery.',
      cat4: 'Disrupted Sleep. Your brain is not getting the overnight repair it depends on.',
      cat5: 'Inflammation and Physical Pain. Systemic inflammation is one of the primary drivers of cognitive slowdown.'
    },
    connector: 'These patterns feed each other. A depleted brain drives poor sleep. Poor sleep deepens the fog. The cycle compounds quietly until it becomes your new normal.',
    top3: [
      'Your thinking has slowed and you notice the gap. There is a version of you that processed things faster and moved through complex tasks with ease. That gap between then and now is not imaginary. It is cellular.',
      'Focus requires effort it did not used to require. Sitting down to concentrate now feels like pushing through resistance. The work gets done but it costs more than it should.',
      'Mental tiredness that sleep does not fix. You wake up and the fog is already there. Your brain never fully resets overnight. You are carrying yesterday\'s cognitive debt into every new day.'
    ],
    whyHappening: `Think of your cells like the battery inside your phone.

When the battery is fully charged, everything runs smoothly. Apps open fast. The screen is bright. It does everything you need without slowing down or overheating. But when that battery starts to degrade, none of that changes on the surface. You still use the phone the same way. You still plug it in each night. You still do everything right. And yet the battery drains faster, the performance drops, and no matter how many times you charge it, it never quite holds the way it used to.

Your cells work the same way. They run on bioelectrical energy. They communicate through electromagnetic signals. And just like a phone battery, they can deplete over time not because of anything you did wrong, but because most of the things we use to support our health work at the surface level. They charge the phone. They do not restore the battery itself.

PEMF and Terahertz frequency technology works at the battery level. Not the surface. The source. It works at the bioelectromagnetic layer where your cells actually produce energy, send signals, and coordinate repair. This is the layer that food, supplements, and sleep habits simply cannot reach.

For you, the battery powering your brain's processing speed has been running below capacity. The goal is to clear the load and restore the signal.`,
    dailyShifts: [
      'Protect the first hour of your day from decisions. Your brain has the highest cognitive clarity in the morning before decision fatigue sets in. Use it for your most demanding mental work, not email.',
      'Step outside within thirty minutes of waking. Natural light calibrates your circadian rhythm which directly regulates the cellular repair cycle your brain depends on overnight.',
      'End screen use thirty minutes before sleep. Blue light suppresses melatonin and delays the deep sleep stages where your brain clears the metabolic waste that builds during the day.'
    ],
    dailyShiftsHeading: 'Daily Shifts to Start Clearing the Fog',
    patternsToWatch: `Cellular health is not a one-and-done fix. It is not something you sort out once and leave alone.

Think about it like charging your phone. You do not charge it once and expect it to run forever. You charge it consistently, every single day, because that is how the battery stays functional. And over time, if you never give it a proper charge, the battery capacity itself starts to decline. Performance drops. Recovery slows. The phone starts doing less with the same input.

Your cells work the same way. They need consistent recharging. Not a course. Not a detox. A daily input that keeps the cellular battery running at the level your body is designed to operate at.

The technology exists to do exactly that.

Every day you reduce the oxidative load is a day your clarity gets sharper. This is where that starts.`,
    bridgeSentence: `You have tried the surface layer. This is something different.

OlyLife is not a supplement. It is not a food or a diet. It is frequency technology that works at the bioelectromagnetic layer your cells actually run on. The layer everything else has been missing.`,
    products: [
      {
        name: 'OlyLife Tera P90+',
        description: 'The P90+ combines PEMF and Terahertz frequency technology with two additional attachments in one complete system. Twenty minutes on the footplate activates cellular energy production, improves microcirculation and supports the bioelectromagnetic environment your cells use to communicate and repair. The Revitaluxe attachment targets muscle recovery and localised tension. The Frost Age Beauty device supports skin and collagen at the cellular level. One device. Three modes of action. Twenty minutes a day.'
      },
      {
        name: 'H+ Molecular Hydrogen Infuser',
        description: 'Molecular hydrogen is one of the few antioxidants that crosses the blood-brain barrier. Added to your water through electrolysis, it reaches your cells with every sip and reduces the oxidative load that depletes cellular energy and disrupts neural signalling. Upgraded hydration working at the cellular level.'
      }
    ],
    dailyProtocol: `Morning: H+ bottle first thing before anything else.
Evening: 20 minutes on the Tera P90+. Sit, wind down while it works.`,
    nextStepLine: 'Your mind has not lost its edge. It has lost the conditions it needs to stay sharp. Now you know what those conditions are.'
  },

  cat4: {
    name: 'Disrupted Sleep and Nervous System Stress',
    watermarkWord: 'REST',
    brandResponse: 'We hear you.',
    primaryPattern: 'Your cells are the foundation of everything. Your energy, your focus, your sleep, your recovery. They all run from the same source. And right now, something at that source is worth paying attention to. That source is your cellular communication between activation and rest. And it has lost its rhythm.',
    secondaryPatterns: {
      cat1: 'Energy Drain and Fatigue. When deep sleep is absent the cellular repair that should happen overnight does not complete.',
      cat2: 'Poor Recovery. Without deep sleep your body cannot complete its physical repair cycle either.',
      cat3: 'Mental Fog. Your brain clears metabolic waste during deep sleep. Without it the fog builds.',
      cat5: 'Inflammation and Physical Pain. An elevated nervous system baseline drives inflammatory markers higher.'
    },
    connector: 'These are not separate issues. They are the same disrupted foundation showing up in your energy, your thinking and your ability to rest.',
    top3: [
      'You cannot fully switch off. Even when you are still your mind keeps moving. A background hum of alertness follows you into the evening, into bed, and sometimes into the early hours.',
      'Sleep does not feel restorative. You get the hours. You wake up and the tiredness is still there. Your body went through the motions of sleep but never reached the depth where real repair happens.',
      'Stress stays in your system longer than it should. Something stressful happens and you feel it for the rest of the day. Your nervous system is taking longer and longer to return to baseline.'
    ],
    whyHappening: `Think of your cells like the battery inside your phone.

When the battery is fully charged, everything runs smoothly. Apps open fast. The screen is bright. It does everything you need without slowing down or overheating. But when that battery starts to degrade, none of that changes on the surface. You still use the phone the same way. You still plug it in each night. You still do everything right. And yet the battery drains faster, the performance drops, and no matter how many times you charge it, it never quite holds the way it used to.

Your cells work the same way. They run on bioelectrical energy. They communicate through electromagnetic signals. And just like a phone battery, they can deplete over time not because of anything you did wrong, but because most of the things we use to support our health work at the surface level. They charge the phone. They do not restore the battery itself.

PEMF and Terahertz frequency technology works at the battery level. Not the surface. The source. It works at the bioelectromagnetic layer where your cells actually produce energy, send signals, and coordinate repair. This is the layer that food, supplements, and sleep habits simply cannot reach.

For you, the battery never fully enters deep charge mode because the system keeps interrupting the cycle. The goal is to restore the conditions that allow a full recharge overnight.`,
    dailyShifts: [
      'Build a transition ritual between your working day and your evening. A walk, a shower, a change of clothes. Any consistent action that physically marks the shift. Done daily it trains your cortisol rhythm to taper at the right time.',
      'Eat your last meal at least two hours before sleep. Digestion keeps your nervous system engaged. Giving your body time to complete it removes one of the most common barriers to deep rest.',
      'Keep your sleep and wake time consistent even on weekends. Your circadian rhythm is regulated at the cellular level. Every time you shift your sleep window you reset the clock your cells use to coordinate repair.'
    ],
    dailyShiftsHeading: 'Daily Shifts to Start Sleeping Deeper',
    patternsToWatch: `Cellular health is not a one-and-done fix. It is not something you sort out once and leave alone.

Think about it like charging your phone. You do not charge it once and expect it to run forever. You charge it consistently, every single day, because that is how the battery stays functional. And over time, if you never give it a proper charge, the battery capacity itself starts to decline. Performance drops. Recovery slows. The phone starts doing less with the same input.

Your cells work the same way. They need consistent recharging. Not a course. Not a detox. A daily input that keeps the cellular battery running at the level your body is designed to operate at.

The technology exists to do exactly that.

Every day you restore the cellular rhythm between activation and rest is a day the baseline lowers. This is where that starts.`,
    bridgeSentence: `You have tried the surface layer. This is something different.

OlyLife is not a supplement. It is not a food or a diet. It is frequency technology that works at the bioelectromagnetic layer your cells actually run on. The layer everything else has been missing.`,
    products: [
      {
        name: 'OlyLife Tera P90+',
        description: 'The P90+ combines PEMF and Terahertz frequency technology with two additional attachments in one complete system. Twenty minutes on the footplate activates cellular energy production, improves microcirculation and supports the bioelectromagnetic environment your cells use to communicate and repair. The Revitaluxe attachment targets muscle recovery and localised tension. The Frost Age Beauty device supports skin and collagen at the cellular level. One device. Three modes of action. Twenty minutes a day.'
      },
      {
        name: 'Galaxy G-One Eye Device',
        description: 'Releases the accumulated tension from screen use and sustained focus that builds through the day. Low-frequency PEMF with gentle compression and warmth held at 42 degrees. Ten to twenty minutes before bed to support the shift from activation to rest.'
      }
    ],
    dailyProtocol: `Evening transition: Walk, shower, or any consistent action that marks the end of your day.
Before bed: 20 minutes on the Tera P90+ while using the Galaxy G-One. Screens off. Lights low.`,
    nextStepLine: 'Your body has not forgotten how to rest. It has lost the cellular conditions that make rest possible. Now you know what those conditions are.'
  },

  cat5: {
    name: 'Inflammation and Physical Pain',
    watermarkWord: 'REPAIR',
    brandResponse: 'We hear you.',
    primaryPattern: 'Your cells are the foundation of everything. Your energy, your focus, your sleep, your recovery. They all run from the same source. And right now, something at that source is worth paying attention to. That source is your cellular environment. And it is carrying a load it was not designed to hold indefinitely.',
    secondaryPatterns: {
      cat1: 'Energy Drain and Fatigue. Inflammation is one of the most significant drains on cellular energy in the body.',
      cat2: 'Poor Recovery. When inflammation is running as a baseline your body cannot complete its normal repair cycle.',
      cat3: 'Mental Fog. Systemic inflammation crosses the blood-brain barrier and directly disrupts cognitive function.',
      cat4: 'Disrupted Sleep. Inflammatory markers elevate at night and directly disrupt deep sleep stages.'
    },
    connector: 'These are not separate struggles. They are the same disrupted cellular environment expressing itself in different ways.',
    top3: [
      'Something always hurts or feels tight. There is no longer a day where your body feels fully clear and comfortable. You have stopped expecting to feel good and started just managing how bad it gets.',
      'The pain is inconsistent and hard to explain. Sometimes it flares for no clear reason. Sometimes it moves. That unpredictability is a sign of systemic inflammation rather than a structural problem.',
      'Nothing has fully fixed it. Some things have helped temporarily. But the relief never lasts. That is because everything you have tried has addressed the symptom rather than the cellular environment producing it.'
    ],
    whyHappening: `Think of your cells like the battery inside your phone.

When the battery is fully charged, everything runs smoothly. Apps open fast. The screen is bright. It does everything you need without slowing down or overheating. But when that battery starts to degrade, none of that changes on the surface. You still use the phone the same way. You still plug it in each night. You still do everything right. And yet the battery drains faster, the performance drops, and no matter how many times you charge it, it never quite holds the way it used to.

Your cells work the same way. They run on bioelectrical energy. They communicate through electromagnetic signals. And just like a phone battery, they can deplete over time not because of anything you did wrong, but because most of the things we use to support our health work at the surface level. They charge the phone. They do not restore the battery itself.

PEMF and Terahertz frequency technology works at the battery level. Not the surface. The source. It works at the bioelectromagnetic layer where your cells actually produce energy, send signals, and coordinate repair. This is the layer that food, supplements, and sleep habits simply cannot reach.

For you, the battery is being drained by a persistent background process that never switches off. The goal is to clear that process so the energy can go where it is needed.`,
    dailyShifts: [
      'Move the areas that hurt rather than protecting them completely. Gentle, consistent movement keeps circulation active and prevents the pooling of inflammatory markers that makes pain worse over time.',
      'Reduce your inflammatory food load for thirty days. Processed seed oils, refined sugar and alcohol are the three inputs most consistently associated with elevated systemic inflammation.',
      'Heat before movement, cold after. Warmth before activity improves circulation and tissue pliability. Cold after effort reduces the inflammatory response in tissue.'
    ],
    dailyShiftsHeading: 'Daily Shifts to Start Reducing Your Load',
    patternsToWatch: `Cellular health is not a one-and-done fix. It is not something you sort out once and leave alone.

Think about it like charging your phone. You do not charge it once and expect it to run forever. You charge it consistently, every single day, because that is how the battery stays functional. And over time, if you never give it a proper charge, the battery capacity itself starts to decline. Performance drops. Recovery slows. The phone starts doing less with the same input.

Your cells work the same way. They need consistent recharging. Not a course. Not a detox. A daily input that keeps the cellular battery running at the level your body is designed to operate at.

The technology exists to do exactly that.

Every day you improve the cellular clearance environment is a day your body carries less. This is where that starts.`,
    bridgeSentence: `You have tried the surface layer. This is something different.

OlyLife is not a supplement. It is not a food or a diet. It is frequency technology that works at the bioelectromagnetic layer your cells actually run on. The layer everything else has been missing.`,
    products: [
      {
        name: 'OlyLife Tera P90+',
        description: 'The P90+ combines PEMF and Terahertz frequency technology with two additional attachments in one complete system. Twenty minutes on the footplate activates cellular energy production, improves microcirculation and supports the bioelectromagnetic environment your cells use to communicate and repair. The Revitaluxe attachment targets muscle recovery and localised tension. The Frost Age Beauty device supports skin and collagen at the cellular level. One device. Three modes of action. Twenty minutes a day.'
      },
      {
        name: 'Vitality Wand',
        description: 'Handheld Terahertz frequency technology designed for localised areas of tension, stiffness and discomfort. Improves microcirculation directly in the tissue holding the problem. Five to fifteen minutes on any affected area.{{bodyPartNote}} Direct. Precise. Effective.'
      }
    ],
    dailyProtocol: `Morning: 10 minutes with the Vitality Wand on your primary area before movement.
Evening: 20 minutes on the Tera P90+. Sit, wind down while it works.`,
    nextStepLine: 'The pain is real. The stiffness is real. And the solution is not more management. It is reaching the layer underneath where it actually starts.'
  },

};

// ─── CATEGORY META ───────────────────────────────────────────────
const CAT_NAMES = {
  cat1: 'Energy Drain and Fatigue',
  cat2: 'Poor Recovery',
  cat3: 'Mental Fog',
  cat4: 'Disrupted Sleep and Nervous System Stress',
  cat5: 'Inflammation and Physical Pain'
};

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initCursorAtmosphere();
  initParticles(document.getElementById('particles-container'));

  document.getElementById('btn-begin').addEventListener('click', startAssessment);
  document.getElementById('btn-unlock').addEventListener('click', handleEmailSubmit);
  document.getElementById('email-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleEmailSubmit();
  });
});

// ═══════════════════════════════════════════════════════════
// CURSOR ATMOSPHERE (lerp 0.035)
// ═══════════════════════════════════════════════════════════
function initCursorAtmosphere() {
  let targetX = 50, targetY = 50;
  let currentX = 50, currentY = 50;

  const lerp = (start, end, factor) => start + (end - start) * factor;

  const tick = () => {
    currentX = lerp(currentX, targetX, 0.035);
    currentY = lerp(currentY, targetY, 0.035);

    document.documentElement.style.setProperty('--cursor-x', `${currentX.toFixed(2)}%`);
    document.documentElement.style.setProperty('--cursor-y', `${currentY.toFixed(2)}%`);
    document.documentElement.style.setProperty('--cursor-inv-x', `${(100 - currentX).toFixed(2)}%`);
    document.documentElement.style.setProperty('--cursor-inv-y', `${(100 - currentY).toFixed(2)}%`);

    requestAnimationFrame(tick);
  };

  const onMove = e => {
    targetX = (e.clientX / window.innerWidth) * 100;
    targetY = (e.clientY / window.innerHeight) * 100;
  };

  const onTouch = e => {
    const touch = e.touches[0];
    targetX = (touch.clientX / window.innerWidth) * 100;
    targetY = (touch.clientY / window.innerHeight) * 100;
  };

  document.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('touchmove', onTouch, { passive: true });
  tick();
}

// ═══════════════════════════════════════════════════════════
// PARTICLES
// ═══════════════════════════════════════════════════════════
function initParticles(container) {
  const count = 14;
  const driftAnimations = ['particle-drift-left', 'particle-drift-right', 'particle-drift-straight'];

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const size = 2 + Math.random() * 2.5;
    const left = Math.random() * 100;
    const duration = 18 + Math.random() * 22;
    const delay = -(Math.random() * duration);
    const opacity = 0.08 + Math.random() * 0.12;
    const drift = driftAnimations[Math.floor(Math.random() * driftAnimations.length)];

    el.style.cssText = `
      position: fixed;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: rgba(0, 212, 204, ${opacity.toFixed(3)});
      left: ${left}%;
      bottom: -10px;
      pointer-events: none;
      z-index: 1;
      animation: ${drift} ${duration}s ${delay}s linear infinite;
      filter: drop-shadow(0 0 ${size}px rgba(0, 212, 204, 0.4));
    `;

    container.appendChild(el);
  }
}

// ═══════════════════════════════════════════════════════════
// SCREEN NAVIGATION
// ═══════════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.style.display = 'none';
    s.classList.remove('active');
  });

  const el = document.getElementById(id);
  if (el) {
    el.style.display = '';
    el.classList.add('active');
  }
}

// ═══════════════════════════════════════════════════════════
// ASSESSMENT START
// ═══════════════════════════════════════════════════════════
function startAssessment() {
  showScreen('screen-questions');
  goToQuestion(1);
}

// ═══════════════════════════════════════════════════════════
// QUESTION NAVIGATION
// ═══════════════════════════════════════════════════════════
function goToQuestion(num) {
  if (num > 13) {
    goToEmailScreen();
    return;
  }

  assessmentState.currentScreen = num;
  updateProgress(num);

  const contentEl = document.getElementById('question-content');

  if (contentEl.children.length > 0) {
    const old = contentEl.firstElementChild;
    old.classList.add('exit');
    setTimeout(() => {
      contentEl.innerHTML = '';
      insertQuestion(num, contentEl);
    }, 420);
  } else {
    insertQuestion(num, contentEl);
  }
}

function insertQuestion(num, container) {
  const q = questions[num - 1];
  const html = buildQuestionHTML(q);
  container.innerHTML = html;

  const wrap = container.firstElementChild;
  wrap.classList.add('enter');

  bindQuestionEvents(q);
}

function updateProgress(qNum) {
  const pct = ((qNum - 1) / 13) * 100;
  document.getElementById('progress-bar-fill').style.width = pct + '%';
  document.getElementById('q-progress-label').textContent =
    `QUESTION ${String(qNum).padStart(2, '0')} OF 13`;
  const bar = document.querySelector('.progress-bar-track');
  if (bar) bar.setAttribute('aria-valuenow', qNum);
}

// ═══════════════════════════════════════════════════════════
// QUESTION HTML BUILDERS
// ═══════════════════════════════════════════════════════════
function buildQuestionHTML(q) {
  const numLabel = String(q.num).padStart(2, '0');

  let innerHTML = '';

  if (q.type === 'single' || q.type === 'single-conditional') {
    innerHTML = buildSingleChoiceHTML(q);
  } else if (q.type === 'multi' || q.type === 'multi-any') {
    innerHTML = buildMultiChoiceHTML(q);
  } else if (q.type === 'open') {
    innerHTML = buildOpenTextHTML(q);
  }

  return `
    <div class="question-screen-wrap" data-qid="${q.id}">
      <div class="question-inner">
        <div class="question-text">
          ${renderQuestionText(q.text)}
        </div>
        ${innerHTML}
        ${buildNavHTML(q)}
      </div>
      <div class="watermark-number" aria-hidden="true">${numLabel}</div>
    </div>
  `;
}

function renderQuestionText(text) {
  const parts = text.split('\n');
  const main = escHtml(parts[0]);
  if (parts.length > 1) {
    const context = escHtml(parts.slice(1).join(' '));
    return `<div class="question-block">
      <p class="question-main">${main}</p>
      <p class="question-context">${context}</p>
    </div>`;
  }
  return `<div class="question-block">
    <p class="question-main">${main}</p>
  </div>`;
}

function formatQuestionText(text) {
  return text.replace(/\n/g, '<br><span style="display:block;height:0.4em;"></span>');
}

function buildSingleChoiceHTML(q) {
  const opts = q.options.map((opt, i) => `
    <button
      class="answer-card"
      data-index="${i}"
      aria-pressed="false"
      type="button"
    >
      <span class="answer-letter">${opt.label}</span>
      <span class="answer-text type-answer">${opt.text}</span>
    </button>
  `).join('');

  let followup = '';
  if (q.type === 'single-conditional') {
    followup = `
      <div class="q9-followup" id="q9-followup">
        <label class="q9-followup-label" for="q9-text">${q.followupLabel}</label>
        <textarea
          id="q9-text"
          class="ot-input"
          placeholder="${q.followupPlaceholder}"
          rows="3"
          aria-label="${q.followupLabel}"
        ></textarea>
      </div>
    `;
  }

  return `<div class="answer-cards-wrap">${opts}${followup}</div>`;
}

function buildMultiChoiceHTML(q) {
  const opts = q.options.map((opt, i) => `
    <button
      class="answer-card checkbox-card"
      data-index="${i}"
      aria-pressed="false"
      type="button"
    >
      <span class="answer-check" aria-hidden="true"></span>
      <span class="answer-text type-answer">${opt.text}</span>
    </button>
  `).join('');

  return `<div class="answer-cards-wrap">${opts}</div>`;
}

function buildOpenTextHTML(q) {
  return `
    <div class="open-text-wrap">
      <textarea
        id="${q.id}-input"
        class="ot-input"
        placeholder="${q.placeholder}"
        rows="5"
        aria-label="${q.text}"
      ></textarea>
    </div>
  `;
}

function buildNavHTML(q) {
  const isMulti = q.type === 'multi' || q.type === 'multi-any';
  const isOpen = q.type === 'open';
  const alwaysEnabled = q.type === 'multi-any' || q.type === 'open';

  const nextDisabled = (!alwaysEnabled && !isOpen) ? 'disabled' : '';
  const skipBtn = isOpen && q.skipLabel
    ? `<button class="btn-skip" id="btn-skip" type="button">${q.skipLabel}</button>`
    : '';

  const continueLabel = isMulti ? 'Continue' : (isOpen ? 'Continue' : 'Next');

  return `
    <div class="question-nav">
      ${skipBtn}
      <button class="btn-next" id="btn-next" type="button" ${nextDisabled}>
        ${continueLabel} <span aria-hidden="true">→</span>
      </button>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// QUESTION EVENT BINDING
// ═══════════════════════════════════════════════════════════
function bindQuestionEvents(q) {
  const btnNext = document.getElementById('btn-next');
  const btnSkip = document.getElementById('btn-skip');

  if (q.type === 'single') {
    const cards = document.querySelectorAll('.answer-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        cards.forEach(c => { c.classList.remove('selected'); c.setAttribute('aria-pressed', 'false'); });
        card.classList.add('selected');
        card.setAttribute('aria-pressed', 'true');
        const idx = parseInt(card.dataset.index);
        assessmentState.answers[q.id] = idx;
        btnNext.removeAttribute('disabled');
      });
    });

    btnNext.addEventListener('click', () => {
      if (assessmentState.answers[q.id] !== undefined) {
        goToQuestion(q.num + 1);
      }
    });
  }

  else if (q.type === 'single-conditional') {
    const cards = document.querySelectorAll('.answer-card');
    const followup = document.getElementById('q9-followup');

    cards.forEach(card => {
      card.addEventListener('click', () => {
        cards.forEach(c => { c.classList.remove('selected'); c.setAttribute('aria-pressed', 'false'); });
        card.classList.add('selected');
        card.setAttribute('aria-pressed', 'true');
        const idx = parseInt(card.dataset.index);
        assessmentState.answers[q.id] = idx;
        btnNext.removeAttribute('disabled');

        if (q.conditionalTrigger && q.conditionalTrigger.includes(idx) && followup) {
          followup.classList.add('revealed');
        } else if (followup) {
          followup.classList.remove('revealed');
        }
      });
    });

    btnNext.addEventListener('click', () => {
      if (assessmentState.answers[q.id] !== undefined) {
        const textEl = document.getElementById('q9-text');
        if (textEl) {
          assessmentState.openText[q.storeFollowupIn] = textEl.value.trim();
        }
        goToQuestion(q.num + 1);
      }
    });
  }

  else if (q.type === 'multi') {
    const cards = document.querySelectorAll('.answer-card');
    assessmentState.answers[q.id] = [];

    cards.forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.index);
        const selected = assessmentState.answers[q.id];
        const pos = selected.indexOf(idx);

        if (pos === -1) {
          selected.push(idx);
          card.classList.add('selected');
          card.setAttribute('aria-pressed', 'true');
        } else {
          selected.splice(pos, 1);
          card.classList.remove('selected');
          card.setAttribute('aria-pressed', 'false');
        }

        if (q.requireOne) {
          btnNext.toggleAttribute('disabled', selected.length === 0);
        }
      });
    });

    btnNext.addEventListener('click', () => {
      if (!q.requireOne || assessmentState.answers[q.id].length > 0) {
        goToQuestion(q.num + 1);
      }
    });
  }

  else if (q.type === 'multi-any') {
    const cards = document.querySelectorAll('.answer-card');
    assessmentState.answers[q.id] = [];

    cards.forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.index);
        const selected = assessmentState.answers[q.id];
        const pos = selected.indexOf(idx);

        if (pos === -1) {
          selected.push(idx);
          card.classList.add('selected');
          card.setAttribute('aria-pressed', 'true');
        } else {
          selected.splice(pos, 1);
          card.classList.remove('selected');
          card.setAttribute('aria-pressed', 'false');
        }

        // Store flags for Q12
        if (q.id === 'q12') {
          assessmentState.q12flags = selected.map(i => q.options[i].flag);
        }
      });
    });

    btnNext.addEventListener('click', () => {
      if (q.id === 'q12') {
        assessmentState.q12flags = assessmentState.answers['q12'].map(i => q.options[i].flag);
      }
      goToQuestion(q.num + 1);
    });
  }

  else if (q.type === 'open') {
    const textarea = document.getElementById(`${q.id}-input`);

    btnNext.addEventListener('click', () => {
      if (textarea) {
        assessmentState.openText[q.storeIn] = textarea.value.trim();
      }
      goToQuestion(q.num + 1);
    });

    if (btnSkip) {
      btnSkip.addEventListener('click', () => {
        assessmentState.openText[q.storeIn] = '';
        goToQuestion(q.num + 1);
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════
// EMAIL SCREEN
// ═══════════════════════════════════════════════════════════
function goToEmailScreen() {
  assessmentState.currentScreen = 14;
  showScreen('screen-email');

  // Trigger entry animations by re-inserting elements
  const anims = document.querySelectorAll('.email-anim');
  anims.forEach(el => {
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = '';
  });
}

function handleEmailSubmit() {
  const input = document.getElementById('email-input');
  const errorEl = document.getElementById('email-error');
  const email = input.value.trim();

  if (!isValidEmail(email)) {
    errorEl.textContent = 'Please enter a valid email address.';
    input.focus();
    return;
  }

  errorEl.textContent = '';
  assessmentState.email = email;

  calculateScores();
  submitEmail(assessmentState.email, assessmentState.scores, getPrimaryCategory());

  const q13 = assessmentState.openText.q13;
  const primaryCat = getPrimaryCategory();
  const brandResponse = RESULTS[primaryCat].brandResponse;

  if (q13) {
    showQ13Reveal(q13, brandResponse);
  } else {
    renderAndShowResults();
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ═══════════════════════════════════════════════════════════
// EMAIL SUBMISSION — Cloudflare Worker
// ═══════════════════════════════════════════════════════════
async function submitEmail(email, score, category) {
  try {
    var res = await fetch(
      'https://cellsource-email-capture.jaidasuthers.workers.dev',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          score: score,
          category: category,
          destination: 'assessment'
        })
      }
    );
    var data = await res.json();
    return res.ok;
  } catch(e) {
    console.error('Email capture error:', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// Q13 REVEAL OVERLAY
// ═══════════════════════════════════════════════════════════
function showQ13Reveal(q13Text, brandResponse) {
  const revealEl = document.getElementById('q13-reveal');
  document.getElementById('q13-quote-text').textContent = q13Text;
  document.getElementById('q13-response-text').textContent = brandResponse;

  // Pre-render results and show behind the overlay (overlay is z-index:100)
  renderResultsPage();
  showScreen('screen-results');

  revealEl.style.display = 'flex';
  revealEl.style.opacity = '1';
  revealEl.style.transform = 'none';

  let dismissed = false;

  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    revealEl.removeEventListener('click', dismiss);
    document.removeEventListener('keydown', dismiss);
    window.removeEventListener('scroll', dismiss);

    revealEl.style.transition = 'opacity 0.9s ease, transform 0.9s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    revealEl.style.opacity = '0';
    revealEl.style.transform = 'translateY(-40px)';

    setTimeout(() => {
      revealEl.style.display = 'none';
      initScrollReveal();
    }, 900);
  };

  const timer = setTimeout(dismiss, 3000);

  revealEl.addEventListener('click', () => { clearTimeout(timer); dismiss(); });
  document.addEventListener('keydown', () => { clearTimeout(timer); dismiss(); }, { once: true });
  window.addEventListener('scroll', () => { clearTimeout(timer); dismiss(); }, { once: true });
}

// ═══════════════════════════════════════════════════════════
// SCORING ENGINE
// ═══════════════════════════════════════════════════════════
function calculateScores() {
  assessmentState.scores   = { cat1: 0, cat2: 0, cat3: 0, cat4: 0, cat5: 0 };
  assessmentState.cdScores = { cat1: 0, cat2: 0, cat3: 0, cat4: 0, cat5: 0 };

  questions.forEach(q => {
    if (q.type === 'single' || q.type === 'single-conditional') {
      const idx = assessmentState.answers[q.id];
      if (idx !== undefined && q.options[idx]) {
        const score = q.options[idx].score || {};
        Object.entries(score).forEach(([cat, val]) => {
          assessmentState.scores[cat] = (assessmentState.scores[cat] || 0) + val;
        });
        // Track C/D answers (index 2 = C, index 3 = D)
        if (idx >= 2) {
          Object.entries(score).forEach(([cat, val]) => {
            if (cat in assessmentState.cdScores) {
              assessmentState.cdScores[cat] = (assessmentState.cdScores[cat] || 0) + val;
            }
          });
        }
      }
    } else if (q.type === 'multi' || q.type === 'multi-any') {
      const indices = assessmentState.answers[q.id] || [];
      indices.forEach(idx => {
        const opt = q.options[idx];
        if (opt && opt.score) {
          Object.entries(opt.score).forEach(([cat, val]) => {
            assessmentState.scores[cat] = (assessmentState.scores[cat] || 0) + val;
          });
        }
      });
    }
    // open text: no scoring
  });

  // Floor at 0
  Object.keys(assessmentState.scores).forEach(k => {
    assessmentState.scores[k] = Math.max(0, assessmentState.scores[k]);
  });
  Object.keys(assessmentState.cdScores).forEach(k => {
    assessmentState.cdScores[k] = Math.max(0, assessmentState.cdScores[k]);
  });
}

function getPrimaryCategory() {
  const scores = assessmentState.scores;
  // Always route to the highest-scoring category — no threshold, no fallback
  return Object.keys(scores).reduce((best, k) => scores[k] > scores[best] ? k : best);
}

function getPrimaryCategories() {
  const scores = assessmentState.scores;
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return ['cat1'];
  return Object.keys(scores).filter(k => scores[k] === maxScore);
}

function getSecondaryCategories() {
  const primaryKeys = getPrimaryCategories();
  const scores  = assessmentState.scores;
  const cdScores = assessmentState.cdScores || {};
  // Qualifying: not primary, has at least one point from a C or D answer
  const qualifying = Object.keys(scores).filter(k =>
    !primaryKeys.includes(k) && (cdScores[k] || 0) > 0
  );
  // Sort by total score descending, return top 3
  qualifying.sort((a, b) => scores[b] - scores[a]);
  return qualifying.slice(0, 3);
}


// ─── SCIENCE SECTION DATA ────────────────────────────────────────
const CAT_TO_SUBSECTION = {
  cat1: 'energy', cat2: 'recovery', cat3: 'clarity',
  cat4: 'sleep', cat5: 'inflammation'
};


const SECONDARY_COPY = {
  cat1: { name: 'Energy Drain and Fatigue', text: 'Your energy levels are dropping before the day is done.' },
  cat2: { name: 'Poor Recovery', text: 'Your body is taking longer than it should to bounce back.' },
  cat3: { name: 'Mental Fog', text: 'Your focus and mental clarity have been taking a hit.' },
  cat4: { name: 'Disrupted Sleep and Nervous System Stress', text: 'Your sleep is not restoring you the way it should.' },
  cat5: { name: 'Inflammation and Physical Pain', text: 'Your body is carrying tension or discomfort that will not fully clear.' }
};

function getSecondHighestCat(primaryCat) {
  const scores = assessmentState.scores;
  const keys = Object.keys(scores).filter(k => k !== primaryCat);
  if (keys.length === 0) return null;
  return keys.reduce((best, k) => scores[k] > scores[best] ? k : best);
}

function buildQ12OpeningLine() {
  const flagMap = {
    'nutrition':      'eating clean',
    'supplementation': 'taking your supplements',
    'movement':       'moving your body',
    'sleep':          'working on your sleep',
    'nervous system': 'managing your stress'
  };
  const flags = (assessmentState.q12flags || []).filter(f => f !== 'early awareness');
  const items = flags.map(f => flagMap[f]).filter(Boolean).slice(0, 3);
  if (items.length === 0) {
    return 'You have been looking for the answer. Now it is time to go a layer deeper.';
  } else if (items.length === 1) {
    return `You are already ${items[0]}. Now it is time to go a layer deeper.`;
  } else if (items.length === 2) {
    return `You are already ${items[0]} and ${items[1]}. Now it is time to go a layer deeper.`;
  } else {
    return `You are already ${items[0]}, ${items[1]} and ${items[2]}. Now it is time to go a layer deeper.`;
  }
}

// ═══════════════════════════════════════════════════════════
// RESULTS PAGE
// ═══════════════════════════════════════════════════════════
function renderAndShowResults() {
  renderResultsPage();
  showScreen('screen-results');
  setTimeout(initScrollReveal, 100);
}

function renderResultsPage() {
  calculateScores();

  const primaryCat = getPrimaryCategory();
  const container = document.getElementById('results-content');

  const template = RESULTS[primaryCat];
  const secondaries = getSecondaryCategories();
  const q13 = assessmentState.openText.q13;
  const q9  = assessmentState.openText.q9;

  // One highlighted sub-section — primary pattern category only
  const highlightedSubsections = [CAT_TO_SUBSECTION[primaryCat]].filter(Boolean);

  // Build sections HTML
  let html = '';

  // ── Section 1: Hero (includes mirror if q13 exists)
  html += buildHeroSection(template, q13, primaryCat);

  // ── Section 2: Primary Pattern (universal hook only)
  html += `<hr class="results-divider">`;
  html += buildPrimaryPatternSection(template);

  // ── Section 3: What Else We Noticed — only when CD-qualifying secondaries exist
  if (secondaries.length > 0) {
    html += `<hr class="results-divider">`;
    html += buildSecondarySection(secondaries);
  }

  // ── Section 4: The Cellular Science Behind This (accordion)
  html += `<hr class="results-divider">`;
  html += buildWhySection(highlightedSubsections);

  // ── Section 5: Daily Shifts
  html += `<hr class="results-divider">`;
  html += buildDailyShiftsSection(template);

  // ── Section 6: What This Means Going Forward
  html += `<hr class="results-divider">`;
  html += buildPatternsSection(template);

  // ── Section 7: Product Recommendations + CTA
  html += `<hr class="results-divider">`;
  html += buildProductSection(template, q9, primaryCat);

  container.innerHTML = html;
  renderDebugPanel();
  initScienceAccordion();
}

// ── Hero Section
function buildHeroSection(template, q13, catKey) {
  const mirrorBlock = q13 ? `
    <div class="mirror-quote-block">
      <p class="mirror-quote-text">\u201C${escHtml(q13)}\u201D</p>
      <p class="mirror-response">${escHtml(template.brandResponse)}</p>
    </div>
  ` : '';

  return `
    <div class="results-section results-hero" id="results-section-hero">
      <div class="results-hero-watermark" aria-hidden="true">${template.watermarkWord}</div>
      <div class="results-hero-content">
        ${mirrorBlock}
        <span class="results-section-label">Your Cellular Health Report</span>
        <div style="margin-top: var(--space-xs);">
          <span class="type-data" style="color:var(--soft-silver); display:block; margin-bottom:var(--space-xs);">Prepared for</span>
          <p class="type-data" style="color:var(--teal-primary);">${escHtml(assessmentState.email)}</p>
        </div>
      </div>
    </div>
  `;
}

// Universal cellular hook — identical across all six results
const UNIVERSAL_HOOK = [
  'Your cells are the foundation of everything. Your energy, your focus, your sleep, your recovery. Every single thing your body does runs from the same cellular source.',
  'Think of it like a battery. When it is new it holds its charge fully, runs strong and performs at its best. But when a battery is not looked after and not properly recharged, it starts to die. Slowly at first. Then faster. It cannot hold what it used to. It cannot perform the way it was built to. Not because it is broken. Because it has not been given what it needs to stay alive.',
  'Your cells work exactly the same way. And frequency technology exists to recharge them at the source.'
];

// ── Primary Pattern Section
function buildPrimaryPatternSection(template) {
  const sectionLabel = template.patternSectionLabel || 'Your Primary Pattern';
  const categoryNameHtml = template.name
    ? `<h2 class="type-display gradient-text gradient-text-animated" style="margin-bottom: var(--space-sm); margin-top: var(--space-xs);">${template.name}</h2>`
    : '';
  // Universal hook only — no category-specific primaryPattern text
  const hookHtml = UNIVERSAL_HOOK.map(p =>
    `<p class="type-body" style="margin-bottom:var(--space-sm);">${escHtml(p)}</p>`
  ).join('');
  return `
    <div class="results-section" id="results-section-primary">
      <span class="results-section-label">${sectionLabel}</span>
      ${categoryNameHtml}
      <div class="results-body">
        ${hookHtml}
      </div>
    </div>
  `;
}

// ── Secondary Patterns Section
function buildSecondarySection(secondaries) {
  const items = secondaries.map(cat => {
    const copy = SECONDARY_COPY[cat];
    if (!copy) return '';
    return `
      <div style="margin-bottom: var(--space-sm);">
        <span class="type-label" style="display:block; margin-bottom:4px;">${escHtml(copy.name)}</span>
        <p class="type-body results-body">${escHtml(copy.text)}</p>
      </div>
    `;
  }).join('');

  return `
    <div class="results-section" id="results-section-secondary">
      <span class="results-section-label">What Else We Noticed</span>
      <div style="margin-top: var(--space-sm);">
        ${items}
      </div>
    </div>
  `;
}

// ── Top 3 Struggles
function buildTop3Section(template) {
  const items = template.top3.map((item, i) => `
    <li class="results-numbered-item">
      <span class="results-numbered-item-num" aria-hidden="true">0${i + 1}</span>
      <p class="type-body results-numbered-item-text">${escHtml(item)}</p>
    </li>
  `).join('');

  return `
    <div class="results-section" id="results-section-struggles">
      <span class="results-section-label">Your Top 3 Struggles</span>
      <ul class="results-numbered-list" style="margin-top: var(--space-sm);">
        ${items}
      </ul>
    </div>
  `;
}

// ── The Cellular Science Behind This (accordion)
function buildWhySection(highlightedSubsections) {
  const SCIENCE_SECTIONS = [
    {
      key: 'energy',
      label: 'Energy',
      dataMg: 'energy',
      body: [
        'Your mitochondria are the power generators inside your cells. They produce around 90 percent of all the energy your body runs on, stored in a molecule called ATP. Every movement, thought and heartbeat depends on that supply.',
        'When your mitochondria are not functioning efficiently, ATP production drops. Your muscles get less fuel. Your brain gets less fuel. Your organs get less fuel. The result is a whole-body slowdown that no amount of rest or caffeine can fully fix, because the generator itself is the problem, not the fuel going into it.'
      ]
    },
    {
      key: 'recovery',
      label: 'Recovery',
      dataMg: 'recovery',
      body: [
        'Every time you push your body physically, small amounts of muscle tissue are damaged. That is normal. Your cells repair that damage through a process where specialised muscle stem cells activate, rebuild the damaged fibres and make them stronger than before.',
        'That repair process requires energy, good circulation and enough time to complete. When cellular energy production is low or microcirculation is poor, the repair cycle slows down or stalls before it finishes. That is why the soreness lingers, the stiffness stays and your body just will not bounce back the way it used to.'
      ]
    },
    {
      key: 'clarity',
      label: 'Mental Clarity',
      dataMg: 'mental-clarity',
      body: [
        'Your brain uses more energy relative to its size than any other organ in your body. Every decision, thought and moment of focus requires your neurons to fire, transmit signals and reset rapidly. All of that runs on ATP produced by your mitochondria.',
        'When mitochondrial function drops, the energy supply to your brain drops with it. Neurons cannot fire as quickly. Signals slow down. Focus becomes effort. That foggy, slow, re-reading-the-same-sentence feeling is your brain running on a depleted signal, not a willpower problem.'
      ]
    },
    {
      key: 'sleep',
      label: 'Sleep',
      dataMg: 'sleep',
      body: [
        'Sleep is when your body does its most important repair work. During deep sleep your body releases growth hormone, which triggers tissue repair, muscle rebuilding and cellular recovery. Your nervous system also uses this window to shift from its active state into its rest and repair state.',
        'For that shift to happen properly, your cells need to be able to complete the transition. When cellular function is compromised, the nervous system struggles to fully downregulate. Inflammation that should clear overnight stays elevated. You get the hours but your cells never fully enter the repair window, which is why you wake up still tired.'
      ]
    },
    {
      key: 'inflammation',
      label: 'Inflammation and Pain',
      dataMg: 'inflammation-pain',
      body: [
        'When tissue is damaged or under stress, your immune system sends cells to repair it. That is inflammation working correctly. The problem is when it does not switch off.',
        'Mitochondrial function plays a direct role in regulating inflammation. When it is impaired, the body struggles to clear the inflammatory signals building up in tissue. At the same time, poor microcirculation means those signals accumulate faster than the body can remove them. The aches, the stiffness, the tension that never fully clears. These are not structural problems. They are signs of a cellular clearance system that cannot keep up.'
      ]
    }
  ];

  const buildItem = (sub, isHighlighted, isOpen) => {
    const cls = ['science-accordion-item', isHighlighted ? 'highlighted' : '', isOpen ? 'open' : ''].filter(Boolean).join(' ');
    const bodyHtml = sub.body.map(p =>
      `<p class="type-body results-body" style="margin-bottom:var(--space-sm);">${escHtml(p)}</p>`
    ).join('');
    return `
      <div class="${cls}">
        <button class="science-accordion-header" type="button" aria-expanded="${isOpen ? 'true' : 'false'}">
          <div class="mg-placeholder" data-section="${sub.dataMg}" style="display:none;"></div>
          <span class="science-accordion-title">${escHtml(sub.label)}</span>
          <span class="science-accordion-arrow" aria-hidden="true">↓</span>
        </button>
        <div class="science-accordion-body">
          <div class="science-accordion-body-inner">
            ${bodyHtml}
          </div>
        </div>
      </div>
    `;
  };

  const highlightedHtml = SCIENCE_SECTIONS
    .filter(s => highlightedSubsections.includes(s.key))
    .map(s => buildItem(s, true, true))
    .join('');

  const remainingHtml = SCIENCE_SECTIONS
    .filter(s => !highlightedSubsections.includes(s.key))
    .map(s => buildItem(s, false, false))
    .join('');

  return `
    <div class="results-section" id="results-section-why">
      <span class="results-section-label">The Cellular Science Behind This</span>
      <p class="type-body results-body" style="margin-top:var(--space-sm); margin-bottom:var(--space-sm);">${escHtml('Your cells are responsible for every process in your body. Energy production. Muscle repair. Brain function. Sleep quality. Immune response. It all starts at the cellular level. Everything you do for your health matters. And when you go a layer deeper into how your body is actually operating, you start to see that your cells are at the centre of all of it. Supporting your cellular health is the layer underneath everything else you are already doing.')}</p>
      <p class="type-body results-body science-instruction">${escHtml('Your most relevant section is open below. Click any section to explore how your cells run that part of your body.')}</p>
      <div class="science-accordion">
        <span class="type-label science-highlighted-label">Your most relevant section</span>
        ${highlightedHtml}
        ${remainingHtml}
      </div>
    </div>
  `;
}

// ── Science Accordion Interaction
function initScienceAccordion() {
  document.querySelectorAll('.science-accordion-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.science-accordion-item');
      const isOpen = item.classList.contains('open');
      item.classList.toggle('open', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  });
}

// ── Daily Shifts
function buildDailyShiftsSection(template) {
  const items = template.dailyShifts.map((item, i) => `
    <li class="results-numbered-item">
      <span class="results-numbered-item-num" aria-hidden="true">0${i + 1}</span>
      <p class="type-body results-numbered-item-text">${escHtml(item)}</p>
    </li>
  `).join('');

  return `
    <div class="results-section" id="results-section-shifts">
      <span class="results-section-label">Here are three simple daily shifts to make.</span>
      <ul class="results-numbered-list" style="margin-top: var(--space-sm);">
        ${items}
      </ul>
    </div>
  `;
}

// ── What This Means Going Forward
function buildPatternsSection(template) {
  const paras = [
    'Cellular health is not a one-time fix. It is something that needs to be recharged consistently, the same way a battery needs regular charging to stay at full capacity.',
    'The people who feel exceptional are not lucky. They are the ones who started taking care of the layer beneath everything else.'
  ];
  const bodyHtml = paras.map(p =>
    `<p class="type-body results-body" style="margin-bottom:var(--space-sm);">${escHtml(p)}</p>`
  ).join('');
  return `
    <div class="results-section" id="results-section-patterns">
      <span class="results-section-label">What This Means Going Forward</span>
      <div style="margin-top: var(--space-sm);">
        ${bodyHtml}
      </div>
    </div>
  `;
}

// ── Product Recommendations + CTA
function buildProductSection(template, q9, catKey) {
  const bodyPart = q9 ? q9 : '';
  const bodyPartNote = bodyPart
    ? ` Given the ${escHtml(bodyPart)} you mentioned, start your sessions there.`
    : '';

  const productCards = template.products.map((product, i) => {
    const desc = product.description.replace('{{bodyPartNote}}', bodyPartNote);
    const numLabel = `0${i + 1}`;
    return `
      <div class="product-card">
        <span class="product-card-label">${numLabel}</span>
        <span class="product-card-name">${escHtml(product.name)}</span>
        <p class="product-card-desc">${escHtml(desc)}</p>
      </div>
    `;
  }).join('');

  // Dynamic bridge: Q12-based opening line + fixed second paragraph
  const openingLine = buildQ12OpeningLine();
  const fixedLine = 'OlyLife is not a supplement. It is not a diet. It is frequency technology that works at the bioelectromagnetic layer your cells run on.';
  const bridgeHtml = `
    <p class="type-body results-body" style="margin-bottom:var(--space-sm);">${escHtml(openingLine)}</p>
    <p class="type-body results-body" style="margin-bottom:var(--space-sm);">${escHtml(fixedLine)}</p>
  `;

  return `
    <div class="results-section" id="results-section-products">
      <span class="results-section-label">The Technology Behind the Shift</span>
      <div style="margin: var(--space-sm) 0 var(--space-md);">
        ${bridgeHtml}
      </div>

      <div class="product-cards-grid">
        ${productCards}
      </div>

      <div class="daily-protocol">
        <span class="daily-protocol-label">Your Daily Protocol</span>
        <p class="daily-protocol-text">${escHtml(template.dailyProtocol)}</p>
      </div>

      <div class="results-cta-wrap">
        <p class="next-step-line">${escHtml(template.nextStepLine)}</p>
        <p style="text-align:center; color:var(--teal-primary); font-size:1.1em; font-weight:500; letter-spacing:0.04em; margin:var(--space-sm) 0;">This is frequency technology.</p>
        <a href="#" class="btn-primary" role="button" aria-label="See the OlyLife products recommended for your pattern">
          <span class="gradient-text">See the OlyLife products recommended for your pattern</span>
        </a>
        <p class="affiliate-disclosure">
          Cellsource is an affiliate of OlyLife. We earn a commission on purchases made through our links at no extra cost to you. The science we share is independent of that relationship.
        </p>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// SCROLL REVEAL (IntersectionObserver)
// ═══════════════════════════════════════════════════════════
function initScrollReveal() {
  const sections = document.querySelectorAll('.results-section');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  sections.forEach(el => observer.observe(el));
}

// ═══════════════════════════════════════════════════════════
// DEBUG PANEL
// ═══════════════════════════════════════════════════════════
function renderDebugPanel() {
  const showDebug = new URLSearchParams(window.location.search).get('debug') === 'true';

  // Hide the entire debug panel from end users
  const panelEl = document.querySelector('.debug-panel');
  if (panelEl) panelEl.style.display = showDebug ? '' : 'none';
  if (!showDebug) return;

  const el = document.getElementById('debug-content');
  if (!el) return;

  const s = assessmentState.scores;
  const primary = getPrimaryCategory();
  const secondaries = getSecondaryCategories();

  el.innerHTML = `
    cat1 (Energy Drain & Fatigue): ${s.cat1}<br>
    cat2 (Poor Recovery): ${s.cat2}<br>
    cat3 (Mental Fog): ${s.cat3}<br>
    cat4 (Disrupted Sleep & Nervous System): ${s.cat4}<br>
    cat5 (Inflammation & Physical Pain): ${s.cat5}<br>
    <br>
    Primary: ${CAT_NAMES[primary] || 'Optimiser'}<br>
    Secondaries (≥4): ${secondaries.map(c => CAT_NAMES[c]).join(', ') || 'none'}<br>
    <br>
    Q3: ${assessmentState.openText.q3 || '(empty)'}<br>
    Q9: ${assessmentState.openText.q9 || '(empty)'}<br>
    Q12 flags: ${assessmentState.q12flags.join(', ') || 'none'}<br>
    Q13: ${assessmentState.openText.q13 || '(empty)'}<br>
    Email: ${assessmentState.email}
  `;
}

// ═══════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════
function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
