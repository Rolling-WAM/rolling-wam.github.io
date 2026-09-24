/* Bounded rolling-window state; retained video/action pairs keep their contents. */
(function (root) {
  'use strict';
  const DURATION = 7200;
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const easeSlide = value => { const t = clamp(value); return t < .5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; };
  const stops = [0, 2500, 3400, 4600, 5500, 6650];
  function stateAt(time) {
    const t = Math.max(0, Math.min(DURATION, time));
    const refine = smooth((t-350)/1900);
    const slide = easeSlide((t-4750)/1700);
    const phase = t < 2900 ? 0 : t < 4550 ? 1 : 2;
    return {
      phase, refine, slide,
      ready: t >= 2250 && t < 4550,
      executing: phase === 1,
      refineOpacity: smooth((t-200)/150) * (1-smooth((t-2600)/200)),
      emphasis: smooth((t-2900)/200) * (1-smooth((t-4400)/150)),
      execution: clamp((t-3050)/1250),
      levels: [1-refine,2-refine,3-refine,4-refine,5-refine,5],
      label: ['01 / REFINE WINDOW PREDICTIONS','02 / EXECUTE AND OBSERVE','03 / ROLL THE WINDOW'][phase],
      description: phase === 0
        ? (t < 2250 ? 'Jointly denoise video and action predictions across the window.' : 'The next action chunk is ready; future predictions remain partially denoised.')
        : phase === 1 ? 'Execute the action chunk and acquire a new observation.'
        : 'Retain the future predictions and append a new noisy chunk.'
    };
  }
  root.RollingCycle = Object.freeze({DURATION, stops, stateAt});
})(typeof globalThis !== 'undefined' ? globalThis : this);
