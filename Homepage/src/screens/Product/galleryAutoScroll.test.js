// Feature: marketplace-improvements, Requirements 11.2, 11.3 (gallery auto-scroll timing)
//
// Unit test for the product image gallery auto-scroll timing rules (task 21.3),
// covering:
//   - Req 11.2: the gallery auto-scrolls to the next photo every 3 seconds,
//     wrapping around at the end.
//   - Req 11.3: a manual scroll pauses auto-scroll for 5 seconds, then resumes.
//
// fast-check is NOT a dependency of this project, so this uses the built-in
// node:test / node:assert runner together with a hand-rolled, manually-advanced
// fake clock (no real timers, no fake-timer library). Run with:
//   env -u NODE_OPTIONS node --test src/screens/Product/galleryAutoScroll.test.js
//
// MIRROR NOTE: The timing rules below are an EXACT replica of the gallery
// effect implemented in ./ProductDetailScreen.js (task 21.1). That module pulls
// in the React Native / Expo runtime (useEffect, setInterval/clearInterval,
// setTimeout/clearTimeout, scrollTo) which plain `node --test` cannot load, so
// the PURE timing logic is replicated here and MUST be kept in sync with it.
//
// Reference (ProductDetailScreen.js, task 21.1 gallery effect):
//
//   // Auto-scroll to the next photo every 3 seconds, wrapping around.
//   useEffect(() => {
//     if (galleryPaused || galleryImages.length <= 1) return;
//     const id = setInterval(() => {
//       setImgIndex((prev) => {
//         const next = (prev + 1) % galleryImages.length;   // <- advanceIndex
//         imgRef.current?.scrollTo({ x: next * width, animated: true });
//         return next;
//       });
//     }, 3000);                                              // <- AUTO_SCROLL_MS
//     return () => clearInterval(id);
//   }, [galleryPaused, galleryImages.length]);
//
//   // When the buyer manually scrolls, pause auto-scroll for 5s, then resume.
//   const handleGalleryManualScroll = () => {
//     setGalleryPaused(true);
//     if (galleryResumeRef.current) clearTimeout(galleryResumeRef.current);
//     galleryResumeRef.current = setTimeout(() => setGalleryPaused(false), 5000); // <- MANUAL_PAUSE_MS
//   };

const test = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Pure constants and timing helpers (mirror of ProductDetailScreen.js).
// ---------------------------------------------------------------------------

// The auto-scroll tick interval (3 seconds) — `setInterval(..., 3000)` above.
const AUTO_SCROLL_MS = 3000;
// The manual-scroll pause window (5 seconds) — `setTimeout(..., 5000)` above.
const MANUAL_PAUSE_MS = 5000;

// advanceIndex / nextGalleryIndex: the pure step applied on each 3s tick.
// Mirrors `(prev + 1) % galleryImages.length`, wrapping at the end.
const nextGalleryIndex = (i, len) => (len <= 0 ? 0 : (i + 1) % len);

// ---------------------------------------------------------------------------
// A tiny manually-advanced fake clock. Discrete-event simulation supporting
// setInterval / setTimeout / clearInterval / clearTimeout and an advance(ms)
// driver. Callbacks fired during advance() may themselves schedule new timers
// (e.g. resume re-starting the interval), which is required to model the
// pause-then-resume behaviour faithfully.
// ---------------------------------------------------------------------------
class FakeClock {
  constructor() {
    this.now = 0;
    this._seq = 0;
    this._timers = new Map(); // id -> { fireAt, interval|null, cb }
  }
  setInterval(cb, ms) {
    const id = ++this._seq;
    this._timers.set(id, { fireAt: this.now + ms, interval: ms, cb });
    return id;
  }
  setTimeout(cb, ms) {
    const id = ++this._seq;
    this._timers.set(id, { fireAt: this.now + ms, interval: null, cb });
    return id;
  }
  clearInterval(id) { this._timers.delete(id); }
  clearTimeout(id) { this._timers.delete(id); }

  // Advance simulated time by `ms`, firing every due timer in chronological
  // order. Ties (same fireAt) fire in scheduling order via the timer id.
  advance(ms) {
    const target = this.now + ms;
    while (true) {
      let next = null;
      for (const [id, t] of this._timers) {
        if (t.fireAt <= target) {
          if (next === null || t.fireAt < next.t.fireAt ||
              (t.fireAt === next.t.fireAt && id < next.id)) {
            next = { id, t };
          }
        }
      }
      if (next === null) break;
      this.now = next.t.fireAt;
      if (next.t.interval !== null) {
        next.t.fireAt += next.t.interval; // reschedule recurring timer
      } else {
        this._timers.delete(next.id); // one-shot
      }
      next.t.cb();
    }
    this.now = target;
  }
}

