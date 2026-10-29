// specimens.js – shared by the live sketch (sketch.js) and the field-guide posters (poster.html)
//
// The field guide: six species of the invented genus Mikatoa. Each has a body colour and
// a tip colour, calm (pastels from the website) and alarmed (warning colours, chosen to
// blend cleanly into the body colour). Like real nudibranchs, each takes its colour – and
// its warning – from what it eats.
window.SPECIMENS = [
    {
        latin: 'Mikatoa menthae', name: 'mint drifter', eats: 'sea-grass hydroids',
        line: 'Grazes the hydroids in sea-grass meadows; when touched, its tips light up yellow, a warning it borrowed from its food.',
        calm: ['#7fd8cc', '#f0d890'], alarm: ['#00a896', '#ffd23f'],
    },
    {
        latin: 'Mikatoa corallina', name: 'coral flame', eats: 'soft corals',
        line: 'Lives on the soft corals it eats and keeps their sting; disturbed, it burns red from the inside out.',
        calm: ['#ff9a87', '#fbe3dc'], alarm: ['#f2352a', '#ffd000'],
    },
    {
        latin: 'Mikatoa lavandula', name: 'lavender dancer', eats: 'stinging anemones',
        line: 'Feeds on anemones and stores their stinging cells in the tips of its limbs, which turn turquoise the moment it feels threatened.',
        calm: ['#a8a8e6', '#7fe6e0'], alarm: ['#5a3cf0', '#00e0cc'],
    },
    {
        latin: 'Mikatoa foliata', name: 'leaf sleeper', eats: 'green algae',
        line: 'Keeps the green of the algae it eats alive in its body and sleeps in the light; only when disturbed does it flash cyan.',
        calm: ['#a8f0c0', '#a8a8e6'], alarm: ['#14b85a', '#00c8f0'],
    },
    {
        latin: 'Mikatoa arenaria', name: 'sand ember', eats: 'sponges in sandy shallows',
        line: 'Hides on sandy ground, almost invisible, until something comes too close; then its tips glow like embers.',
        calm: ['#f0d890', '#ff9a87'], alarm: ['#ffab00', '#ff2d6f'],
    },
    {
        latin: 'Mikatoa atramentum', name: 'ink ghost', eats: 'unknown',
        line: 'The rarest of the six. Its food is unknown; at rest it is pure ink, and only its warning shows any colour.',
        calm: ['#141414', '#141414'], alarm: ['#141414', '#ff2d6f'],
    },
];
