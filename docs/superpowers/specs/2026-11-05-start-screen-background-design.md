# Start Screen Background: Design

## Goal

The kiosk start screen (QR code and keypad) sits on a near-black background. An admin should be able to replace it with an image or a video from the admin panel, in both the native Android app and the web kiosk.

**Decided with Ajay**
- Image and video uploads are both allowed.
- It applies to the start screen only.
- With no custom background, the start screen shows the built-in wallpaper.

**Assumed**
- Video plays muted and loops.
- One background at a time, with no playlist or rotation.

**Done when**
- An admin uploads an image or MP4, previews it and sets it, and both apps show it on the start screen.
- Removing it brings the built-in wallpaper back.
- A broken or unplayable file falls back to the built-in wallpaper, never to a black screen or a crash.
- No video is decoding once a round starts, so hand tracking is unaffected.
- The QR code still scans and the keypad stays readable over any background.

**Out of scope**
- Video in-game wallpapers. The in-game wallpaper system is unchanged and stays image only.
- Video on the game-over or photo screens.
- Server-side transcoding or codec inspection.
- Streaming with HTTP range requests.

## Settings

Three new optional fields on `SystemSettings`, in `src/types/backend.ts` and `core/model/.../Backend.kt`, with defaults in the JSON and Mongo adapters:

| Field | Type | Default | Meaning |
|---|---|---|---|
| `startBackgroundUrl` | string or null | null | The asset to show. Null means built-in. |
| `startBackgroundType` | `'image'` or `'video'` | `'image'` | How to render it, stored so clients needn't sniff the file. |
| `startBackgroundDim` | number, 0–80 | 50 | Black overlay percentage on a custom background. Not applied to the built-in wallpaper. |

Clients treat an unknown `startBackgroundType` as image. Older clients ignore these fields, because the native JSON parser already ignores unknown keys.

## Server

**New asset category `start_backgrounds`** in `AssetCategory`, `CATEGORY_RULES` and the key prefix map:
- Images: JPG, PNG or WebP, up to 15 MB.
- Video: MP4 (`video/mp4`, `.mp4`), up to 40 MB.

Keeping it separate from `wallpapers` keeps videos out of `wallpaperPlaylist`, so in-game clients never receive one.

**Validation**
- `CategoryValidationRules` has one size cap per category, so add an optional per-MIME cap for the image and video limits above.
- `verifyMagicBytes` gains an MP4 check: `ftyp` at byte offset 4.
- Raise the shared multer limit from 16 MB to 40 MB. Every other category is still held to its own lower cap by `CATEGORY_RULES`.

**Delete guard:** the asset delete route already refuses an asset assigned to `brandLogoUrl` or `wallpaperUrl`. Add `startBackgroundUrl`.

**Delivery:** `/api/assets/:id/content` answers a matching `If-None-Match` from asset metadata, without reading storage. GridFS and local files stream to the response with backpressure; S3 and GCS still buffer behind the same interface. Both clients download the file once and play it locally, so range requests aren't needed.

**Known limit:** uploads are still held in server memory by multer, so each 40 MB upload uses about 40 MB of RAM while it runs. That needs checking on the production server (see Testing).

## Admin panel

A new "Start screen background" card at the top of the Wallpapers tab in `BrandingSection.tsx`. That is the live admin screen; `WallpapersSection.tsx` isn't rendered anywhere.
- Shows the current background, or "Built-in wallpaper" if none is set.
- One file picker accepts images and MP4. Before uploading, the browser tries to load the file. If it can't be decoded, the upload is refused with a message advising 1080p H.264 MP4.
- A preview is shown at 16:9 with the dim applied, because the kiosk crops to fill the screen.
- A dim slider, from 0 to 80%.
- **Set as background** and **Remove (use built-in)** buttons.
- Replacing or removing a background deletes the old asset once the setting has moved away from it, so storage doesn't fill up.

Uploads need superadmin or operator, as today, but changing settings is superadmin only. Non-superadmins see the card read-only.

## Web kiosk

