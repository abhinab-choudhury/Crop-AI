# On-Device Models in Crop AI

Everything the mobile app "knows" at inference time runs **on the phone itself**. No inference
API is called at runtime; the only network traffic the AI features make is the **one-time
download** of a model file. After that, chat, photo understanding and plant-disease
detection are fully offline.

- App: `apps/native` (Expo 54 / React Native 0.81, TypeScript, NativeWind).
- Two independent on-device engines:
  1. **`llama.rn`** (llama.cpp bindings) - large language models for chat, vision (image
     understanding) and AI-generated chat titles.
  2. **`onnxruntime-react-native`** - a ResNet9 convolutional network for 38-class plant
     disease classification.

Both engines are native modules, so they require a **custom dev client / standalone APK**.
They do **not** run in Expo Go.

---

## 1. Model inventory

### 1.1 Language / vision models (`lib/llm.ts`)

Defined in the `LLM_MODELS` array. All are **GGUF** files (llama.cpp quantized format),
downloaded from Hugging Face and mmap'd into memory.

| id (`LlmModelId`)        | Label          | Files on disk                                                                   | Approx size                 | `sizeBytes`                            | Context (`n_ctx`) | Vision  |
| ------------------------ | -------------- | ------------------------------------------------------------------------------- | --------------------------- | -------------------------------------- | ----------------- | ------- |
| `qwen2.5-0.5b`           | Qwen 2.5 0.5B  | `qwen2.5-0.5b-instruct-q4_k_m.gguf`                                             | ~0.5 GB                     | 491,400,032                            | 2048              | no      |
| `qwen2.5-1.5b` (default) | Qwen 2.5 1.5B  | `qwen2.5-1.5b-instruct-q4_k_m.gguf`                                             | ~1 GB                       | 1,117,320,736                          | 2048              | no      |
| `qwen2.5-vl-3b`          | Qwen 2.5-VL 3B | `Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf` + `mmproj-Qwen2.5-VL-3B-Instruct-f16.gguf` | ~3.1 GB (backbone + vision) | 1,934,123,648 (+ 1,240,000,000 mmproj) | 4096              | **yes** |

- Default quantization is **Q4_K_M** (best quality/size trade-off for CPU inference).
- The **vision** model is a two-file bundle: the text backbone GGUF plus the **mmproj**
  projector GGUF, which llama.cpp's multimodal path uses to encode images into the model's
  embedding space.
- A vision model counts as `downloaded` **only when both files exist and are at least 99%
  of their expected byte size** (`getModelDownloadInfo`).
- `DEFAULT_MODEL_ID = 'qwen2.5-1.5b'`. `getReadyModelId()` returns the selected model if it
  is actually on disk, else _any_ downloaded model, else `null`.

Default source URLs (each overridable via env var, see section 7):

```
https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf
https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf
https://huggingface.co/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf
https://huggingface.co/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/mmproj-Qwen2.5-VL-3B-Instruct-f16.gguf
```

### 1.2 Disease classifier (`lib/disease-detection.ts`)

| Property             | Value                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format               | **ONNX** (`onnxruntime-react-native`)                                                                                                                       |
| Architecture         | ResNet9 (9 conv layers, 2 residual blocks); training history is in `MODELS.md`                                                                              |
| Parameters           | ~11.2M                                                                                                                                                      |
| Input                | `float32[1, 3, 256, 256]` (CHW, RGB normalised to `[0,1]`)                                                                                                  |
| Output               | 38 logits -> softmax -> PlantVillage class                                                                                                                  |
| Classes              | 38 (14 plant species), list in `DISEASE_CLASSES`                                                                                                            |
| Confidence threshold | `isConfident = confidence >= 0.4`                                                                                                                           |
| Default URL          | `https://github.com/abhinab-choudhury/Crop-AI/releases/download/plant-disease-model/resnet9_plant_disease.onnx` (override: `EXPO_PUBLIC_DISEASE_MODEL_URL`) |
| Filename             | `resnet9_plant_disease.onnx`                                                                                                                                |

---

## 2. Where models live on disk

All models are stored under the app's **document directory** (never the cache directory, so
the OS cannot delete them under storage pressure):

```
${Paths.document}/models/
|-- qwen2.5-0.5b-instruct-q4_k_m.gguf        # LLM backbone (0.5B)
|-- qwen2.5-1.5b-instruct-q4_k_m.gguf        # LLM backbone (1.5B, default)
|-- Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf       # vision backbone
|-- mmproj-Qwen2.5-VL-3B-Instruct-f16.gguf   # vision projector (mmproj)
|-- resnet9_plant_disease.onnx               # disease classifier
|-- resnet9_plant_disease.onnx.part          # in-progress download (never counted as cached)
```