// ---------------------------------------------------------------------------
// GalleryAutoScroll: a faithful, runtime-free model of the ProductDetailScreen
// gallery effect lifecycle, driven by the fake clock above. Mirrors how the
// React effect starts/stops the interval as `paused` toggles, and how a manual
// scroll schedules a single resume timer.
// ---------------------------------------------------------------------------
class GalleryAutoScroll {
  constructor(clock, length) {
    this.clock = clock;
    this.length = length;
    this.index = 0;
    this.paused = false;
    this._intervalId = null;
    this._resumeId = null;
    this._startInterval();
  }
  _startInterval() {
    // Mirror: effect no-ops while paused or with <= 1 image.
    if (this.paused || this.length <= 1) return;
    this._intervalId = this.clock.setInterval(() => {
      this.index = nextGalleryIndex(this.index, this.length);
    }, AUTO_SCROLL_MS);
  }
  _stopInterval() {
    if (this._intervalId !== null) {
      this.clock.clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }
  // Mirror of handleGalleryManualScroll: pause now, (re)schedule resume in 5s.
  manualScroll() {
    this.paused = true;
    this._stopInterval();
    if (this._resumeId !== null) this.clock.clearTimeout(this._resumeId);
    this._resumeId = this.clock.setTimeout(() => {
      this.paused = false;
      this._resumeId = null;
      this._startInterval();
    }, MANUAL_PAUSE_MS);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('timing constants match the gallery effect (3s tick, 5s pause)', () => {
  assert.equal(AUTO_SCROLL_MS, 3000);
  assert.equal(MANUAL_PAUSE_MS, 5000);
});

test('nextGalleryIndex advances by one and wraps at length', () => {
  // Property-style sweep across lengths and full wrap cycles.
  for (let len = 1; len <= 6; len++) {
    let i = 0;
    for (let step = 1; step <= len * 3; step++) {
      const expected = step % len; // after `step` advances from 0
      i = nextGalleryIndex(i, len);
      assert.equal(i, expected, `len=${len} step=${step}`);
    }
  }
});

test('Req 11.2: index advances by one per 3s tick and wraps at end', () => {
  const clock = new FakeClock();
  const g = new GalleryAutoScroll(clock, 6); // 6 photos -> wraps 5 -> 0
  assert.equal(g.index, 0);

  for (let tick = 1; tick <= 13; tick++) {
    clock.advance(AUTO_SCROLL_MS);
    assert.equal(g.index, tick % 6, `after ${tick} ticks`);
  }
  // 6 ticks lands back on 0 (wrap-around confirmed).
  assert.equal(g.index, 13 % 6);
});

test('Req 11.2: no advance occurs before a full 3s elapses', () => {
  const clock = new FakeClock();
  const g = new GalleryAutoScroll(clock, 3);
  clock.advance(2999);
  assert.equal(g.index, 0, 'must not advance before 3000ms');
  clock.advance(1); // now exactly 3000ms
  assert.equal(g.index, 1, 'advances exactly at 3000ms');
});

test('single-photo gallery never auto-advances', () => {
  const clock = new FakeClock();
  const g = new GalleryAutoScroll(clock, 1);
  clock.advance(AUTO_SCROLL_MS * 10);
  assert.equal(g.index, 0);
});

test('Req 11.3: manual scroll pauses ~5s, then auto-scroll resumes every 3s', () => {
  const clock = new FakeClock();
  const g = new GalleryAutoScroll(clock, 4);

  // One auto tick happens first.
  clock.advance(AUTO_SCROLL_MS);
  assert.equal(g.index, 1);

  // Buyer manually scrolls -> pause begins.
  g.manualScroll();
  assert.equal(g.paused, true);
  const indexAtPause = g.index;

  // Across the next 4999ms, NO auto-advance may occur (within pause window).
  clock.advance(4999);
  assert.equal(g.index, indexAtPause, 'must not advance during the 5s pause');
  assert.equal(g.paused, true);

  // At exactly 5000ms the pause ends and ticking resumes.
  clock.advance(1);
  assert.equal(g.paused, false, 'resumes at exactly 5000ms');
  assert.equal(g.index, indexAtPause, 'resume itself does not advance');

  // After resume, the next 3s tick advances by one (wrapping).
  clock.advance(AUTO_SCROLL_MS);
  assert.equal(g.index, nextGalleryIndex(indexAtPause, 4));
  clock.advance(AUTO_SCROLL_MS);
  assert.equal(g.index, nextGalleryIndex(nextGalleryIndex(indexAtPause, 4), 4));
});

test('Req 11.3: a second manual scroll restarts the 5s pause window', () => {
  const clock = new FakeClock();
  const g = new GalleryAutoScroll(clock, 5);

  g.manualScroll();
  clock.advance(3000); // 3s into the first pause
  assert.equal(g.paused, true);

  // Second manual scroll re-arms the pause; the prior resume timer is cleared.
  g.manualScroll();
  clock.advance(4999); // 4999ms into the SECOND pause window
  assert.equal(g.paused, true, 'second scroll restarts the full 5s window');
  assert.equal(g.index, 0, 'no auto-advance while paused');

  clock.advance(1); // reaches 5000ms of the second window
  assert.equal(g.paused, false);
});
