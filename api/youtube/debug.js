import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFile, rm, mkdtemp } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import {
  byItagMap,
  videoChoices,
  getYouTubeStreams,
  fetchStreamFast,
  itagOf,
  AAC_ITAG,
  PROGRESSIVE_ITAG,
} from '../../serverlib/shared.js'

function findFfmpeg() {
  const candidates = [
    ffmpegPath,
    join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    join(process.cwd(), 'api', 'node_modules', 'ffmpeg-static', 'ffmpeg'),
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p)) || null
}

const ms = (t) => `${Math.round(t)}ms`

/**
 * GET /api/youtube/debug?url=...
 * Diagnostik: jalankan langkah-langkah unduhan satu per satu dan laporkan
 * hasil + durasinya, untuk menemukan titik gagal di lingkungan serverless.
 */
export default async function handler(req, res) {
  const url = String(req.query.url || 'https://youtu.be/FIqdZatWQUY')
  const out = { url, region: process.env.VERCEL_REGION || null, steps: {} }

  // 1. Metadata
  let t = Date.now()
  const r = await getYouTubeStreams(url)
  out.steps.metadata = {
    ok: !!r,
    ms: ms(Date.now() - t),
    title: r?.title || null,
    medias: r?.medias?.length || 0,
  }
  if (!r) return res.json(out)

  const byItag = byItagMap(r.medias)
  out.steps.itags = {
    h264: videoChoices(byItag).map((c) => `${c.itag}/${c.height}p`),
    audio140: !!byItag[AAC_ITAG],
    progressive18: !!byItag[PROGRESSIVE_ITAG],
  }

  // 2. Binary ffmpeg
  out.steps.ffmpeg = {
    path: ffmpegPath,
    exists: existsSync(ffmpegPath || ''),
    found: findFfmpeg(),
  }

  // 3. Unduh video 720p per-potongan
  const v = byItag['136'] || byItag['135'] || byItag['134']
  if (v) {
    t = Date.now()
    try {
      const buf = await fetchStreamFast(v.url)
      out.steps.fetchVideo = { ok: true, ms: ms(Date.now() - t), bytes: buf.length, headHex: buf.subarray(4, 8).toString() }
    } catch (e) {
      out.steps.fetchVideo = { ok: false, ms: ms(Date.now() - t), error: String(e.message).slice(0, 200) }
    }
  }

  // 4. Coba remux kecil (1 detik pertama) bila ffmpeg ada
  const ff = findFfmpeg()
  if (ff && out.steps.fetchVideo?.ok) {
    t = Date.now()
    let tmp
    try {
      tmp = await mkdtemp(join(tmpdir(), 'dbg-'))
      const vPath = join(tmp, 'v.mp4')
      await writeFile(vPath, (await fetchStreamFast(v.url)).subarray(0, 512 * 1024))
      const outPath = join(tmp, 'o.mp4')
      await new Promise((resolve, reject) => {
        const p = spawn(ff, ['-hide_banner', '-loglevel', 'error', '-i', vPath, '-t', '1', '-c', 'copy', '-y', outPath])
        let e = ''
        p.stderr.on('data', (d) => { e += d })
        p.on('error', reject)
        p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`exit ${c}: ${e.slice(0, 150)}`))))
      })
      out.steps.remux = { ok: true, ms: ms(Date.now() - t) }
    } catch (e) {
      out.steps.remux = { ok: false, ms: ms(Date.now() - t), error: String(e.message).slice(0, 200) }
    } finally {
      if (tmp) await rm(tmp, { recursive: true, force: true }).catch(() => {})
    }
  }

  res.json(out)
}