The active LLM choice is persisted in the local SQLite settings table under the key
`llm.model` (`SETTING_MODEL` in `lib/llm.ts`). Chats live in `threads` / `messages`
(section 6.3).

---

## 3. The download pipeline

Both features download models with the **same technique**, implemented separately in each
module so neither depends on the other.

### 3.1 Why not `File.downloadFileAsync`?

The old disease-model downloader used `File.downloadFileAsync` plus a `setInterval` poll of
the destination file size. Problems:

1. **Progress is inaccurate/laggy** - file size only grows when a buffer flushes, and the
   total came from a single `HEAD` request that some hosts do not answer.
2. **No per-chunk recovery** - a drop at 90% restarts the whole file.

The current implementation downloads **byte-range by byte-range**, so progress is exact
(every downloaded byte is counted) and a dropped connection only loses one chunk.

### 3.2 Exact algorithm

```
resolveRemoteSize(url):
  1. HEAD url                     -> content-length  (preferred)
  2. GET url  Range: bytes=0-0    -> parse Content-Range: bytes 0-0/<total>
  3. otherwise 0 (unknown size)

download file:
  if dest exists and dest.size >= expected: report 100%, return
  total = resolveRemoteSize(url)
  offset = resume point   # disease model: size of existing .part; llm: 0

  while offset < total:
    abort if signal.aborted
    end   = min(offset + CHUNK - 1, total - 1)
    bytes = fetch(url, Range: bytes=offset-end)  # retried, exponential backoff
    write bytes at offset    # FileHandle: handle.offset = ...; handle.writeBytes(...)
    offset += bytes.byteLength
    onProgress(offset / total, offset, total)
  close handle
  if offset < expected: throw "Download incomplete"

finalize:
  delete existing dest (if any)
  part.move(dest)   # the real file appears only when complete
```

Constants:

|                               | `lib/llm.ts`                                                          | `lib/disease-detection.ts`                                   |
| ----------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| Chunk size                    | 8 MiB (`DL_CHUNK_BYTES`)                                              | 8 MiB                                                        |
| Retry attempts / base backoff | 5 / 1000 ms                                                           | 3 / 600 ms                                                   |
| Partial file                  | downloaded to final name, deleted on retry                            | `<name>.part`, **resumed** on next attempt                   |
| Multi-file                    | vision = 2 files, **aggregate** progress (`baseBytes` + `grandTotal`) | single file                                                  |
| Abort                         | not wired (no cancel button for LLM yet)                              | `AbortSignal` checked between chunks and passed into `fetch` |

Key consequence of the `.part` scheme: **`isModelCached()` only ever returns `true` for a
fully written file.** A half-downloaded `.onnx` is never mistaken for a ready model, and
`getPartialDownload()` reports the partial byte count so the UI can say "Resuming a
previous download...".

### 3.3 Notes on the APIs used

- `FileHandle.offset` / `writeBytes()` / `close()` and `File.move(destination)` are part of
  the `expo-file-system` **class-based API** (v19, SDK 54). `File.downloadFileAsync` is no
  longer used for model downloads.
- Range requests need server support (`206 Partial Content`). Hugging Face `resolve/main`
  URLs and GitHub release assets both honour them; if a host ignores `Range`, the code
  detects it (status != 206), retries, then falls back to a single full-body request for
  unknown-size files.

### 3.4 User-visible download surfaces

| Screen                                             | Behaviour                                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/onboarding.tsx` (step 2)                      | pick any model; per-model progress bar; low-priority Android notification shows `x%`; **at least 1 model must be downloaded** to finish onboarding                              |
| `app/(drawer)/profile.tsx` ("AI Models (offline)") | all `LLM_MODELS` with a **Vision** badge, exact size (incl. the second file for VL), confirm alert, delete, "Use this" to switch the active model, live progress + notification |
| `app/(drawer)/diagnosis.tsx`                       | disease model card: `%`, bytes of total, **speed (MB/s)**, **ETA**, **Cancel** (abort), resume notice, error + retry                                                            |

Download-complete notifications are scheduled on the `downloads` Android channel
(`AndroidImportance.LOW`) and dismissed on success or failure.

---

## 4. Loading and lifecycle (`llama.rn`)

### 4.1 One shared context, one model at a time

```ts
let context: LlamaContext | null = null;
let contextModelId: LlmModelId | null = null;