A new `StartBackground` component, rendered inside `KioskStartupScreen`, replaces the screen's solid `bg-[#0A0713]` and its two ambient glows:
- **None set:** the built-in scene from `DiwaliWallpaper`.
- **Image:** `object-cover`, plus the dim overlay. Built-in on load error.
- **Video:** built-in until ready. The file is fetched once as a blob and played from an object URL with `muted`, `loop`, `playsInline` and `autoPlay`, plus the dim overlay, and `object-cover`. Built-in on fetch, decode or play error.
- On unmount or URL change: pause, abort any fetch in progress and revoke the object URL. The video is gone as soon as a round starts, since this screen unmounts.

`useBranding`'s 8-second polling carries changes to an idle kiosk. The QR and keypad panels stay solid.

## Native app

**Assets:** `SettingsRepository` adds `startBackgroundUrl` to the URLs it caches, so `AssetCache` downloads the file (its 120 s call timeout covers 40 MB on a normal connection). The video is played only from the cached file. Until that's ready, the built-in shows.

**Rendering**
- `backdropFor` currently returns `Dark` for `GamePhase.Startup`. It returns a new `BackdropKind.StartBackground` instead.
- `BackdropSurfaceView` draws this as the built-in scene (`drawWallpaper` with no image) or the image cropped to fill, with the dim.
- `StartScreen` drops its opaque `Palette.Background` and ambient glows so the backdrop shows through.

**Video**
- A new `StartVideoSurface` is a separate `SurfaceView` driven by a Media3 ExoPlayer: muted, repeat-one, crop to fill. It exists only while the phase is Startup and the type is video.
- Media3 is already in `core:audio`; add it to `app`.
- The dim for video is a translucent Compose layer in `StartScreen`.
- Leaving Startup releases the player before the round's camera and tracking need the hardware. Pausing the activity releases it too.
- Stacking order with the backdrop and game surfaces has to be proven on the emulator first, as the riskiest part of the native work. The backdrop keeps drawing the built-in underneath, so if the video never appears, the screen still looks right.
- Any player error releases the player and leaves the built-in showing.

**Cache:** old cached files aren't evicted when a background is replaced. A few replaced videos cost a few hundred MB at most on an 8 GB device, so this is accepted for now.

## Failure behaviour

| Situation | Result |
|---|---|
| No background set | Built-in wallpaper |
| Server unreachable, file not yet cached | Built-in wallpaper |
| File missing or fails to decode | Built-in wallpaper; logged in the client |
| Video uses a codec the device can't play (for example H.265) | Built-in wallpaper; the admin's browser check catches most of these first |
| Upload too large or the wrong type | Clear error in the admin card; nothing changes |
| Delete an asset that's in use | Refused, as for other assigned assets |
| Player starts a round while the video is playing | Video stops immediately; the round isn't delayed by it |

## Relation to the in-game wallpaper

The `useBuiltInWallpaper` setting (commit `be79268`) controls gameplay only, and `startBackground*` controls only the start screen. Neither affects the other. The preview reuses `DiwaliWallpaper`'s `contained` prop.

## Testing

- **Server** (`tests/assets-api.test.ts`):
  - A valid MP4 is accepted.
  - A file named `.mp4` without `ftyp` is rejected.
  - An image over 15 MB and a video over 40 MB are rejected.
  - Other categories still reject over their own caps.
  - An assigned start background can't be deleted.
  - Videos don't appear in `wallpaperPlaylist`.
- **Native unit tests:** `backdropFor` in Startup, `SettingsRepository` caching the new URL, and unknown type treated as image.
- **Native emulator (`diwali_tv_34`):** built-in, image and video each show, with correct stacking. A corrupt file falls back. The player is released on leaving Startup.
- **Web, in a browser:** the same cases, with no blob URL left behind after leaving the screen.
- **Upload test:** upload and download a 40 MB file against a local throwaway server.
- **Needs the real device or production, for you to check after install:**
  - A 40 MB transfer on the Render server through the Vercel rewrite. It only works after Ayush pushes, since deploys depend on that push.
  - Video smoothness on the TV, and tracking feel straight after a video start screen.
  - QR scanning from a phone over a busy background.

## Rollout

The server change comes first, because clients ignore fields they don't get and show the built-in until then. The web kiosk updates on deploy. The native app needs a new APK on the TV, installed only when asked.
