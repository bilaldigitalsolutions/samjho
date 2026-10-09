const { fs, guides, FILE, update } = require('./enrich-helper');

// Enrich pm-modi-tribute-ashok-singhal
update('pm-modi-tribute-ashok-singhal', {
  content: `## What Happened

On September 28, 2026, Prime Minister Narendra Modi paid rich tribute to Shri Ashok Singhal on his birth centenary. The Prime Minister shared his thoughts through a series of posts on X (formerly Twitter) and authored a comprehensive commemorative article reflecting on Singhal's life, philosophical vision, and public contribution.

In his tribute, Prime Minister Modi highlighted Singhal's unwavering conviction, spiritual grounding, and exceptional personal simplicity. He recalled how Singhal dedicated decades to selfless social work, grassroots mobilisation, and the cultural unity of the country.

## Historical Background and Contribution

Shri Ashok Singhal (1926-2015) was a prominent social, cultural, and organisational leader who served as the international working president of the Vishva Hindu Parishad (VHP) for over two decades. Born in Agra and educated in metallurgical engineering at Banaras Hindu University (BHU), Singhal chose a path of public service through the Rashtriya Swayamsevak Sangh (RSS) as a lifelong pracharak.

He played a pivotal role in the Ram Janmabhoomi movement in Ayodhya, uniting diverse socio-cultural communities and advocating for civilisational restoration across India and among the global Indian diaspora.

## Why It Matters

Prime Minister Modi's centennial tribute highlights the enduring values of ideological steadfastness, grassroots service, and social cohesion in contemporary public life. Singhal's legacy serves as a testament to organizational leadership without personal ambition, offering lessons for modern governance and social work.

The tribute was published in both English and Hindi across national platforms to reach citizens nationwide.

## Key Points

- PM Narendra Modi marked the birth centenary of Shri Ashok Singhal on September 28, 2026.
- The tribute was shared via official posts on X and a comprehensive authored article.
- Singhal was remembered for combining spiritual dedication with tireless organizational work.
- His lifelong role in cultural awakening and social unity was prominently commemorated.
- The tribute was issued simultaneously in English and Hindi for broad national outreach.`,
  faqs: [
    {
      q: 'Who was Shri Ashok Singhal?',
      a: 'Shri Ashok Singhal (1926-2015) was a renowned Indian socio-cultural leader, metallurgical engineer from BHU, and longtime international working president of the Vishva Hindu Parishad (VHP).'
    },
    {
      q: 'Who paid tribute to Shri Ashok Singhal on September 28, 2026?',
      a: 'Prime Minister Shri Narendra Modi paid tribute to Shri Ashok Singhal commemorating his birth centenary.'
    },
    {
      q: 'How did Prime Minister Narendra Modi share his tribute?',
      a: 'The Prime Minister shared his tribute through official posts on X (formerly Twitter) accompanied by a specially written commemorative article.'
    },
    {
      q: 'What key qualities of Shri Ashok Singhal were highlighted by PM Modi?',
      a: "PM Modi highlighted Singhal's unwavering conviction, deep personal simplicity, spiritual grounding, and lifelong commitment to social harmony and cultural unity."
    },
    {
      q: 'What was Shri Ashok Singhal\'s role in modern Indian history?',
      a: 'Singhal was a central figure in cultural and social movements in India, most notably leading the Ram Janmabhoomi movement for over two decades and uniting community organisations across the country.'
    },
    {
      q: 'Where can citizens read the Prime Minister\'s tribute article?',
      a: 'The Prime Minister\'s written article and statements are accessible via his official handle on X and published through the Press Information Bureau (PIB).'
    }
  ]
});

fs.writeFileSync(FILE, JSON.stringify(guides, null, 2), 'utf8');
console.log('Enriched pm-modi-tribute-ashok-singhal with 350+ words and 6 FAQs');