getContext(modelId):
  if context && contextModelId === modelId: return context   # warm reuse
  releaseContext()                                           # release the old one first
  context = await initLlama({ ... })
  if vision model: await context.initMultimodal({ path: mmproj, use_gpu: false })
  contextModelId = modelId
```

- **At most one model is resident at a time.** Switching models releases the previous
  context first, which keeps peak memory bounded on low-end phones.
- `releaseContext()` stops any in-flight completion (`stopCompletion()`) then `release()`s;
  failures are swallowed because the context may already be gone.
- `shutdownLlama()` = `releaseContext()` + `releaseAllLlama()` (full llama.cpp teardown).

### 4.2 `initLlama` parameters

| Option         | Value                              | Why                                                                                                               |
| -------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `n_ctx`        | `info.contextLength` (2048 / 4096) | VL gets a larger context because image patches consume many tokens                                                |
| `use_mmap`     | `true`                             | map the GGUF instead of copying it - faster start, less RAM                                                       |
| `use_mlock`    | `false`                            | avoid pinning hundreds of MB (can OOM mid-load on Android)                                                        |
| `n_gpu_layers` | `0`                                | **CPU only** - the Android emulator has no usable GPU; CPU keeps x86_64 builds fast                               |
| `ctx_shift`    | `false`                            | **required for vision**: media positions depend on a stable KV cache, so automatic context shifting must stay off |

Vision attach:

```ts
await context.initMultimodal({ path: <mmproj gguf>, use_gpu: false });
```

If `initMultimodal` returns `false`, the context is released and a descriptive error is
thrown ("Failed to enable vision support for ...") instead of silently degrading to
text-only.

### 4.3 Model selection rules

1. `getSelectedModelId()` -> the `llm.model` setting, else `DEFAULT_MODEL_ID`.
2. `setSelectedModelId(id)` -> **releases the live context first**, then writes the setting
   (never leaves a stale context bound to the old model).
3. `getReadyModelId()` (used by the chat screens) = selected model **if downloaded**,
   otherwise the first downloaded model, otherwise `null`.
   - `null` => the chat screens show the amber "No AI model on device" banner linking to
     Profile, and `ChatInput` stays disabled (`canSend = false`).

---

## 5. Running a chat turn

### 5.1 `streamChatMessage(options)`

```ts
streamChatMessage({
  messages: ChatMessage[],        // includes { role: 'system', content: AGRI_SYSTEM_PROMPT }
  modelId: LlmModelId | null,
  signal?: AbortSignal,           // wired to ctx.stopCompletion()
  onToken?: (partial, accumulated) => void,
}): Promise<string>               // full generated text
```

Guards, in order:

1. no `modelId` or `!isModelDownloaded(modelId)` -> throws "AI model not downloaded yet...".
2. any message has `imageUri` but `modelSupportsVision(modelId)` is false -> throws
   "This model is text-only. Download the Qwen 2.5-VL 3B vision model...". The screens turn
   this specific message into an actionable assistant bubble with a Profile deep-link hint.
3. `signal.aborted` -> throws `'aborted'` (the screens treat `message === 'aborted'` or
   `name === 'AbortError'` as a silent cancel: no error bubble, no DB write).

Sampling defaults (chat):

| Parameter          | Value    |
| ------------------ | -------- |
| `n_predict`        | 512      |
| `temperature`      | 0.7      |
| `top_p` / `top_k`  | 0.9 / 40 |
| `penalty_repeat`   | 1.1      |
| `enable_thinking`  | `false`  |
| `reasoning_format` | `'none'` |

The token stream is post-processed by `cleanToken`, which drops control/special tokens
(`</s>`, `<s>`, `<>`, ``) so they never reach the UI.

History windowing: the screens send the **system prompt + the last 10 messages + the new
user turn**. This keeps prompt size predictable against `n_ctx`.

### 5.2 Multimodal message format

`ChatMessage` is `{ role, content, imageUri? }`. `toLlamaMessages` converts it to the
llama.rn connector format:

```ts
// text-only
{ role: 'user', content: 'Why are my leaves yellow?' }

