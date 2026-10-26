# Firestore Security Rules Unit Tests

Tests all security boundaries in `firestore.rules` using the official `@firebase/rules-unit-testing` library.

## Running Tests

1. Start the Firebase Local Emulator Suite:
```bash
firebase emulators:start --only firestore
```

2. In another terminal, run the test suite:
```bash
cd firebase/rules-tests
npm install
npm test
```

## Coverage
- Unauthenticated access prevention
- `shops_private`, `setup_codes`, and `rate_limits` blocked from all web clients
- Multi-tenant tenant isolation (`isOwner(shopId)`)
- Expired subscription read lockdown on subcollections (lock screen allows root shop read only)
- Strict client write prohibition (all writes must occur via Cloud Functions with the Admin SDK)
- Khata ledger data and balance protection against client-side tampering
