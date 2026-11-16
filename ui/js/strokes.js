// Stroke order for every letter: strokes in writing order, each a polyline drawn in that direction,
// in a 100x100 box. Double consonants and compound vowels are built from their parts.
//
// Needs nothing from earlier scripts.
// Provides: STROKES (letter -> strokes), samplePoints, strokeScore (how well a drawing matches the template)
// and strokeOrderIssue (which stroke is out of order or drawn the wrong way). Tested by tools/check.js.

// A circle as 25 points, starting at the top and going anticlockwise (back to the top)
const circle = (centerX, centerY, radius) => Array.from({length: 25}, (_, k) => {
  const angle = -Math.PI / 2 - k / 24 * 2 * Math.PI;
  return [+(centerX + radius * Math.cos(angle)).toFixed(1), +(centerY + radius * Math.sin(angle)).toFixed(1)];
});

const BASE_STROKES = {
  'ㄱ': [[[20, 20], [78, 20], [78, 85]]],
  'ㄴ': [[[22, 15], [22, 80], [82, 80]]],
  'ㄷ': [[[22, 18], [78, 18]], [[22, 18], [22, 80], [80, 80]]],
  'ㄹ': [[[20, 15], [78, 15], [78, 47]], [[22, 47], [78, 47]], [[22, 47], [22, 82], [82, 82]]],
  'ㅁ': [[[22, 18], [22, 82]], [[22, 18], [78, 18], [78, 82]], [[22, 82], [78, 82]]],
  'ㅂ': [[[25, 15], [25, 85]], [[75, 15], [75, 85]], [[25, 48], [75, 48]], [[25, 85], [75, 85]]],
  'ㅅ': [[[50, 15], [20, 85]], [[46, 45], [82, 85]]],
  'ㅇ': [circle(50, 50, 32)],
  'ㅈ': [[[22, 18], [75, 18], [25, 85]], [[52, 48], [82, 85]]],
  'ㅊ': [[[45, 4], [55, 13]], [[22, 25], [75, 25], [25, 88]], [[52, 55], [82, 88]]],
  'ㅋ': [[[20, 18], [78, 18], [78, 85]], [[20, 50], [78, 50]]],
  'ㅌ': [[[22, 18], [78, 18]], [[22, 50], [78, 50]], [[22, 18], [22, 82], [80, 82]]],
  'ㅍ': [[[18, 18], [82, 18]], [[38, 18], [34, 80]], [[62, 18], [66, 80]], [[15, 82], [85, 82]]],
  'ㅎ': [[[45, 4], [55, 12]], [[22, 26], [78, 26]], circle(50, 62, 22)],
  'ㅏ': [[[45, 8], [45, 92]], [[45, 50], [72, 50]]],
  'ㅑ': [[[42, 8], [42, 92]], [[42, 38], [70, 38]], [[42, 62], [70, 62]]],
  'ㅓ': [[[28, 50], [55, 50]], [[55, 8], [55, 92]]],
  'ㅕ': [[[28, 38], [55, 38]], [[28, 62], [55, 62]], [[55, 8], [55, 92]]],
  'ㅗ': [[[50, 30], [50, 62]], [[12, 62], [88, 62]]],
  'ㅛ': [[[38, 32], [38, 62]], [[62, 32], [62, 62]], [[12, 62], [88, 62]]],
  'ㅜ': [[[12, 38], [88, 38]], [[50, 38], [50, 75]]],
  'ㅠ': [[[12, 38], [88, 38]], [[38, 38], [38, 75]], [[62, 38], [62, 75]]],
  'ㅡ': [[[12, 50], [88, 50]]],
  'ㅣ': [[[50, 8], [50, 92]]],
  'ㅐ': [[[35, 8], [35, 92]], [[35, 50], [58, 50]], [[66, 8], [66, 92]]],
  'ㅒ': [[[33, 8], [33, 92]], [[33, 38], [56, 38]], [[33, 62], [56, 62]], [[66, 8], [66, 92]]],
  'ㅔ': [[[18, 50], [42, 50]], [[42, 8], [42, 92]], [[68, 8], [68, 92]]],
  'ㅖ': [[[16, 38], [40, 38]], [[16, 62], [40, 62]], [[40, 8], [40, 92]], [[68, 8], [68, 92]]],
};

