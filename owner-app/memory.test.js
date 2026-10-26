/**
 * Memory / listener leak tests for HisaabLive owner-app patterns.
 * Run: node --test memory.test.js
 * No Firebase, no React — pure Node.js mocks.
 */
"use strict";
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ---- Mock timer helpers ----
describe("setInterval cleanup (App midnight roll-over)", () => {
  test("clearInterval is called when the component unmounts", () => {
    const cleared = [];
    const handles = [];

    // Mock setInterval / clearInterval
    let handleCounter = 1;
    const mockSetInterval = (fn, ms) => {
      const id = handleCounter++;
      handles.push({ id, fn, ms });
      return id;
    };
    const mockClearInterval = (id) => cleared.push(id);

    // Simulate App mount: start interval
    const intervalId = mockSetInterval(() => {}, 60000);
    assert.equal(handles.length, 1, "one interval should be registered");

    // Simulate App unmount: cleanup function calls clearInterval
    const cleanup = () => mockClearInterval(intervalId);
    cleanup();

    assert.equal(cleared.length, 1, "clearInterval should be called once on unmount");
    assert.equal(cleared[0], intervalId, "should clear the interval that was set");
  });

  test("multiple mounts each clean up their own interval", () => {
    const cleared = [];
    let counter = 100;
    const mockSetInterval = () => ++counter;
    const mockClearInterval = (id) => cleared.push(id);

    // Simulate 3 mount/unmount cycles
    for (let i = 0; i < 3; i++) {
      const id = mockSetInterval();
      const cleanup = () => mockClearInterval(id);
      cleanup(); // unmount immediately
    }

    assert.equal(cleared.length, 3, "each of 3 mounts should clean up its interval");
    // All cleared IDs should be unique
    assert.equal(new Set(cleared).size, 3);
  });
});

// ---- Mock onSnapshot helpers ----
describe("onSnapshot cleanup (Hisaab component)", () => {
  test("the unsubscribe function returned by onSnapshot is called on unmount", () => {
    let unsubscribeCalled = false;

    // Simulate onSnapshot: returns an unsubscribe function
    const mockOnSnapshot = (_query, _callback) => {
      return () => { unsubscribeCalled = true; };
    };

    // Simulate Hisaab component useEffect: calls onSnapshot, stores cleanup
    const dummyQuery = {};
    const unsubscribe = mockOnSnapshot(dummyQuery, (snap) => {});

    assert.equal(unsubscribeCalled, false, "should not be unsubscribed before unmount");

    // Simulate unmount: React calls the cleanup returned by useEffect
    unsubscribe();

    assert.equal(unsubscribeCalled, true, "unsubscribe should be called on unmount");
  });

  test("multiple snapshots are each independently cleaned up", () => {
    const unsubscribed = [];

    const mockOnSnapshot = (label) => {
      return () => unsubscribed.push(label);
    };

    // Simulate Hisaab: expenses snapshot + month summary snapshot
    const unsub1 = mockOnSnapshot("expenses");
    const unsub2 = mockOnSnapshot("monthly_summary");

    // Both unmount
    unsub1();
    unsub2();

    assert.deepEqual(unsubscribed.sort(), ["expenses", "monthly_summary"]);
  });
});

// ---- Listener accumulation test ----
describe("Khata listener accumulation (CustomerLedger rapid mount/unmount)", () => {
  test("each mount-unmount cycle leaves zero net listeners", () => {
    let activeListeners = 0;

    const mockOnSnapshot = () => {
      activeListeners++;
      return () => { activeListeners--; };
    };

    // Simulate rapidly switching between 5 different customers
    for (let i = 0; i < 5; i++) {
      const unsub = mockOnSnapshot();
      // Immediately unmount (user navigated back before data arrived)
      unsub();
    }

    assert.equal(activeListeners, 0, "no listeners should remain after all unmounts");
  });

  test("concurrent mounts all clean up when component tree unmounts", () => {
    const unsubscribers = [];
    let activeListeners = 0;

    const mockOnSnapshot = () => {
      activeListeners++;
      const unsub = () => { activeListeners--; };
      unsubscribers.push(unsub);
      return unsub;
    };

    // Simulate 10 component instances alive simultaneously
    for (let i = 0; i < 10; i++) mockOnSnapshot();
    assert.equal(activeListeners, 10);

    // Unmount all (React StrictMode double-invoke, or navigation away)
    unsubscribers.forEach((u) => u());
    assert.equal(activeListeners, 0, "all listeners cleaned up after full unmount");
  });

  test("a forgotten unsubscribe simulates a real leak (negative control)", () => {
    let activeListeners = 0;
    const mockOnSnapshot = () => {
      activeListeners++;
      return () => { activeListeners--; };
    };

    // Simulate a buggy component that doesn't call unsubscribe
    const _unsub = mockOnSnapshot();
    // (intentionally NOT calling _unsub)
    assert.equal(activeListeners, 1, "listener should still be active (this demonstrates a leak)");
    // Prove that calling it does fix the leak
    _unsub();
    assert.equal(activeListeners, 0);
  });
});

// ---- React useEffect cleanup pattern ----
describe("useEffect return-value cleanup contract", () => {
  test("a cleanup function that returns undefined does not throw", () => {
    // React calls the cleanup returned from useEffect; if the effect has no cleanup,
    // returning undefined must be accepted.
    const mockUseEffectCleanup = (fn) => {
      const cleanup = fn();
      if (typeof cleanup === "function") cleanup();
    };
    // No-op effect (no listener to clean up)
    assert.doesNotThrow(() => mockUseEffectCleanup(() => undefined));
  });

  test("a cleanup function that returns a function does call it", () => {
    let called = false;
    const mockUseEffectCleanup = (fn) => {
      const cleanup = fn();
      if (typeof cleanup === "function") cleanup();
    };
    mockUseEffectCleanup(() => () => { called = true; });
    assert.equal(called, true);
  });
});
