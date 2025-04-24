"use strict";

const blindSignatures = require('blind-signatures');
const { Coin, COIN_RIS_LENGTH, IDENT_STR, BANK_STR } = require('./coin.js');
const utils = require('./utils.js');

// Details about the bank's key.
const BANK_KEY = blindSignatures.keyGeneration({ b: 2048 });
const N = BANK_KEY.keyPair.n.toString();
const E = BANK_KEY.keyPair.e.toString();

// Signing the coin
function signCoin(blindedCoinHash) {
  return blindSignatures.sign({
    blinded: blindedCoinHash,
    key: BANK_KEY,
  });
}

// Parse identity hashes from a coin string
function parseCoin(s) {
  let [cnst, amt, guid, leftHashes, rightHashes] = s.split('-');
  if (cnst !== BANK_STR) {
    throw new Error(`Invalid identity string: ${cnst} received, but ${BANK_STR} expected`);
  }
  let lh = leftHashes.split(',');
  let rh = rightHashes.split(',');
  return [lh, rh];
}

// Merchant accepting the coin
function acceptCoin(coin) {
  // Verify signature
  const isValid = blindSignatures.verify({
    unblinded: coin.signature,
    N: coin.n,
    E: coin.e,
    message: coin.toString()
  });

  if (!isValid) {
    return new Error("Invalid coin signature.");
  }

  // Get RIS (random identity strings)
  let ris = [];
  let [leftHashes, rightHashes] = parseCoin(coin.toString());

  for (let i = 0; i < COIN_RIS_LENGTH; i++) {
    const chooseLeft = utils.randInt(2) === 0;
    const part = coin.getRis(chooseLeft, i);
    const hashed = utils.hash(part);

    const expected = chooseLeft ? leftHashes[i] : rightHashes[i];
    if (hashed !== expected) {
      throw new Error( `Hash mismatch at position ${i}`);
    }

    ris.push(part.toString('hex')); // store as hex strings
  }

  return ris;
}

// Detect double-spending
function determineCheater(guid, ris1, ris2) {
  console.log(`Checking double-spend for coin ${guid}...`);
  for (let i = 0; i < ris1.length; i++) {
    const s1 = Buffer.from(ris1[i], 'hex');
    const s2 = Buffer.from(ris2[i], 'hex');

    if (!s1.equals(s2)) {
      const combined = Buffer.alloc(s1.length);
      for (let j = 0; j < s1.length; j++) {
        combined[j] = s1[j] ^ s2[j];
      }

      const result = combined.toString();
      if (result.startsWith(IDENT_STR)) {
        const purchaser = result.split(':')[1];
        console.log(`Purchaser is the cheater! Identity: ${purchaser}`);
        return;
      } else {
        console.log("Merchant is the cheater! Gave mismatched RIS values.");
        return;
      }
    }
  }
  console.log("No double spending detected or RIS values are identical.");
}

// MAIN FLOW
let coin = new Coin('alice', 20, N, E);
coin.signature = signCoin(coin.blinded);
coin.unblind();

let ris1 = acceptCoin(coin);
let ris2 = acceptCoin(coin);

console.log("\n--- Double Spend Check ---");
determineCheater(coin.guid, ris1, ris2);

console.log("\n--- Same RIS Check ---");
determineCheater(coin.guid, ris1, ris1);