// with an image attached
{
  role: 'user',
  content: [
    { type: 'text', text: 'Why are my leaves yellow?' },   // or a default prompt if empty
    { type: 'image_url', image_url: { url: <local file uri> } },
  ],
}
```

Images are picked with `expo-image-picker` inside the shared `components/chat-input.tsx`
(Take photo / Choose from gallery), shown as a removable thumbnail, rendered inside the user
bubble, and persisted to SQLite via `messages.image_uri` so history replays them.

If the active model is text-only, the image button is still visible but tapping it shows an
alert offering a deep link to Profile to download the vision model (the picker is never
opened).

### 5.3 AI-generated chat titles

Two flows, one shared function `suggestChatTitle(messages, modelId, signal?)`:

- **Auto (new chat):** after the first reply lands, `index.tsx` fires `suggestChatTitle`
  fire-and-forget with the recent transcript. The UI shows a fallback title instantly
  (`query.slice(0, 40)` or "New chat") and swaps in the model's title when it arrives, then
  persists it with `updateThreadTitle`.
- **Manual (rename modal):** `RenameThreadModal` has a "Suggest with on-device AI" button
  wired to `onSuggest` (disabled while a reply is streaming). It fills the text input so the
  user can edit before saving.

Generation parameters (deliberately different from chat):

| Parameter         | Value                                 |
| ----------------- | ------------------------------------- |
| `n_predict`       | 24                                    |
| `temperature`     | 0.3 (low = deterministic short title) |
| `top_p` / `top_k` | 0.9 / 20                              |
| `penalty_repeat`  | 1.2                                   |

`cleanTitle()` then strips quotes/whitespace/terminal punctuation and truncates to **40
chars**, falling back to `"New chat"` if empty. Any failure returns `''` so callers keep
their own default (title generation must never break a chat turn).

### 5.4 System prompt

`AGRI_SYSTEM_PROMPT` scopes the model to agriculture, asks for simple practical language,
and explicitly forbids claiming access to live weather/market data (the model is offline by
design).

### 5.5 Abort / concurrency

- Each chat screen owns one `AbortController` per turn. Aborting calls
  `ctx.stopCompletion()`; the catch path distinguishes real errors from cancels.
- `messages` state is updated optimistically (user bubble appears immediately); the
  assistant message and DB write only happen after the full completion returns.

---

## 6. Plant-disease pipeline (ONNX)

### 6.1 Full pipeline

```
predictDisease(imageUri):
  1. preprocessImage:
     a. ImageManipulator.resize to 256x256, output as PNG
     b. decode PNG with fast-png  (RGBA/RGB -> raw byte planes)
     c. normalise each channel to [0,1]  (divide by 255)
     d. transpose HWC -> CHW and wrap in Float32Array(1*3*256*256)
  2. loadSession: ort.InferenceSession.create(<native path>)  (cached in a module-level promise)
  3. session.run({ input: Tensor('float32', data, [1,3,256,256]) })
  4. softmax over the 38 logits (numerically stable: subtract max before exp)
  5. argmax -> DISEASE_CLASSES[i] -> split on '___' into plantName + disease
  6. confidence = p[argmax];  isConfident = confidence >= 0.4
