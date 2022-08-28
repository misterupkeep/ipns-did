# ipns-did

**NOTE:** The IPNS-DID spec is unstable.

JavaScript library for publishing, updating, and resolving DID documents over
the IPNS method.

## API

The library default exports a factory function:
```ts
import IPNSDID from "ipns-did";

import * as IPFS from 'ipfs-core'
const ipfs = await IPFS.create()

const ipnsDid = IPNSDID(ipfs, { codecs: [myCodec], hashers: [myHasher] });
```
By default the library supports `DAG-JSON`, `DAG-CBOR`, and `DAG-PB` codecs, and
the `sha2-256` hasher.

You can then use this object to perform some DID document operations:
```ts
await ipnsDid.resolve("did:ipns:did.example.com");

const { ipnsCid, docCid } = await ipnsDid.publishDid(
  { id: ipnsDid.peerIdToDid(peerId) }, // Minimal valid DID document
  { codec: cbor.code, hasher: sha256.code }, // Will default to these two if passed {}
  peerId, // You will need to handle your own PeerId
  24 * 60 * 60 * 1000 // Lifetime of the IPNS record, in milliseconds
);
```

For creating and validating DID documents, you can use the [`did-doc`
library](https://www.npmjs.com/package/did-doc).