// Place a letter's strokes inside the rectangle left..right, top..bottom
const fit = (strokes, left, top, right, bottom) => strokes.map(stroke => stroke.map(([x, y]) => [
  +(left + x * (right - left) / 100).toFixed(1),
  +(top + y * (bottom - top) / 100).toFixed(1),
]));
// Two letters side by side: the first in 0..split, the second in split..100
const pair = (leftLetter, rightLetter, split = 50) => [
  ...fit(BASE_STROKES[leftLetter], 0, 0, split, 100),
  ...fit(BASE_STROKES[rightLetter], split, 0, 100, 100),
];
const STROKES = {
  ...BASE_STROKES,
  'ㄲ': pair('ㄱ', 'ㄱ'),
  'ㄸ': pair('ㄷ', 'ㄷ'),
  'ㅃ': pair('ㅂ', 'ㅂ'),
  'ㅆ': pair('ㅅ', 'ㅅ'),
  'ㅉ': pair('ㅈ', 'ㅈ'),
  'ㅘ': pair('ㅗ', 'ㅏ', 62),
  'ㅙ': pair('ㅗ', 'ㅐ', 55),
  'ㅚ': pair('ㅗ', 'ㅣ', 65),
  'ㅝ': pair('ㅜ', 'ㅓ', 58),
  'ㅞ': pair('ㅜ', 'ㅔ', 52),
  'ㅟ': pair('ㅜ', 'ㅣ', 65),
  'ㅢ': pair('ㅡ', 'ㅣ', 65),
};

// Points about every `step` units along each stroke: its first point, then each segment cut into equal pieces
function samplePoints(strokes, step = 3) {
  const points = [];
  for (const stroke of strokes) {
    for (let k = 0; k < stroke.length; k++) {
      if (k === 0) {
        points.push(stroke[0]);
        continue;
      }
      const start = stroke[k - 1];
      const end = stroke[k];
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      const pieces = Math.max(1, Math.round(length / step));
      for (let t = 1; t <= pieces; t++) {
        points.push([start[0] + (end[0] - start[0]) * t / pieces, start[1] + (end[1] - start[1]) * t / pieces]);
      }
    }
  }
  return points;
}

// 0-100: how much of the template you covered (recall) and how much of your ink is on it (precision),
// within `near` units, combined as their harmonic mean
function strokeScore(template, drawn, near = 9) {
  const templatePoints = samplePoints(template);
  const drawnPoints = samplePoints(drawn.filter(stroke => stroke.length));
  if (!drawnPoints.length) return 0;
  const isNearAny = (point, others) => others.some(other => {
    return Math.hypot(point[0] - other[0], point[1] - other[1]) <= near;
  });
  const recall = templatePoints.filter(point => isNearAny(point, drawnPoints)).length / templatePoints.length;
  const precision = drawnPoints.filter(point => isNearAny(point, templatePoints)).length / drawnPoints.length;
  return recall + precision ? Math.round(200 * recall * precision / (recall + precision)) : 0;
}

// Stroke order and direction: each drawn stroke must start, pass its first quarter and end near the template
// stroke with the same number (the quarter point tells clockwise from anticlockwise in ㅇ). Returns the number
// (1-based) of the first stroke that is off, 0 if all are right, or -1 when the stroke count differs
// (the count message covers that).
function strokeOrderIssue(template, drawn, near = 24) {
  const drawnStrokes = drawn.filter(stroke => stroke.length);
  if (drawnStrokes.length !== template.length) return -1;
  // the point `fraction` of the way along a stroke (0 = start, 1 = end)
  const pointAlong = (stroke, fraction) => {
    const points = samplePoints([stroke], 1);
    return points[Math.min(points.length - 1, Math.round(fraction * (points.length - 1)))];
  };
  const isNear = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= near;
  const checkpoints = [0, 0.25, 1];
  for (let i = 0; i < template.length; i++) {
    const followsTemplate = checkpoints.every(fraction => {
      return isNear(pointAlong(template[i], fraction), pointAlong(drawnStrokes[i], fraction));
    });
    if (!followsTemplate) return i + 1;
  }
  return 0;
}

if (typeof module !== 'undefined') module.exports = {STROKES, samplePoints, strokeScore, strokeOrderIssue};
