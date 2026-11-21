// Re-encode the music track to a small MP3 (run once; output is committed).
//   npm i --no-save mpg123-decoder @breezystack/lamejs
//   node tools/build-audio.mjs <pure_raceway_bpm160.mp3> public/assets/audio/music.mp3
// Source: "Pure Raceway" by MintoDog, OpenGameArt.org, CC0.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { MPEGDecoder } from 'mpg123-decoder';
import { Mp3Encoder } from '@breezystack/lamejs';

const [src, out] = process.argv.slice(2);
const KBPS = 96;

const decoder = new MPEGDecoder();
await decoder.ready;
const { channelData, sampleRate, samplesDecoded } = decoder.decode(new Uint8Array(readFileSync(src)));
decoder.free();
console.log(`decoded ${(samplesDecoded / sampleRate).toFixed(1)} s @ ${sampleRate} Hz, ${channelData.length} ch`);

const toPCM = (f) => {
  const o = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) o[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
  return o;
};
const L = toPCM(channelData[0]);
const R = toPCM(channelData[1] || channelData[0]);
const enc = new Mp3Encoder(2, sampleRate, KBPS);
const chunks = [];
const BLOCK = 1152;
for (let i = 0; i < L.length; i += BLOCK) {
  const b = enc.encodeBuffer(L.subarray(i, i + BLOCK), R.subarray(i, i + BLOCK));
  if (b.length) chunks.push(Buffer.from(b));
}
chunks.push(Buffer.from(enc.flush()));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat(chunks));
console.log('wrote', out, Buffer.concat(chunks).length, 'bytes');
