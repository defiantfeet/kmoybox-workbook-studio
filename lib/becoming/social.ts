export const socialPath = '/becoming/social-integration';
export const socialTitle = 'Beyond the Box: Belonging Without Conformity';
export const socialSections = {
  awareness: 'Social Self-Awareness',
  ecosystem: 'Social Ecosystem Map',
  practice: 'Communication Practice',
  community: 'Community Exploration',
  goals: 'Personal Social Goals',
  journal: 'Social Interaction Journal',
  expectations: 'Societal Expectations Reflection',
  weekly: 'Weekly Social Reflection',
} as const;

export type SocialSection = keyof typeof socialSections;
export const socialKeys = Object.keys(socialSections) as SocialSection[];
export const socialSection = (value: unknown): SocialSection =>
  socialKeys.find(key => key === value) ?? 'awareness';

export const socialPrompts = {
  awareness: ['What social environments suit me?', 'How do I notice my social energy and capacity?',
    'What communication formats work for me?', 'What interests might I want to share?', 'What accessibility support do I need?',
    'How much connection would I like right now?', 'What gets in the way of participating?', 'When have I felt included or excluded?'],
  expectations: ['Which cultural expectations shape this experience?', 'What gender roles am I expected to follow?',
    'Which professional expectations affect my choices?', 'What happens when I compare myself with others?',
    'How do my identities affect where I feel I belong?', 'Which stereotypes influence how people are treated?',
    'Have I experienced or witnessed discrimination I want to reflect on?', 'Where do I feel pressure to conform?',
    'What is within my control? What needs collective or institutional change?'],
  weekly: ['Where did I experience belonging?', 'Where did I feel excluded?', 'Did I act consistently with my values?',
    'Did I respect my own and others’ boundaries?', 'What support would help me participate?', 'What would I like to try next week?'],
  journal: ['Activity or interaction', 'Relationship label (optional)', 'Feelings before', 'Feelings after', 'Perceived connection',
    'Authenticity', 'Comfort level', 'Accessibility or environmental barriers', 'What went well', 'What I learned', 'Desired next step'],
  community: ['Interest or activity I want to explore', 'Accessibility, cost, timing, or support to check',
    'A small next step that fits my capacity', 'What I noticed or want to adjust'],
  practice: ['My response', 'What feels authentic or accessible about this response?', 'What would I change for my own context?'],
} as const;

export const socialCircles = ['Self', 'Close relationships', 'Acquaintances', 'Professional networks', 'Community', 'Wider society'] as const;
export const communityIdeas = ['Dance classes', 'Book clubs', 'Volunteer opportunities', 'Professional organizations',
  'Educational events', 'Creative communities', 'Cultural organizations', 'Recreational activities'] as const;
export const socialGoalIdeas = ['Reconnect with a friend', 'Attend an interest-based activity', 'Introduce myself to someone',
  'Participate in a community project', 'Practice expressing my opinion', 'Ask for support'] as const;
export const socialGoalStatuses = ['Active', 'Postponed', 'Declined', 'Completed'] as const;

export const socialScenarios = [
  ['Starting conversations', 'You are waiting for a workshop to begin and someone nearby appears open to talking.',
    'Have you tried this kind of workshop before?'],
  ['Introducing oneself', 'A group invites introductions, and you want to share just one detail.',
    'I’m River. I’m here to learn more about making things by hand.'],
  ['Active listening', 'Someone describes a change at work and pauses after saying it was difficult.',
    'It sounds like the sudden change was the hardest part. Did I understand that correctly?'],
  ['Expressing disagreement respectfully', 'A group is choosing a meeting time you think may exclude some people.',
    'I see why that time works for some of us. Could we look at an option with easier transport access?'],
  ['Asking for help', 'You want to join an activity but need written instructions before you arrive.',
    'Could you send the instructions in writing so I can review them ahead of time?'],
  ['Declining invitations', 'Someone invites you to an event on a day you need for yourself.',
    'Thanks for including me. I’m going to sit this one out.'],
  ['Receiving feedback', 'A teammate gives feedback, and you want more time and a concrete example.',
    'Could you share one example? I’d like time to consider it before responding.'],
  ['Resolving misunderstandings', 'A short message came across differently from what you intended.',
    'I meant to ask about the timing. How did the message come across to you?'],
  ['Communicating personal boundaries', 'In a situation that feels safe, someone asks about something you prefer to keep private.',
    'I keep that part of my life private. I’m happy to talk about something else.'],
  ['Workplace communication', 'Two assignments are due at once, and you need to clarify priorities.',
    'Both tasks are due Friday. Which should I prioritize if I can finish one by then?'],
] as const;

export type SocialFields = Record<string, string>;
export type SocialRecord = { id: string; updatedAt: string; key: string; fields: SocialFields };
export type SocialGoal = { id: string; updatedAt: string; title: string; target: string; status: typeof socialGoalStatuses[number]; notes: string };
