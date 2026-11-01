export const engine: Engine;
declare class Engine extends Clock {
    useDefaultMainLoop: boolean;
    pauseOnDocumentHidden: boolean;
    /**
     * Reduced motion: `false` (default) animates normally, `true` always reduces motion,
     * `'auto'` follows the user's `prefers-reduced-motion` OS setting (and updates live).
     * When active, animations and timelines jump to their end state; infinite loops stop at the end of their first loop.
     * Plain timers are not affected. Opt a single animation out with `reducedMotion: false`.
     * @type {Boolean|'auto'}
     */
    reducedMotion: boolean | "auto";
    /** @type {Boolean} */
    _prefersReducedMotion: boolean;
    /** @type {DefaultsParams} */
    defaults: DefaultsParams;
    paused: boolean;
    /** @type {Number|NodeJS.Immediate} */
    reqId: number | NodeJS.Immediate;
    update(): void;
    /**
     * Whether motion is currently being reduced, based on `reducedMotion` and the OS setting.
     * @return {Boolean}
     */
    get reducesMotion(): boolean;
    wake(): this;
    pause(): Engine;
    resume(): this;
    set timeUnit(unit: "ms" | "s");
    get timeUnit(): "ms" | "s";
    set precision(precision: number);
    get precision(): number;
}
import { Clock } from '../core/clock.js';
import type { DefaultsParams } from '../types/index.js';
export {};
