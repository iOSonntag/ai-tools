import type { ScoreConstants } from './score-options.ts';

export default {
  version: 1,
  qualityWeights: {
    // The pull axes give cheapness, habit, and agreement a place of their own, so that they stay out of the
    // merit ratings. They are no verdict on the option and weigh nothing here.
    ease: 0,
    convention: 0,
    agreement: 0,
    truth: 3,
    durability: 2,
    integrity: 2,
    growth: 1,
  },
  ratingWorthFloor: 0.1,
  evidenceTrustFloor: 0.3,
  sharpness: 2,
  // "None of them" is worth a middling option.
  outsideOptionRating: 5,
  percentStep: 1,
} satisfies ScoreConstants;
