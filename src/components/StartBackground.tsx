/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DiwaliWallpaper } from './DiwaliWallpaper';
import { chooseStartBackground } from '../utils/startBackground';
import { resolveAssetUrl } from '../utils/assetUrl';

interface StartBackgroundProps {
  url?: string | null;
  type?: string;
  dim?: number;
}

/** A video that has its file but no frame by then is treated as unplayable. */
const FIRST_FRAME_TIMEOUT_MS = 10_000;

export const StartBackground: React.FC<StartBackgroundProps> = ({ url, type, dim }) => {
  const choice = chooseStartBackground(url, type, dim);
  const mediaUrl = choice.kind === 'builtin' ? '' : choice.url;
  const kind = choice.kind;
  // State below belongs to one background: naming it here means a new one can't inherit any of it.
  const mediaKey = `${kind}:${mediaUrl}`;

  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [video, setVideo] = useState<{ key: string; src: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const firstFrameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnedKey = useRef<string | null>(null);

  const failed = failedKey === mediaKey;
  const loaded = loadedKey === mediaKey;

  const fail = useCallback((key: string, reason: string) => {
    if (warnedKey.current !== key) {
      warnedKey.current = key;
      console.warn(`[StartBackground] Showing the built-in wallpaper: ${reason}`);
    }
    setFailedKey(key);
  }, []);

  // Coming back to an earlier background starts over.
  useEffect(() => {
    if (warnedKey.current !== mediaKey) warnedKey.current = null;
    setFailedKey((key) => (key === mediaKey ? key : null));
    setLoadedKey((key) => (key === mediaKey ? key : null));
  }, [mediaKey]);

  useEffect(() => {
    if (kind !== 'video') return;

    const controller = new AbortController();
    let objectUrl: string | null = null;

    (async () => {
      try {
        const res = await fetch(resolveAssetUrl(mediaUrl), { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setVideo({ key: mediaKey, src: objectUrl });
      } catch (err: any) {
        if (!controller.signal.aborted) fail(mediaKey, `video fetch failed (${err?.message || err})`);
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      // Revoked, so a return to this same video can't pick it up again.
      setVideo(null);
    };
  }, [kind, mediaUrl, mediaKey, fail]);

  const videoSrc = video?.key === mediaKey && !failed ? video.src : null;

  // Start playback once the blob is attached; a rejected play() falls back to the built-in scene.
  useEffect(() => {
    const el = videoRef.current;
    if (!videoSrc || !el) return;
    let active = true;
    el.play().catch((err) => {
      // Leaving this effect pauses the element, which rejects the play() in progress. That isn't a failure.
      if (active) fail(mediaKey, `video play rejected (${err?.name || err})`);
    });
    firstFrameTimer.current = setTimeout(() => {
      // Frame callbacks stop in a hidden tab, so a video with its data in hand still counts.
      if (el.readyState >= el.HAVE_CURRENT_DATA) setLoadedKey(mediaKey);
      else fail(mediaKey, `video gave no frame in ${FIRST_FRAME_TIMEOUT_MS / 1000} s`);
    }, FIRST_FRAME_TIMEOUT_MS);
    return () => {
      active = false;
      if (firstFrameTimer.current) clearTimeout(firstFrameTimer.current);
      el.pause();
      el.removeAttribute('src');
      el.load();
    };
  }, [videoSrc, mediaKey, fail]);

  const handleVideoLoaded = (el: HTMLVideoElement) => {
    // An audio-only file loads without an error, and has no picture to show.
    if (el.videoWidth === 0) {
      if (firstFrameTimer.current) clearTimeout(firstFrameTimer.current);
      fail(mediaKey, 'video has no playable video track');
      return;
    }
    // A file cut short can report loaded with no frame to show, so wait for one where the browser can say.
    const frameShown = () => {
      if (firstFrameTimer.current) clearTimeout(firstFrameTimer.current);
      setLoadedKey(mediaKey);
    };
    if (el.requestVideoFrameCallback) el.requestVideoFrameCallback(frameShown);
    else frameShown();
  };

  const showMedia = choice.kind !== 'builtin' && !failed;
  const opacity = choice.kind !== 'builtin' ? choice.dim / 100 : 0;

  return (
    <div className="fixed inset-0 bg-[#0A0713]" aria-hidden="true">
      {/* Built-in scene: default, and shown while loading and after any error */}
      <DiwaliWallpaper />
      {showMedia && choice.kind === 'image' && (
        <img
          key={mediaKey}
          src={resolveAssetUrl(choice.url)}
          alt=""
          // Hidden until complete: it paints as it downloads, and the dim waits for onLoad.
          className={`absolute inset-0 w-full h-full object-cover ${loaded ? '' : 'opacity-0'}`}
          onLoad={() => setLoadedKey(mediaKey)}
          onError={() => fail(mediaKey, 'image failed to load')}
        />
      )}
      {showMedia && choice.kind === 'video' && videoSrc && (
        <video
          ref={videoRef}
          src={videoSrc}
          muted
          loop
          playsInline
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
          onLoadedData={(e) => handleVideoLoaded(e.currentTarget)}
          onError={() => fail(mediaKey, 'video failed to decode')}
        />
      )}
      {/* Waits for the media: the dim is never for the built-in underneath */}
      {showMedia && loaded && (
        <div className="absolute inset-0 bg-black" style={{ opacity }} />
      )}
    </div>
  );
};
