![KeroTranslate Beta — live captions, comment translation and meaning check for Chrome](docs/assets/kerotranslate-banner.png)

# 🐸 KeroTranslate

[日本語](README.jp.md)

[Website](https://kurayan.github.io/KeroTranslate/) · [Privacy policy](https://kurayan.github.io/KeroTranslate/privacy.html)

Live captions and comment translation for YouTube Live, built as a Chrome extension for English and Japanese viewers.

Follow a stream with original and translated captions. Draft a comment, translate it, and use back-translation to check its meaning before inserting it into YouTube's chat input.

**INSERT only fills the chat input. It never sends a message. You review and post it yourself.**

Current version: **Beta 0.2** (October 9, 2026).

## Install the beta

**KeroTranslate is still in beta. For this release, enable Chrome's Developer mode and load the unpacked extension using the steps below.**

1. Open [Download Chrome extension ZIP](https://github.com/kurayan/KeroTranslate/releases/tag/v0.2.0-beta) and download **KeroTranslate-Extension.zip** under **Assets**. Extract it to a folder you will keep. Alternatively, use the repository's `extension/` folder.
2. Open `chrome://extensions` in Chrome 116 or later.
3. Enable **Developer mode** in the upper-right corner.
4. Click **Load unpacked** and select the folder that directly contains `manifest.json`.
5. Open or reload a YouTube Live watch page with live chat available.
6. Open KeroTranslate's toolbar popup, then **Settings & API keys**. The main panel's gear button opens the same settings.
7. Choose your speech recognition and translation providers, enter your own API keys, and save. Check that the configured model IDs are available to your account.
8. On that YouTube tab, open the toolbar popup and press **Start captions**. You can close the popup once capture starts. **Stop** is available in both the popup and the main panel.

There is no Demo mode or bundled sample preview in this release. The initial selections are **Deepgram** for speech recognition and **Gemini** for translation. API keys are required; no provider account or API credit is included. Installing the extension does not start capture automatically.

Chrome requires you to invoke the extension on the target tab before tab audio capture can start. Start from the toolbar popup on a new tab. The extension captures that tab's audio, not your microphone.

### Update an existing installation

1. Stop captions, then replace the files in the folder Chrome currently loads.
2. Click **Reload** for KeroTranslate in `chrome://extensions`.
3. Reload the YouTube page as well.
4. Restart captions from the toolbar popup. Saved API keys are retained in the same Chrome profile and extension installation.

**Saved API keys survive Chrome restarts and extension reloads.** They are stored locally in this Chrome profile, not synced to other devices. Use **Delete all API keys** in Settings to remove them. Removing the extension or clearing its data removes saved keys. Saving settings still stops the current audio session. Keep the same unpacked installation folder when updating; loading another folder may create a separate extension installation.

When upgrading from 0.1.10 or earlier, any remaining session keys are migrated. If the old version's session keys were already cleared during the update, enter and save them once in the new version.

Saved language preferences are preserved. Old `demo` provider selections are normalized to Deepgram/Gemini; configure the corresponding keys or select different providers before use.

## Providers and API keys

Speech recognition and translation are independent. For example, you can combine OpenAI speech recognition with DeepL translation. Comment translation and back-translation use the same selected translation provider and model.

**Tested using Deepgram free credits and the Gemini free tier.** [Get and set up your API keys: a beginner guide](docs/API-KEYS.md), including free-usage limits and conditions.

| Provider | Speech recognition | Translation / back-translation | Configuration |
|---|---|---|---|
| Deepgram | Nova-3 | — | Deepgram API key |
| Gemini | — | Supported | Gemini API key and model ID |
| OpenAI | `gpt-live-transcribe` | Supported | OpenAI API key; default translation model `gpt-4.1-mini` |
| DeepL | Voice API, requiring an eligible paid account | API Free / API Pro | DeepL API key and matching translation plan |
| DeepSeek | — | Supported | DeepSeek API key; default model `deepseek-flash` |

The default Gemini model ID is `gemini-3.5-flash-lite`. These are implementation defaults, not guarantees of model availability. Verify access, region, quota and billing in your provider account. A ChatGPT or DeepL website subscription is separate from API access.

The adapters added in 0.1.6 remain experimental: their request/response handling has offline test coverage, but live accounts, translation quality and end-to-end latency have not all been validated. See the [provider integration notes](docs/PROVIDERS-0.1.6.md).

- OpenAI speech recognition shows partial text before finalization. Its experimental local endpointing commits after about 600 ms of quiet, or at approximately eight seconds of continuous sound. This is an amplitude heuristic; music and quiet speech can affect it. The thresholds are not user-configurable yet.
- DeepL's API Free/Pro selection controls text translation, not Voice eligibility. Voice requests source transcription only; translation is a separate request.
- DeepSeek is available for text translation only. The adapter disables Thinking and accepts only completed response content.
- Settings show fields for the selected providers. Switching providers preserves other saved keys. **Delete all API keys** clears them together.

## Live captions

- **Partial:** show provisional source text in a dim color with an ellipsis. Revisions update the same segment.
- **Final:** show confirmed source text normally, then request translation. Partial updates do not trigger translation API calls.
- Keep the previous translation and its original visible while displaying a new recognition segment separately. A delayed translation does not erase newer partial text.
- Start the reading timer after translation arrives. Keep the caption while the next translation is pending; replace it when the new translation arrives.
- When translation falls behind, finish the active segment and keep only the newest waiting segment. Intermediate segments can be skipped; this is not a complete transcript recorder.

Under **Settings → 03 / Captions**:

| Setting | Choices / default |
|---|---|
| Show | Original + MTL (default), Original only, MTL only |
| Caption size | 75 / 100 / 125 / 150 / 200%; default 100% |
| Keep captions after translation | 5 / 7 / 10 / 15 / 20 seconds; default 5 |
| Maximum lines per language | 1 or 2; default 2, including provisional text |
| Position | Nine anchors in a 3×3 grid; default bottom-center |

The five-second reading time starts when the translation arrives. If captions disappear before you finish reading, try 7–10 seconds, or 15–20 seconds for longer passages. New translations can replace the current caption sooner, and waiting for the next translation can keep it visible longer. This setting controls display time, not translation speed or request frequency. Saved display preferences are preserved; existing users can select five seconds manually.

Partial text is visible in Original + MTL and Original only. MTL only hides the original. Original only does not call the caption translation API; its timer starts from the original-text update.

Under **Settings → 02 / Languages**, **Speech language** describes the stream audio and **Translate captions into** selects caption output. These are independent of the comment composer's direction. For a Japanese stream, you can explicitly choose Japanese. Mixed-language recognition is experimental.

## Draft and translate comments

The initial **Composer original language** setting is **English → Japanese**. Existing saved preferences are preserved. Change and save the default under **Settings → 02 / Languages**. The main panel uses the green-and-white frog icon and displays the beta version.

1. Type into **Original** and choose EN → JA or JA → EN.
2. Review **MTL** and **re-MTL**, the back-translation used as a meaning check. Back-translation does not guarantee accuracy.
3. Edit the current MTL if necessary; this regenerates re-MTL.
4. Click **INSERT** beside Original or MTL. MTL insertion is enabled only when the latest back-translation finishes.
5. Review the draft in YouTube and send it yourself.

If YouTube already has a draft, choose **Replace draft** or **Keep draft**. Repeated insertion does not duplicate identical text. The insertion limit is 200 JavaScript string units, a conservative limit that may differ from YouTube's counting of emoji. Translation waits during Japanese IME composition, and stale responses cannot replace newer input.

A full-width animated green bar below the panel header indicates comment translation or back-translation, including time spent waiting in the shared queue. It remains visible while minimized and disappears on completion, cancellation or failure. It indicates activity, not completion percentage. Reduced-motion preferences replace the animation with a static striped indicator.

## Quick timing controls

The header's **−** button minimizes the panel; **+** restores it. Drafts, translations and active captions continue while minimized. This view preference lasts until the panel is remounted or the page is reloaded.

**Retry all** is always present below re-MTL and becomes available when Original contains text (except during IME composition). It cancels the previous comment operation and restarts both translation and meaning check from the current Original, replacing any manually edited MTL. Use it if either stage fails or appears stuck. It does not bypass provider cooldowns. An unresponsive comment operation times out after two minutes. Error messages in the panel and popup stay visible for at least one second before subsequent updates replace them.

The two controls at the **upper-right of the main panel** adjust different things. If you are unsure, start with **Request gap: 1 s / Caption hold: 5 s**. Here, **s** means seconds.

| Panel control / same setting in Settings | What it changes | Default / choices | When to adjust it |
|---|---|---|---|
| **Request gap** / **Minimum interval between translation requests** | Minimum time between the starts of requests sent to your translation service. Applies to captions, comment translation and re-MTL (back-translation). | **1 s** / 0.5, 1, 2, 4, 6, 12 s | Increase it if requests are being sent too often and rate-limit errors occur. Reducing a long gap may shorten waiting, but does not make the service itself translate faster. |
| **Caption hold** / **Keep captions after translation** | How long a translated caption remains visible, counted from when the translation arrives. | **5 s** / 5, 7, 10, 15, 20 s | Try **7 or 10 s** if captions disappear before you finish reading, or **15 or 20 s** for longer passages. This does not change request frequency or translation speed. |

| What you notice | What to try |
|---|---|
| Captions disappear too quickly | Increase **Caption hold**. New translations can still replace the caption sooner; waiting for the next translation can keep it visible longer. |
| Comment translation or re-MTL takes a long time | Check **Request gap**. If it is 6 or 12 s, try a shorter value within your provider's allowance. Network delays and the service's processing time can still cause waiting. |
| A rate-limit error appears | Wait for the indicated delay, then increase **Request gap** to 2 or 4 s; use 6 or 12 s for stricter limits. If your usage allowance is exhausted, check the provider's usage page: spacing alone will not restore it. |

Select a value in the main panel to save it automatically. Both controls share their values with Settings and other YouTube tabs, and wrap to the next row in narrow panels. Adjusting them here keeps captions running and preserves your draft and edited translation. Request gap applies to waiting requests without interrupting an active request or clearing a service-imposed pause. Caption hold applies when the next caption reading timer starts. Updates preserve saved values, so an existing installation may differ from the defaults above.

## Shared request scheduling

Caption translation, comment translation and back-translation share a background queue per translation provider. Only one translation HTTP request runs at a time per provider. Waiting comments have priority; an active caption request finishes first. Speech recognition streams are separate from this queue.

Each comment's translation and back-translation now hold one queue slot together, with the configured request gap between HTTP calls. Captions cannot slip between these stages. Editing MTL runs only its meaning check; Retry all restarts both stages. Cancelled or superseded results cannot overwrite the current draft.

After other caption translation failures, recognition continues while new translation attempts pause for 1–10 seconds, increasing with consecutive failures. New speech during the pause is skipped for translation; fresh segments resume afterward. Only the active and newest waiting caption are retained. The shared queue also rejects excess waiting work without resetting healthy jobs or provider cooldowns. No overflow-count reset setting is required for the browser timer failure fixed in this release.

A **request** is one call to the translation service (API). A normal comment uses **two requests: translation + re-MTL**. Captions use the same allowance. **Request gap** in the panel and **Minimum interval between translation requests** in Settings are the same setting.

| Request gap | Approximate maximum request starts per minute* | Choosing a value |
|---|---:|---|
| **0.5 s** | 120 | Shortest spacing; use only if your provider allowance supports the higher request rate. |
| **1 s — default** | 60 | Starting point for shorter waits. Check your provider's allowance. |
| **2 s** | 30 | First step to reduce request frequency if 1 s triggers rate limits. |
| **4 s** | 15 | Further reduces request frequency, with more waiting between translation and re-MTL. |
| **6 s** | 10 | For stricter request limits; comment completion can take noticeably longer. |
| **12 s** | 5 | Widest spacing; prioritize a low request rate over responsiveness. |

*These are spacing-based estimates (60 seconds ÷ gap), **not your plan's allowance or a guaranteed number of completed translations**. Only one request runs at a time per provider; slow responses and temporary pauses reduce throughput. Shorter gaps may increase usage and cost. Daily usage limits and limits based on text volume can still apply. A 1 s gap does not mean your translation will arrive in 1 s.

After HTTP 429 or 456, that provider pauses according to Retry-After, capped at 24 hours, or for 30 seconds if no usable value is returned. Failed and queued work is not automatically replayed. Retry a comment after the indicated delay; captions resume with new recognition segments. Stop, input changes and key deletion cancel unneeded pending work.

This addresses concurrency and bursts, not daily quotas, token limits or other apps sharing the same API project. Reloading the extension or restarting its worker resets the queue and cooldown. See [Gemini's rate-limit documentation](https://ai.google.dev/gemini-api/docs/rate-limits).

## Troubleshooting

| Symptom | Check |
|---|---|
| Illegal invocation during re-MTL | Update to 0.1.15 or later, reload the extension, then reload YouTube. If it recurs, report the stage in the panel and the queue stack trace |
| Extension context invalidated | A previously loaded script lost its extension connection. The new handler stops further sends and retains the visible draft; copy it before reloading YouTube |
| No main panel | Open live chat on a normal YouTube Live watch page and reload YouTube |
| Overlay initialization error | Wait for the video to load; reload YouTube after updating the extension, then start from the toolbar |
| No captions | Use **Test overlay** in the popup to check display with a fixed caption, without audio or provider requests |
| LISTENING but no transcript | Check stream audio, Speech language and provider usage; connected status alone does not prove recognition |
| Prompt to open the toolbar icon | Invoke the extension on the current tab and start from its popup |
| NO_SPEECH | No recognition results have arrived for 15 seconds; this does not measure actual silence |
| INSERT unavailable | Check sign-in, chat permissions and input availability; YouTube DOM changes can affect detection |
| Missing key after an update | Check that you updated the same installation in the same Chrome profile. Upgrading from session-only versions may require one final entry; save it in Settings |
| Old Demo settings | Select real providers and configure their keys; Demo was removed in Beta 0.1.10 |

**Test overlay is a display diagnostic, not a Demo provider or a translation mode.**

## Keys and data

- Keys are held in `chrome.storage.local`, restricted to trusted extension contexts. They are not returned to content scripts or placed in YouTube's DOM, and are not sent to Chrome Sync. Local extension storage is not an encrypted credential vault. Capture state and usage metrics remain session-only.
- Tab audio goes to your selected Deepgram, OpenAI or DeepL speech provider. Comment text, translations and caption transcripts go to the selected translation provider.
- KeroTranslate has no separate collection server, analytics SDK or translation-history storage.
- Deepgram requests include `mip_opt_out=true`. Data policies, free allowances and charges depend on each provider and your agreement.
- There is no automatic switch to another paid provider. Work already sent can remain billable after Stop.

## Validation and limitations

The user has reported working captions. Offline tests cover state transitions, cancellation, provider requests, chat insertion, permission boundaries and request scheduling. Those tests do not prove live API operation or browser rendering. No live chat message has been posted by the development workflow.

The current UI still needs end-to-end checks in Chrome, including INSERT, fullscreen, theater mode and pop-out chat. Mixed-language quality, latency and cost need measurement with actual accounts. See [acceptance and testing](docs/ACCEPTANCE.md).

Configurable VAD thresholds, merging following utterances, entity normalization, per-stage latency visualization, full transcripts and OBS integration are not implemented.

## Development

There are no runtime dependencies to install and no bundler requirement. Node.js 22 or later is recommended for development commands.

```powershell
node tools/sync-version.js
node --test tests/*.test.js
node tools/check.js
./tools/package.ps1
```

`sync-version.js` reads the extension manifest and updates the beta labels, using `version_name` when present and `version` otherwise. The package script runs it automatically before building the ZIP. Update `package.json` and `extension/manifest.json` together. Test doubles live in `tests/`; they are not shipped as providers. The old standalone Demo preview and its build/serve tools have been removed.

| Location | Contents |
|---|---|
| `extension/` | Unpacked Chrome extension |
| `tests/` | Offline state, provider, audio, queue and YouTube adapter tests |
| `tools/` | Version-label synchronization, checks and ZIP packaging |
| `artifacts/` | Extension ZIP; local artwork may also exist in a development workspace |
| [Design](docs/DESIGN.md) | Architecture and historical design decisions |
| [Acceptance](docs/ACCEPTANCE.md) | Real-browser checks and remaining validation |
| `docs/reference/` | Original design handoff, retained as historical reference |

English is the primary documentation language. Each document links to a corresponding `.jp.md` Japanese version. Historical notes describe their original releases; use this README for current installation instructions.

## Changelog

- **Beta 0.2:** Promote the current beta to the 0.2 milestone (extension/package version `0.2.0`). Update release labels and the distribution ZIP; functionality and saved settings are unchanged from 0.1.17.

- **Beta 0.1.17:** Start back-translation without waiting for the YouTube frame to acknowledge the MTL progress notification. Keep request spacing, provider cooldowns, two separate translation requests and the 650 ms typing debounce unchanged. See the [latency experiment](docs/LATENCY-0.1.17.md) for simulated results and limits.

- **Beta 0.1.16:** Address both 0.1.15 code-review findings: bind native fetch to the browser global in OpenAI/DeepL speech recognition, and update the queue immediately when request spacing is saved from Settings. Both longer and shorter intervals apply to the next request while provider cooldowns remain in force.

- **Beta 0.1.15:** Explicitly bind native queue timers to the browser global, including supplied timer functions. Catch failures inside back-translation wait callbacks and queued dispatch so promises settle and later work can recover. Add stage-specific Illegal invocation diagnostics. Stop stale content scripts after extension-context invalidation, preserving the visible draft and showing a reload instruction.

- **Beta 0.1.14:** Add a full-width indeterminate activity bar for comment translation and back-translation, visible while minimized and with reduced-motion support.

- **Beta 0.1.13:** Fix browser timer invocation causing `Illegal invocation` and stalled translation queues. Keep comment translation and back-translation together; add permanent Retry all, caption failure backoff, minimum one-second error visibility, panel minimization and live Request gap / Caption hold controls. Preserve drafts, saved settings and provider cooldowns.

- **Beta 0.1.12:** Default translation request spacing to one second and caption retention after translation to five seconds. Preserve saved preferences and add tuning advice.

- **Beta 0.1.11:** Persist API keys locally across Chrome restarts and extension reloads. Migrate remaining legacy session keys, retain trusted-context access restrictions, and remove saved credentials with Delete all API keys.

- **Beta 0.1.10:** Remove Demo providers, sample controls and standalone preview distribution. Default to Deepgram/Gemini with API-key requirements. Publish English-first documentation with Japanese counterparts and beta Developer mode installation instructions.
- **Beta 0.1.9:** Default comment translation to English → Japanese; replace the panel icon with the green-and-white frog; replace LOCAL PoC labels with the beta version synchronized during packaging.
- **0.1.8:** Share a translation queue across captions, comments and back-translation, with comment priority, request spacing and cooldowns.
- **0.1.7:** Restore popup Start/Stop, tab-scoped state and overlay retry/reconnection.
- **0.1.6:** Add OpenAI STT/translation, DeepL Voice/text translation and DeepSeek translation.
- **0.1.5:** Standardize the KeroTranslate name and documentation.
- **0.1.4:** Show dim partial captions and preserve newer recognition alongside delayed translation.
- **0.1.3:** Fix current YouTube input detection and add main-panel capture controls.
- **0.1.2:** Preserve pending captions and add size/reading-time settings.
- **0.1.1:** Retry overlay initialization and add Test overlay.
- **0.1.0:** Initial captions, comment translation and back-translation proof of concept.


### Captions without translation

In Settings, select **Captions → Caption mode → Transcription only (no translation)**, save, then press **Start captions** in the main panel. Only a speech recognition API key is required. Interim and final speech appear in the original language; caption translation requests are skipped. Speech recognition service charges and limits still apply. Comment translation and re-MTL remain separate and require a translation API key.


### 0.2.3 — 2026-10-21

Updated the extension name to “Kero Translate - YouTube Live Translation & Comment Assist”. The toolbar now uses the original frog image without the extra store-icon padding. Settings also include API key setup guide links and clearer guidance for transcription-only captions.
