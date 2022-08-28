import { DIDResolutionResult, Resolver } from "did-resolver";
import { IPFS } from "ipfs-core-types";
import * as IPNSMethod from "ipns-did-resolver";

import { BlockMulticodec } from "multiformat-multicodec";
import { BlockCodec } from "multiformats/codecs/interface";
import { Hasher } from "multiformats/hashes/hasher";

import { sha256 } from "multiformats/hashes/sha2";
import * as json from "@ipld/dag-json";
import * as cbor from "@ipld/dag-cbor";
import * as pb from "@ipld/dag-pb";

export { DIDResolutionResult } from "did-resolver";

import { DIDDocument } from "did-doc";

import * as ipns from "ipns";
import { PeerId } from "@libp2p/interface-peer-id";
import { CID } from "multiformats";

type MultidecoderParam = {
  codecs?: [BlockCodec<any, any>];
  hashers?: [Hasher<any, any>];
};

export default function (opts: {
  ipfs: IPFS;
  multicodecs?: MultidecoderParam;
}) {
  const { ipfs, multicodecs } = opts;

  const multicodec = new BlockMulticodec<DIDDocument>({
    codecs: [json, pb, cbor as any].concat(multicodecs?.codecs || ([] as any)),
    hashers: multicodecs?.hashers || [],
  });

  const ipnsResolver = IPNSMethod.getResolver(
    ipfs.block,
    ipfs.name,
    multicodec as any
  );
  const resolver = new Resolver(ipnsResolver);

  return {
    /**
     * Resolve an IPNS method DID into a document.
     * @throws Will throw if DID method isn't `ipns`
     * @throws Will throw if IPNS cannot resolve into an IPFS CID
     * @throws Will throw if the document can't be found, or if the given path can't be followed
     */
    async resolve(did: string): Promise<DIDResolutionResult> {
      return await resolver.resolve(did);
    },

    async _publishValue(
      value: any,
      codec: number = cbor.code,
      hasher: number = sha256.code
    ): Promise<CID> {
      const serialized = await multicodec.encode({
        codec,
        value,
        hasher,
      });

      // Discard the returned CID, as we already got it during serialization;
      // and the ipfs-core API isn't as dynamic in what codecs it supports as we
      // are.
      await ipfs.block.put(serialized.bytes);
      return serialized.cid.toV1();
    },

    /**
     * Publish a DID document to IPNS using a given peer ID.
     * @param {DIDDocument} doc The DID document to publish
     * @param {Object} opts Document serialization options
     * @param {number} opts.codec Code of the codec used to serialize
     * @param {number} opts.hasher Code of the hasher used to serialize
     * @param {PeerId} peerId The peer ID (keypair) used to create the IPNS block
     * @param {number} lifetime The lifetime (TTL) of the published document, in milliseconds
     * @throws {TypeError} Will throw if the passed document isn't valid
     * @returns Returns the CIDs of the document and IPNS blocks
     */
    async publishDid(
      doc: DIDDocument,
      opts: { codec?: number; hasher?: number },
      peerId: PeerId,
      lifetime: number
    ): Promise<{ ipnsCid: CID; docCid: CID }> {
      if (!DIDDocument.isDoc(doc))
        throw new TypeError("Passed doc isn't valid DID document");

      const ipfsCid: CID = await this._publishValue(
        doc,
        opts.codec || cbor.code,
        opts.hasher || sha256.code
      );
      const ipfsPath = "/ipfs/" + ipfsCid.toString();
      const pathBytes = Buffer.from(ipfsPath);

      const ipnsCid = peerId.toCID();
      const strkey = "/ipns/" + ipnsCid.toString();

      let rev: bigint = BigInt(0);
      try {
        for await (const e of ipfs.dht.get(strkey)) {
          if (e.name === "VALUE") {
            rev = ipns.unmarshal(e.value).sequence + BigInt(1);
          }
        }
      } catch {}

      const ipnsEntry = await ipns.create(peerId, pathBytes, rev, lifetime);
      const ipnsBlock = ipns.marshal(ipnsEntry);

      for await (const m of ipfs.dht.put(strkey, ipnsBlock));

      return {
        docCid: ipfsCid,
        ipnsCid,
      };
    },

    peerIdToDid(peerId: PeerId) {
      return `did:ipns:${peerId.toCID()}`;
    },

    domainToDid(domain: string) {
      return `did:ipns:${domain}`;
    },
  };
}
