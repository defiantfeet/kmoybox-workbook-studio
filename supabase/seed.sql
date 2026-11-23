insert into public.products (slug, title, summary, free) values
('finding-my-voice', 'Finding My Voice', 'Make space for what you really think, feel, and need.', true),
('the-boundaries-edit', 'The Boundaries Edit', 'Practice setting limits that protect your time and energy.', false),
('becoming-her', 'Becoming Her', 'Picture the life you want and take one small step toward it.', false);

insert into public.prompts (id, product_slug, position, title, question) values
(1, 'finding-my-voice', 1, 'Start with what you know', 'When do you feel most like yourself? Describe a recent moment.'),
(2, 'finding-my-voice', 2, 'Notice what goes unsaid', 'What have you been holding back? What would help you say it?'),
(3, 'finding-my-voice', 3, 'Practice asking for what you need', 'Write one sentence that communicates a need clearly and kindly.'),
(4, 'finding-my-voice', 4, 'Take one small step', 'Where could you use your voice this week? What will you do first?'),
(5, 'the-boundaries-edit', 1, 'Recognize your limits', 'Describe a recent moment when you agreed to something you wanted to decline.'),
(6, 'the-boundaries-edit', 2, 'Make it clear', 'Write a short, kind response you could use the next time this happens.'),
(7, 'becoming-her', 1, 'Imagine an ordinary day', 'What does an ordinary morning look like in the life you want?'),
(8, 'becoming-her', 2, 'Choose a next step', 'What is one action you can take this week to move toward that vision?');
