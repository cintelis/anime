import {
  expect,
} from '../utils.js';

import {
  animate,
  createTimeline,
  createTimer,
  engine,
  utils,
  waapi,
} from '../../dist/modules/index.js';

// Waits for a few engine frames
const frames = (n = 3) => new Promise(resolve => {
  const step = () => (n-- > 0 ? requestAnimationFrame(step) : resolve());
  requestAnimationFrame(step);
});

suite('Reduced motion', () => {

  const initialPreference = engine._prefersReducedMotion;

  teardown(() => {
    engine.reducedMotion = false;
    engine._prefersReducedMotion = initialPreference;
  });

  test('Is off by default and animations play normally', async () => {
    expect(engine.reducedMotion).to.equal(false);
    expect(engine.reducesMotion).to.equal(false);
    const animation = animate('#target-id', { x: 100, duration: 1000 });
    await frames();
    expect(animation.completed).to.equal(false);
    expect(utils.get('#target-id', 'x', false)).to.be.below(100);
    animation.revert();
  });

  test('reducesMotion reflects the setting and the OS preference', () => {
    engine.reducedMotion = true;
    expect(engine.reducesMotion).to.equal(true);
    engine.reducedMotion = 'auto';
    engine._prefersReducedMotion = true;
    expect(engine.reducesMotion).to.equal(true);
    engine._prefersReducedMotion = false;
    expect(engine.reducesMotion).to.equal(false);
    engine.reducedMotion = false;
    engine._prefersReducedMotion = true;
    expect(engine.reducesMotion).to.equal(false);
  });

  test('Animations jump to their end state and still fire callbacks and promises', async () => {
    engine.reducedMotion = true;
    let completes = 0;
    let updates = 0;
    const animation = animate('#target-id', {
      x: 100,
      opacity: .5,
      duration: 2000,
      onUpdate: () => updates++,
      onComplete: () => completes++,
    });
    await animation.then(() => {});
    expect(utils.get('#target-id', 'x', false)).to.equal(100);
    expect(utils.get('#target-id', 'opacity', false)).to.equal(.5);
    expect(animation.completed).to.equal(true);
    expect(completes).to.equal(1);
    expect(updates).to.be.above(0);
  });

  test('Delayed animations also jump to their end state', async () => {
    engine.reducedMotion = true;
    const animation = animate('#target-id', { x: 50, delay: 1500, duration: 1000 });
    await frames();
    expect(animation.completed).to.equal(true);
    expect(utils.get('#target-id', 'x', false)).to.equal(50);
  });

  test('Finite loops end on their final state', async () => {
    engine.reducedMotion = true;
    const animation = animate('#target-id', { x: [0, 100], loop: 2, alternate: true, duration: 500 });
    await frames();
    expect(animation.completed).to.equal(true);
    // 3 iterations alternating: 0→100, 100→0, 0→100
    expect(utils.get('#target-id', 'x', false)).to.equal(100);
  });

  test('Infinite loops stop at the end of their first loop', async () => {
    engine.reducedMotion = true;
    const animation = animate('#target-id', { x: [0, 100], loop: true, alternate: true, duration: 500 });
    await frames();
    expect(animation.paused).to.equal(true);
    expect(animation.completed).to.equal(false);
    expect(utils.get('#target-id', 'x', false)).to.be.closeTo(100, .001);
    await frames(5);
    expect(utils.get('#target-id', 'x', false)).to.be.closeTo(100, .001);
    animation.revert();
  });

  test('An animation can opt out with reducedMotion: false', async () => {
    engine.reducedMotion = true;
    const animation = animate('#target-id', { x: 100, duration: 1000, reducedMotion: false });
    await frames();
    expect(animation.completed).to.equal(false);
    expect(utils.get('#target-id', 'x', false)).to.be.below(100);
    animation.revert();
  });

  test('Timelines jump to their end state and fire every child callback', async () => {
    engine.reducedMotion = true;
    const calls = [];
    const tl = createTimeline({ onComplete: () => calls.push('tl') })
      .add('#target-id', { x: 100, duration: 800, onComplete: () => calls.push('first') })
      .call(() => calls.push('call'))
      .add('#target-id', { y: 60, duration: 800, onComplete: () => calls.push('second') });
    await tl.then(() => {});
    expect(utils.get('#target-id', 'x', false)).to.equal(100);
    expect(utils.get('#target-id', 'y', false)).to.equal(60);
    expect(calls).to.include.members(['first', 'call', 'second', 'tl']);
  });

  test('Timelines can opt out with reducedMotion: false', async () => {
    engine.reducedMotion = true;
    const tl = createTimeline({ reducedMotion: false }).add('#target-id', { x: 100, duration: 1000 });
    await frames();
    expect(tl.completed).to.equal(false);
    tl.revert();
  });

  test('Plain timers are not affected unless they opt in', async () => {
    engine.reducedMotion = true;
    const clock = createTimer({ duration: 1000 });
    const optedIn = createTimer({ duration: 1000, reducedMotion: true });
    await frames();
    expect(clock.completed).to.equal(false);
    expect(optedIn.completed).to.equal(true);
    clock.cancel();
  });

  test("'auto' follows the OS preference, including changes while running", async () => {
    engine.reducedMotion = 'auto';
    engine._prefersReducedMotion = false;
    const animation = animate('#target-id', { x: 100, duration: 2000 });
    await frames();
    expect(animation.completed).to.equal(false);
    // The user turns on "reduce motion" while the animation is playing
    engine._prefersReducedMotion = true;
    await frames();
    expect(animation.completed).to.equal(true);
    expect(utils.get('#target-id', 'x', false)).to.equal(100);
  });

  test('WAAPI animations finish immediately and resolve their promise', async () => {
    engine.reducedMotion = true;
    let completed = false;
    const animation = waapi.animate('#target-id', { opacity: .25, duration: 2000, onComplete: () => completed = true });
    await animation.then(() => {});
    expect(animation.completed).to.equal(true);
    expect(completed).to.equal(true);
    expect(+getComputedStyle(document.querySelector('#target-id')).opacity).to.be.closeTo(.25, .001);
  });

  test('Infinite WAAPI loops stop near the end of their first loop without completing', async () => {
    engine.reducedMotion = true;
    let completed = false;
    const animation = waapi.animate('#target-id', { opacity: [1, .2], loop: true, duration: 1000, ease: 'linear', onComplete: () => completed = true });
    await frames(5);
    expect(animation.paused).to.equal(true);
    expect(completed).to.equal(false);
    expect(+getComputedStyle(document.querySelector('#target-id')).opacity).to.be.closeTo(.2, .01);
    animation.cancel();
  });

  test('WAAPI animations can opt out with reducedMotion: false', async () => {
    engine.reducedMotion = true;
    const animation = waapi.animate('#target-id', { opacity: .25, duration: 1000, reducedMotion: false });
    await frames();
    expect(animation.completed).to.equal(false);
    animation.cancel();
  });

});
