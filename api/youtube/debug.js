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
  getSaveTubeVideo,
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

/** Baca maksimal maxBytes dari body, lalu batalkan; laporkan byte terbaca. */
async function readSome(res, maxBytes) {
  try {
    const reader = res.body.getReader()
    let got = 0
    while (got < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      got += value.length
      if (got >= maxBytes) await reader.cancel().catch(() => {})
    }
    return got
  } catch (e) {
    return -1
  }
}

/**
 * GET /api/youtube/debug?url=...
 * Diagnostik v2: uji berbagai strategi pengambilan video dari serverless
 * (googlevideo menolak/mengosongkan respons untuk IP datacenter) plus
 * sumber alternatif savetube.
 */
export default async function handler(req, res) {
  const url = String(req.query.url || 'https://youtu.be/FIqdZatWQUY')
  const out = { url, region: process.env.VERCEL_REGION || null, steps: {} }

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
  const v = byItag['136'] || byItag['135'] || byItag['134'] || byItag['18']
  if (!v) return res.json(out)

  // --- Strategi A: GET polos tanpa Range ---
  try {
    t = Date.now()
    const a = await fetch(v.url)
    out.steps.plainGet = {
      status: a.status,
      contentType: a.headers.get('content-type'),
      contentLength: a.headers.get('content-length'),
      bytes: await readSome(a, 1024 * 1024),
      ms: ms(Date.now() - t),
    }
  } catch (e) {
    out.steps.plainGet = { error: String(e.message).slice(0, 150) }
  }

  // --- Strategi B: Range + header browser ---
  try {
    t = Date.now()
    const b = await fetch(v.url, {
      headers: {
        Range: 'bytes=0-999999',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        Referer: 'https://www.youtube.com/',
        Origin: 'https://www.youtube.com',
      },
    })
    out.steps.rangeBrowser = {
      status: b.status,
      contentRange: b.headers.get('content-range'),
      bytes: await readSome(b, 1024 * 1024),
      ms: ms(Date.now() - t),
    }
  } catch (e) {
    out.steps.rangeBrowser = { error: String(e.message).slice(0, 150) }
  }

  // --- Strategi C: fetchStreamFast (chunked paralel, kode produksi) ---
  try {
    t = Date.now()
    const buf = await fetchStreamFast(v.url)
    out.steps.chunked = { bytes: buf.length, ms: ms(Date.now() - t) }
  } catch (e) {
    out.steps.chunked = { error: String(e.message).slice(0, 150) }
  }

  // --- Strategi D: savetube (server pihak ketiga menarik video) ---
  try {
    t = Date.now()
    const stUrl = await getSaveTubeVideo(url)
    if (!stUrl) {
      out.steps.savetube = { ok: false, error: 'tidak mendapat URL' }
    } else {
      const d = await fetch(stUrl)
      out.steps.savetube = {
        ok: d.ok,
        status: d.status,
        contentLength: d.headers.get('content-length'),
        bytes: await readSome(d, 1024 * 1024),
        ms: ms(Date.now() - t),
      }
    }
  } catch (e) {
    out.steps.savetube = { error: String(e.message).slice(0, 150) }
  }

  out.steps.ffmpeg = { found: findFfmpeg() }
  res.json(out)
}
