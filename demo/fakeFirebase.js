"use strict";
// In-memory fake of firebase-admin + firebase-functions/v1, just enough to run the REAL
// firebase/functions/index.js on a laptop with no internet, no Firebase project, no installs.
// It does NOT test firestore.rules (that needs the Firebase emulator).
const Module = require("module");

const store = new Map(); // "shops/g10" -> data
const SERVER_TS = { __fv: "ts" };
const clone = (o) => JSON.parse(JSON.stringify(o));

const resolveFV = (cur, v) => {
  if (v && v.__fv === "ts") return new Date().toISOString();
  if (v && v.__fv === "inc") return (Number(cur) || 0) + v.n;
  if (v && v.__fv === "arrRemove") return (Array.isArray(cur) ? cur : []).filter((x) => !v.items.includes(x));
  return v;
};
const applyWrite = (path, data, { merge = false, mustExist = false, mustNotExist = false } = {}) => {
  const exists = store.has(path);
  if (mustExist && !exists) { const e = new Error("NOT_FOUND"); e.code = 5; throw e; }
  if (mustNotExist && exists) { const e = new Error("ALREADY_EXISTS"); e.code = 6; throw e; }
  const base = merge || mustExist ? clone(store.get(path) || {}) : {};
  const isFV = (v) => v && typeof v === "object" && v.__fv;
  const isPlain = (v) => v && typeof v === "object" && !Array.isArray(v) && !isFV(v);
  const mergeInto = (target, src) => {
    for (const [k, v] of Object.entries(src)) {
      if (isPlain(v) && (merge || mustExist)) { target[k] = isPlain(target[k]) ? target[k] : {}; mergeInto(target[k], v); }
      else target[k] = resolveFV(target[k], v);
    }
  };
  mergeInto(base, data);
  store.set(path, base);
};

const snap = (path) => ({
  id: path.split("/").pop(), exists: store.has(path), ref: docRef(path),
  data: () => (store.has(path) ? clone(store.get(path)) : undefined),
});

function docRef(path) {
  return {
    id: path.split("/").pop(), path,
    get: async () => snap(path),
    set: async (d, o) => applyWrite(path, d, o),
    update: async (d) => applyWrite(path, d, { mustExist: true, merge: true }),
    create: async (d) => applyWrite(path, d, { mustNotExist: true }),
    delete: async () => { store.delete(path); },
    collection: (name) => colRef(path + "/" + name),
  };
}

function query(colPath, filters = [], lim = Infinity) {
  const q = {
    where: (f, op, v) => query(colPath, filters.concat([[f, op, v]]), lim),
    limit: (n) => query(colPath, filters, n),
    get: async () => {
      const docs = [];
      for (const [p, d] of store) {
        const rest = p.startsWith(colPath + "/") ? p.slice(colPath.length + 1) : null;
        if (!rest || rest.includes("/")) continue;
        const ok = filters.every(([f, op, v]) =>
          op === "==" ? d[f] === v : op === ">=" ? d[f] >= v : op === "<=" ? d[f] <= v : false);
        if (ok) docs.push(snap(p));
      }
      const out = docs.slice(0, lim);
      return { docs: out, empty: out.length === 0, size: out.length, forEach: (fn) => out.forEach(fn) };
    },
  };
  return q;
}

let autoId = 0;
function colRef(path) {
  return Object.assign(query(path), {
    doc: (id) => docRef(path + "/" + (id || "auto" + String(++autoId).padStart(12, "0"))),
  });
}

const firestore = () => ({
  collection: (n) => colRef(n),
  batch: () => {
    const ops = [];
    return {
      set: (r, d, o) => ops.push(() => applyWrite(r.path, d, o)),
      create: (r, d) => ops.push(() => applyWrite(r.path, d, { mustNotExist: true })),
      update: (r, d) => ops.push(() => applyWrite(r.path, d, { mustExist: true, merge: true })),
      delete: (r) => ops.push(() => store.delete(r.path)),
      commit: async () => { ops.forEach((f) => f()); },
    };
  },
  // Real Firestore retries conflicting transactions so the outcome is as if they ran one after the
  // other. The fake does exactly that (a queue), which is what makes burst/parallel tests meaningful.
  runTransaction: (fn) => {
    const result = txChain.then(() => runTx(fn));
    txChain = result.catch(() => {});
    return result;
  },
});
let txChain = Promise.resolve();
const runTx = async (fn) => {
  {
    const writes = [];
    const tx = {
      get: async (r) => (r.get ? r.get() : r),
      set: (r, d, o) => writes.push(() => applyWrite(r.path, d, o)),
      update: (r, d) => writes.push(() => applyWrite(r.path, d, { mustExist: true, merge: true })),
      delete: (r) => writes.push(() => store.delete(r.path)),
    };
    const result = await fn(tx);
    writes.forEach((w) => w());
    return result;
  }
};
firestore.FieldValue = {
  serverTimestamp: () => SERVER_TS,
  increment: (n) => ({ __fv: "inc", n }),
  arrayRemove: (...items) => ({ __fv: "arrRemove", items }),
};

const fcm = { sent: [], deadTokens: new Set() };
const authUsers = new Set(); // uids that "signed in" at least once (a real project creates the user on first sign-in)
const revoked = [];
const admin = {
  initializeApp: () => {},
  firestore,
  auth: () => ({
    createCustomToken: async (uid, claims) => { authUsers.add(uid); return "TOKEN:" + JSON.stringify({ uid, ...claims }); },
    revokeRefreshTokens: async (uid) => {
      if (!authUsers.has(uid)) { const e = new Error("no user"); e.code = "auth/user-not-found"; throw e; }
      revoked.push(uid);
    },
  }),
  messaging: () => ({
    sendEachForMulticast: async ({ tokens, notification }) => ({
      responses: tokens.map((t) => {
        if (fcm.deadTokens.has(t)) return { success: false, error: { code: "messaging/registration-token-not-registered" } };
        fcm.sent.push({ token: t, body: notification.body });
        return { success: true };
      }),
    }),
  }),
};

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const wrap = (fn) => ({ run: fn });
const functions = {
  https: { HttpsError, onCall: wrap },
  pubsub: { schedule: () => ({ timeZone: () => ({ onRun: wrap }) }) },
  firestore: { document: () => ({ onCreate: wrap }) },
  runWith: () => functions,
  logger: { warn: () => {}, error: (...a) => console.error("   [fn error]", ...a), info: () => {} },
};

// Make require("firebase-admin") / require("firebase-functions/v1") return the fakes.
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "firebase-admin") return admin;
  if (request === "firebase-functions/v1" || request === "firebase-functions") return functions;
  return origLoad.apply(this, arguments);
};

module.exports = { store, fcm, admin, authUsers, revoked };