```

### 6.2 Accuracy notes

What determines real-world accuracy here (in rough order):

1. **Training data** - PlantVillage is laboratory-shot leaves; field photos (shadows, dirt,
   mixed background) are out of distribution. This is the single biggest source of wrong
   confident predictions.
2. **Input fidelity** - the preprocessing above must exactly match training
   (resize + `[0,1]` normalisation + CHW, no mean/std subtraction). `fast-png` decoding of
   the manipulator's PNG output guarantees deterministic pixels (JPEG artifacts would not).
3. **Class set** - 38 classes / 14 species. A plant outside that set will be forced into
   one of the 38; the UI's confidence bar + "verify before acting" note exists for this.
4. **Confidence threshold** - 0.4. Below it the result is still shown but flagged as low
   confidence.
5. **ONNX conversion** - PyTorch -> ONNX export must preserve the eval graph exactly
   (batchnorm folded to eval stats). Compare `ml-server` PyTorch logits vs ONNX logits on
   the same tensor when re-exporting.

The redesigned `diagnosis.tsx` surfaces all of this to the user: a result card with the
plant, the disease (or "Healthy"), a confidence **bar**, and the on-device/low-confidence
disclaimer, plus a model-download card with accurate progress, speed, ETA and cancel.

### 6.3 Session caching

`loadSession()` memoises the `ort.InferenceSession` promise. A failed create clears it so
the next call retries. `removeModel()` deletes both the final file and any `.part`.

---

## 7. Environment variables

All are **optional** - every model has a working default baked into the code, so a build
works with no `.env`. They are read at JS-bundle build time (`EXPO_PUBLIC_*`), so changing
one requires a rebuild, not just a reload.

| Variable                           | Overrides        | Default in code                                                     |
| ---------------------------------- | ---------------- | ------------------------------------------------------------------- |
| `EXPO_PUBLIC_LLM_MODEL_0_5B_URL`   | 0.5B GGUF        | Hugging Face `Qwen/Qwen2.5-0.5B-Instruct-GGUF`                      |
| `EXPO_PUBLIC_LLM_MODEL_1_5B_URL`   | 1.5B GGUF        | Hugging Face `Qwen/Qwen2.5-1.5B-Instruct-GGUF`                      |
| `EXPO_PUBLIC_LLM_MODEL_VISION_URL` | VL backbone GGUF | Hugging Face `ggml-org/Qwen2.5-VL-3B-Instruct-GGUF`                 |
| `EXPO_PUBLIC_LLM_MMPROJ_URL`       | VL mmproj GGUF   | Hugging Face `ggml-org/Qwen2.5-VL-3B-Instruct-GGUF`                 |
| `EXPO_PUBLIC_DISEASE_MODEL_URL`    | ResNet9 ONNX     | GitHub release `.../plant-disease-model/resnet9_plant_disease.onnx` |

Uses for the overrides: self-hosting/mirroring the files (e.g. on an internal server for
field deployments with flaky Hugging Face access), pointing at a fine-tuned GGUF, or
swapping in a different quantization without a code change.

---

## 8. Native build requirements

Custom config plugins live in `apps/native/app.json`:

| Plugin                                                | Purpose                                                                                                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `llama.rn`                                            | links llama.cpp for chat/vision                                                                                                                     |
| `expo-sqlite`                                         | local DB (threads/messages/settings/image_uri)                                                                                                      |
| `./plugins/withOnnxruntimeRegistration`               | registers `OnnxruntimePackage` in Kotlin `MainApplication` (required; ONNX Runtime is not auto-linked reliably under the New Architecture)          |
| `./plugins/withLimitedAbis`                           | writes `reactNativeArchitectures=arm64-v8a` (override with `APP_ABIS` at prebuild) so the APK does not ship llama.cpp + ONNX + Hermes for every ABI |
| `onnxruntimeExtensionsEnabled: "true"` (package.json) | builds ONNX Runtime custom ops (needed by some pre/post ops)                                                                                        |

Also relevant:

- `newArchEnabled: true` (New Architecture is on; `llama.rn` 0.13.0-rc.4 supports it).
- Release builds package **one ABI** (arm64-v8a) - about 4x smaller than a universal build
  and enough for virtually all modern Android phones.
- **Expo Go cannot run either engine.** Use `npx expo run:android` / `run:ios`, or the
  GitHub Actions APK workflow (`.github/workflows/build-apk.yml`).
- The first Gradle build is slow (20-50 min, ~2 GB RAM/worker) because it compiles
  llama.cpp and ONNX Runtime from source.

---

## 9. Offline guarantees and privacy

- After download, **chat, vision and disease detection make zero network requests.**
- The system prompt tells the model it has no internet, so it does not invent live
  weather/market/news claims.
- Chat text, image URIs (`messages.image_uri`), profile fields and the selected model all
  live in the on-device SQLite DB (`cropai.db`). Nothing is uploaded.
- Model files sit in the app's private document directory; other apps cannot read them.
- Photos chosen for chat/disease are processed from their local URI (the vision model and
  ONNX session both read local files only).

---

## 10. Troubleshooting

| Symptom                                           | Likely cause                                             | Fix                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Amber "No AI model on device" banner in Chat      | no GGUF on disk (`getReadyModelId() === null`)           | Profile -> AI Models -> download one                                                                                    |
| "This model is text-only..." when sending a photo | active model lacks vision                                | download `qwen2.5-vl-3b`, or disable the image button path (it already deep-links to Profile)                           |
| "Failed to enable vision support..."              | mmproj file missing/corrupt                              | delete + re-download the VL model (both files are required)                                                             |
| Download stuck / progress jumps                   | host ignoring `Range` or a flaky network                 | retries with backoff already run; for the disease model, cancel and resume (`.part` keeps bytes)                        |
| Progress shows 100% but "Download incomplete"     | server reported a smaller total than actually sent       | delete the model and retry; file is not marked cached                                                                   |
| ONNX inference fails to create session            | model file corrupt or wrong ABI/onnxruntime registration | re-download; verify `withOnnxruntimeRegistration` plugin ran (Kotlin `MainApplication` contains `OnnxruntimePackage()`) |
| Disease prediction looks confident but wrong      | out-of-distribution photo (background, wrong plant)      | take a closer, well-lit photo of a single leaf; treat confidence < 0.4 as unreliable                                    |
| Chat input hidden behind keyboard on Android      | `softwareKeyboardLayoutMode` not `resize`                | keep `"softwareKeyboardLayoutMode": "resize"` in `app.json` (it was `pan`, which caused this)                           |
| Slow first token / OOM                            | large model (VL ~3 GB) on a small-RAM device             | prefer the 0.5B/1.5B models; only one context is ever resident, so switch models rather than loading several            |
| Title suggestion returns nothing                  | model not ready, aborted, or failure                     | expected: callers fall back to the first-query title; rename modal can retry via the AI button                          |

---

## 11. Adding or swapping a model (recipe)

1. **Pick a GGUF** (Q4_K_M recommended for CPU) or ONNX file. Verify the remote honours
   `Range` requests (`curl -r 0-0 -I <url>` should return `206` + `Content-Range`).
2. **Add/adjust the entry** in `LLM_MODELS` (`lib/llm.ts`):
   - `id`, `label`, `description`, `filename`, `url` (or an `EXPO_PUBLIC_LLM_*_URL` default),
   - `sizeBytes` (exact) and `approxSize` (display),
   - `contextLength`,
   - for vision: `mmprojFilename`, `mmprojUrl`, `mmprojSizeBytes`, `vision: true`.
3. **`getReadyModelId` / `isModelDownloaded` pick it up automatically** - no screen changes
   needed; onboarding, profile and chat iterate `LLM_MODELS`.
4. If the model needs different sampling or context rules, branch on `info.vision` (as
   `getContext` already does for `ctx_shift` and `initMultimodal`).
5. For the **disease model**, only `MODEL_URL` / `MODEL_FILENAME` / `MODEL_INPUT_SIZE` and
   `DISEASE_CLASSES` (and the matching training export in `apps/ml-server`) need to change.
6. Rebuild the native client if you changed `EXPO_PUBLIC_*` values (they are inlined into
   the JS bundle at build time).

---

## 12. File-by-file map

| File                                             | Responsibility                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/native/lib/llm.ts`                         | model catalog, chunked/multi-file download, context lifecycle, multimodal chat streaming, title suggestion, system prompt |
| `apps/native/lib/disease-detection.ts`           | ONNX download (`.part` + resume + abort), preprocessing, inference, softmax, class labels                                 |
| `apps/native/lib/db.ts`                          | SQLite: `threads`, `messages` (incl. `image_uri` migration), `settings` (profile + `llm.model`)                           |
| `apps/native/lib/chat-session.ts`                | pub/sub so the drawer's "New chat" can reset the open Chat screen                                                         |
| `apps/native/components/chat-input.tsx`          | shared multiline input: newline submit, image attach, send/abort states                                                   |
| `apps/native/components/rename-thread-modal.tsx` | manual rename + "Suggest with on-device AI"                                                                               |
| `apps/native/app/onboarding.tsx`                 | first-run model download (blocks finish until >= 1 model)                                                                 |
| `apps/native/app/(drawer)/profile.tsx`           | model management UI: download/delete/switch, vision badge, notifications                                                  |
| `apps/native/app/(drawer)/index.tsx`             | main chat: streaming, image bubbles, header pill rename, auto-title                                                       |
| `apps/native/app/(drawer)/chat/[id].tsx`         | existing thread: same features as above, loads history from DB                                                            |
| `apps/native/app/(drawer)/diagnosis.tsx`         | disease screen: download card (progress/speed/ETA/cancel) + result card                                                   |
| `apps/native/app.json`                           | native plugins, `softwareKeyboardLayoutMode: "resize"` (keyboard fix)                                                     |
| `apps/native/plugins/*.js`                       | ONNX Runtime registration, ABI limiting                                                                                   |
| `MODELS.md`                                      | training/architecture history of the disease classifiers (ResNet9/18/50)                                                  |

Related docs: [apps/native/README.md](../apps/native/README.md) (building the APK),
[README.md](../README.md) (repo overview), [MODELS.md](../MODELS.md) (model training).
