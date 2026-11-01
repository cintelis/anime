import {
  defaults,
  globals,
  globalVersions,
} from '../core/globals.js';

import {
  tickModes,
  isBrowser,
  K,
  doc,
} from '../core/consts.js';

import {
  now,
  forEachChildren,
  removeChild,
} from '../core/helpers.js';

import {
  minValue,
} from '../core/consts.js';

import {
  Clock,
} from '../core/clock.js';

import {
  tick,
} from '../core/render.js';

import {
  additive,
} from '../animation/additive.js';

/**
 * @import {
 *   DefaultsParams,
 * } from '../types/index.js'
*/

/**
 * @import {
 *   Tickable,
 * } from '../types/index.js'
*/

const engineTickMethod = /*#__PURE__*/ (() => isBrowser ? requestAnimationFrame : setImmediate)();
const engineCancelMethod = /*#__PURE__*/ (() => isBrowser ? cancelAnimationFrame : clearImmediate)();

class Engine extends Clock {

  /** @param {Number} [initTime] */
  constructor(initTime) {
    super(initTime);
    this.useDefaultMainLoop = true;
    this.pauseOnDocumentHidden = true;
    /**
     * Reduced motion: `false` (default) animates normally, `true` always reduces motion,
     * `'auto'` follows the user's `prefers-reduced-motion` OS setting (and updates live).
     * When active, animations and timelines jump to their end state; infinite loops stop at the end of their first loop.
     * Plain timers are not affected. Opt a single animation out with `reducedMotion: false`.
     * @type {Boolean|'auto'}
     */
    this.reducedMotion = false;
    /** @type {Boolean} */
    this._prefersReducedMotion = false;
    /** @type {DefaultsParams} */
    this.defaults = defaults;
    // this.paused = isBrowser && doc.hidden ? true  : false;
    this.paused = true;
    /** @type {Number|NodeJS.Immediate} */
    this.reqId = 0;
  }

  update() {
    const time = this._currentTime = now();
    if (this.requestTick(time)) {
      this.computeDeltaTime(time);
      const engineSpeed = this._speed;
      const engineFps = this._fps;
      const reduceMotion = this.reducesMotion;
      let activeTickable = /** @type {Tickable} */(this._head);
      while (activeTickable) {
        const nextTickable = activeTickable._next;
        if (!activeTickable.paused && reduceMotion && activeTickable._reduceMotion) {
          skipToEnd(activeTickable);
        } else if (!activeTickable.paused) {
          tick(
            activeTickable,
            (time - activeTickable._startTime) * activeTickable._speed * engineSpeed,
            0, // !muteCallbacks
            0, // !internalRender
            activeTickable._fps < engineFps ? activeTickable.requestTick(time) : tickModes.AUTO
          );
        } else {
          removeChild(this, activeTickable);
          this._hasChildren = !!this._tail;
          activeTickable._running = false;
          if (activeTickable.completed && !activeTickable._cancelled) {
            activeTickable.cancel();
          }
        }
        activeTickable = nextTickable;
      }
      additive.update();
    }
  }

  /**
   * Whether motion is currently being reduced, based on `reducedMotion` and the OS setting.
   * @return {Boolean}
   */
  get reducesMotion() {
    const setting = this.reducedMotion;
    return setting === true || (setting === 'auto' && this._prefersReducedMotion);
  }

  wake() {
    if (this.useDefaultMainLoop && !this.reqId) {
      // Imediatly request a tick to update engine._lastTickTime and get accurate offsetPosition calculation in timer.js
      this.requestTick(now());
      this.reqId = engineTickMethod(tickEngine);
    }
    return this;
  }

  pause() {
    if (!this.reqId) return;
    this.paused = true;
    return killEngine();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    forEachChildren(this, (/** @type {Tickable} */child) => child.resetTime());
    return this.wake();
  }

  // Getter and setter for speed
  get speed() {
    return this._speed * (globals.timeScale === 1 ? 1 : K);
  }

  set speed(playbackRate) {
    const speed = playbackRate * globals.timeScale;
    if (this._speed === speed) return;
    this._speed = speed;
    forEachChildren(this, (/** @type {Tickable} */child) => child.speed = child._speed);
  }

  // Getter and setter for timeUnit
  get timeUnit() {
    return globals.timeScale === 1 ? 'ms' : 's';
  }

  set timeUnit(unit) {
    const secondsScale = 0.001;
    const isSecond = unit === 's';
    const newScale = isSecond ? secondsScale : 1;
    if (globals.timeScale !== newScale) {
      globals.timeScale = newScale;
      globals.tickThreshold = 200 * newScale;
      const scaleFactor = isSecond ? secondsScale : K;
      /** @type {Number} */
      (this.defaults.duration) *= scaleFactor;
      this._speed *= scaleFactor;
    }
  }

  // Getter and setter for precision
  get precision() {
    return globals.precision;
  }

  set precision(precision) {
    globals.precision = precision;
  }

}

export const engine = /*#__PURE__*/(() => {
  const engine = new Engine(now());
  if (isBrowser) {
    globalVersions.engine = engine;
    doc.addEventListener('visibilitychange', () => {
      if (!engine.pauseOnDocumentHidden) return;
      doc.hidden ? engine.pause() : engine.resume();
    });
    // Track the OS "reduce motion" setting for `engine.reducedMotion = 'auto'`
    const reducedMotionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (reducedMotionQuery) {
      engine._prefersReducedMotion = reducedMotionQuery.matches;
      if (reducedMotionQuery.addEventListener) {
        reducedMotionQuery.addEventListener('change', e => engine._prefersReducedMotion = e.matches);
      }
    }
  }
  return engine;
})();


const tickEngine = () => {
  if (engine._head) {
    engine.reqId = engineTickMethod(tickEngine);
    engine.update();
  } else {
    engine.reqId = 0;
  }
}

/**
 * Renders a tickable straight to its end state, through the normal completion path,
 * so callbacks and promises still fire. Infinite loops stop at the end of their first loop.
 * @param {Tickable} tickable
 */
const skipToEnd = tickable => {
  if (tickable.iterationCount === Infinity) {
    tick(tickable, tickable._delay + tickable.iterationDuration - minValue, 0, 0, tickModes.AUTO);
    tickable.pause();
  } else {
    tick(tickable, tickable._delay + tickable.duration, 0, 0, tickModes.AUTO);
  }
}

const killEngine = () => {
  engineCancelMethod(/** @type {NodeJS.Immediate & Number} */(engine.reqId));
  engine.reqId = 0;
  return engine;
}
