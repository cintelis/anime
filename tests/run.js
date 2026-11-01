import './suites/engine.test.js';
import './suites/seconds.test.js';
import './suites/build.test.js';
import './suites/draggables.test.js';
import './suites/scroll.test.js';
import './suites/waapi.test.js';
import './suites/scope.test.js';
import './suites/targets.test.js';
import './suites/animations.test.js';
import './suites/keyframes.test.js';
import './suites/tweens.test.js';
import './suites/timelines.test.js';
import './suites/timings.test.js';
import './suites/animatables.test.js';
import './suites/callbacks.test.js';
import './suites/controls.test.js';
import './suites/directions.test.js';
import './suites/function-based-values.test.js';
import './suites/parameters.test.js';
import './suites/promises.test.js';
import './suites/stagger.test.js';
import './suites/svg.test.js';
import './suites/text.test.js';
import './suites/units.test.js';
import './suites/utils.test.js';
import './suites/values.test.js';
import './suites/transforms.test.js';
import './suites/colors.test.js';
import './suites/threejs.test.js';
import './suites/eases.test.js';
import './suites/reduced-motion.test.js';
import './suites/leaks.test.js';

mocha.checkLeaks();

// Expose a summary for the headless runner (tests/headless.js); harmless in a normal browser session
const failures = [];
const runner = mocha.run();
runner.on('fail', (test, err) => failures.push({ title: test.fullTitle(), error: String(err && err.message || err) }));
runner.on('end', () => {
  window['__mochaResults'] = { ...runner.stats, failures };
});
